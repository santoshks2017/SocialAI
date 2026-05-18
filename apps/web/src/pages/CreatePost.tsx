import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import PlatformPreview from '../components/PlatformPreview';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { creativeService, postService } from '../services/creative';
import type { AIGenerationResponse, CaptionVariant } from '../services/creative';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { generateBrandedCreative } from '../services/imageGeneration';
import {
  Tag, Sparkles, Heart, Gift, PenLine,
  ArrowLeft, RefreshCw, Check, ImagePlus, Video, X,
  Send, Download, Zap, Globe, Calendar, Film, Clock, Wand2,
  Languages, Minimize2, Hash, ChevronDown,
} from 'lucide-react';
import api from '../services/api';
import { CanvasStudio } from '../components/CreatePost/CanvasStudio';

// ─── Platform SVG icons ───────────────────────────────────────────────────────
function FbIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
    </svg>
  );
}
function IgIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const POST_TYPES = [
  { id: 'offer',    icon: Tag,     label: "Today's Offer",  color: 'text-orange-600', bg: 'bg-orange-50',  activeBg: 'bg-orange-600',  category: 'Festival Offer', starter: 'Special weekend offer — ' },
  { id: 'arrival',  icon: Sparkles,label: 'New Arrival',    color: 'text-teal-600',   bg: 'bg-teal-50',    activeBg: 'bg-teal-600',    category: 'New Arrival',   starter: 'New vehicle just arrived — ' },
  { id: 'delivery', icon: Heart,   label: 'Delivery Post',  color: 'text-pink-600',   bg: 'bg-pink-50',    activeBg: 'bg-pink-600',    category: 'Testimonial',   starter: 'Happy delivery to our valued customer — ' },
  { id: 'festival', icon: Gift,    label: 'Festival Post',  color: 'text-purple-600', bg: 'bg-purple-50',  activeBg: 'bg-purple-600',  category: 'Festival Offer', starter: 'Celebrate this festival with us — ' },
  { id: 'custom',   icon: PenLine, label: 'Custom',         color: 'text-stone-600',  bg: 'bg-stone-100',  activeBg: 'bg-stone-700',   category: 'Engagement',    starter: '' },
] as const;

const PROMPT_CHIPS: Record<string, string[]> = {
  'New Arrival': [
    'New Maruti Brezza 2024 just arrived at our showroom. Limited stock!',
    'Introducing the all-new Hyundai Creta N Line — now available for booking',
    'New Tata Nexon EV Max now in stock. Book a test drive today!',
  ],
  'Festival Offer': [
    'Diwali special offer — ₹50,000 cash discount on all models this festive season',
    'Festival season deal — Zero processing fee and free accessories worth ₹20,000',
    'Special weekend offer — Exchange bonus up to ₹75,000 on all models',
  ],
  'Testimonial': [
    'Our customer Ramesh ji just drove home his new Fortuner. Congratulations!',
    'Happy delivery of Baleno to the Singh family. Thank you for trusting us!',
    '5-star Google review from our valued customer Mrs. Patel. We are grateful!',
  ],
  'Engagement': [
    'Which colour do you prefer for your next car? Comment below!',
    'Petrol vs Diesel vs EV — what would you choose in 2024? Tell us!',
    'Quiz: What is the mileage of the new Maruti Swift? Win a free service voucher!',
  ],
};

const PLATFORMS = [
  { id: 'facebook',  label: 'Facebook',          icon: FbIcon,  color: 'text-[#1877F2]', dot: 'bg-[#1877F2]' },
  { id: 'instagram', label: 'Instagram',          icon: IgIcon,  color: 'text-pink-500',  dot: 'bg-pink-500' },
  { id: 'gmb',       label: 'Google My Business', icon: Globe,   color: 'text-[#4285F4]', dot: 'bg-[#4285F4]' },
] as const;

const TEMPLATE_THEMES = [
  { label: 'Bold Banner',   gradient: 'from-stone-900 to-stone-800',   accent: 'bg-orange-600',  sub: "TODAY'S OFFER" },
  { label: 'Minimal',       gradient: 'from-orange-600 to-orange-500', accent: 'bg-white/20',     sub: 'SPECIAL DEAL' },
  { label: 'Offer Card',    gradient: 'from-teal-700 to-teal-600',     accent: 'bg-white/20',     sub: 'LIMITED TIME' },
] as const;

const DRAFT_STORAGE_KEY = 'sg_create_draft';

interface DraftState {
  prompt: string;
  selectedPostType: string | null;
  caption: string;
  selectedPlatforms: string[];
  toneActive: 'hinglish' | 'english' | 'hindi';
  mediaTab: 'upload' | 'ai' | 'url';
}

