import { useState, useEffect, useRef } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { creativeService, postService } from '../services/creative';
import type { AIGenerationResponse } from '../services/creative';
import { useToast } from '../components/ui/Toast';
import {
  ArrowLeft, RefreshCw, Check, ImagePlus, X,
  Calendar, Film, Wand2, ChevronDown, Layout, Sparkles, ZoomIn
} from 'lucide-react';
import api from '../services/api';
import { CanvasStudio } from '../components/CreatePost/CanvasStudio';
import PlatformPreview from '../components/PlatformPreview';

const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',          color: 'text-[#1877F2]', dot: 'bg-[#1877F2]' },
  { id: 'instagram', label: 'Instagram',          color: 'text-pink-500',  dot: 'bg-pink-500' },
  { id: 'gmb',       label: 'Google My Business', color: 'text-[#4285F4]', dot: 'bg-[#4285F4]' },
] as const;

export default function CreatePost() {
  const [searchParams] = useSearchParams();
  const { addToast } = useToast();
  const { profile: dealerProfile } = useDealerProfile();

  const [prompt, setPrompt] = useState(() => searchParams.get('prompt') ?? '');
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(['facebook', 'instagram', 'gmb']);
  
  // Post states
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<AIGenerationResponse | null>(null);
  const [caption, setCaption] = useState('');
  const [aiImageUrls, setAiImageUrls] = useState<string[]>([]);
  const [selectedCreativeIdx, setSelectedCreativeIdx] = useState<number | null>(null);
  const [selectedCaptionIdx, setSelectedCaptionIdx] = useState<number | null>(null);
  const [isCheckedOut, setIsCheckedOut] = useState(false);
  const [activeSection, setActiveSection] = useState<1 | 2>(1);
  const [previewTab, setPreviewTab] = useState<'facebook' | 'instagram' | 'gmb'>('facebook');
  const [zoomImageIdx, setZoomImageIdx] = useState<number | null>(null);
  const [published, setPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState(() => {
    const d = searchParams.get('date');
    const t = searchParams.get('time');
    if (d && t) {
      return `${d}T${t}`;
    } else if (d) {
      return `${d}T12:00`;
    }
    return '';
  });
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);

  // Workflow modes
  const [imageMode, setImageMode] = useState<'add_creative' | 'add_inspiration' | 'generate_scratch'>('generate_scratch');
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const [isDropzoneFocused, setIsDropzoneFocused] = useState(false);

  // Prompt detailing layers
  const [elaboratedBrief, setElaboratedBrief] = useState<{
    brand: string;
    model_name: string;
    car_angle: string;
    background_theme: string;
    background_details: string;
    background_details_option2?: string;
    background_details_option3?: string;
    lighting_mood: string;
    headline: string;
    caption: string;
    caption_option2?: string;
    caption_option3?: string;
    hashtags: string[];
    hashtags_option2?: string[];
    hashtags_option3?: string[];
  } | null>(null);
  const [stepIndex, setStepIndex] = useState(0); // Stepper progress: 0=idle, 1=detailing, 2=background, 3=composition, 4=overlay, 5=caption

  // Model selection
  const [allModels, setAllModels] = useState<any[]>([]);
  const [detectedModel, setDetectedModel] = useState<any | null>(null);
  const [selectedModelImage, setSelectedModelImage] = useState<string | null>(null);
  const [selectedModelAngle, setSelectedModelAngle] = useState<string>('front_exterior');
  const [selectedModelColor, setSelectedModelColor] = useState<string>('');
  const [showModelPickerModal, setShowModelPickerModal] = useState(false);
  const [showAllModelsSelector, setShowAllModelsSelector] = useState(false);

  // Canvas Studio integration
  const [canvasStudioOpen, setCanvasStudioOpen] = useState(false);

  // Legacy tools states
  const [legacyExpanded, setLegacyExpanded] = useState(false);
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(15);
  const [videoAspect, setVideoAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const videoImageRef = useRef<HTMLInputElement>(null);
  const [videoImageUrl, setVideoImageUrl] = useState<string | null>(null);
  const [videoImageId, setVideoImageId] = useState<string | null>(null);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [uploadingVideoImage, setUploadingVideoImage] = useState(false);

  // Brand logos & details
  const [selectedBrand, setSelectedBrand] = useState('Hyundai');

  useEffect(() => {
    if (dealerProfile?.brands?.length) {
      setSelectedBrand(dealerProfile.brands[0]);
    }
  }, [dealerProfile]);

  useEffect(() => {
    api.get<{ success: boolean; accounts: Array<{ platform: string }> }>('/platform-accounts')
      .then((res) => setConnectedAccounts((res.accounts ?? []).map((a) => a.platform)))
      .catch(() => setConnectedAccounts([]));
  }, []);

  useEffect(() => {
    api.get<{ success: boolean; models: any[] }>('/model-library')
      .then((res) => setAllModels(res.models || []))
      .catch(console.error);
  }, []);

  // Automatic Model Match from Prompt
  useEffect(() => {
    if (!prompt.trim() || imageMode !== 'generate_scratch') {
      return;
    }
    const handler = setTimeout(() => {
      const lowerPrompt = prompt.toLowerCase();
      let matched = null;

      for (const model of allModels) {
        const matchAlias = model.alias_names.some((alias: string) =>
          lowerPrompt.includes(alias.toLowerCase())
        );
        if (matchAlias) {
          matched = model;
          break;
        }
      }

      if (matched) {
        setDetectedModel(matched);
        setSelectedBrand(matched.brand);
        const defaultColor = matched.colours?.[0]?.name || '';
        setSelectedModelColor(defaultColor);
        setSelectedModelAngle('front_exterior');
        const defaultImg = matched.colours?.[0]?.images?.find((img: any) => img.angle === 'front_exterior')?.url 
          || matched.images?.find((img: any) => img.angle === 'front_exterior')?.url 
          || matched.images?.[0]?.url;
        setSelectedModelImage(defaultImg || null);
      }
    }, 450);

    return () => clearTimeout(handler);
  }, [prompt, allModels, imageMode]);

  const handleImageUpload = async (file: File) => {
    try {
      const res = await creativeService.uploadImage(file);
      if (res) {
        setUploadedImageUrl(res.url);
        addToast({ type: 'success', title: 'Upload Success', message: 'Creative/Reference image attached.' });
      }
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Image upload failed. Try again.' });
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast({ type: 'error', title: 'Prompt required', message: 'Please enter a prompt concept.' });
      return;
    }

    setIsGenerating(true);
    setVariants(null);
    setElaboratedBrief(null);
    setStepIndex(1); // Detailing Prompt Concept

    try {
      // Step 1: Call elaborate-prompt
      const elaborateRes = await api.post<{
        success: boolean;
        brief: any;
        matchedModel: any;
      }>('/creatives/elaborate-prompt', { prompt });

      if (!elaborateRes.success || !elaborateRes.brief) {
        throw new Error("Failed to elaborate prompt concept");
      }

      const brief = elaborateRes.brief;
      setElaboratedBrief(brief);

      if (elaborateRes.matchedModel && imageMode === 'generate_scratch') {
        setDetectedModel(elaborateRes.matchedModel);
        setSelectedModelImage(elaborateRes.matchedModel.imageUrl);
      }

      setStepIndex(2); // Generating background scene (contacting Google AI Studio)
      await new Promise((r) => setTimeout(r, 800)); // Stepper visual delay

      setStepIndex(3); // Removing subject background & compositing
      await new Promise((r) => setTimeout(r, 600));

      // Step 2, 3 & 4: Call generate-detailed-post
      const postRes = await api.post<{
        success: boolean;
        creatives: Array<{ creativeUrl: string }>;
        captions: Array<{ caption: string; hashtags: string[] }>;
      }>('/creatives/generate-detailed-post', {
        prompt,
        brand: brief.brand || selectedBrand,
        model_name: brief.model_name || (detectedModel?.model_name ?? ''),
        car_angle: brief.car_angle || 'front-three-quarter',
        background_theme: brief.background_theme,
        background_details: brief.background_details,
        background_details_option2: brief.background_details_option2,
        background_details_option3: brief.background_details_option3,
        lighting_mood: brief.lighting_mood,
        headline: brief.headline,
        caption: brief.caption,
        caption_option2: brief.caption_option2,
        caption_option3: brief.caption_option3,
        hashtags: brief.hashtags,
        hashtags_option2: brief.hashtags_option2,
        hashtags_option3: brief.hashtags_option3,
        image_mode: imageMode,
        uploaded_image_url: uploadedImageUrl || undefined,
        model_image_url: selectedModelImage || undefined
      });

      setStepIndex(4); // Branded overlays
      await new Promise((r) => setTimeout(r, 500));

      if (!postRes.success || !postRes.creatives?.length) {
        throw new Error("Failed to generate detailed creative post");
      }

      setStepIndex(5); // Writing copy

      const mappedCaptions = postRes.captions.map((capOpt, idx) => ({
        caption_text: capOpt.caption,
        hashtags: capOpt.hashtags,
        suggested_emoji: [],
        platform_notes: `Option ${idx + 1}`,
        style: `Option ${idx + 1}`,
      }));

      const mappedCreatives = postRes.creatives.map((creOpt, idx) => ({
        id: `tpl_detailed_creative_${idx}`,
        template_name: `Option ${idx + 1}`,
        thumbnail_url: creOpt.creativeUrl,
        platform_urls: {
          facebook: creOpt.creativeUrl,
          instagram: creOpt.creativeUrl,
          gmb: creOpt.creativeUrl,
        }
      }));

      setSelectedCreativeIdx(null);
      setSelectedCaptionIdx(null);
      setIsCheckedOut(false);
      setActiveSection(2);

      setVariants({
        captions: mappedCaptions,
        hindi_captions: null,
        creatives: mappedCreatives,
        inventory_matched: null,
        platforms_requested: selectedPlatforms,
      });

      // Default caption: Option 1 text + hashtags joined
      const tagsStr = postRes.captions[0]?.hashtags?.length
        ? `\n\n${postRes.captions[0].hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
        : '';
      setCaption(`${postRes.captions[0]?.caption || ''}${tagsStr}`);

      setAiImageUrls(postRes.creatives.map(c => c.creativeUrl));

      addToast({ type: 'success', title: 'Post Ready!', message: 'Branded creatives and caption options generated.' });
    } catch (err: any) {
      console.error(err);
      addToast({ type: 'error', title: 'Generation failed', message: err.message || 'Creative generation failed.' });
    } finally {
      setIsGenerating(false);
      setStepIndex(0);
    }
  };

  const handleRegenerateDetailedPost = async () => {
    if (!elaboratedBrief) return;
    setIsGenerating(true);
    setStepIndex(2); // Start background step

    try {
      setStepIndex(3); // Compositing
      const postRes = await api.post<{
        success: boolean;
        creatives: Array<{ creativeUrl: string }>;
        captions: Array<{ caption: string; hashtags: string[] }>;
      }>('/creatives/generate-detailed-post', {
        prompt,
        brand: elaboratedBrief.brand || selectedBrand,
        model_name: elaboratedBrief.model_name || (detectedModel?.model_name ?? ''),
        car_angle: elaboratedBrief.car_angle || 'front-three-quarter',
        background_theme: elaboratedBrief.background_theme,
        background_details: elaboratedBrief.background_details,
        background_details_option2: elaboratedBrief.background_details_option2,
        background_details_option3: elaboratedBrief.background_details_option3,
        lighting_mood: elaboratedBrief.lighting_mood,
        headline: elaboratedBrief.headline,
        caption: elaboratedBrief.caption,
        caption_option2: elaboratedBrief.caption_option2,
        caption_option3: elaboratedBrief.caption_option3,
        hashtags: elaboratedBrief.hashtags,
        hashtags_option2: elaboratedBrief.hashtags_option2,
        hashtags_option3: elaboratedBrief.hashtags_option3,
        image_mode: imageMode,
        uploaded_image_url: uploadedImageUrl || undefined,
        model_image_url: selectedModelImage || undefined
      });

      setStepIndex(4); // Branded overlays

      if (!postRes.success || !postRes.creatives?.length) {
        throw new Error("Failed to regenerate creative");
      }

      setStepIndex(5); // Writing copy

      const mappedCaptions = postRes.captions.map((capOpt, idx) => ({
        caption_text: capOpt.caption,
        hashtags: capOpt.hashtags,
        suggested_emoji: [],
        platform_notes: `Option ${idx + 1}`,
        style: `Option ${idx + 1}`,
      }));

      const mappedCreatives = postRes.creatives.map((creOpt, idx) => ({
        id: `tpl_detailed_creative_${idx}`,
        template_name: `Option ${idx + 1}`,
        thumbnail_url: creOpt.creativeUrl,
        platform_urls: {
          facebook: creOpt.creativeUrl,
          instagram: creOpt.creativeUrl,
          gmb: creOpt.creativeUrl,
        }
      }));

      setSelectedCreativeIdx(null);
      setSelectedCaptionIdx(null);
      setIsCheckedOut(false);

      setVariants({
        captions: mappedCaptions,
        hindi_captions: null,
        creatives: mappedCreatives,
        inventory_matched: null,
        platforms_requested: selectedPlatforms,
      });

      // Default caption: Option 1 text + hashtags joined
      const tagsStr = postRes.captions[0]?.hashtags?.length
        ? `\n\n${postRes.captions[0].hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
        : '';
      setCaption(`${postRes.captions[0]?.caption || ''}${tagsStr}`);

      setAiImageUrls(postRes.creatives.map(c => c.creativeUrl));

      addToast({ type: 'success', title: 'Updated!', message: 'Post regenerated using modified layers.' });
    } catch (err: any) {
      console.error(err);
      addToast({ type: 'error', title: 'Update failed', message: err.message || 'Could not update post.' });
    } finally {
      setIsGenerating(false);
      setStepIndex(0);
    }
  };

  const handlePublishNow = async () => {
    if (!variants) return;

    const connectedSelected = selectedPlatforms.filter((p) => {
      if (p === 'gmb') return connectedAccounts.includes('google');
      return connectedAccounts.includes(p);
    });
    if (connectedSelected.length === 0) {
      addToast({
        type: 'error',
        title: 'No accounts connected',
        message: 'Connect Facebook or Google in settings before publishing.',
      });
      return;
    }

    setIsPublishing(true);
    try {
      const cap = selectedCaptionIdx !== null ? variants.captions[selectedCaptionIdx] : null;
      const cre = selectedCreativeIdx !== null ? variants.creatives[selectedCreativeIdx] : null;
      const res = await postService.create({
        promptText: prompt,
        captionText: caption,
        captionHashtags: cap?.hashtags ?? [],
        creativeUrls: (cre?.platform_urls as Record<string, string>) ?? {},
        platforms: selectedPlatforms,
      });
      await postService.publish(res.item.id, selectedPlatforms);
      setPublished(true);
      addToast({ type: 'success', title: 'Success', message: 'Branded post published successfully!' });
    } catch {
      addToast({ type: 'error', title: 'Publish failed', message: 'Could not publish.' });
    } finally {
      setIsPublishing(false);
    }
  };

  const confirmSchedule = async () => {
    if (!variants || !scheduleTime) return;
    setIsPublishing(true);
    try {
      const cap = selectedCaptionIdx !== null ? variants.captions[selectedCaptionIdx] : null;
      const cre = selectedCreativeIdx !== null ? variants.creatives[selectedCreativeIdx] : null;
      const res = await postService.create({
        promptText: prompt,
        captionText: caption,
        captionHashtags: cap?.hashtags ?? [],
        creativeUrls: (cre?.platform_urls as Record<string, string>) ?? {},
        platforms: selectedPlatforms,
      });
      await postService.schedule(res.item.id, selectedPlatforms, new Date(scheduleTime).toISOString());
      setShowScheduleModal(false);
      setPublished(true);
      addToast({ type: 'success', title: 'Scheduled', message: 'Post scheduled successfully!' });
    } catch {
      addToast({ type: 'error', title: 'Schedule failed', message: 'Could not schedule.' });
    } finally {
      setIsPublishing(false);
    }
  };

  // Video generation functions (Legacy)
  const handleVideoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideoImage(true);
    try {
      const res = await creativeService.uploadImage(file);
      setVideoImageId(res.id);
      setVideoImageUrl(res.url);
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not upload image.' });
    } finally {
      setUploadingVideoImage(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!videoPrompt.trim()) return;
    setGeneratingVideo(true);
    setVideoJobId(null);
    setVideoUrl(null);
    try {
      const res = await api.post<{ success: boolean; video_url?: string; job_id?: string; status?: string; message?: string }>('/creatives/generate-video', {
        prompt: videoPrompt,
        image_id: videoImageId ?? undefined,
        duration_seconds: videoDuration,
        aspect_ratio: videoAspect,
      });
      if (res.video_url) {
        setVideoUrl(res.video_url);
        addToast({ type: 'success', title: 'Video ready!', message: `Your ${videoDuration}s video is generated.` });
      } else if (res.job_id) {
        setVideoJobId(res.job_id);
        addToast({ type: 'success', title: 'Video queued', message: 'Video is being processed.' });
      }
    } catch {
      addToast({ type: 'error', title: 'Video generation failed', message: 'Could not generate video.' });
    } finally {
      setGeneratingVideo(false);
    }
  };

  const selectModelManually = (model: any) => {
    setDetectedModel(model);
    setSelectedBrand(model.brand);
    const defaultColor = model.colours?.[0]?.name || '';
    setSelectedModelColor(defaultColor);
    setSelectedModelAngle('front_exterior');
    const defaultImg = model.colours?.[0]?.images?.find((img: any) => img.angle === 'front_exterior')?.url 
      || model.images?.find((img: any) => img.angle === 'front_exterior')?.url 
      || model.images?.[0]?.url;
    setSelectedModelImage(defaultImg || null);
    setShowAllModelsSelector(false);
  };

  // Success Screen
  if (published) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white border border-slate-200 rounded-3xl p-10 shadow-xl max-w-md w-full mx-4">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-150 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600 animate-bounce" />
          </div>
          <h3 className="text-xl font-black text-slate-900">Post Published successfully!</h3>
          <p className="text-slate-500 text-sm mt-2">Branded post queued to: {selectedPlatforms.join(', ')}</p>
          <div className="flex gap-3 mt-8 justify-center">
            <button
              onClick={() => {
                setVariants(null);
                setPrompt('');
                setPublished(false);
                setElaboratedBrief(null);
                setUploadedImageUrl(null);
              }}
              className="px-5 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 bg-white rounded-xl hover:bg-slate-55 transition-colors cursor-pointer"
            >
              Create Another
            </button>
            <NavLink to="/calendar" className="px-5 py-2.5 text-sm font-bold bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/10">
              View Calendar
            </NavLink>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* Top Bar */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 shrink-0 shadow-xs">
        <NavLink to="/" className="text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </NavLink>
        <span className="text-slate-300">/</span>
        <span className="text-slate-850 text-sm font-black uppercase tracking-wider">Create Social Post</span>
        {scheduleTime && (
          <span className="flex items-center gap-1.5 bg-orange-55 text-[10px] md:text-xs text-orange-650 font-bold px-2.5 py-1 rounded-full border border-orange-200/60 shadow-sm">
            <Calendar className="w-3.5 h-3.5 shrink-0" />
            Scheduling for: {new Date(scheduleTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        )}
        {variants && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" /> Post Draft Ready
          </span>
        )}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Form Controls */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-4 max-w-3xl border-r border-slate-200 bg-white">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Generate Branded Post</h2>
            <p className="text-xs text-slate-500 font-medium">Specify your marketing concept, choose a visual creative source, and let Gemini compile your post.</p>
          </div>

          {/* Section 1: Concept & Creative Type Accordion */}
          <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            <button
              onClick={() => setActiveSection(1)}
              className={`w-full px-5 py-4 flex items-center justify-between text-left transition-colors focus:outline-none cursor-pointer ${
                activeSection === 1 ? 'bg-slate-50 border-b border-slate-200' : 'bg-white hover:bg-slate-50'
              }`}
            >
              <div>
                <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-orange-500" /> Section 1: Campaign Prompt & Visual Type
                </h3>
                {activeSection !== 1 && prompt.trim() && (
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5 truncate max-w-lg">
                    Prompt: "{prompt}" ({imageMode.replace('_', ' ')})
                  </p>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${activeSection === 1 ? 'rotate-180' : ''}`} />
            </button>

            {activeSection === 1 && (
              <div className="p-5 space-y-6 bg-white">
                {/* Prompt Entry */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                    What is your post about?
                  </label>
                  <div className="bg-slate-50/50 border border-slate-250 rounded-2xl p-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 transition-colors shadow-inner">
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      placeholder="e.g. Create a promotion post for summer for Creta Model, offering a special exchange discount"
                      className="w-full h-24 bg-transparent text-sm text-slate-800 resize-none focus:outline-none placeholder:text-slate-450 leading-relaxed"
                      maxLength={400}
                    />
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[10px] text-slate-400 font-semibold">
                      <span>{prompt.length} / 400 characters</span>
                      {prompt.trim() && (
                        <button onClick={() => setPrompt('')} className="text-red-500 hover:underline cursor-pointer">
                          Clear Concept
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Creative Mode Selector */}
                <div className="space-y-3">
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Creative Visual Type
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { id: 'generate_scratch', title: 'Scratch AI', desc: 'imagen background + model library car cutout' },
                      { id: 'add_inspiration', title: 'Inspiration Recreate', desc: 'paste reference layout, create similar branded' },
                      { id: 'add_creative', title: 'Branded Creative', desc: 'use uploaded photo exactly as-is' }
                    ].map((mode) => {
                      const isActive = imageMode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => setImageMode(mode.id as any)}
                          className={`p-4 rounded-2xl border-2 text-left flex flex-col justify-between transition-all duration-200 cursor-pointer ${
                            isActive
                              ? 'border-orange-500 bg-orange-50/20 shadow-sm'
                              : 'border-slate-200 bg-slate-50/20 hover:border-slate-350 hover:bg-slate-50/40'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between">
                              <span className={`text-xs font-black tracking-tight ${isActive ? 'text-orange-700' : 'text-slate-700'}`}>
                                {mode.title}
                              </span>
                              <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isActive ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                                {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-550 font-medium leading-relaxed mt-2">{mode.desc}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Contextual Upload Box or Library Matched Model */}
                {imageMode === 'generate_scratch' ? (
                  <div className="space-y-2.5">
                    <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                      Target Vehicle Image (From Model Library)
                    </label>
                    {detectedModel ? (
                      <div className="flex items-center gap-4 p-4 border border-slate-200 rounded-2xl bg-slate-50/50 shadow-xs relative group overflow-hidden">
                        <div className="w-24 h-16 rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
                          {selectedModelImage ? (
                            <img src={selectedModelImage} alt={detectedModel.model_name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-350 bg-slate-100">🚗</div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="text-[9px] font-bold text-orange-600 tracking-wider uppercase">{detectedModel.brand}</span>
                          <h4 className="font-extrabold text-slate-800 text-sm truncate mt-0.5">{detectedModel.model_name}</h4>
                          <p className="text-[10px] text-slate-500 font-semibold mt-1">
                            Angle: <span className="capitalize">{selectedModelAngle.replace('_', ' ')}</span> | Color: {selectedModelColor || 'Default'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setShowModelPickerModal(true)}
                            className="text-xs px-2.5 py-1.5 font-bold border border-slate-250 bg-white hover:bg-slate-55 text-slate-700 rounded-lg shadow-xs cursor-pointer flex items-center gap-1"
                          >
                            Customize View
                          </button>
                          <button
                            onClick={() => setShowAllModelsSelector(true)}
                            className="text-xs px-2.5 py-1.5 font-bold border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-xs cursor-pointer"
                          >
                            Change Model
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-slate-300 rounded-2xl p-6 text-center bg-slate-50/50 space-y-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">🚗</div>
                        <div>
                          <p className="text-xs font-bold text-slate-700">No matched model found in prompt</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Type a vehicle name (e.g. "Creta") or pick one manually below</p>
                        </div>
                        <button
                          onClick={() => setShowAllModelsSelector(true)}
                          className="px-4 py-1.5 text-xs font-bold bg-white border border-slate-255 text-slate-700 hover:bg-slate-50 rounded-lg shadow-xs cursor-pointer"
                        >
                          Select Model from Library
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                      {imageMode === 'add_creative' ? 'Upload Creative (Ready-made)' : 'Upload Reference Layout (Inspiration)'}
                    </label>
                    
                    {uploadedImageUrl ? (
                      <div className="relative rounded-2xl overflow-hidden border border-slate-255 w-full aspect-[21/9] shadow-xs group bg-slate-50">
                        <img src={uploadedImageUrl} alt="Attached" className="w-full h-full object-cover" />
                        <button
                          onClick={() => { setUploadedImageUrl(null); }}
                          className="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/85 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <X className="w-4 h-4 text-white" />
                        </button>
                        <span className="absolute bottom-3 left-3 text-xs text-white font-bold bg-black/50 px-3 py-1.5 rounded-full">
                          Image attached & ready
                        </span>
                      </div>
                    ) : (
                      <div
                        ref={dropzoneRef}
                        tabIndex={0}
                        onFocus={() => setIsDropzoneFocused(true)}
                        onBlur={() => setIsDropzoneFocused(false)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={async (e) => {
                          e.preventDefault();
                          const file = e.dataTransfer.files?.[0];
                          if (file?.type.startsWith('image/')) await handleImageUpload(file);
                        }}
                        onPaste={async (e) => {
                          const item = e.clipboardData.items[0];
                          if (item && item.type.startsWith('image/')) {
                            const file = item.getAsFile();
                            if (file) await handleImageUpload(file);
                          }
                        }}
                        onClick={() => dropzoneRef.current?.focus()}
                        className={`border border-dashed rounded-2xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[180px] focus:outline-none cursor-pointer ${
                          isDropzoneFocused
                            ? 'border-orange-500 bg-orange-50/15 shadow-sm ring-2 ring-orange-500/10'
                            : 'border-slate-300 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-50/80'
                        }`}
                      >
                        {isDropzoneFocused && (
                          <div className="mb-2 bg-orange-500 text-white text-[10px] font-black uppercase px-2.5 py-1 rounded-full animate-pulse shadow-sm">
                            Ready to Paste! Press Cmd+V / Ctrl+V
                          </div>
                        )}
                        <ImagePlus className={`w-8 h-8 mb-2 transition-colors ${isDropzoneFocused ? 'text-orange-500' : 'text-slate-400'}`} />
                        <p className="text-xs font-bold text-slate-700">Click to focus box, then copy-paste image</p>
                        <p className="text-[10px] text-slate-450 mt-1 max-w-sm leading-relaxed">
                          Supports clipboard screenshots, drag & drop, or use the button below to upload files.
                        </p>
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById('contextual-creative-file')?.click();
                          }}
                          className="mt-4 px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                        >
                          Upload from Computer
                        </button>

                        <input
                          id="contextual-creative-file"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) await handleImageUpload(file);
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Generate Button in Section 1 */}
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !prompt.trim() || (imageMode !== 'generate_scratch' && !uploadedImageUrl)}
                  className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating Branded Post…
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Generate Post
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Section 2: AI Detailing Layers Accordion */}
          <div className="border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
            <button
              onClick={() => {
                if (elaboratedBrief) {
                  setActiveSection(2);
                } else {
                  addToast({ type: 'info', title: 'Detailing not ready', message: 'Generate a campaign concept first to unlock detailing layers.' });
                }
              }}
              className={`w-full px-5 py-4 flex items-center justify-between text-left transition-colors focus:outline-none ${
                !elaboratedBrief ? 'opacity-50 cursor-not-allowed bg-slate-50' : 
                activeSection === 2 ? 'bg-slate-50 border-b border-slate-200 cursor-pointer' : 'bg-white hover:bg-slate-50 cursor-pointer'
              }`}
            >
              <div>
                <h3 className="text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Layout className="w-4 h-4 text-orange-500" /> Section 2: Detailing Layer & Editable Parameters
                </h3>
                {activeSection !== 2 && elaboratedBrief && (
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5 truncate max-w-lg">
                    Headline: "{elaboratedBrief.headline}" | BG Theme: {elaboratedBrief.background_theme}
                  </p>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${activeSection === 2 ? 'rotate-180' : ''}`} />
            </button>

            {activeSection === 2 && elaboratedBrief && (
              <div className="p-5 space-y-5 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Headline Text</label>
                    <input
                      type="text"
                      value={elaboratedBrief.headline}
                      onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, headline: e.target.value })}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Car Angle</label>
                    <input
                      type="text"
                      value={elaboratedBrief.car_angle}
                      onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, car_angle: e.target.value })}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Lighting & Mood</label>
                    <input
                      type="text"
                      value={elaboratedBrief.lighting_mood}
                      onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, lighting_mood: e.target.value })}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Background theme</label>
                    <input
                      type="text"
                      value={elaboratedBrief.background_theme}
                      onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, background_theme: e.target.value })}
                      className="w-full text-xs font-semibold px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="block text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">Background Scene Details (AI Generation Prompt)</label>
                    <textarea
                      value={elaboratedBrief.background_details}
                      onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, background_details: e.target.value })}
                      rows={3}
                      className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-orange-500 resize-none leading-relaxed"
                    />
                  </div>
                </div>

                <button
                  onClick={handleRegenerateDetailedPost}
                  disabled={isGenerating}
                  className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-2xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Regenerate Post
                    </>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Legacy Tools & Video Generator */}
          <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-slate-50/50 mt-8">
            <button
              onClick={() => setLegacyExpanded(!legacyExpanded)}
              className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors focus:outline-none cursor-pointer"
            >
              <div>
                <h4 className="text-xs font-black text-slate-700 flex items-center gap-1.5 uppercase tracking-wider">
                  <Film className="w-4 h-4 text-orange-500" /> Legacy Tools & Video Generator
                </h4>
                <p className="text-[10px] text-slate-450 mt-0.5">Generate video concepts, Reels duration, and other legacy features</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${legacyExpanded ? 'rotate-180' : ''}`} />
            </button>

            {legacyExpanded && (
              <div className="px-5 pb-5 pt-3 border-t border-slate-150 space-y-4 bg-white">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Video Concept</label>
                  <textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    rows={2}
                    placeholder="Describe video story board concept..."
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 bg-white text-xs text-slate-800 placeholder:text-slate-400"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Upload base car photo</label>
                  <input ref={videoImageRef} type="file" accept="image/*" className="hidden" onChange={handleVideoImageUpload} />
                  {videoImageUrl ? (
                    <div className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50">
                      <img src={videoImageUrl} alt="Base" className="w-10 h-10 rounded-lg object-cover" />
                      <span className="text-xs text-slate-700">Image attached</span>
                      <button onClick={() => { setVideoImageId(null); setVideoImageUrl(null); }} className="ml-auto p-1 hover:text-red-500">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => videoImageRef.current?.click()}
                      className="px-3 py-2 text-xs font-bold border border-slate-200 hover:border-orange-500 rounded-xl text-slate-600 bg-white cursor-pointer w-full"
                    >
                      {uploadingVideoImage ? 'Uploading...' : 'Choose File'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Duration</label>
                    <div className="flex gap-1.5">
                      {[15, 30].map((s) => (
                        <button key={s} onClick={() => setVideoDuration(s)}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${videoDuration === s ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-700'}`}
                        >{s}s</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Aspect Ratio</label>
                    <div className="flex gap-1.5">
                      {['9:16', '1:1'].map((r) => (
                        <button key={r} onClick={() => setVideoAspect(r as any)}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${videoAspect === r ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-slate-700'}`}
                        >{r}</button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleGenerateVideo}
                  disabled={!videoPrompt.trim() || generatingVideo}
                  className="w-full py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-sm"
                >
                  {generatingVideo ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                  Generate AI Video
                </button>

                {videoUrl && (
                  <div className="bg-slate-955 p-3 rounded-xl flex flex-col items-center">
                    <video src={videoUrl} controls className="max-h-[280px] rounded-lg" />
                    <a href={videoUrl} download className="text-xs text-orange-500 mt-2 font-bold hover:underline">Download MP4</a>
                  </div>
                )}

                {videoJobId && !videoUrl && (
                  <p className="text-[10px] text-orange-550 font-semibold animate-pulse text-center mt-2">
                    Video generation job queued: {videoJobId}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Platform Preview & Checkout Flow */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 bg-slate-50 flex flex-col justify-between">
          {!variants ? (
            /* Empty State Preview (Before Generation) */
            <div className="my-auto flex flex-col items-center justify-center text-center space-y-3">
              <div className="aspect-square max-w-md mx-auto w-full border-2 border-dashed border-slate-300 rounded-3xl bg-slate-100/50 flex flex-col items-center justify-center text-slate-400 space-y-3 shadow-inner">
                <Layout className="w-12 h-12 text-slate-300 stroke-1" />
                <p className="text-xs font-bold text-slate-500">Post Creative Preview</p>
                <p className="text-[10px] text-slate-400 max-w-xs leading-relaxed">
                  Enter a concept prompt on the left and click Generate to see options here.
                </p>
              </div>
            </div>
          ) : !isCheckedOut ? (
            /* Mix-and-match Selection Screen (Before Checkout) */
            <div className="space-y-6">
              <div className="space-y-1">
                <h3 className="text-sm font-extrabold text-slate-500 uppercase tracking-wider">Select Options</h3>
                <p className="text-xs text-slate-400">Choose 1 creative layout and 1 caption style to finalize.</p>
              </div>

              {/* 3 Creative Options Grid */}
              <div className="space-y-2">
                <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Creative Visual Options
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {variants.creatives.map((cre, idx) => {
                    const isSelected = selectedCreativeIdx === idx;
                    return (
                      <div
                        key={cre.id}
                        onClick={() => setSelectedCreativeIdx(idx)}
                        className={`group relative aspect-square rounded-2xl overflow-hidden border-2 text-left cursor-pointer transition-all ${
                          isSelected
                            ? 'border-orange-500 shadow-md scale-102 ring-2 ring-orange-500/10'
                            : 'border-slate-200 hover:border-slate-350 bg-white'
                        }`}
                      >
                        <img src={cre.thumbnail_url || undefined} alt={`Option ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/5 group-hover:bg-transparent transition-colors" />
                        
                        {/* Zoom Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setZoomImageIdx(idx);
                          }}
                          className="absolute top-2 left-2 bg-black/60 hover:bg-orange-500 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all z-20 cursor-pointer"
                          title="Zoom Creative"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>

                        {isSelected && (
                          <div className="absolute top-2 right-2 bg-orange-500 text-white rounded-full p-1 shadow-sm z-10">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                        <span className={`absolute bottom-2 left-2 text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${
                          isSelected ? 'bg-orange-500 text-white' : 'bg-black/60 text-white'
                        }`}>
                          Option {idx + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 Caption Options List */}
              <div className="space-y-2">
                <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                  Caption Copy Options
                </label>
                <div className="space-y-2.5">
                  {variants.captions.map((capOpt, idx) => {
                    const isSelected = selectedCaptionIdx === idx;
                    return (
                      <button
                        key={idx}
                        onClick={() => {
                          setSelectedCaptionIdx(idx);
                        }}
                        className={`w-full text-left p-4 rounded-2xl border-2 transition-all cursor-pointer bg-white flex flex-col justify-between ${
                          isSelected
                            ? 'border-slate-900 shadow-xs'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 w-full">
                          <span className={`text-[10px] font-black uppercase ${isSelected ? 'text-slate-900' : 'text-slate-500'}`}>
                            Option {idx + 1} ({capOpt.style})
                          </span>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-slate-900" />}
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed line-clamp-2">
                          {capOpt.caption_text}
                        </p>
                        {capOpt.hashtags?.length > 0 && (
                          <p className="text-[10px] text-slate-500 font-semibold mt-1.5">
                            {capOpt.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Proceed to Checkout Button */}
              <div className="pt-4">
                <button
                  onClick={() => {
                    if (selectedCreativeIdx !== null && selectedCaptionIdx !== null) {
                      const capOpt = variants.captions[selectedCaptionIdx];
                      const tags = capOpt.hashtags?.length
                        ? `\n\n${capOpt.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
                        : '';
                      setCaption(`${capOpt.caption_text}${tags}`);
                      setIsCheckedOut(true);
                    }
                  }}
                  disabled={selectedCreativeIdx === null || selectedCaptionIdx === null}
                  className="w-full py-4 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-500/10 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                >
                  Checkout Selection
                </button>
              </div>
            </div>
          ) : (
            /* Checked-out Preview & Publish Screen */
            <div className="space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-700 uppercase tracking-wider">Mobile Preview Mockup</h3>
                    <p className="text-xs text-slate-400">Review layout presentation on each network.</p>
                  </div>
                  <button
                    onClick={() => setIsCheckedOut(false)}
                    className="text-xs font-bold text-orange-500 hover:text-orange-600 cursor-pointer flex items-center gap-1"
                  >
                    ← Change Selection
                  </button>
                </div>

                {/* Mobile Preview Tabs */}
                <div className="flex bg-slate-100 rounded-xl p-1 gap-1 border border-slate-200 shrink-0">
                  {[
                    { id: 'facebook', label: 'Facebook' },
                    { id: 'instagram', label: 'Instagram' },
                    { id: 'gmb', label: 'Google My Business' }
                  ].map((tab) => {
                    const isActive = previewTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setPreviewTab(tab.id as any)}
                        className={`flex-1 py-2 text-center rounded-lg text-xs font-black transition-all cursor-pointer ${
                          isActive ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Simulated Smartphone Screen */}
                <div className="w-full max-w-[340px] aspect-[4/5] mx-auto border border-slate-250 bg-white rounded-3xl overflow-hidden shadow-lg flex flex-col shrink-0">
                  {selectedCreativeIdx !== null && selectedCaptionIdx !== null && (
                    <PlatformPreview
                      platform={previewTab === 'gmb' ? 'google' : previewTab as any}
                      dealerName={dealerProfile?.name || 'Authorized Dealer'}
                      dealerInitials={dealerProfile?.name ? dealerProfile.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'AD'}
                      caption={caption}
                      imageUrl={aiImageUrls[selectedCreativeIdx] || null}
                      isGenerating={false}
                      promptText={prompt}
                      selectedDesign={selectedCreativeIdx}
                    />
                  )}
                </div>

                {/* Caption Editor inside Checkout */}
                <div className="space-y-2">
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Edit Final Caption Text
                  </label>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    rows={4}
                    className="w-full border border-slate-250 rounded-2xl px-4 py-3 bg-white text-xs text-slate-850 focus:outline-none focus:border-orange-500 leading-relaxed shadow-sm resize-none"
                  />
                  {selectedCaptionIdx !== null && variants.captions[selectedCaptionIdx]?.hashtags?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {variants.captions[selectedCaptionIdx].hashtags.map((h, i) => {
                        const tag = h.startsWith('#') ? h : `#${h}`;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              if (!caption.includes(tag)) {
                                setCaption(prev => prev.trim() + ' ' + tag);
                              }
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-orange-50 border border-slate-200 hover:border-orange-300 rounded-lg text-[10px] font-extrabold text-slate-600 hover:text-orange-600 transition-colors cursor-pointer"
                          >
                            + {tag}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom checkout platform publisher options */}
              <div className="pt-6 border-t border-slate-200 space-y-4">
                <div className="space-y-2">
                  <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                    Publish Platforms
                  </label>
                  <div className="flex gap-3">
                    {PLATFORMS.map((p) => {
                      const isSelected = selectedPlatforms.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPlatforms(prev =>
                              prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                            );
                          }}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'border-slate-800 bg-slate-900 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-655 hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                          {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowScheduleModal(true)}
                    className="px-5 py-3 border border-slate-250 text-slate-700 bg-white hover:bg-slate-50 font-bold rounded-2xl text-xs flex items-center gap-2 cursor-pointer shadow-xs"
                  >
                    <Calendar className="w-4 h-4" />
                    Schedule
                  </button>
                  <button
                    onClick={handlePublishNow}
                    disabled={isPublishing || selectedPlatforms.length === 0}
                    className="flex-1 py-3 bg-slate-900 hover:bg-slate-950 text-white font-bold rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isPublishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    Publish Branded Post Now
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Model Picker Modal */}
      {showModelPickerModal && detectedModel && (
        <ModelPickerModal
          model={detectedModel}
          initialColor={selectedModelColor}
          initialAngle={selectedModelAngle}
          onClose={() => setShowModelPickerModal(false)}
          onApply={(color: string, angle: string, imageUrl: string) => {
            setSelectedModelColor(color);
            setSelectedModelAngle(angle);
            setSelectedModelImage(imageUrl);
            setShowModelPickerModal(false);
          }}
        />
      )}

      {/* Selector Modal for All Models */}
      {showAllModelsSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-extrabold text-slate-950 text-base">Select Car Model</h3>
              <button onClick={() => setShowAllModelsSelector(false)} className="p-1 hover:bg-slate-200 rounded-full cursor-pointer">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              {allModels.map((model) => (
                <button
                  key={model.id}
                  onClick={() => selectModelManually(model)}
                  className="w-full p-3 rounded-xl border border-slate-200 hover:border-orange-500 hover:bg-orange-50/10 flex items-center gap-3 transition-colors cursor-pointer text-left"
                >
                  <div className="w-12 h-8 rounded border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                    <img src={model.images?.[0]?.url || model.colours?.[0]?.images?.[0]?.url} alt={model.model_name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-450 uppercase tracking-wide block">{model.brand}</span>
                    <span className="text-xs font-bold text-slate-800">{model.model_name}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Stepper Progress Modal */}
      {isGenerating && stepIndex > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white/85 border border-white/20 backdrop-blur-xl rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center space-y-6 animate-in zoom-in-95 duration-200">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100" />
              <div className="absolute inset-0 rounded-full border-4 border-orange-500 border-t-transparent animate-spin" />
              <Sparkles className="w-6 h-6 text-orange-500" />
            </div>

            <div className="space-y-1">
              <h3 className="font-extrabold text-slate-900 text-base">Creating Branded Post</h3>
              <p className="text-xs text-slate-550">Gemini is details-layering your campaign...</p>
            </div>

            <div className="space-y-3.5 text-left border-t border-slate-200/50 pt-4">
              {[
                { step: 1, label: 'Detailing Prompt Concept' },
                { step: 2, label: 'Generating background setting scene' },
                { step: 3, label: 'Extracting car subject & lighting matching' },
                { step: 4, label: 'Overlaying dealer branding details' },
                { step: 5, label: 'Writing Hinglish post caption & tags' }
              ].map((s) => {
                const isDone = stepIndex > s.step;
                const isActive = stepIndex === s.step;
                return (
                  <div key={s.step} className="flex items-center gap-3 text-xs">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center border font-bold text-[10px] shrink-0 ${
                      isDone ? 'bg-emerald-500 border-emerald-500 text-white' :
                      isActive ? 'bg-orange-500 border-orange-500 text-white animate-pulse' :
                      'border-slate-200 text-slate-400 bg-white'
                    }`}>
                      {isDone ? '✓' : s.step}
                    </div>
                    <span className={`font-semibold ${isActive ? 'text-slate-900 font-bold' : isDone ? 'text-slate-500' : 'text-slate-400'}`}>
                      {s.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">Schedule Post</h3>
            <p className="text-xs text-slate-550">Pick a future date and time to publish this post automatically.</p>
            <input
              type="datetime-local"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-orange-500"
            />
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-50 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmSchedule}
                disabled={!scheduleTime}
                className="px-4 py-2 text-xs font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
              >
                Confirm Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Studio Modal */}
      <CanvasStudio
        open={canvasStudioOpen}
        onClose={() => setCanvasStudioOpen(false)}
        brief={prompt}
        model={detectedModel?.model_name || 'Creta'}
        initialHeading={elaboratedBrief?.headline || ''}
        onExport={(dataUrl: string) => {
          if (selectedCreativeIdx === null) return;
          const idx = selectedCreativeIdx;
          setVariants(prev => {
            if (!prev) return null;
            const next = { ...prev };
            next.creatives = [...next.creatives];
            next.creatives[idx] = {
              ...next.creatives[idx]!,
              thumbnail_url: dataUrl,
              platform_urls: { facebook: dataUrl, instagram: dataUrl, gmb: dataUrl }
            };
            return next;
          });
          setAiImageUrls(prev => {
            const next = [...prev];
            next[idx] = dataUrl;
            return next;
          });
          addToast({ type: 'success', title: 'Studio Saved', message: 'Manual adjustments applied to your creative!' });
        }}
      />

      {/* Zoom Creative Lightbox Modal */}
      {zoomImageIdx !== null && aiImageUrls[zoomImageIdx] && (
        <div 
          className="fixed inset-0 z-[110] flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-250"
          onClick={() => setZoomImageIdx(null)}
        >
          {/* Close button */}
          <button
            onClick={() => setZoomImageIdx(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 p-2.5 rounded-full transition-all cursor-pointer z-30"
          >
            <X className="w-6 h-6" />
          </button>

          <div 
            className="relative max-w-4xl w-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking content
          >
            {/* Left navigation arrow */}
            <button
              onClick={() => setZoomImageIdx(prev => (prev !== null && prev > 0 ? prev - 1 : aiImageUrls.length - 1))}
              className="absolute left-4 bg-white/10 hover:bg-white/25 text-white p-3 rounded-full transition-all cursor-pointer z-20 shadow-md backdrop-blur-xs"
            >
              <ChevronDown className="w-6 h-6 rotate-90" />
            </button>

            {/* Main Zoomed Image */}
            <div className="w-full flex flex-col items-center justify-center space-y-4">
              <div className="relative aspect-square max-w-[80vh] w-full bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-white/15">
                <img 
                  src={aiImageUrls[zoomImageIdx]} 
                  alt={`Option ${zoomImageIdx + 1}`} 
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Bottom selection options & title inside zoom */}
              <div className="flex items-center gap-4 bg-slate-900/80 border border-white/10 px-6 py-3 rounded-2xl text-white backdrop-blur-md">
                <span className="text-sm font-black uppercase tracking-wider text-slate-350">
                  Option {zoomImageIdx + 1}
                </span>
                <div className="h-4 w-[1px] bg-white/20" />
                <button
                  onClick={() => {
                    setSelectedCreativeIdx(zoomImageIdx);
                    setZoomImageIdx(null);
                    addToast({ type: 'success', title: 'Selected', message: `Creative Option ${zoomImageIdx + 1} selected.` });
                  }}
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    selectedCreativeIdx === zoomImageIdx
                      ? 'bg-emerald-500 text-white'
                      : 'bg-orange-500 hover:bg-orange-655 text-white'
                  }`}
                >
                  {selectedCreativeIdx === zoomImageIdx ? '✓ Selected' : 'Select as Final'}
                </button>
              </div>
            </div>

            {/* Right navigation arrow */}
            <button
              onClick={() => setZoomImageIdx(prev => (prev !== null && prev < aiImageUrls.length - 1 ? prev + 1 : 0))}
              className="absolute right-4 bg-white/10 hover:bg-white/25 text-white p-3 rounded-full transition-all cursor-pointer z-20 shadow-md backdrop-blur-xs"
            >
              <ChevronDown className="w-6 h-6 -rotate-90" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Model Picker Modal Component ───────────────────────────────────────────
interface ModelPickerModalProps {
  model: {
    brand: string;
    model_name: string;
    colours?: Array<{ name: string; hex: string; images?: Array<{ angle: string; url: string }> }>;
    images?: Array<{ angle: string; url: string }>;
  };
  initialColor: string;
  initialAngle: string;
  onClose: () => void;
  onApply: (color: string, angle: string, imageUrl: string) => void;
}

function ModelPickerModal({ model, initialColor, initialAngle, onClose, onApply }: ModelPickerModalProps) {
  const [tempColor, setTempColor] = useState(initialColor || (model.colours?.[0]?.name ?? ''));
  const [tempAngle, setTempAngle] = useState(initialAngle || 'front_exterior');

  const getImageUrl = (colorName: string, angleName: string) => {
    const colorObj = model.colours?.find((c) => c.name === colorName);
    const imgFromColor = colorObj?.images?.find((img) => img.angle === angleName)?.url;
    if (imgFromColor) return imgFromColor;

    const imgFromGlobal = model.images?.find((img) => img.angle === angleName)?.url;
    if (imgFromGlobal) return imgFromGlobal;

    return model.images?.[0]?.url || model.colours?.[0]?.images?.[0]?.url || '';
  };

  const handleApply = () => {
    const finalUrl = getImageUrl(tempColor, tempAngle);
    onApply(tempColor, tempAngle, finalUrl);
  };

  const angles = [
    { id: 'front_exterior', label: 'Front Exterior' },
    { id: 'rear_exterior', label: 'Rear Exterior' },
    { id: 'side_exterior', label: 'Side Exterior' },
    { id: 'interior_dashboard', label: 'Interior Dashboard' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Select Model Image</h3>
            <p className="text-xs text-slate-500 font-medium">
              Choose from official {model.brand} {model.model_name} media assets
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 p-6 overflow-y-auto space-y-6">
          {/* Colors Selection */}
          {model.colours && model.colours.length > 0 && (
            <div className="space-y-2.5">
              <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
                Color Variant
              </label>
              <div className="flex flex-wrap gap-2.5">
                {model.colours.map((color) => {
                  const isSelected = tempColor === color.name;
                  return (
                    <button
                      key={color.name}
                      onClick={() => setTempColor(color.name)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50 text-orange-700 font-bold shadow-xs'
                          : 'border-slate-200 bg-white text-slate-655 hover:border-slate-350 hover:bg-slate-50'
                      }`}
                    >
                      <span
                        className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                        style={{ backgroundColor: color.hex }}
                      />
                      {color.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Angles Selection */}
          <div className="space-y-2.5">
            <label className="block text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">
              Camera Angle / View
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {angles.map((angle) => {
                const imgUrl = getImageUrl(tempColor, angle.id);
                const isSelected = tempAngle === angle.id;
                return (
                  <button
                    key={angle.id}
                    onClick={() => setTempAngle(angle.id)}
                    className={`relative flex flex-col rounded-2xl overflow-hidden border-2 text-left transition-all group ${
                      isSelected
                        ? 'border-orange-500 shadow-md shadow-orange-100'
                        : 'border-slate-200 hover:border-slate-355 bg-slate-50/20'
                    }`}
                  >
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={angle.label}
                        className="w-full aspect-video object-cover border-b border-slate-100 group-hover:scale-[1.02] transition-transform duration-350"
                      />
                    ) : (
                      <div className="w-full aspect-video bg-slate-100 flex items-center justify-center border-b border-slate-100 text-slate-400">
                        <ImagePlus className="w-6 h-6 stroke-1.5" />
                      </div>
                    )}
                    <div className={`p-3 w-full flex items-center justify-between ${isSelected ? 'bg-orange-50/30' : 'bg-white'}`}>
                      <span className={`text-xs font-bold ${isSelected ? 'text-orange-700' : 'text-slate-705'}`}>
                        {angle.label}
                      </span>
                      {isSelected && (
                        <Check className="w-4 h-4 text-orange-600 font-extrabold" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end bg-slate-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 text-sm font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-all shadow-md shadow-orange-500/10 cursor-pointer"
          >
            Apply Selection
          </button>
        </div>

      </div>
    </div>
  );
}


