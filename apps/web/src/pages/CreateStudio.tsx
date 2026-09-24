import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Languages, LoaderCircle, Sparkles } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { ThemedSelect } from '../components/ui/ThemedSelect';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { PERMISSIONS, can } from '../lib/permissions';
import { ApiError } from '../services/api';
import { creativeService, postService } from '../services/creative';
import { createStudioService, type CarModelMatch, type GeneratedPost, type VideoEngineName } from '../services/createStudio';
import {
  LANGUAGES, dealerInitials, defaultPlatforms, initialLanguage, keepPreloadedCaption, limitIssues, mergeHashtags, outputFormat, platformOptions,
  reelErrorMessage, scheduleFromQuery, shouldFallBackToQuickRender, togglePlatform,
  type CreateType, type PlatformSpecs, type VisualSource,
} from '../utils/createStudio';
import { waitForVideoJob } from '../utils/videoJobPolling';
import { firstCreative } from '../utils/posts';
import { publishErrorMessage, summarizePublishResult } from '../utils/publishResult';
import { AttachBlock, PlatformPicker, PromptField, SourcePicker, TypePicker } from '../components/create/EditorSections';
import { CaptionEditor, DesignPicker } from '../components/create/DesignResults';
import { PreviewColumn } from '../components/create/PreviewColumn';
import { PublishActions } from '../components/create/PublishActions';
import { ScheduleModal } from '../components/create/ScheduleModal';
import { SuccessScreen, type CreateOutcome } from '../components/create/SuccessScreen';
import { CanvasStudio } from '../components/CreatePost/CanvasStudio';
import { trackEvent } from '../services/events';
import { captionEventFor } from '../utils/analytics';

type Action = 'publish' | 'schedule' | 'approval';

// Branded mode's prompt is optional, but captions are written from a brief.
const FALLBACK_PROMPT = 'Showroom offer post';

// The reel job is gone (another dealership's link, or deleted): polling again won't help.
const isMissingJobError = (err: unknown) => err instanceof ApiError && (err.status === 403 || err.status === 404);

function dataUrlToFile(dataUrl: string, name: string): File {
  const [head = '', body = ''] = dataUrl.split(',');
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? 'image/jpeg';
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return new File([bytes], name, { type: mime });
}

// Keyed on ?job= / ?edit= so a new one (e.g. a "reel ready" notification clicked while already
// on /create) mounts a fresh studio that loads it, instead of keeping the current state.
export default function CreateStudioPage() {
  const [params] = useSearchParams();
  return <CreateStudio key={params.get('job') ?? params.get('edit') ?? 'new'} />;
}