// ─── CreatePost ───────────────────────────────────────────────────────────────
export default function CreatePost() {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  // Restore draft from localStorage on mount
  const getInitialDraft = (): Partial<DraftState> => {
    try {
      const stored = localStorage.getItem(DRAFT_STORAGE_KEY);
      return stored ? (JSON.parse(stored) as DraftState) : {};
    } catch {
      return {};
    }
  };
  const draft = getInitialDraft();

  const [prompt, setPrompt] = useState(() => searchParams.get('prompt') ?? draft.prompt ?? '');
  const [selectedPostType, setSelectedPostType] = useState<string | null>(
    () => searchParams.get('postType') ?? draft.selectedPostType ?? null,
  );
  const [activeCategory, setActiveCategory] = useState('Festival Offer');
  const [isGenerating, setIsGenerating] = useState(false);
  const [variants, setVariants] = useState<AIGenerationResponse | null>(null);
  // selectedVariant controls which CAPTION is active; selectedDesign controls which template card is highlighted
  const [selectedVariant, setSelectedVariant] = useState(0);
  const [selectedDesign, setSelectedDesign] = useState(0);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(
    () => draft.selectedPlatforms ?? ['facebook', 'instagram', 'gmb'],
  );
  // Default preview to Facebook (most commonly used, per M12)
  const [activePlatformPreview, setActivePlatformPreview] = useState<'google' | 'facebook' | 'instagram'>('facebook');
  const [caption, setCaption] = useState(() => draft.caption ?? '');
  // Language variants — stored per-generate, switched on tab change (C6)
  const [englishCaptions, setEnglishCaptions] = useState<CaptionVariant[] | null>(null);
  const [hindiCaptions, setHindiCaptions] = useState<CaptionVariant[] | null>(null);
  const [toneActive, setToneActive] = useState<'hinglish' | 'english' | 'hindi'>(
    () => draft.toneActive ?? 'english',
  );
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  // Pre-fill schedule time from ?date=YYYY-MM-DD param (e.g. from Calendar page)
  const [scheduleTime, setScheduleTime] = useState<string>(() => {
    const d = searchParams.get('date');
    if (!d) return '';
    // Set default time to 10:00 AM on the selected date
    return `${d}T10:00`;
  });
  const [published, setPublished] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [uploadedImageId, setUploadedImageId] = useState<string | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string | null>(null);
  const [uploadedVideoName, setUploadedVideoName] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [mediaTab, setMediaTab] = useState<'upload' | 'ai' | 'url'>(() => draft.mediaTab ?? 'ai');
  const [inspirationImageId, setInspirationImageId] = useState<string | null>(null);
  const [inspirationImageUrl, setInspirationImageUrl] = useState<string | null>(null);
  const [aiImageUrls, setAiImageUrls] = useState<(string | null)[]>([null, null, null]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageLoadingStates, setImageLoadingStates] = useState<boolean[]>([false, false, false]);
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [canvasStudioOpen, setCanvasStudioOpen] = useState(false);
  const [canvasDesignIdx,  setCanvasDesignIdx]  = useState(0);

  // Post-generation toolbar states
  const [isTransforming, setIsTransforming] = useState(false);
  const [showRephraseMenu, setShowRephraseMenu] = useState(false);
  const [showTranslateMenu, setShowTranslateMenu] = useState(false);

  // URL Generation states
  const [sourceUrl, setSourceUrl] = useState('');
  const [urlCar, setUrlCar] = useState('');
  const [urlOffer, setUrlOffer] = useState('');
  const [urlFestival, setUrlFestival] = useState('');
  const [urlCity, setUrlCity] = useState('');
  const [urlGeneratedImage, setUrlGeneratedImage] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const aiInspirationInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  // AI Video mode
  const isVideoMode = searchParams.get('mode') === 'video';
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState(15);
  const [videoAspect, setVideoAspect] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [_videoStyle, _setVideoStyle] = useState<'cinematic' | 'dynamic' | 'minimal'>('cinematic');
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [videoJobId, setVideoJobId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoImageId, setVideoImageId] = useState<string | null>(null);
  const [videoImageUrl, setVideoImageUrl] = useState<string | null>(null);
  const [uploadingVideoImage, setUploadingVideoImage] = useState(false);
  const videoImageRef = useRef<HTMLInputElement>(null);

  const { profile: dealerProfile } = useDealerProfile();

  // Dealer display name — prefer dealer profile name, fall back to auth user name
  const dealerDisplayName = dealerProfile?.name ?? user?.name ?? 'Your Dealership';
  const dealerInitials = dealerDisplayName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Fetch connected platform accounts to guard publish (C3)
  useEffect(() => {
    api.get<{ success: boolean; accounts: Array<{ platform: string }> }>('/platform-accounts')
      .then((res) => setConnectedAccounts((res.accounts ?? []).map((a) => a.platform)))
      .catch(() => setConnectedAccounts([]));
  }, []);

  // Auto-save draft to localStorage whenever key fields change (C9)
  const saveDraft = useCallback(() => {
    if (!prompt && !caption) return; // don't save empty state
    const state: DraftState = { prompt, selectedPostType, caption, selectedPlatforms, toneActive, mediaTab };
    try { localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
  }, [prompt, selectedPostType, caption, selectedPlatforms, toneActive, mediaTab]);

  useEffect(() => { saveDraft(); }, [saveDraft]);

  useEffect(() => { creativeService.getPrompts().catch(console.error); }, []);
  useEffect(() => {
    const p = searchParams.get('prompt');
    if (p) setPrompt(p);
    const pt = searchParams.get('postType');
    if (pt) {
      setSelectedPostType(pt);
      const type = POST_TYPES.find((t) => t.id === pt);
      if (type) setActiveCategory(type.category);
    }
  }, [searchParams]);

  const handleTypeSelect = (type: (typeof POST_TYPES)[number]) => {
    setSelectedPostType(type.id);
    setActiveCategory(type.category);
    if (type.starter && !prompt.trim()) setPrompt(type.starter);
  };

  const uploadFileAPI = async (file: File) => {
    setIsUploading(true);
    try {
      return await creativeService.uploadImage(file);
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Image upload failed. Try again.' });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleImageUploadEvent = async (file: File) => {
    const res = await uploadFileAPI(file);
    if (res) {
      setUploadedImageId(res.id);
      setUploadedImageUrl(res.url);
      setUploadedVideoName(null);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImageUploadEvent(file);
    e.target.value = '';
  };

  const handleAiInspirationUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await uploadFileAPI(file);
    if (res) {
      setInspirationImageId(res.id);
      setInspirationImageUrl(res.url);
    }
    e.target.value = '';
  };

  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            setIsPasting(true);
            const localUrl = URL.createObjectURL(file);
            if (mediaTab === 'ai') {
              setInspirationImageUrl(localUrl);
              setInspirationImageId('pasted');
              const res = await uploadFileAPI(file);
              if (res) { setInspirationImageId(res.id); setInspirationImageUrl(res.url); }
            } else {
              setMediaTab('upload');
              setUploadedImageUrl(localUrl);
              setUploadedImageId('pasted');
              setUploadedVideoName(null);
              const res = await uploadFileAPI(file);
              if (res) { setUploadedImageId(res.id); setUploadedImageUrl(res.url); }
            }
            setTimeout(() => setIsPasting(false), 1500);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [mediaTab]);

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      await creativeService.uploadVideo(file);
      setUploadedVideoName(file.name);
      setUploadedImageId(null);
      setUploadedImageUrl(null);
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Video upload failed. Try again.' });
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const clearMedia = () => { setUploadedImageId(null); setUploadedImageUrl(null); setUploadedVideoName(null); };
  const clearInspiration = () => { setInspirationImageId(null); setInspirationImageUrl(null); };

  const generateImagesForVariants = (captions: CaptionVariant[], currentPrompt: string) => {
    const slots = captions.slice(0, 3);
    setAiImageUrls([null, null, null]);
    setImageLoadingStates([true, true, true]);
    setIsGeneratingImages(true);
    let pending = slots.length;

    // Pass subject image when available so the 3-layer compositor can isolate it
    const subjectId = mediaTab === 'upload' ? (uploadedImageId ?? undefined) : undefined;
    const subjectUrl = mediaTab === 'url' && urlGeneratedImage ? urlGeneratedImage : undefined;

    slots.forEach((v, i) => {
      const styleHints = ['bold high-contrast dramatic lighting', 'minimal clean white background', 'warm lifestyle family setting'];
      const styledPrompt = `${currentPrompt} — ${styleHints[i] ?? ''}`;
      generateBrandedCreative(v.caption_text, styledPrompt, i, subjectId, subjectUrl)
        .then((url) => { setAiImageUrls((prev) => { const n = [...prev]; n[i] = url; return n; }); })
        .catch(() => {})
        .finally(() => {
          setImageLoadingStates((prev) => { const n = [...prev]; n[i] = false; return n; });
          pending -= 1;
          if (pending === 0) setIsGeneratingImages(false);
        });
    });
  };

  // Switch caption text when language tab changes (C6)
  const handleToneChange = (tone: 'hinglish' | 'english' | 'hindi') => {
    setToneActive(tone);
    if (!variants) return;
    const sourceCaptions =
      tone === 'hindi' && hindiCaptions
        ? hindiCaptions
        : englishCaptions ?? variants.captions;
    setCaption(sourceCaptions[selectedVariant]?.caption_text ?? '');
  };

  const handleGenerate = async (force = false) => {
    if (!prompt.trim()) {
      addToast({ type: 'error', title: 'Description required', message: 'Please enter a post description before generating.' });
      return;
    }
    setIsGenerating(true);
    if (!force) {
      setVariants(null);
      setPublished(false);
      setAiImageUrls([null, null, null]);
      setImageLoadingStates([false, false, false]);
    }
    try {
      const imageIdToUse = mediaTab === 'upload' ? (uploadedImageId ?? undefined) : (inspirationImageId ?? undefined);
      // Always request Hindi variants so the language toggle has real content.
      // Falls back to creativeService mock if the API is unreachable or returns auth error.
      let res: AIGenerationResponse;
      try {
        res = await api.post<AIGenerationResponse>('/creatives/generate', {
          prompt,
          platforms: selectedPlatforms,
          image_id: imageIdToUse,
          force,
          includeHindi: true,
          post_type: selectedPostType ?? undefined,
        });
      } catch {
        // API unreachable or auth not ready — use client-side mock captions
        res = await creativeService.generateCaptions(prompt, selectedPlatforms, imageIdToUse, force);
      }
      setVariants(res);
      setEnglishCaptions(res.captions);
      setHindiCaptions(res.hindi_captions);
      setSelectedVariant(0);
      setSelectedDesign(0);

      // Set caption based on current language tab
      const initial = toneActive === 'hindi' && res.hindi_captions
        ? res.hindi_captions[0]?.caption_text
        : res.captions[0]?.caption_text;
      setCaption(initial ?? '');

      if (mediaTab === 'ai') {
        generateImagesForVariants(res.captions, prompt);
      }

      // Clear saved draft after a successful generate (content is now in view)
      localStorage.removeItem(DRAFT_STORAGE_KEY);
    } catch (err) {
      console.error(err);
      addToast({ type: 'error', title: 'Generation unavailable', message: 'Could not generate captions right now. Please try again in a moment.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateFromUrl = async () => {
    if (!sourceUrl) return;
    setIsGeneratingImages(true);
    setUrlGeneratedImage(null);
    try {
      const res = await creativeService.generateFromUrl({
        url: sourceUrl,
        dealerId: 'self',
        car: urlCar || 'Any Car',
        offer: urlOffer || 'Special Offer',
        festival: urlFestival || 'None',
        city: urlCity || 'Any City',
      });
      if (res && res.data) {
        setUrlGeneratedImage(res.data.image);
        setCaption(res.data.content.caption);
        setPrompt(`${res.data.content.headline} - ${res.data.content.cta}`);
        addToast({ type: 'success', title: 'Success', message: 'Creative generated from URL successfully!' });
      }
    } catch {
      addToast({ type: 'error', title: 'Failed', message: 'Could not generate from URL' });
    } finally {
      setIsGeneratingImages(false);
    }
  };

  // Caption variant tab click — changes caption only, NOT the design (M7 fix)
  const handleVariantSelect = (idx: number) => {
    setSelectedVariant(idx);
    const sourceCaptions =
      toneActive === 'hindi' && hindiCaptions
        ? hindiCaptions
        : englishCaptions ?? variants?.captions;
    setCaption(sourceCaptions?.[idx]?.caption_text ?? '');
  };

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const handlePublishNow = async () => {
    if (!variants) return;

    // Guard: ensure at least one selected platform has a connected account (C3)
    const connectedSelected = selectedPlatforms.filter((p) => {
      if (p === 'gmb') return connectedAccounts.includes('google');
      return connectedAccounts.includes(p);
    });
    if (connectedSelected.length === 0) {
      addToast({
        type: 'error',
        title: 'No accounts connected',
        message: 'Connect Facebook or Google in the Accounts page before publishing.',
      });
      return;
    }

    setIsPublishing(true);
    try {
      const cap = variants.captions[selectedVariant];
      const cre = variants.creatives[selectedDesign];
      const res = await postService.create({
        promptText: prompt,
        captionText: caption,
        captionHashtags: cap?.hashtags ?? [],
        creativeUrls: (cre?.platform_urls as Record<string, string>) ?? {},
        platforms: selectedPlatforms,
      });
      await postService.publish(res.item.id, selectedPlatforms);
      setPublished(true);
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      addToast({ type: 'success', title: 'Post published!', message: 'Your post is live on selected platforms.' });
    } catch (err) {
      console.error(err);
      addToast({ type: 'error', title: 'Publish failed', message: 'Could not publish. Check platform connections and try again.' });
    } finally {
      setIsPublishing(false);
    }
  };

  const confirmSchedule = async () => {
    if (!variants || !scheduleTime) return;
    setIsPublishing(true);
    try {
      const cap = variants.captions[selectedVariant];
      const cre = variants.creatives[selectedDesign];
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
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      addToast({ type: 'success', title: 'Post scheduled!', message: 'Your post will be published at the selected time.' });
    } catch (err) {
      console.error(err);
      addToast({ type: 'error', title: 'Schedule failed', message: 'Could not schedule. Please try again.' });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleVideoImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingVideoImage(true);
    try {
      const res = await creativeService.uploadImage(file);
      setVideoImageId(res.id);
      setVideoImageUrl(res.url);
    } catch {
      addToast({ type: 'error', title: 'Upload failed', message: 'Could not upload image. Try again.' });
    } finally {
      setUploadingVideoImage(false);
      e.target.value = '';
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
        addToast({ type: 'success', title: 'Video ready!', message: `Your ${videoDuration}s video has been generated.` });
      } else if (res.job_id) {
        setVideoJobId(res.job_id);
        addToast({ type: 'success', title: 'Video queued', message: res.message ?? 'Video is being processed.' });
      }
    } catch {
      addToast({ type: 'error', title: 'Video generation failed', message: 'Could not generate video. Please try again.' });
    } finally {
      setGeneratingVideo(false);
    }
  };

  const handleRephrase = async (tone?: string) => {
    if (!caption.trim() || isTransforming) return;
    setShowRephraseMenu(false);
    setIsTransforming(true);
    try {
      const res = await api.post<{ success: boolean; caption: string }>('/creatives/rephrase', { caption, tone });
      setCaption(res.caption);
    } catch {
      addToast({ type: 'error', title: 'Rephrase failed', message: 'Could not rephrase. Please try again.' });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleTranslate = async (to: string) => {
    if (!caption.trim() || isTransforming) return;
    setShowTranslateMenu(false);
    setIsTransforming(true);
    try {
      const res = await api.post<{ success: boolean; caption: string }>('/creatives/translate', { caption, to });
      setCaption(res.caption);
    } catch {
      addToast({ type: 'error', title: 'Translation failed', message: 'Could not translate. Please try again.' });
    } finally {
      setIsTransforming(false);
    }
  };

  const handleMoreHashtags = async () => {
    if (!caption.trim() || isTransforming) return;
    setIsTransforming(true);
    try {
      const cap = variants?.captions[selectedVariant];
      const res = await api.post<{ success: boolean; hashtags: string[] }>('/creatives/hashtags', {
        caption,
        brand: cap?.hashtags?.find((h) => h.startsWith('#')) ?? undefined,
      });
      if (res.hashtags.length > 0) {
        setCaption((prev) => `${prev}\n\n${res.hashtags.join(' ')}`);
      }
    } catch {
      addToast({ type: 'error', title: 'Hashtag generation failed', message: 'Could not generate hashtags. Please try again.' });
    } finally {
      setIsTransforming(false);
    }
  };

  const currentVariant = variants ? (
    toneActive === 'hindi' && hindiCaptions
      ? hindiCaptions[selectedVariant]
      : (englishCaptions ?? variants.captions)[selectedVariant]
  ) : null;

  const charLimitMap: Record<string, number> = { google: 1500, facebook: 63206, instagram: 2200 };
  const charLimit = charLimitMap[activePlatformPreview] ?? 2200;
  const activeChips = PROMPT_CHIPS[activeCategory] ?? [];

  // ─── Published success screen ─────────────────────────────────────────────
  if (published) {
    return (
      <div className="h-full flex items-center justify-center bg-[#F5F0EA]">
        <div className="text-center bg-white rounded-2xl border border-stone-200 p-10 shadow-sm max-w-sm w-full mx-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-xl font-extrabold text-stone-900">Post Published!</h3>
          <p className="text-stone-500 text-sm mt-2">Queued to {selectedPlatforms.join(', ')}</p>
          <div className="flex gap-3 mt-6 justify-center">
            <button
              onClick={() => { setVariants(null); setPrompt(''); setPublished(false); setSelectedPostType(null); }}
              className="px-4 py-2.5 text-sm font-semibold text-stone-700 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
            >
              Create Another
            </button>
            <NavLink to="/calendar" className="px-4 py-2.5 text-sm font-semibold bg-orange-600 text-white rounded-xl hover:bg-orange-700 transition-colors">
              View Calendar
            </NavLink>
          </div>
        </div>
      </div>
    );
  }

  // ─── AI Video Mode ────────────────────────────────────────────────────────
  if (isVideoMode) {
    return (
      <div className="h-full flex flex-col overflow-y-auto bg-[#f1f5f9]">
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-gray-200 shrink-0">
          <NavLink to="/" className="text-gray-400 hover:text-gray-700 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </NavLink>
          <span className="text-gray-300 text-sm">/</span>
          <span className="text-gray-400 text-sm">Create</span>
          <span className="text-gray-300 text-sm">/</span>
          <span className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <Film className="w-4 h-4 text-orange-500" /> AI Video
          </span>
          <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 uppercase tracking-wide">Coming Soon</span>
        </div>

        <div className="flex-1 p-5 md:p-7 max-w-2xl mx-auto w-full space-y-5">
          <div className="bg-gradient-to-br from-[#0f1117] to-[#1a1f2e] rounded-2xl p-6 text-white">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0">
                <Film className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold">AI Video Generation</h2>
                <p className="text-gray-400 text-sm mt-1">Create short-form videos for Reels and Stories directly from a text description.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {['Instagram Reels', 'Facebook Stories', 'YouTube Shorts'].map((p) => (
                    <span key={p} className="text-[11px] px-2.5 py-1 rounded-full bg-white/10 text-gray-300">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Video Concept</label>
              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Diwali offer — new Hyundai Creta, ₹50,000 discount, limited period"
                className="w-full border rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none text-gray-800 placeholder:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Base Image (optional)</label>
              <input ref={videoImageRef} type="file" accept="image/*" className="hidden" onChange={handleVideoImageUpload} />
              {videoImageUrl ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-gray-50">
                  <img src={videoImageUrl} alt="Base" className="w-14 h-14 rounded-lg object-cover border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700">Image uploaded</p>
                    <p className="text-xs text-gray-400">Will be used as the video background</p>
                  </div>
                  <button onClick={() => { setVideoImageId(null); setVideoImageUrl(null); }} className="p-1.5 text-gray-400 hover:text-red-500">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => videoImageRef.current?.click()}
                  disabled={uploadingVideoImage}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-400 hover:text-orange-600 text-sm font-medium transition-colors disabled:opacity-50 w-full justify-center"
                >
                  <ImagePlus className="w-4 h-4" />
                  {uploadingVideoImage ? 'Uploading…' : 'Upload car photo (or we\'ll generate a background)'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Duration</label>
                <div className="flex gap-2">
                  {[15, 30, 60].map((s) => (
                    <button key={s} onClick={() => setVideoDuration(s)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${videoDuration === s ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}
                    >{s}s</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Format</label>
                <div className="flex gap-2">
                  {(['9:16', '1:1', '16:9'] as const).map((r) => (
                    <button key={r} onClick={() => setVideoAspect(r)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${videoAspect === r ? 'bg-orange-500 text-white border-orange-500' : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'}`}
                    >{r}</button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerateVideo}
              disabled={!videoPrompt.trim() || generatingVideo}
              className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {generatingVideo
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating video… ({videoDuration}s)</>
                : <><Wand2 className="w-4 h-4" /> Generate Video</>
              }
            </button>
          </div>

          {videoUrl && (
            <div className="bg-white rounded-2xl border border-green-100 shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-sm font-semibold text-gray-800">Video Ready — {videoDuration}s · {videoAspect}</span>
                </div>
                <a
                  href={videoUrl}
                  download={`socialgenie-video-${Date.now()}.mp4`}
                  className="flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
              <div className="flex justify-center bg-black p-4">
                <video
                  src={videoUrl}
                  controls
                  autoPlay
                  loop
                  className={`max-h-[480px] rounded-lg ${videoAspect === '9:16' ? 'max-w-[270px]' : videoAspect === '1:1' ? 'max-w-[480px]' : 'w-full'}`}
                />
              </div>
            </div>
          )}

          {videoJobId && !videoUrl && (
            <div className="bg-white rounded-2xl border border-orange-100 shadow-sm p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-semibold text-gray-800">Video queued</h3>
              <p className="text-xs text-gray-400 font-mono bg-gray-50 px-3 py-1.5 rounded-lg">Job ID: {videoJobId}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f4f5f7]">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-stone-200 shrink-0">
        <NavLink to="/" className="text-stone-400 hover:text-stone-700 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </NavLink>
        <span className="text-stone-300">/</span>
        <span className="text-stone-900 text-sm font-semibold">Create Post</span>
        {variants && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Draft saved
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ════ MAIN CONTENT ════ */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 min-w-0 max-w-5xl mx-auto">

          {/* ── SECTION 1: Describe your post ── */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-stone-900 mb-1">What exactly should be the post?</h2>
              <p className="text-sm text-stone-500">Describe your post in detail or choose a post type for ideas.</p>
            </div>

            <div className="bg-stone-50 border-2 border-stone-200 rounded-2xl p-2 focus-within:border-orange-400 focus-within:bg-white transition-colors">
              <div className="flex items-center justify-between mb-2 px-3 pt-2">
                <select
                  className="bg-transparent text-sm font-bold text-stone-800 focus:outline-none cursor-pointer w-full md:w-auto"
                  value={selectedPostType || ''}
                  onChange={(e) => {
                    const t = POST_TYPES.find((type) => type.id === e.target.value);
                    if (t) handleTypeSelect(t);
                  }}
                >
                  <option value="" disabled>✨ Select a post type...</option>
                  {POST_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe your offer in detail — include vehicle name, discount amount, validity, and any special offer…"
                className="w-full h-32 px-3 py-2 bg-transparent text-sm text-stone-800 resize-none focus:outline-none placeholder:text-stone-400 leading-relaxed"
                maxLength={500}
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <span className="text-[11px] text-stone-400">{prompt.length} / 500 characters</span>
                {prompt.trim() && (
                  <button onClick={() => setPrompt('')} className="text-[11px] text-stone-400 hover:text-red-500 transition-colors font-medium">
                    Clear
                  </button>
                )}
              </div>
            </div>

            {selectedPostType && activeChips.length > 0 && (
              <div className="pt-2">
                <p className="text-[11px] font-extrabold text-stone-400 uppercase tracking-widest mb-3">Quick Suggestions</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {activeChips.map((chip, idx) => (
                    <button
                      key={idx}
                      onClick={() => setPrompt(chip)}
                      className={`text-left p-4 rounded-xl border-2 transition-all ${
                        prompt === chip
                          ? 'border-orange-500 bg-orange-50 shadow-md shadow-orange-100'
                          : 'border-stone-200 bg-white hover:border-orange-300 hover:shadow-sm'
                      }`}
                    >
                      <p className={`text-sm leading-relaxed ${prompt === chip ? 'text-orange-900 font-bold' : 'text-stone-700'}`}>{chip}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION 2: Media ── */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-stone-900 mb-1">Creative / Media</h2>
                <p className="text-sm text-stone-500">Optional — add your own image or let AI create one</p>
              </div>
              <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest bg-stone-100 px-2.5 py-1 rounded-full">Optional</span>
            </div>

            <div className="flex flex-wrap p-4 gap-2 bg-stone-50/50 border-b border-stone-100">
              {([
                { id: 'ai',     icon: Wand2,     label: 'Generate with AI', sub: 'Let AI design it' },
                { id: 'upload', icon: ImagePlus,  label: 'Upload Creative',  sub: 'Your own image/video' },
                { id: 'url',    icon: Globe,      label: 'Auto-Scrape URL',  sub: 'Generate from Link' },
              ] as const).map(({ id, icon: Icon, label, sub }) => (
                <button
                  key={id}
                  onClick={() => setMediaTab(id as typeof mediaTab)}
                  className={`flex-1 flex flex-col items-start p-4 rounded-xl border-2 transition-all min-w-[150px] ${
                    mediaTab === id
                      ? 'border-orange-500 bg-orange-50 shadow-sm'
                      : 'border-stone-200 bg-white hover:border-stone-300'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${mediaTab === id ? 'text-orange-600' : 'text-stone-400'}`} />
                  <p className={`text-sm font-bold ${mediaTab === id ? 'text-orange-800' : 'text-stone-700'}`}>{label}</p>
                  <p className={`text-xs mt-1 ${mediaTab === id ? 'text-orange-600' : 'text-stone-500'}`}>{sub}</p>
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* Upload tab */}
              {mediaTab === 'upload' && (
                <div className="max-w-2xl">
                  <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoUpload} />
                  {uploadedImageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border-2 border-stone-200 group w-64 h-64">
                      <img src={uploadedImageUrl} alt="Uploaded" className="w-full h-full object-cover" />
                      <button onClick={clearMedia} className="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
                        <X className="w-4 h-4 text-white" />
                      </button>
                      <span className="absolute bottom-3 left-3 text-xs text-white font-bold bg-black/50 px-3 py-1.5 rounded-full">Photo attached</span>
                    </div>
                  ) : uploadedVideoName ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl border-2 border-stone-200 bg-stone-50">
                      <Video className="w-6 h-6 text-teal-500 shrink-0" />
                      <p className="text-sm text-stone-600 truncate flex-1">{uploadedVideoName}</p>
                      <button onClick={clearMedia}><X className="w-5 h-5 text-stone-400 hover:text-red-500 transition-colors" /></button>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <button onClick={() => imageInputRef.current?.click()} disabled={isUploading}
                        className="flex-1 flex flex-col items-center gap-3 py-8 rounded-xl border-2 border-dashed border-stone-300 hover:border-orange-400 hover:bg-orange-50 transition-colors text-stone-400 hover:text-orange-600 disabled:opacity-40">
                        <ImagePlus className="w-8 h-8" />
                        <span className="text-sm font-semibold">{isUploading ? 'Uploading…' : 'Upload Photo'}</span>
                        <span className="text-xs">JPG, PNG, WEBP</span>
                      </button>
                      <button onClick={() => videoInputRef.current?.click()} disabled={isUploading}
                        className="flex-1 flex flex-col items-center gap-3 py-8 rounded-xl border-2 border-dashed border-stone-300 hover:border-orange-400 hover:bg-orange-50 transition-colors text-stone-400 hover:text-orange-600 disabled:opacity-40">
                        <Video className="w-8 h-8" />
                        <span className="text-sm font-semibold">{isUploading ? 'Uploading…' : 'Upload Video'}</span>
                        <span className="text-xs">MP4, MOV</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* AI Generate tab */}
              {mediaTab === 'ai' && (
                <div className="space-y-6 max-w-3xl">
                  <div className="bg-stone-50 border-2 border-stone-200 border-dashed rounded-xl p-4">
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="flex-1">
                        <h4 className="text-sm font-bold text-stone-800 mb-1">Inspiration (Optional)</h4>
                        <p className="text-xs text-stone-500">Have a reference image? Upload it to guide the AI design.</p>
                      </div>
                      <div className="flex-shrink-0 w-full sm:w-auto">
                        <input
                          ref={aiInspirationInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAiInspirationUpload}
                        />
                        {inspirationImageUrl ? (
                          <div className="relative rounded-lg overflow-hidden border border-stone-200 group w-32 h-20">
                            <img src={inspirationImageUrl} alt="Inspiration" className="w-full h-full object-cover" />
                            <button onClick={clearInspiration} className="absolute top-1 right-1 w-6 h-6 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors">
                              <X className="w-3 h-3 text-white" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => aiInspirationInputRef.current?.click()}
                            disabled={isUploading}
                            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white border border-stone-300 hover:border-orange-400 hover:text-orange-600 text-stone-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40"
                          >
                            <ImagePlus className="w-4 h-4" /> {isUploading ? 'Uploading…' : 'Upload or Paste'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {!variants && !isGenerating ? (
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl p-6 text-white shadow-md">
                      <div className="flex items-start gap-4">
                        <Wand2 className="w-8 h-8 shrink-0 mt-1 text-orange-100" />
                        <div>
                          <h3 className="font-bold text-lg mb-1">Let AI design your post</h3>
                          <p className="text-orange-100 text-sm mb-5">Click below to generate post content and 3 distinct automotive creatives based on your description.</p>
                          <button
                            onClick={() => handleGenerate(false)}
                            disabled={!prompt.trim()}
                            className="bg-white text-orange-600 font-bold px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                          >
                            <Sparkles className="w-4 h-4" />
                            {prompt.trim() ? 'Generate Designs' : 'Enter a description first'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-stone-800">Choose a design</p>
                        <button
                          onClick={() => handleGenerate(true)}
                          disabled={isGeneratingImages || isGenerating}
                          className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-orange-600 font-semibold transition-colors bg-stone-100 px-3 py-1.5 rounded-lg disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${isGeneratingImages || isGenerating ? 'animate-spin' : ''}`} />
                          {isGeneratingImages ? 'Generating…' : 'Regenerate'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {TEMPLATE_THEMES.map((theme, i) => {
                          const aiImg = aiImageUrls[i] ?? null;
                          const loading = imageLoadingStates[i] ?? false;
                          return (
                            <div key={i} className="flex flex-col gap-1.5">
                            <button
                              onClick={() => setSelectedDesign(i)}
                              className={`relative rounded-2xl overflow-hidden border-2 transition-all group ${
                                selectedDesign === i ? 'border-orange-500 shadow-lg shadow-orange-100 scale-[1.02]' : 'border-stone-200 hover:border-stone-300'
                              }`}
                            >
                              {aiImg ? (
                                <img src={aiImg} alt={theme.label} className="w-full aspect-square object-cover" />
                              ) : loading ? (
                                <div className={`aspect-square bg-gradient-to-br ${theme.gradient} flex flex-col items-center justify-center gap-2`}>
                                  <Sparkles className="w-6 h-6 text-white/70 animate-pulse" />
                                  <p className="text-white/50 text-[10px] font-bold uppercase tracking-wider">Creating…</p>
                                </div>
                              ) : (
                                <div className={`aspect-square bg-gradient-to-br ${theme.gradient} flex items-center justify-center p-4`}>
                                  <div className={`${theme.accent} rounded-lg px-3 py-1.5 shadow-sm`}>
                                    <p className="text-white text-xs font-bold uppercase tracking-wider">{theme.label}</p>
                                  </div>
                                </div>
                              )}
                              {selectedDesign === i && (
                                <div className="absolute top-3 right-3 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-md">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6">
                                <p className="text-white text-xs font-bold">{theme.label}</p>
                              </div>
                            </button>
                            <button
                              onClick={() => { setCanvasDesignIdx(i); setCanvasStudioOpen(true); }}
                              className="w-full py-1.5 text-[11px] font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors"
                            >
                              ✏ Edit in Canvas Studio
                            </button>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* URL Generation tab */}
              {mediaTab === 'url' && (
                <div className="space-y-4 max-w-2xl">
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="Enter dealer website URL (e.g. https://example.com/offer)"
                      className="flex-1 px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" value={urlCar} onChange={(e) => setUrlCar(e.target.value)} placeholder="Car Model (e.g. Creta)" className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm" />
                    <input type="text" value={urlOffer} onChange={(e) => setUrlOffer(e.target.value)} placeholder="Offer Details (e.g. ₹50K Off)" className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm" />
                    <input type="text" value={urlFestival} onChange={(e) => setUrlFestival(e.target.value)} placeholder="Festival (e.g. Diwali)" className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm" />
                    <input type="text" value={urlCity} onChange={(e) => setUrlCity(e.target.value)} placeholder="City (e.g. Delhi)" className="px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:outline-none focus:border-orange-400 text-sm" />
                  </div>
                  <button
                    onClick={handleGenerateFromUrl}
                    disabled={!sourceUrl || isGeneratingImages}
                    className="w-full bg-stone-900 hover:bg-black disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-sm"
                  >
                    {isGeneratingImages ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                    {isGeneratingImages ? 'Scraping & Generating...' : 'Auto-Generate Post from Link'}
                  </button>
                  {urlGeneratedImage && (
                    <div className="mt-6">
                      <p className="text-sm font-bold text-stone-800 mb-2">Generated Result</p>
                      <div className="border-2 border-orange-500 rounded-xl overflow-hidden shadow-lg inline-block relative group">
                        <img src={urlGeneratedImage} alt="Generated from URL" className="w-64 h-64 object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => setUrlGeneratedImage(null)} className="bg-white text-stone-900 px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm">
                            Clear Image
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Generate button — shown when no variants yet and NOT in AI tab */}
          {!variants && mediaTab !== 'ai' && (
            <button
              onClick={() => handleGenerate(false)}
              disabled={!prompt.trim() || isGenerating}
              className="w-full max-w-2xl flex items-center justify-center gap-2.5 bg-stone-900 hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-colors shadow-lg shadow-stone-200 text-base"
            >
              {isGenerating
                ? <><RefreshCw className="w-5 h-5 animate-spin" /> Generating content…</>
                : <><PenLine className="w-5 h-5" /> Generate Post Content</>
              }
            </button>
          )}

          {/* ── SECTION 3: Caption ── */}
          {(variants || isGenerating) && (
            <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
              <div className="px-6 py-5 border-b border-stone-100">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-stone-900">Caption</h2>
                    <span className="flex items-center gap-1.5 text-xs bg-teal-100 text-teal-700 font-bold px-2.5 py-1 rounded-full">
                      <Sparkles className="w-3 h-3" /> AI Generated
                    </span>
                  </div>
                  {variants && (
                    <div className="flex gap-1 bg-stone-100 p-1 rounded-xl">
                      {(['english', 'hinglish', 'hindi'] as const).map((tone) => (
                        <button
                          key={tone}
                          onClick={() => handleToneChange(tone)}
                          disabled={tone === 'hindi' && !hindiCaptions}
                          className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                            toneActive === tone ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                          }`}
                        >
                          {tone === 'hinglish' ? 'Hinglish' : tone === 'english' ? 'English' : 'हिंदी'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {isGenerating ? (
                <div className="px-6 py-6 space-y-4 max-w-3xl">
                  <div className="flex gap-3">
                    {[0, 1, 2].map((i) => <div key={i} className="flex-1 h-10 bg-stone-100 rounded-xl animate-pulse" />)}
                  </div>
                  <div className="h-32 bg-stone-100 rounded-2xl animate-pulse" />
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 w-24 bg-stone-100 rounded-full animate-pulse" />)}
                  </div>
                </div>
              ) : variants && (
                <div className="px-6 py-6 space-y-5 max-w-3xl">
                  {/* Caption style tabs — independent of design selection (M7) */}
                  <div className="flex gap-3">
                    {variants.captions.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => handleVariantSelect(i)}
                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${
                          selectedVariant === i
                            ? 'bg-stone-900 text-white border-stone-900 shadow-md'
                            : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'
                        }`}
                      >
                        {v.style ? v.style.charAt(0).toUpperCase() + v.style.slice(1) : `Style ${i + 1}`}
                      </button>
                    ))}
                  </div>

                  {/* Editable caption */}
                  <div className="relative">
                    <textarea
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="w-full h-40 p-5 border-2 border-stone-200 rounded-2xl text-sm text-stone-800 resize-none focus:outline-none focus:border-orange-400 leading-relaxed transition-colors bg-stone-50/50 focus:bg-white"
                      maxLength={charLimit}
                    />
                    <div className="absolute bottom-3 right-4 text-xs text-stone-400 font-medium bg-white/80 px-2 py-0.5 rounded backdrop-blur-sm">
                      <span className={caption.length > charLimit * 0.9 ? 'text-orange-500' : ''}>
                        {caption.length} / {charLimit}
                      </span>
                    </div>
                  </div>

                  {/* Post-generation toolbar */}
                  {caption && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {/* Rephrase with tone dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => { setShowRephraseMenu((v) => !v); setShowTranslateMenu(false); }}
                          disabled={isTransforming}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50 transition-colors"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          Rephrase
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showRephraseMenu && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 py-1 min-w-[140px]">
                            {[
                              { id: 'punchy', label: 'Punchy' },
                              { id: 'detailed', label: 'Detailed' },
                              { id: 'emotional', label: 'Emotional' },
                              { id: 'shorter', label: 'Shorter' },
                              { id: 'formal', label: 'Formal' },
                              { id: 'casual', label: 'Casual' },
                            ].map((t) => (
                              <button
                                key={t.id}
                                onClick={() => handleRephrase(t.id)}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                              >
                                {t.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Shorten */}
                      <button
                        onClick={() => handleRephrase('shorter')}
                        disabled={isTransforming}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50 transition-colors"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        Shorten
                      </button>

                      {/* Translate dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => { setShowTranslateMenu((v) => !v); setShowRephraseMenu(false); }}
                          disabled={isTransforming}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50 transition-colors"
                        >
                          <Languages className="w-3.5 h-3.5" />
                          Translate
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showTranslateMenu && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-stone-200 rounded-xl shadow-lg z-20 py-1 min-w-[150px]">
                            {[
                              { id: 'hi', label: 'Hindi' },
                              { id: 'mr', label: 'Marathi' },
                              { id: 'ta', label: 'Tamil' },
                              { id: 'te', label: 'Telugu' },
                              { id: 'kn', label: 'Kannada' },
                              { id: 'gu', label: 'Gujarati' },
                              { id: 'bn', label: 'Bengali' },
                              { id: 'en', label: 'English' },
                            ].map((l) => (
                              <button
                                key={l.id}
                                onClick={() => handleTranslate(l.id)}
                                className="w-full text-left px-4 py-2 text-xs font-medium text-stone-700 hover:bg-stone-50"
                              >
                                {l.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* More hashtags */}
                      <button
                        onClick={handleMoreHashtags}
                        disabled={isTransforming}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 disabled:opacity-50 transition-colors"
                      >
                        <Hash className="w-3.5 h-3.5" />
                        Hashtags
                      </button>

                      {isTransforming && (
                        <span className="flex items-center gap-1.5 text-xs text-stone-400 ml-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Working…
                        </span>
                      )}
                    </div>
                  )}

                  {/* Hashtags */}
                  {currentVariant && currentVariant.hashtags.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-3">Suggested Hashtags</p>
                      <div className="flex gap-2 flex-wrap">
                        {currentVariant.hashtags.map((h) => (
                          <span key={h} className="bg-orange-50 text-orange-700 text-sm font-semibold px-4 py-1.5 rounded-full border border-orange-200 shadow-sm">{h}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="h-8" />
        </div>

        {/* ════ RIGHT PANEL ════ */}
        <div className="w-96 shrink-0 border-l border-stone-200 bg-white overflow-y-auto">
          <div className="sticky top-0 flex flex-col items-center py-6 px-5 gap-5">

            {isPasting && (
              <div className="w-full bg-green-50 border-2 border-green-400 rounded-xl px-4 py-2 flex items-center gap-2 animate-pulse">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-bold text-green-700">Image pasted!</span>
              </div>
            )}

            {/* Platform preview switcher */}
            <div className="w-full">
              <p className="text-xs font-extrabold text-stone-400 uppercase tracking-widest mb-2 text-center">Live Preview</p>
              <div className="flex gap-1 bg-stone-100 p-1 rounded-xl">
                {(['facebook', 'instagram', 'google'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setActivePlatformPreview(p)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all ${
                      activePlatformPreview === p ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-400 hover:text-stone-600'
                    }`}
                  >
                    {p === 'facebook' ? <FbIcon className="w-4 h-4" /> : p === 'instagram' ? <IgIcon className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Phone frame */}
            <div className="relative w-full max-w-[320px] shrink-0">
              <div className="relative w-full bg-stone-900 rounded-[36px] p-1.5 shadow-2xl">
                <div className="absolute -left-1.5 top-24 w-1.5 h-12 bg-stone-700 rounded-l-full" />
                <div className="absolute -left-1.5 top-44 w-1.5 h-10 bg-stone-700 rounded-l-full" />
                <div className="absolute -right-1.5 top-28 w-1.5 h-14 bg-stone-700 rounded-r-full" />

                <div className="bg-white rounded-[30px] overflow-hidden h-[580px] flex flex-col">
                  <div className="flex justify-center pt-2 pb-1 bg-stone-900">
                    <div className="w-24 h-6 bg-stone-900 rounded-b-2xl" />
                  </div>
                  <div className="bg-white px-5 py-1.5 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-stone-800">9:41</span>
                    <div className="w-4 h-2.5 border-[1.5px] border-stone-800 rounded-sm p-[0.5px]">
                      <div className="w-full h-full bg-stone-800 rounded-sm scale-x-75 origin-left" />
                    </div>
                  </div>

                  <PlatformPreview
                    platform={activePlatformPreview}
                    dealerName={dealerDisplayName}
                    dealerInitials={dealerInitials}
                    caption={caption}
                    imageUrl={
                      mediaTab === 'url' && urlGeneratedImage ? urlGeneratedImage :
                      mediaTab === 'ai' && aiImageUrls[selectedDesign] ? aiImageUrls[selectedDesign]! :
                      mediaTab === 'upload' && uploadedImageUrl ? uploadedImageUrl :
                      null
                    }
                    isGenerating={isGenerating || isGeneratingImages}
                    promptText={prompt}
                    selectedDesign={selectedDesign}
                  />
                </div>
              </div>
            </div>

            {/* Platform toggles */}
            <div className="w-full space-y-2">
              <p className="text-xs font-extrabold text-stone-400 uppercase tracking-widest text-center">Platforms</p>
              <div className="flex gap-2">
                {PLATFORMS.map(({ id, icon: Icon, color, dot }) => {
                  const isConnected = connectedAccounts.includes(id === 'gmb' ? 'google' : id);
                  return (
                    <button
                      key={id}
                      onClick={() => togglePlatform(id)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all ${
                        selectedPlatforms.includes(id)
                          ? 'border-stone-300 bg-stone-50 shadow-sm'
                          : 'border-stone-100 opacity-50 hover:opacity-100 hover:border-stone-200'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${color} shrink-0`} />
                      {selectedPlatforms.includes(id) && (
                        <div className={`w-2 h-2 rounded-full shadow-sm ${isConnected ? dot : 'bg-stone-300'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Show warning if no selected platform has a connected account */}
              {selectedPlatforms.length > 0 && !selectedPlatforms.some((p) => connectedAccounts.includes(p === 'gmb' ? 'google' : p)) && (
                <p className="text-[11px] text-amber-600 text-center font-medium bg-amber-50 rounded-lg px-2 py-1.5">
                  No connected accounts — <NavLink to="/accounts" className="underline font-bold">Connect now</NavLink>
                </p>
              )}
            </div>

            <div className="w-full border-t-2 border-stone-100 border-dashed" />

            {/* Publish actions */}
            <div className="w-full space-y-2.5">
              <button
                onClick={handlePublishNow}
                disabled={isPublishing || selectedPlatforms.length === 0 || !variants}
                className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3.5 rounded-xl transition-colors shadow-md shadow-orange-200"
              >
                {isPublishing
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Publishing…</>
                  : <><Send className="w-4 h-4" /> Post Everywhere</>
                }
              </button>
              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={selectedPlatforms.length === 0 || !variants}
                className="w-full flex items-center justify-center gap-2 text-stone-700 text-sm font-bold border-2 border-stone-200 py-3 rounded-xl hover:bg-stone-50 hover:border-stone-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Calendar className="w-4 h-4" /> Schedule Post
              </button>
              <div className="flex gap-2">
                <button disabled={!variants} className="flex-1 flex items-center justify-center gap-2 text-stone-600 text-xs font-bold border-2 border-stone-200 py-2.5 rounded-xl hover:bg-stone-50 disabled:opacity-50 transition-colors">
                  <Download className="w-3.5 h-3.5" /> Save
                </button>
                <button disabled={!variants} className="flex-1 flex items-center justify-center gap-2 text-yellow-700 text-xs font-bold border-2 border-yellow-200 bg-yellow-50 py-2.5 rounded-xl hover:bg-yellow-100 disabled:opacity-50 transition-colors">
                  <Zap className="w-3.5 h-3.5" /> Boost
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Modal */}
      {showScheduleModal && (() => {
        const now = new Date();
        const minDateTime = now.toISOString().slice(0, 16);
        const quickPicks = [
          { label: 'Today 9 AM',    value: (() => { const d = new Date(now); d.setHours(9, 0, 0, 0); return d; })() },
          { label: 'Today 12 PM',   value: (() => { const d = new Date(now); d.setHours(12, 0, 0, 0); return d; })() },
          { label: 'Today 6 PM',    value: (() => { const d = new Date(now); d.setHours(18, 0, 0, 0); return d; })() },
          { label: 'Tomorrow 9 AM', value: (() => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; })() },
          { label: 'Tomorrow 6 PM', value: (() => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(18, 0, 0, 0); return d; })() },
        ].filter((q) => q.value > now);
        const toLocal = (d: Date) => {
          const off = d.getTimezoneOffset();
          return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
        };
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-lg font-extrabold text-stone-900">Schedule Post</h3>

              {/* Quick-pick time buttons */}
              <div>
                <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-2">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                  {quickPicks.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => setScheduleTime(toLocal(q.value))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        scheduleTime === toLocal(q.value)
                          ? 'bg-orange-600 text-white border-orange-600'
                          : 'bg-stone-50 text-stone-700 border-stone-200 hover:border-orange-300 hover:text-orange-600'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-stone-700 mb-1">Custom Date &amp; Time</label>
                <input
                  type="datetime-local"
                  min={minDateTime}
                  className="w-full border border-stone-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-orange-400 focus:outline-none"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>

              {scheduleTime && (
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-xs text-orange-700">
                  Will be published on <strong>{new Date(scheduleTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong> to {selectedPlatforms.join(', ')}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold text-stone-700 border border-stone-200 rounded-xl hover:bg-stone-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSchedule}
                  disabled={isPublishing || !scheduleTime}
                  className="flex-1 py-2.5 text-sm font-bold bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-xl transition-colors"
                >
                  {isPublishing ? 'Scheduling…' : 'Confirm Schedule'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      <CanvasStudio
        open={canvasStudioOpen}
        onClose={() => setCanvasStudioOpen(false)}
        brief={prompt}
        model={prompt}
        initialHeading={
          variants
            ? ((englishCaptions ?? variants.captions)[canvasDesignIdx]?.caption_text ?? '')
                .split(/[.!?\n]/)[0]?.trim().slice(0, 70) ?? ''
            : ''
        }
        onExport={(dataUrl) => {
          setAiImageUrls((prev) => {
            const next = [...prev] as (string | null)[];
            next[canvasDesignIdx] = dataUrl;
            return next;
          });
          setSelectedDesign(canvasDesignIdx);
        }}
      />
    </div>
  );
}
