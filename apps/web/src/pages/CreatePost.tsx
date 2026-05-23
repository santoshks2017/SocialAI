import { useState, useEffect, useRef, useCallback } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import PlatformPreview from '../components/PlatformPreview';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { creativeService, postService } from '../services/creative';
import type { AIGenerationResponse, CaptionVariant } from '../services/creative';
import { useToast } from '../components/ui/Toast';
import { useAuth } from '../contexts/AuthContext';
import { generateGeminiCreative } from '../services/imageGeneration';
import {
  Tag, Sparkles, Heart, Gift, PenLine,
  ArrowLeft, RefreshCw, Check, ImagePlus, Video, X,
  Send, Download, Zap, Globe, Calendar, Film, Clock, Wand2,
  Languages, Minimize2, Hash, ChevronDown, AlertCircle,
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
    () => searchParams.get('postType') ?? draft.selectedPostType ?? localStorage.getItem('sg_last_post_type') ?? 'offer',
  );
  const [activeCategory, setActiveCategory] = useState(() => {
    const pt = searchParams.get('postType') ?? draft.selectedPostType ?? localStorage.getItem('sg_last_post_type') ?? 'offer';
    const type = POST_TYPES.find((t) => t.id === pt);
    return type ? type.category : 'Festival Offer';
  });
  const [isPromptCustom, setIsPromptCustom] = useState(() => {
    const initialPrompt = searchParams.get('prompt') ?? draft.prompt ?? '';
    if (!initialPrompt.trim()) return false;
    
    // Check if it matches a starter template of any post type
    const isStarter = POST_TYPES.some(t => t.starter && initialPrompt.startsWith(t.starter));
    if (isStarter) return false;
    
    // Check if it matches any chip in PROMPT_CHIPS
    const isChip = Object.values(PROMPT_CHIPS).some(chips => chips.includes(initialPrompt));
    if (isChip) return false;
    
    return true;
  });
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
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
  const [mediaTab, setMediaTab] = useState<'ai' | 'url'>(() => (draft.mediaTab as 'ai' | 'url') ?? 'ai');


  // Model Library / Auto-Image selection states
  const [allModels, setAllModels] = useState<any[]>([]);
  const [detectedModel, setDetectedModel] = useState<any | null>(null);
  const [selectedModelImage, setSelectedModelImage] = useState<string | null>(null);
  const [selectedModelAngle, setSelectedModelAngle] = useState<string>('front_exterior');
  const [selectedModelColor, setSelectedModelColor] = useState<string>('');
  const [showModelPickerModal, setShowModelPickerModal] = useState(false);
  const [matchingErrorNotice, setMatchingErrorNotice] = useState<string | null>(null);
  const [uploadSectionExpanded, setUploadSectionExpanded] = useState(false);
  const [aiImageUrls, setAiImageUrls] = useState<(string | null)[]>([null, null, null]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [imageLoadingStates, setImageLoadingStates] = useState<boolean[]>([false, false, false]);
  const [connectedAccounts, setConnectedAccounts] = useState<string[]>([]);
  const [canvasStudioOpen, setCanvasStudioOpen] = useState(false);
  const [canvasDesignIdx,  setCanvasDesignIdx]  = useState(0);
  const [promptBrief, setPromptBrief] = useState<{
    car_details: string;
    angle: string;
    background: string;
    theme: string;
    lighting: string;
    text_placement: string;
    expanded_prompt?: string;
  } | null>(null);

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
  const [selectedBrand, setSelectedBrand] = useState('Hyundai');

  useEffect(() => {
    if (dealerProfile?.brands?.length) {
      setSelectedBrand(dealerProfile.brands[0]);
    }
  }, [dealerProfile]);

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

  // Load models on mount
  useEffect(() => {
    api.get<{ success: boolean; models: any[] }>('/model-library')
      .then((res) => setAllModels(res.models || []))
      .catch(console.error);
  }, []);

  // Debounced prompt model detection
  useEffect(() => {
    if (!prompt.trim()) {
      setDetectedModel(null);
      setSelectedModelImage(null);
      setMatchingErrorNotice(null);
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
        setMatchingErrorNotice(null);
        const defaultColor = matched.colours?.[0]?.name || '';
        setSelectedModelColor(defaultColor);
        setSelectedModelAngle('front_exterior');
        const defaultImg = matched.colours?.[0]?.images?.find((img: any) => img.angle === 'front_exterior')?.url 
          || matched.images?.find((img: any) => img.angle === 'front_exterior')?.url 
          || matched.images?.[0]?.url;
        setSelectedModelImage(defaultImg || null);
      } else {
        const COMMON_INDIAN_MODELS = ['swift', 'creta', 'nexon', 'thar', 'scorpio', 'seltos', 'fortuner', 'hector', 'city', 'baleno', 'brezza', 'punch', 'taigun', 'kushaq', 'compass'];
        const mentionsModel = COMMON_INDIAN_MODELS.find(m => lowerPrompt.includes(m));
        
        if (mentionsModel) {
          setMatchingErrorNotice(`Model "${mentionsModel.charAt(0).toUpperCase() + mentionsModel.slice(1)}" not found in your library. Upload an image or sync your library to continue.`);
        } else {
          setMatchingErrorNotice(null);
        }
        setDetectedModel(null);
        setSelectedModelImage(null);
      }
    }, 500);

    return () => clearTimeout(handler);
  }, [prompt, allModels]);

  // Update selectedBrand to match detected model brand
  useEffect(() => {
    if (detectedModel) {
      const matchingBrand = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra', 'Renault', 'Nissan', 'MG', 'Skoda', 'Volkswagen', 'Jeep', 'Ford', 'Citroën', 'BMW', 'Mercedes-Benz', 'Audi'].find(
        (b) => b.toLowerCase() === detectedModel.brand.toLowerCase()
      );
      if (matchingBrand) {
        setSelectedBrand(matchingBrand);
      }
    }
  }, [detectedModel]);

  // Auto-expand upload drawer for delivery post type
  useEffect(() => {
    if (selectedPostType === 'delivery') {
      setUploadSectionExpanded(true);
    }
  }, [selectedPostType]);

  const handleTypeSelect = (type: (typeof POST_TYPES)[number]) => {
    setSelectedPostType(type.id);
    setActiveCategory(type.category);
    localStorage.setItem('sg_last_post_type', type.id);
    
    const isCurrentStarter = POST_TYPES.some(t => t.starter && t.starter === prompt);
    if (!prompt.trim() || isCurrentStarter) {
      setPrompt(type.starter || '');
      setIsPromptCustom(false);
    }
  };

  const handleSuggestionSelect = (chip: string) => {
    if (prompt.trim() && isPromptCustom) {
      addToast({
        type: 'warning',
        title: 'Prompt replaced',
        message: 'Your custom typed prompt was replaced by the selected suggestion.'
      });
    }
    setPrompt(chip);
    setIsPromptCustom(false);
    
    setTimeout(() => {
      if (promptTextareaRef.current) {
        promptTextareaRef.current.focus();
        promptTextareaRef.current.selectionStart = promptTextareaRef.current.value.length;
        promptTextareaRef.current.selectionEnd = promptTextareaRef.current.value.length;
      }
    }, 0);
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
            setUploadedImageUrl(localUrl);
            setUploadedImageId('pasted');
            setUploadedVideoName(null);
            const res = await uploadFileAPI(file);
            if (res) {
              setUploadedImageId(res.id);
              setUploadedImageUrl(res.url);
            }
            setTimeout(() => setIsPasting(false), 1500);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

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
      setPromptBrief(null);
      setPublished(false);
      setAiImageUrls([null, null, null]);
      setImageLoadingStates([false, false, false]);
    }
    try {
      let subjectImageIds: string[] = [];
      let subjectImageUrls: string[] = [];

      if (uploadedImageUrl) {
        subjectImageIds = uploadedImageId ? [uploadedImageId] : [];
        subjectImageUrls = [uploadedImageUrl];
      } else if (selectedModelImage) {
        subjectImageIds = [];
        subjectImageUrls = [selectedModelImage];
      }

      const geminiRes = await generateGeminiCreative(
        prompt,
        selectedBrand,
        subjectImageIds.length > 0 ? subjectImageIds : undefined,
        subjectImageUrls.length > 0 ? subjectImageUrls : undefined
      );

      const styles = ['Festive & High-Energy', 'Premium & Luxury', 'Value & CTA'];
      const mappedCaptions = geminiRes.options.map((opt, i) => ({
        caption_text: opt.copy,
        hashtags: opt.hashtags,
        suggested_emoji: [],
        platform_notes: 'Generated via Gemini Premium AI',
        style: styles[i] || `Option ${i + 1}`,
      }));

      const mappedCreatives = geminiRes.options.map((opt, i) => ({
        id: `tpl_gemini_${i}`,
        template_name: styles[i] || `Option ${i + 1}`,
        thumbnail_url: opt.creativeUrl,
        platform_urls: {
          facebook: opt.creativeUrl,
          instagram: opt.creativeUrl,
          gmb: opt.creativeUrl,
        }
      }));

      const mappedVariants: AIGenerationResponse = {
        captions: mappedCaptions,
        hindi_captions: null,
        creatives: mappedCreatives,
        inventory_matched: null,
        platforms_requested: selectedPlatforms,
      };

      setVariants(mappedVariants);
      setPromptBrief(geminiRes.promptBrief || null);
      setEnglishCaptions(mappedCaptions);
      setHindiCaptions(null);
      setSelectedVariant(0);
      setSelectedDesign(0);
      setCaption(geminiRes.options[0]?.copy ?? '');
      setAiImageUrls(geminiRes.options.map(opt => opt.creativeUrl));

      // Clear saved draft after a successful generate (content is now in view)
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      addToast({ type: 'success', title: 'Creative Generated', message: 'Your premium branded creative is ready!' });
    } catch (err: any) {
      console.error(err);
      addToast({
        type: 'error',
        title: 'Generation failed',
        message: err.message || 'Could not generate AI creative. Please try again.'
      });
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

  // Caption variant tab click — updates both caption and design to stay in sync
  const handleVariantSelect = (idx: number) => {
    setSelectedVariant(idx);
    setSelectedDesign(idx);
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
      <div className="h-full flex items-center justify-center bg-slate-50">
        <div className="text-center bg-white border border-slate-200 rounded-2xl p-10 shadow-xl max-w-sm w-full mx-4">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-150 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-extrabold text-slate-900">Post Published!</h3>
          <p className="text-slate-500 text-sm mt-2">Queued to {selectedPlatforms.join(', ')}</p>
          <div className="flex gap-3 mt-6 justify-center">
            <button
              onClick={() => { setVariants(null); setPrompt(''); setPublished(false); setSelectedPostType('offer'); setActiveCategory('Festival Offer'); setIsPromptCustom(false); }}
              className="px-4 py-2.5 text-sm font-semibold text-slate-700 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-colors"
            >
              Create Another
            </button>
            <NavLink to="/calendar" className="px-4 py-2.5 text-sm font-semibold bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors shadow-md shadow-orange-500/20">
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
      <div className="h-full flex flex-col overflow-y-auto bg-slate-50">
        <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
          <NavLink to="/" className="text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </NavLink>
          <span className="text-slate-300 text-sm">/</span>
          <span className="text-slate-500 text-sm">Create</span>
          <span className="text-slate-300 text-sm">/</span>
          <span className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
            <Film className="w-4 h-4 text-orange-500" /> AI Video
          </span>
        </div>

        <div className="flex-1 p-5 md:p-7 max-w-2xl mx-auto w-full space-y-5">
          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 border border-orange-200 rounded-2xl p-6 text-slate-800 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0">
                <Film className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">AI Video Generation</h2>
                <p className="text-slate-650 text-sm mt-1">Create short-form videos for Reels and Stories directly from a text description.</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {['Instagram Reels', 'Facebook Stories', 'YouTube Shorts'].map((p) => (
                    <span key={p} className="text-[11px] px-2.5 py-1 rounded-full bg-orange-50 border border-orange-100 text-orange-700 font-semibold">{p}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-sm">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Video Concept</label>
              <textarea
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Diwali offer — new Hyundai Creta, ₹50,000 discount, limited period"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Base Image (optional)</label>
              <input ref={videoImageRef} type="file" accept="image/*" className="hidden" onChange={handleVideoImageUpload} />
              {videoImageUrl ? (
                <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50">
                  <img src={videoImageUrl} alt="Base" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">Image uploaded</p>
                    <p className="text-xs text-slate-500">Will be used as the video background</p>
                  </div>
                  <button onClick={() => { setVideoImageId(null); setVideoImageUrl(null); }} className="p-1.5 text-slate-450 hover:text-red-600 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => videoImageRef.current?.click()}
                  disabled={uploadingVideoImage}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-slate-200 hover:border-orange-500/40 hover:bg-orange-50 text-slate-500 hover:text-orange-600 text-sm font-medium transition-colors disabled:opacity-50 w-full justify-center cursor-pointer"
                >
                  <ImagePlus className="w-4 h-4" />
                  {uploadingVideoImage ? 'Uploading…' : 'Upload car photo (or we\'ll generate a background)'}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Duration</label>
                <div className="flex gap-2">
                  {[15, 30, 60].map((s) => (
                    <button key={s} onClick={() => setVideoDuration(s)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${videoDuration === s ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-orange-500/30 hover:text-orange-600 hover:bg-slate-50'}`}
                    >{s}s</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Format</label>
                <div className="flex gap-2">
                  {(['9:16', '1:1', '16:9'] as const).map((r) => (
                    <button key={r} onClick={() => setVideoAspect(r)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${videoAspect === r ? 'bg-orange-500 text-white border-orange-500 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-orange-500/30 hover:text-orange-600 hover:bg-slate-50'}`}
                    >{r}</button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerateVideo}
              disabled={!videoPrompt.trim() || generatingVideo}
              className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {generatingVideo
                ? <><RefreshCw className="w-4 h-4 animate-spin" /> Generating video… ({videoDuration}s)</>
                : <><Wand2 className="w-4 h-4" /> Generate Video</>
              }
            </button>
          </div>

          {videoUrl && (
            <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden shadow-sm">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-slate-800">Video Ready — {videoDuration}s · {videoAspect}</span>
                </div>
                <a
                  href={videoUrl}
                  download={`cardekho-social-ai-video-${Date.now()}.mp4`}
                  className="flex items-center gap-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
              <div className="flex justify-center bg-slate-900 p-4">
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
            <div className="bg-orange-50 border border-orange-200 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-orange-100 border border-orange-200 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <h3 className="font-semibold text-orange-800">Video queued</h3>
              <p className="text-xs text-orange-700 font-mono bg-white border border-orange-150 px-3 py-1.5 rounded-lg">Job ID: {videoJobId}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Main layout ──────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 shrink-0">
        <NavLink to="/" className="text-slate-500 hover:text-slate-800 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </NavLink>
        <span className="text-slate-300">/</span>
        <span className="text-slate-800 text-sm font-semibold">Create Post</span>
        {variants && (
          <span className="ml-auto flex items-center gap-1.5 text-xs text-green-600 font-medium">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full" /> Draft saved
          </span>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ════ MAIN CONTENT ════ */}
        <div className="flex-1 overflow-y-auto p-8 space-y-6 min-w-0 max-w-5xl mx-auto">

         {/* ── COLLAPSIBLE: Upload Images Only ── */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden transition-all duration-200">
            {/* Header / Toggle Button */}
            <button
              onClick={() => setUploadSectionExpanded(!uploadSectionExpanded)}
              className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-slate-50/50 transition-colors focus:outline-none cursor-pointer"
            >
              <div className="flex-1 min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <ImagePlus className="w-5 h-5 text-orange-500 shrink-0" />
                    Upload Images Only
                  </h2>
                  {(uploadedImageUrl || uploadedVideoName) && (
                    <span className="text-[10px] font-bold text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Attached
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500 truncate">
                  For delivery posts and actual customer photos. Not needed for standard posts — your model library handles those.
                </p>
              </div>
              <ChevronDown
                className={`w-5 h-5 text-slate-400 transition-transform duration-200 shrink-0 ${
                  uploadSectionExpanded ? 'transform rotate-180' : ''
                }`}
              />
            </button>

            {/* Content Body */}
            {uploadSectionExpanded && (
              <div className="px-6 pb-6 pt-2 border-t border-slate-100">
                <div className="max-w-2xl">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoUpload}
                  />
                  {uploadedImageUrl ? (
                    <div className="relative rounded-xl overflow-hidden border border-slate-200 group w-64 h-64 shadow-sm bg-slate-50">
                      <img src={uploadedImageUrl} alt="Uploaded" className="w-full h-full object-cover" />
                      <button
                        onClick={clearMedia}
                        className="absolute top-3 right-3 w-8 h-8 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                      >
                        <X className="w-4 h-4 text-white" />
                      </button>
                      <span className="absolute bottom-3 left-3 text-xs text-white font-bold bg-black/50 px-3 py-1.5 rounded-full">
                        Photo attached
                      </span>
                    </div>
                  ) : uploadedVideoName ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 bg-slate-50 max-w-md">
                      <Video className="w-6 h-6 text-orange-500 shrink-0" />
                      <p className="text-sm text-slate-700 truncate flex-1">{uploadedVideoName}</p>
                      <button onClick={clearMedia} className="cursor-pointer">
                        <X className="w-5 h-5 text-slate-400 hover:text-red-500 transition-colors" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-4">
                      <button
                        onClick={() => imageInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex-1 flex flex-col items-center gap-3 py-8 rounded-xl border border-dashed border-slate-200 hover:border-orange-500 hover:bg-orange-50/30 transition-all text-slate-400 hover:text-orange-600 disabled:opacity-40 cursor-pointer"
                      >
                        <ImagePlus className="w-8 h-8" />
                        <span className="text-sm font-semibold">{isUploading ? 'Uploading…' : 'Upload Photo'}</span>
                        <span className="text-xs">JPG, PNG, WEBP</span>
                      </button>
                      <button
                        onClick={() => videoInputRef.current?.click()}
                        disabled={isUploading}
                        className="flex-1 flex flex-col items-center gap-3 py-8 rounded-xl border border-dashed border-slate-200 hover:border-orange-500 hover:bg-orange-50/30 transition-all text-slate-400 hover:text-orange-600 disabled:opacity-40 cursor-pointer"
                      >
                        <Video className="w-8 h-8" />
                        <span className="text-sm font-semibold">{isUploading ? 'Uploading…' : 'Upload Video'}</span>
                        <span className="text-xs">MP4, MOV</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── SECTION 1: Describe your post ── */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900 mb-1">What exactly should be the post?</h2>
              <p className="text-sm text-slate-500">Choose a post type to get custom templates or write your own concept below.</p>
            </div>

            {/* 1. Pill toggle row */}
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none md:scrollbar-thin scroll-smooth flex-nowrap">
              {POST_TYPES.map((t) => {
                const Icon = t.icon;
                const isActive = selectedPostType === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleTypeSelect(t)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold whitespace-nowrap transition-all duration-200 cursor-pointer shrink-0 ${
                      isActive
                        ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-350 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* 2. Quick suggestions row (only show if selectedPostType !== 'custom' and suggestions exist) */}
            {selectedPostType !== 'custom' && activeChips.length > 0 && (
              <div className="pt-2 space-y-3">
                <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">Quick Suggestions</p>
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none md:scrollbar-thin scroll-smooth flex-nowrap">
                  {activeChips.map((chip, idx) => {
                    const isSelected = prompt === chip;
                    return (
                      <button
                        key={idx}
                        onClick={() => handleSuggestionSelect(chip)}
                        className={`text-left p-4 rounded-xl border transition-all cursor-pointer min-w-[280px] max-w-[320px] shrink-0 flex-1 flex flex-col justify-between ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50/30 shadow-xs'
                            : 'border-slate-200 bg-white hover:border-orange-400 hover:bg-slate-50/50'
                        }`}
                      >
                        <p className={`text-sm leading-relaxed ${isSelected ? 'text-orange-700 font-bold' : 'text-slate-700'}`}>{chip}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Divider: "Or write your own" (only show if suggestions are visible) */}
            {selectedPostType !== 'custom' && activeChips.length > 0 && (
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-xs font-semibold text-slate-400 tracking-wide uppercase">Or write your own</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>
            )}

            {/* 4. Textarea */}
            <div className="bg-slate-50/50 border border-slate-200 rounded-2xl p-2 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 transition-colors">
              <textarea
                ref={promptTextareaRef}
                value={prompt}
                onChange={(e) => {
                  const val = e.target.value;
                  setPrompt(val);
                  if (!val.trim()) {
                    setIsPromptCustom(false);
                  } else {
                    const matchesAnySuggestion = activeChips.includes(val);
                    setIsPromptCustom(!matchesAnySuggestion);
                  }
                }}
                placeholder="Describe your offer in detail — include vehicle name, discount amount, validity, and any special offer…"
                className="w-full h-32 px-3 py-2 bg-transparent text-sm text-slate-800 resize-none focus:outline-none placeholder:text-slate-450 leading-relaxed"
                maxLength={500}
              />
              <div className="flex items-center justify-between px-3 pb-2">
                <span className="text-[11px] text-slate-400">{prompt.length} / 500 characters</span>
                {prompt.trim() && (
                  <button
                    onClick={() => {
                      setPrompt('');
                      setIsPromptCustom(false);
                      if (promptTextareaRef.current) {
                        promptTextareaRef.current.focus();
                      }
                    }}
                    className="text-[11px] text-slate-450 hover:text-red-550 hover:text-red-500 transition-colors font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Matched Model / Uploaded Image Indicator */}
            {uploadedImageUrl ? (
              <div className="flex items-center gap-2 mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-800">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                  📷 Using: your uploaded photo (Overrides model repository)
                </span>
                <button
                  onClick={() => {
                    setUploadedImageUrl(null);
                    setUploadedImageId(null);
                  }}
                  className="ml-auto text-orange-600 hover:text-orange-700 font-bold hover:underline cursor-pointer"
                >
                  Clear Upload
                </button>
              </div>
            ) : detectedModel ? (
              <div className="flex items-center gap-2 mt-3 p-3 bg-orange-50/50 border border-orange-200/50 rounded-xl text-xs text-slate-800 justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base shrink-0">🚗</span>
                  <span>
                    Using: <span className="font-bold text-slate-800">{detectedModel.brand} {detectedModel.model_name}</span> — 
                    Color: <span className="font-semibold text-slate-600">{selectedModelColor}</span>, 
                    Angle: <span className="font-semibold text-slate-600 capitalize">{selectedModelAngle.replace('_', ' ')}</span>
                  </span>
                </div>
                <button
                  onClick={() => setShowModelPickerModal(true)}
                  className="text-orange-600 hover:text-orange-700 font-bold hover:underline cursor-pointer ml-2 shrink-0"
                >
                  [Change]
                </button>
              </div>
            ) : matchingErrorNotice ? (
              <div className="mt-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-2.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed font-medium">{matchingErrorNotice}</p>
                </div>
                <div className="flex gap-3 pl-6">
                  <button
                    onClick={() => {
                      setUploadSectionExpanded(true);
                      setTimeout(() => {
                        imageInputRef.current?.click();
                      }, 100);
                    }}
                    className="bg-amber-600 hover:bg-amber-700 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm cursor-pointer"
                  >
                    Upload Image
                  </button>
                  <NavLink
                    to="/settings?tab=model_library"
                    className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold px-3 py-1.5 rounded-lg shadow-sm"
                  >
                    Open Library Sync
                  </NavLink>
                </div>
              </div>
            ) : null}
          </div>

          {/* ── SECTION 2: Media ── */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-150 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 mb-1">Creative / Media</h2>
                <p className="text-sm text-slate-500">Optional — let AI create a design or scrape from link</p>
              </div>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full">Optional</span>
            </div>

            <div className="flex flex-wrap p-4 gap-2 bg-slate-50/50 border-b border-slate-150">
              {([
                { id: 'ai',  icon: Wand2, label: 'Generate with AI', sub: 'Let AI design it' },
                { id: 'url', icon: Globe, label: 'Auto-Scrape URL',  sub: 'Generate from Link' },
              ] as const).map(({ id, icon: Icon, label, sub }) => (
                <button
                  key={id}
                  onClick={() => setMediaTab(id as typeof mediaTab)}
                  className={`flex-1 flex flex-col items-start p-4 rounded-xl border-2 transition-all min-w-[150px] ${
                    mediaTab === id
                      ? 'border-orange-500 bg-orange-50/50 shadow-sm shadow-orange-500/5'
                      : 'border-slate-200 bg-white hover:border-slate-350 hover:bg-slate-50/50'
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${mediaTab === id ? 'text-orange-500' : 'text-slate-400'}`} />
                  <p className={`text-sm font-bold ${mediaTab === id ? 'text-orange-700' : 'text-slate-700'}`}>{label}</p>
                  <p className={`text-xs mt-1 ${mediaTab === id ? 'text-orange-600/80' : 'text-slate-500'}`}>{sub}</p>
                </button>
              ))}
            </div>

            <div className="p-6">
              {/* AI Generate tab */}
              {mediaTab === 'ai' && (
                <div className="space-y-6 max-w-3xl">
                  {/* Brand Selector */}
                  <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row items-center gap-4">
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-slate-800 mb-1">Select Brand Logo</h4>
                      <p className="text-xs text-slate-500">Pick the brand logo to render on the top-left corner of your creative.</p>
                    </div>
                    <div className="w-full md:w-56">
                      <select
                         value={selectedBrand}
                         onChange={(e) => setSelectedBrand(e.target.value)}
                         className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 text-slate-800 font-medium [&>option]:bg-white"
                      >
                        {(dealerProfile?.brands && dealerProfile.brands.length > 0
                          ? dealerProfile.brands
                          : ['Maruti Suzuki', 'Hyundai', 'Tata', 'Kia', 'Honda', 'Toyota', 'Mahindra']
                        ).map((brand) => (
                          <option key={brand} value={brand}>{brand}</option>
                        ))}
                      </select>
                    </div>
                  </div>


                  {!variants && !isGenerating ? (
                    <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl p-6 text-white shadow-md">
                      <div className="flex items-start gap-4">
                        <Wand2 className="w-8 h-8 shrink-0 mt-1 text-orange-100" />
                        <div>
                          <h3 className="font-bold text-lg mb-1 text-white">Let AI design your post</h3>
                          <p className="text-orange-100 text-sm mb-5">Click below to generate post content and a bespoke automotive creative based on your requirements.</p>
                          <button
                            onClick={() => handleGenerate(false)}
                            disabled={!prompt.trim()}
                            className="bg-white text-orange-600 font-bold px-6 py-3 rounded-xl shadow-sm hover:shadow-md transition-all hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                          >
                            <Sparkles className="w-4 h-4" />
                            {prompt.trim() ? 'Generate Designs' : 'Enter requirements first'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {promptBrief && (
                        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-6">
                          <div className="flex items-center gap-2 mb-3 text-slate-800">
                            <Sparkles className="w-4 h-4 text-orange-500" />
                            <h4 className="text-xs font-bold uppercase tracking-wider">Creative Brief (AI Prompt Engine)</h4>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 text-xs">
                            <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Vehicle</span>
                              <span className="text-slate-800 font-bold">{promptBrief.car_details}</span>
                            </div>
                            <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Camera Angle</span>
                              <span className="text-slate-800 font-bold">{promptBrief.angle}</span>
                            </div>
                            <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Lighting</span>
                              <span className="text-slate-800 font-bold">{promptBrief.lighting}</span>
                            </div>
                            <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs">
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Theme</span>
                              <span className="text-slate-800 font-bold">{promptBrief.theme}</span>
                            </div>
                            <div className="bg-white border border-slate-150 rounded-xl p-3 shadow-xs col-span-2 sm:col-span-1">
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Text Placement</span>
                              <span className="text-slate-800 font-bold">{promptBrief.text_placement}</span>
                            </div>
                          </div>
                          {promptBrief.expanded_prompt && (
                            <div className="mt-3 bg-white border border-slate-150 rounded-xl p-3.5 shadow-xs text-xs text-slate-700">
                              <span className="text-[10px] text-slate-400 block mb-1 font-bold uppercase tracking-wider">Detailed Scene Prompt</span>
                              <span className="text-slate-655 leading-relaxed italic">"{promptBrief.expanded_prompt}"</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-bold text-slate-800">Choose a design</p>
                        <button
                          onClick={() => handleGenerate(true)}
                          disabled={isGeneratingImages || isGenerating}
                          className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-orange-600 font-semibold transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg disabled:opacity-50 cursor-pointer"
                        >
                          <RefreshCw className={`w-4 h-4 ${isGeneratingImages || isGenerating ? 'animate-spin' : ''}`} />
                          {isGeneratingImages ? 'Generating…' : 'Regenerate'}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                         {variants?.creatives.map((creative, i) => {
                          const aiImg = aiImageUrls[i] ?? creative.thumbnail_url;
                          const loading = imageLoadingStates[i] ?? false;
                          const isGemini = creative.id === 'tpl_gemini';
                          return (
                            <div key={creative.id || i} className={`flex flex-col gap-1.5 ${isGemini ? 'md:col-span-3 max-w-sm mx-auto w-full' : ''}`}>
                            <button
                              onClick={() => handleVariantSelect(i)}
                              className={`relative rounded-2xl overflow-hidden border-2 transition-all group w-full ${
                                selectedDesign === i ? 'border-orange-500 shadow-lg shadow-orange-100 scale-[1.02]' : 'border-stone-200 hover:border-stone-300'
                              }`}
                            >
                              {aiImg ? (
                                <img src={aiImg} alt={creative.template_name} className="w-full aspect-square object-cover" />
                              ) : loading ? (
                                <div className="aspect-square bg-slate-100 flex flex-col items-center justify-center gap-2">
                                  <Sparkles className="w-6 h-6 text-orange-500 animate-pulse" />
                                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">Creating…</p>
                                </div>
                              ) : (
                                <div className="aspect-square bg-slate-200 flex items-center justify-center p-4">
                                  <div className="bg-white/80 rounded-lg px-3 py-1.5 shadow-sm">
                                    <p className="text-slate-800 text-xs font-bold uppercase tracking-wider">{creative.template_name}</p>
                                  </div>
                                </div>
                              )}
                              {selectedDesign === i && (
                                <div className="absolute top-3 right-3 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center shadow-md">
                                  <Check className="w-4 h-4 text-white" />
                                </div>
                              )}
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-6">
                                <p className="text-white text-xs font-bold">{creative.template_name}</p>
                              </div>
                            </button>
                            <button
                              onClick={() => { setCanvasDesignIdx(i); setCanvasStudioOpen(true); }}
                              className="w-full py-1.5 text-[11px] font-bold text-orange-600 border border-orange-200 bg-orange-50 hover:bg-orange-100 rounded-xl transition-colors cursor-pointer"
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
                      className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-sm text-slate-800 placeholder:text-slate-400"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <input type="text" value={urlCar} onChange={(e) => setUrlCar(e.target.value)} placeholder="Car Model (e.g. Creta)" className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-sm text-slate-800 placeholder:text-slate-400" />
                    <input type="text" value={urlOffer} onChange={(e) => setUrlOffer(e.target.value)} placeholder="Offer Details (e.g. ₹50K Off)" className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-sm text-slate-800 placeholder:text-slate-400" />
                    <input type="text" value={urlFestival} onChange={(e) => setUrlFestival(e.target.value)} placeholder="Festival (e.g. Diwali)" className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-sm text-slate-800 placeholder:text-slate-400" />
                    <input type="text" value={urlCity} onChange={(e) => setUrlCity(e.target.value)} placeholder="City (e.g. Delhi)" className="px-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 text-sm text-slate-800 placeholder:text-slate-400" />
                  </div>
                  <button
                    onClick={handleGenerateFromUrl}
                    disabled={!sourceUrl || isGeneratingImages}
                    className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-colors flex justify-center items-center gap-2 shadow-sm cursor-pointer shadow-orange-500/10"
                  >
                    {isGeneratingImages ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                    {isGeneratingImages ? 'Scraping & Generating...' : 'Auto-Generate Post from Link'}
                  </button>
                  {urlGeneratedImage && (
                    <div className="mt-6">
                      <p className="text-sm font-bold text-slate-800 mb-2">Generated Result</p>
                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm inline-block relative group">
                        <img src={urlGeneratedImage} alt="Generated from URL" className="w-64 h-64 object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => setUrlGeneratedImage(null)} className="bg-white/15 border border-white/20 text-white px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm">
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
              className="w-full max-w-2xl flex items-center justify-center gap-2.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl transition-colors shadow-lg shadow-orange-500/20 text-base cursor-pointer"
            >
              {isGenerating
                ? <><RefreshCw className="w-5 h-5 animate-spin" /> Generating content…</>
                : <><PenLine className="w-5 h-5" /> Generate Post Content</>
              }
            </button>
          )}


          {/* ── SECTION 3: Caption ── */}
          {(variants || isGenerating) && (
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-150">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900">Caption</h2>
                    <span className="flex items-center gap-1.5 text-xs bg-teal-50 border border-teal-200 text-teal-700 font-bold px-2.5 py-1 rounded-full">
                      <Sparkles className="w-3 h-3" /> AI Generated
                    </span>
                  </div>
                  {variants && (
                    <div className="flex gap-1 bg-slate-100 border border-slate-200 p-1 rounded-xl">
                      {(['english', 'hinglish', 'hindi'] as const).map((tone) => (
                        <button
                          key={tone}
                          onClick={() => handleToneChange(tone)}
                          disabled={tone === 'hindi' && !hindiCaptions}
                          className={`text-xs font-semibold px-4 py-1.5 rounded-lg transition-colors disabled:opacity-40 cursor-pointer ${
                            toneActive === tone ? 'bg-white text-slate-800 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-800'
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
                    {[0, 1, 2].map((i) => <div key={i} className="flex-1 h-10 bg-slate-100 rounded-xl animate-pulse" />)}
                  </div>
                  <div className="h-32 bg-slate-100 rounded-2xl animate-pulse" />
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((i) => <div key={i} className="h-8 w-24 bg-slate-100 rounded-full animate-pulse" />)}
                  </div>
                </div>
              ) : variants && (
                <div className="px-6 py-6 space-y-5 max-w-3xl">
                  {/* Caption style tabs — independent of design selection (M7) */}
                  <div className="flex gap-3">
                    {variants?.captions.map((v, i) => (
                      <button
                        key={i}
                        onClick={() => handleVariantSelect(i)}
                        className={`flex-1 py-3 px-4 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                          selectedVariant === i
                            ? 'bg-orange-50 text-orange-705 border-orange-500 shadow-sm'
                            : 'bg-white text-slate-650 border-slate-200 hover:border-slate-350 hover:text-slate-800'
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
                      className="w-full h-40 p-5 border border-slate-200 rounded-2xl text-sm text-slate-800 resize-none focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10 leading-relaxed transition-colors bg-slate-50/20 focus:bg-white placeholder:text-slate-400"
                      maxLength={charLimit}
                    />
                    <div className="absolute bottom-3 right-4 text-xs text-white font-medium bg-slate-800/80 px-2 py-0.5 rounded backdrop-blur-sm">
                      <span className={caption.length > charLimit * 0.9 ? 'text-orange-400' : ''}>
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
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          Rephrase
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showRephraseMenu && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-20 py-1 min-w-[140px]">
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
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Minimize2 className="w-3.5 h-3.5" />
                        Shorten
                      </button>

                      {/* Translate dropdown */}
                      <div className="relative">
                        <button
                          onClick={() => { setShowTranslateMenu((v) => !v); setShowRephraseMenu(false); }}
                          disabled={isTransforming}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
                        >
                          <Languages className="w-3.5 h-3.5" />
                          Translate
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        {showTranslateMenu && (
                          <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-20 py-1 min-w-[150px]">
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
                                className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
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
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 transition-colors cursor-pointer"
                      >
                        <Hash className="w-3.5 h-3.5" />
                        Hashtags
                      </button>

                      {isTransforming && (
                        <span className="flex items-center gap-1.5 text-xs text-slate-500 ml-1">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Working…
                        </span>
                      )}
                    </div>
                  )}

                  {/* Hashtags */}
                  {currentVariant && currentVariant.hashtags.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Suggested Hashtags</p>
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
        <div className="w-96 shrink-0 border-l border-slate-200 bg-slate-50/50 overflow-y-auto">
          <div className="sticky top-0 flex flex-col items-center py-6 px-5 gap-5">

            {isPasting && (
              <div className="w-full bg-green-500/10 border-2 border-green-500/40 rounded-xl px-4 py-2 flex items-center gap-2 animate-pulse">
                <Check className="w-4 h-4 text-green-600" />
                <span className="text-sm font-bold text-green-800">Image pasted!</span>
              </div>
            )}

            {/* Platform preview switcher */}
            <div className="w-full">
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-widest mb-2 text-center">Live Preview</p>
              <div className="flex gap-1 bg-slate-200/60 p-1 rounded-xl">
                {(['facebook', 'instagram', 'google'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setActivePlatformPreview(p)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg transition-all cursor-pointer ${
                      activePlatformPreview === p ? 'bg-white text-slate-800 shadow-sm font-semibold' : 'text-slate-600 hover:text-slate-800'
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
                      uploadedImageUrl ? uploadedImageUrl :
                      selectedModelImage ? selectedModelImage :
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
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-widest text-center">Platforms</p>
              <div className="flex gap-2">
                {PLATFORMS.map(({ id, icon: Icon, color, dot }) => {
                  const isConnected = connectedAccounts.includes(id === 'gmb' ? 'google' : id);
                  return (
                    <button
                      key={id}
                      onClick={() => togglePlatform(id)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-all cursor-pointer ${
                        selectedPlatforms.includes(id)
                          ? 'border-orange-500 bg-white shadow-sm'
                          : 'border-slate-200 bg-slate-50/40 hover:border-slate-350 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-5 h-5 ${color} shrink-0`} />
                      {selectedPlatforms.includes(id) && (
                        <div className={`w-2 h-2 rounded-full shadow-sm ${isConnected ? dot : 'bg-slate-600'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Show warning if no selected platform has a connected account */}
              {selectedPlatforms.length > 0 && !selectedPlatforms.some((p) => connectedAccounts.includes(p === 'gmb' ? 'google' : p)) && (
                <p className="text-[11px] text-amber-800 text-center font-medium bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                  No connected accounts — <NavLink to="/accounts" className="underline font-bold text-amber-700">Connect now</NavLink>
                </p>
              )}
            </div>

            <div className="w-full border-t border-slate-200" />

            {/* Publish actions */}
            <div className="w-full space-y-2.5">
              <button
                onClick={handlePublishNow}
                disabled={isPublishing || selectedPlatforms.length === 0 || !variants}
                className="w-full flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold py-3.5 rounded-xl transition-colors shadow-lg shadow-orange-500/20 cursor-pointer"
              >
                {isPublishing
                  ? <><RefreshCw className="w-4 h-4 animate-spin" /> Publishing…</>
                  : <><Send className="w-4 h-4" /> Post Everywhere</>
                }
              </button>
              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={selectedPlatforms.length === 0 || !variants}
                className="w-full flex items-center justify-center gap-2 text-slate-700 text-sm font-bold border border-slate-200 py-3 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Calendar className="w-4 h-4" /> Schedule Post
              </button>
              <div className="flex gap-2">
                <button disabled={!variants} className="flex-1 flex items-center justify-center gap-2 text-slate-700 text-xs font-bold border border-slate-200 py-2.5 rounded-xl bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors cursor-pointer">
                  <Download className="w-3.5 h-3.5" /> Save
                </button>
                <button disabled={!variants} className="flex-1 flex items-center justify-center gap-2 text-amber-800 text-xs font-bold border border-amber-200 bg-amber-50 py-2.5 rounded-xl hover:bg-amber-100/80 disabled:opacity-50 transition-colors cursor-pointer">
                  <Zap className="w-3.5 h-3.5 text-amber-600" /> Boost
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
              <h3 className="text-lg font-extrabold text-slate-900">Schedule Post</h3>

              {/* Quick-pick time buttons */}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Quick picks</p>
                <div className="flex flex-wrap gap-2">
                  {quickPicks.map((q) => (
                    <button
                      key={q.label}
                      onClick={() => setScheduleTime(toLocal(q.value))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                        scheduleTime === toLocal(q.value)
                          ? 'bg-orange-500 text-white border-orange-500 shadow-sm font-bold'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-orange-500 hover:text-orange-600'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Custom Date &amp; Time</label>
                <input
                  type="datetime-local"
                  min={minDateTime}
                  className="w-full border border-slate-200 bg-white rounded-lg px-3 py-2 text-sm text-slate-800 focus:ring-2 focus:ring-orange-500/40 focus:outline-none [color-scheme:light]"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                />
              </div>

              {scheduleTime && (
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-900 font-medium">
                  Will be published on <strong>{new Date(scheduleTime).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</strong> to {selectedPlatforms.join(', ')}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setShowScheduleModal(false)}
                  className="flex-1 py-2.5 text-sm font-semibold text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmSchedule}
                  disabled={isPublishing || !scheduleTime}
                  className="flex-1 py-2.5 text-sm font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl transition-colors shadow-lg shadow-orange-500/20 cursor-pointer"
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
            ? ((englishCaptions ?? variants?.captions)[canvasDesignIdx]?.caption_text ?? '')
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

      {/* Model Image Picker Modal */}
      {showModelPickerModal && detectedModel && (
        <ModelPickerModal
          model={detectedModel}
          initialColor={selectedModelColor}
          initialAngle={selectedModelAngle}
          onClose={() => setShowModelPickerModal(false)}
          onApply={(color, angle, imageUrl) => {
            setSelectedModelColor(color);
            setSelectedModelAngle(angle);
            setSelectedModelImage(imageUrl);
            setShowModelPickerModal(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Model Picker Modal Component ───────────────────────────────────────────
interface ModelPickerModalProps {
  model: any;
  initialColor: string;
  initialAngle: string;
  onClose: () => void;
  onApply: (color: string, angle: string, imageUrl: string) => void;
}

function ModelPickerModal({ model, initialColor, initialAngle, onClose, onApply }: ModelPickerModalProps) {
  const [tempColor, setTempColor] = useState(initialColor || (model.colours?.[0]?.name ?? ''));
  const [tempAngle, setTempAngle] = useState(initialAngle || 'front_exterior');

  // Compute the image URL for any given angle and color
  const getImageUrl = (colorName: string, angleName: string) => {
    const colorObj = model.colours?.find((c: any) => c.name === colorName);
    const imgFromColor = colorObj?.images?.find((img: any) => img.angle === angleName)?.url;
    if (imgFromColor) return imgFromColor;

    const imgFromGlobal = model.images?.find((img: any) => img.angle === angleName)?.url;
    if (imgFromGlobal) return imgFromGlobal;

    // Fallback: return any image URL
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
                {model.colours.map((color: any) => {
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
                        : 'border-slate-200 hover:border-slate-350 bg-slate-50/20'
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
                      <span className={`text-xs font-bold ${isSelected ? 'text-orange-700' : 'text-slate-700'}`}>
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