function CreateStudio() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { addToast } = useToast();
  const { user } = useAuth();
  const { profile } = useDealerProfile();
  const canPublish = can(user, PERMISSIONS.PUBLISH_POST);

  const editId = params.get('edit');
  const resumeJobId = params.get('job');

  const [type, setType] = useState<CreateType>(() => (params.get('type') === 'reel' || resumeJobId ? 'reel' : 'image'));
  const [languageChoice, setLanguageChoice] = useState<string | null>(null);
  const [source, setSource] = useState<VisualSource>('generate_scratch');
  const [prompt, setPrompt] = useState(() => (params.get('prompt') ?? '').slice(0, 500));
  const [connected, setConnected] = useState<string[]>([]);
  const [specs, setSpecs] = useState<PlatformSpecs | null>(null);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [matchedCar, setMatchedCar] = useState<CarModelMatch | null>(null);
  const [matching, setMatching] = useState(false);
  const [uploadUrl, setUploadUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<GeneratedPost | null>(null);
  const [designIdx, setDesignIdx] = useState(0);
  const [reel, setReel] = useState<{ videoUrl: string; thumbnailUrl: string | null } | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [previewPlatform, setPreviewPlatform] = useState('');
  const [generating, setGenerating] = useState(() => !!resumeJobId);
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDefault] = useState(() => scheduleFromQuery(params.get('date'), params.get('time')));
  const [savedId, setSavedId] = useState<string | null>(editId);
  const [outcome, setOutcome] = useState<CreateOutcome | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);
  // The caption the AI last produced for the chosen design or reel, compared with the saved caption for usage events.
  const generatedCaptionRef = useRef<string | null>(null);

  // Derived: the language follows the dealer profile until picked; platforms default to every connected one.
  const language = languageChoice ?? initialLanguage(profile?.language_preferences);
  const selected = picked ?? defaultPlatforms(type, connected);
  const format = outputFormat(type, selected, specs);
  const issues = limitIssues(type, selected, specs, caption, hashtags);
  const hasContent = type === 'image' ? !!result : !!reel;
  const selectedCreative = result?.creatives[designIdx] ?? null;
  const dealerName = profile?.name || 'Your Dealership';

  useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    createStudioService.connectedPlatforms()
      .then((ids) => { if (!cancelled) setConnected(ids); })
      .catch(() => {});
    createStudioService.platformSpecs()
      .then((data) => { if (!cancelled) setSpecs(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ?edit=<id>: load the draft into the studio.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    postService.get(editId)
      .then(({ data }) => {
        if (cancelled) return;
        if (data.status !== 'draft') {
          addToast({ type: 'error', title: 'Only drafts can be edited' });
          navigate('/posts', { replace: true });
          return;
        }
        const isVideo = data.media_type === 'video';
        setType(isVideo ? 'reel' : 'image');
        setPrompt((data.prompt_text ?? '').slice(0, 500));
        setCaption(data.caption_text ?? '');
        setHashtags(mergeHashtags([], data.caption_hashtags ?? []));
        setPicked(data.platforms);
        if (isVideo && data.video_url) {
          setReel({ videoUrl: data.video_url, thumbnailUrl: data.thumbnail_url ?? null });
        } else {
          const url = firstCreative(data.creative_urls);
          if (url) {
            setResult({ creatives: [url], copies: [{ caption: data.caption_text ?? '', hashtags: data.caption_hashtags ?? [] }] });
            setDesignIdx(0);
          } else if (data.caption_text) {
            // A drafted caption without a design yet (Inbox "Turn into post") counts as generated:
            // saving it unchanged is caption.accepted.
            generatedCaptionRef.current = data.caption_text;
          }
        }
      })
      .catch(() => { if (!cancelled) addToast({ type: 'error', title: 'Could not load this post' }); });
    return () => { cancelled = true; };
  }, [editId, addToast, navigate]);

  // Scratch AI: find the dealer's car named in the prompt.
  useEffect(() => {
    if (type !== 'image' || source !== 'generate_scratch' || uploadUrl) return;
    const q = prompt.trim();
    let cancelled = false;
    const timer = setTimeout(() => {
      if (q.length < 3) { setMatchedCar(null); return; }
      setMatching(true);
      createStudioService.searchCarModels(q)
        .then((models) => { if (!cancelled) setMatchedCar(models[0] ?? null); })
        .catch(() => {})
        .finally(() => setMatching(false));
    }, 450);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [prompt, type, source, uploadUrl]);

  useEffect(() => {
    if (result || reel) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [result, reel]);

  // Polls a reel job. `retry` re-renders with the quick engine when a premium (Veo) render fails.
  // `keepCaption`: the drafted caption stays instead of the reel's generated one (see keepPreloadedCaption).
  const followReel = async (jobId: string, retry: (() => Promise<void>) | null, isCancelled: () => boolean, keepCaption = false): Promise<void> => {
    const polled = await waitForVideoJob(() => createStudioService.videoStatus(jobId), { isCancelled, isFatal: isMissingJobError });
    if (polled.kind === 'cancelled') return;
    if (polled.kind === 'missing') {
      addToast({ type: 'error', title: 'Reel not found', message: 'This reel is no longer available.' });
      return;
    }
    if (polled.kind === 'timeout') {
      addToast({ type: 'info', title: 'Still rendering', message: 'Your reel is taking longer than usual. We’ll notify you when it’s ready.' });
      return;
    }
    const job = polled.job;
    if (polled.kind === 'ready' && job.video_url) {
      setReel({ videoUrl: job.video_url, thumbnailUrl: job.thumbnail_url });
      if (!keepCaption) {
        setCaption((current) => job.caption ?? current);
        generatedCaptionRef.current = job.caption ?? null;
        setHashtags(mergeHashtags([], job.hashtags));
      }
      addToast({ type: 'success', title: 'Reel ready!', message: 'Your video is ready to publish.' });
      return;
    }
    if (retry && shouldFallBackToQuickRender(job.error?.code, job.engine)) {
      addToast({ type: 'info', title: 'Using quick render', message: 'AI video was unavailable — generating a quick animated reel instead.' });
      await retry();
      return;
    }
    addToast({ type: 'error', title: 'Reel failed', message: reelErrorMessage(job.error?.code) });
  };

  const startReel = async (engine?: VideoEngineName, keepCaption = false): Promise<void> => {
    const started = await createStudioService.startVideo({
      prompt: prompt.trim(),
      language,
      aspect_ratio: format,
      duration_seconds: 15,
      ...(uploadUrl ? { image_url: uploadUrl } : {}),
      ...(engine ? { engine } : {}),
    });
    addToast({ type: 'info', title: 'Generating video', message: 'This takes a minute or two. You can leave this page — we’ll notify you when it’s ready.' });
    await followReel(started.job_id, started.engine === 'veo' ? () => startReel('kenburns', keepCaption) : null, () => !aliveRef.current, keepCaption);
  };

  // ?job=<id> (from the "reel ready" notification): pick the job back up once.
  useEffect(() => {
    if (!resumeJobId) return;
    let cancelled = false;
    void followReel(resumeJobId, null, () => cancelled || !aliveRef.current).finally(() => setGenerating(false));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    if (generating) return;
    const text = prompt.trim();
    const needsPrompt = type === 'reel' || source !== 'add_creative';
    if (needsPrompt && text.length < 3) { addToast({ type: 'error', title: 'Describe your post first' }); return; }
    if (selected.length === 0) { addToast({ type: 'error', title: 'Pick at least one platform' }); return; }
    if (type === 'image' && source !== 'generate_scratch' && !uploadUrl) {
      addToast({ type: 'error', title: source === 'add_inspiration' ? 'Upload a reference image' : 'Upload your creative' });
      return;
    }
    // Editing a drafted caption with no design yet: the first generate keeps it (and its hashtags).
    const keepCaption = keepPreloadedCaption({ editing: !!editId, currentCaption: caption, hasResult: !!result || !!reel });
    // Replacing an unsaved generated caption rejects it.
    if (!keepCaption && generatedCaptionRef.current !== null) trackEvent('caption.rejected', { type });
    setGenerating(true);
    try {
      if (type === 'reel') {
        await startReel(undefined, keepCaption);
        return;
      }
      const generated = await createStudioService.generatePost({ prompt: text || FALLBACK_PROMPT, language, source, uploadUrl, car: uploadUrl ? null : matchedCar });
      if (generated.creatives.length === 0) throw new Error('No designs came back.');
      // Without their generated copy, picking another design keeps the drafted caption too.
      setResult(keepCaption ? { ...generated, copies: [] } : generated);
      setDesignIdx(0);
      if (!keepCaption) {
        const first = generated.copies[0];
        setCaption(first?.caption ?? '');
        generatedCaptionRef.current = first?.caption ?? null;
        setHashtags(mergeHashtags([], first?.hashtags ?? []));
      }
      addToast({ type: 'success', title: 'Post ready!', message: 'Pick a design and publish.' });
    } catch (err) {
      if (type === 'reel') {
        addToast({ type: 'error', title: 'Could not generate', message: reelErrorMessage(err instanceof ApiError ? err.code : null) });
      } else {
        const unavailable = err instanceof ApiError && err.status === 503;
        addToast({
          type: 'error',
          title: unavailable ? 'AI not available' : 'Could not generate',
          message: unavailable ? 'AI generation isn’t enabled yet.' : 'Could not generate. Please try again.',
        });
      }
    } finally {
      setGenerating(false);
    }
  };

  const selectDesign = (index: number) => {
    setDesignIdx(index);
    const copy = result?.copies[index] ?? result?.copies[0];
    if (copy) {
      generatedCaptionRef.current = copy.caption;
      setCaption(copy.caption);
      setHashtags(mergeHashtags([], copy.hashtags));
    }
  };

  const suggest = async () => {
    if (!caption.trim()) { addToast({ type: 'error', title: 'Write a caption first' }); return; }
    setSuggesting(true);
    try {
      const tags = await createStudioService.suggestHashtags(caption, profile?.city ?? '', language);
      setHashtags((current) => mergeHashtags(current, tags));
    } catch {
      addToast({ type: 'error', title: 'Could not suggest hashtags' });
    } finally {
      setSuggesting(false);
    }
  };

  const attach = async (file: File) => {
    if (!file.type.startsWith('image/')) { addToast({ type: 'error', title: 'Choose an image file' }); return; }
    setUploading(true);
    try {
      const { url } = await creativeService.uploadImage(file);
      setUploadUrl(url);
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not upload the image. Please try again.' });
    } finally {
      setUploading(false);
    }
  };

  const exportFromCanvas = async (dataUrl: string) => {
    try {
      const { url } = await creativeService.uploadImage(dataUrlToFile(dataUrl, `canvas-${Date.now()}.jpg`));
      setResult((current) => current && { ...current, creatives: current.creatives.map((c, i) => (i === designIdx ? url : c)) });
      addToast({ type: 'success', title: 'Design updated' });
    } catch {
      addToast({ type: 'error', title: 'Could not save the Canvas edit' });
    }
  };

  // Once per generated caption, on the first save: kept as the AI wrote it (accepted) or changed (edited).
  const reportCaption = () => {
    const event = captionEventFor(generatedCaptionRef.current, caption);
    if (event) trackEvent(event, { type });
    generatedCaptionRef.current = null;
  };

  // Creates the post once, then updates the same draft on later attempts (or in edit mode).
  const savePost = async (): Promise<string> => {
    const video = type === 'reel' && reel
      ? { videoUrl: reel.videoUrl, ...(reel.thumbnailUrl ? { thumbnailUrl: reel.thumbnailUrl } : {}) }
      : null;
    const content = {
      promptText: prompt.trim() || caption.trim().slice(0, 80) || 'Untitled post',
      captionText: caption,
      captionHashtags: hashtags,
      platforms: selected,
      ...(type === 'image' && selectedCreative ? { creativeUrls: Object.fromEntries(selected.map((p) => [p, selectedCreative])) } : {}),
    };
    if (savedId) {
      await postService.update(savedId, { ...content, mediaType: type === 'reel' ? 'video' : 'image', ...(video ?? {}) });
      reportCaption();
      return savedId;
    }
    const { item } = await postService.create({ ...content, ...(video ? { mediaType: 'video' as const, ...video } : {}) });
    setSavedId(item.id);
    reportCaption();
    return item.id;
  };

  const submit = async (action: Action, scheduledAt = '') => {
    if (busy || !hasContent || selected.length === 0 || (action === 'schedule' && !scheduledAt)) return;
    setBusy(true);
    let postId: string | null = null;
    try {
      postId = await savePost();
      const base = { postId, platforms: selected, isVideo: type === 'reel', whatsappShare: null };
      if (action === 'approval') {
        const res = await postService.submitForApproval(postId, selected);
        setOutcome({ ...base, kind: 'approval', warning: null, whatsappShare: res.whatsappShare });
      } else if (action === 'schedule') {
        const summary = summarizePublishResult(await postService.schedule(postId, selected, scheduledAt), selected);
        if (!summary.ok) throw new Error(summary.message ?? 'Could not schedule.');
        setScheduleOpen(false);
        setOutcome({ ...base, kind: 'scheduled', warning: summary.message });
      } else {
        const summary = summarizePublishResult(await postService.publish(postId, selected), selected);
        if (!summary.ok) throw new Error(summary.message ?? 'Could not publish.');
        setOutcome({ ...base, kind: 'published', warning: summary.message });
      }
    } catch (err) {
      const message = err instanceof ApiError && err.code === 'PLAN_LIMIT_REACHED'
        ? 'You’ve hit your monthly post limit. Upgrade in Settings → Billing.'
        : publishErrorMessage(err, 'Could not publish. Please try again.');
      addToast({
        type: 'error',
        title: action === 'schedule' ? 'Could not schedule' : action === 'approval' ? 'Could not send for approval' : 'Could not publish',
        message: postId ? `${message} Your post was saved as a draft.` : message,
      });
    } finally {
      setBusy(false);
    }
  };

  const schedule = (localValue: string) => {
    const when = new Date(localValue);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      addToast({ type: 'error', title: 'Pick a time in the future' });
      return;
    }
    void submit('schedule', when.toISOString());
  };

  const changeType = (next: CreateType) => {
    if (next === type) return;
    setType(next);
    setPicked(null);
    setPreviewPlatform('');
  };

  const changeSource = (next: VisualSource) => {
    setSource(next);
    setUploadUrl(null);
  };

  const createAnother = () => {
    setOutcome(null);
    setResult(null);
    setReel(null);
    setCaption('');
    setHashtags([]);
    setPrompt('');
    setUploadUrl(null);
    setMatchedCar(null);
    setDesignIdx(0);
    setSavedId(null);
    setPicked(null);
    navigate('/create', { replace: true });
  };

  if (outcome) return <SuccessScreen outcome={outcome} onCreateAnother={createAnother} />;

  const previewCaption = hasContent ? [caption, hashtags.join(' ')].filter(Boolean).join('\n\n') : '';
  const actions = (
    <PublishActions
      type={type}
      canPublish={canPublish}
      disabled={!hasContent || selected.length === 0 || generating}
      limitBlocked={issues.length > 0}
      busy={busy}
      onPublish={() => { void submit('publish'); }}
      onSchedule={() => setScheduleOpen(true)}
      onApproval={() => { void submit('approval'); }}
    />
  );
  const captionEditor = (rows: number) => (
    <CaptionEditor
      caption={caption}
      onCaption={setCaption}
      hashtags={hashtags}
      onHashtags={setHashtags}
      suggesting={suggesting}
      onSuggest={() => { void suggest(); }}
      issues={issues}
      rows={rows}
    />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-3 px-5 md:px-6 py-3.5 border-b border-zinc-200/70">
        <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="p-1.5 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight text-zinc-900">{editId ? 'Edit post' : 'Create'}</h1>
          <p className="text-xs text-zinc-500 truncate">One prompt → publish to every platform in the right format.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Languages className="w-4 h-4 text-zinc-400 shrink-0" />
          <ThemedSelect
            size="sm"
            className="w-32"
            ariaLabel="Language"
            value={language}
            onChange={setLanguageChoice}
            options={LANGUAGES.map((l) => ({ value: l.id, label: l.label }))}
          />
        </div>
      </div>

      <div className="flex-1 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] min-h-0">
        <div className="overflow-y-auto p-5 md:p-6 space-y-5">
          <TypePicker value={type} onChange={changeType} />
          <PlatformPicker
            type={type}
            options={platformOptions(type, connected)}
            selected={selected}
            format={format}
            onToggle={(id) => setPicked(togglePlatform(selected, id))}
            onConnect={() => navigate('/accounts')}
          />
          {type === 'image' && <SourcePicker value={source} onChange={changeSource} />}
          <PromptField type={type} source={source} value={prompt} onChange={setPrompt} />
          <AttachBlock
            type={type}
            source={source}
            uploadUrl={uploadUrl}
            matchedCar={matchedCar}
            matching={matching}
            uploading={uploading}
            onFile={(file) => { void attach(file); }}
            onClear={() => setUploadUrl(null)}
          />
          {/* Edit mode before any result: the drafted caption is visible and editable straight away. */}
          {editId && !hasContent && captionEditor(3)}
          <Button className="w-full" onClick={() => { void generate(); }} disabled={generating || selected.length === 0}>
            {generating
              ? <><LoaderCircle className="w-4 h-4 animate-spin" /> Generating…</>
              : <><Sparkles className="w-4 h-4" /> Generate {type === 'reel' ? 'reel' : 'post'}</>}
          </Button>

          {type === 'image' && result && (
            <div ref={resultsRef} className="space-y-4 pt-1 border-t border-zinc-100">
              <DesignPicker creatives={result.creatives} selected={designIdx} onSelect={selectDesign} onEditInCanvas={() => setCanvasOpen(true)} />
              {captionEditor(3)}
              {actions}
            </div>
          )}
          {type === 'reel' && reel && (
            <div ref={resultsRef} className="space-y-3 pt-1 border-t border-zinc-100">
              <div className="pt-3">{captionEditor(2)}</div>
              {actions}
            </div>
          )}
        </div>

        <PreviewColumn
          type={type}
          selected={selected}
          previewPlatform={previewPlatform}
          onPreviewPlatform={setPreviewPlatform}
          dealerName={dealerName}
          initials={dealerInitials(profile?.name)}
          logoUrl={profile?.logo_url ?? null}
          caption={previewCaption}
          imageUrl={selectedCreative}
          videoUrl={reel?.videoUrl ?? null}
          posterUrl={reel?.thumbnailUrl ?? null}
          format={format}
          generating={generating}
        />
      </div>

      <ScheduleModal
        open={scheduleOpen}
        initialValue={scheduleDefault}
        busy={busy}
        onClose={() => setScheduleOpen(false)}
        onSchedule={schedule}
      />
      <CanvasStudio
        open={canvasOpen}
        onClose={() => setCanvasOpen(false)}
        brief={prompt}
        model={matchedCar?.model_name ?? ''}
        initialImageUrl={selectedCreative}
        onExport={(dataUrl) => { void exportFromCanvas(dataUrl); }}
      />
    </div>
  );
}
