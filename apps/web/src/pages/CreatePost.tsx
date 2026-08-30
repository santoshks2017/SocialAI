import { useState, useEffect, useRef } from 'react';
import { NavLink, useSearchParams } from 'react-router-dom';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { creativeService, postService } from '../services/creative';
import type { AIGenerationResponse } from '../services/creative';
import { useToast } from '../components/ui/Toast';
import {
  ArrowLeft, RefreshCw, Check, ImagePlus, X,
  Calendar, Wand2, ChevronDown, Layout, Sparkles, ZoomIn, Video, Send, Download
} from 'lucide-react';
import api from '../services/api';
import { CanvasStudio } from '../components/CreatePost/CanvasStudio';
import PlatformPreview from '../components/PlatformPreview';



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

  // Redesign custom states
  const [creativeType, setCreativeType] = useState<'image' | 'reel'>('image');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showAdvancedParams, setShowAdvancedParams] = useState(false);

  // Reel Video states
  const [reelDuration, setReelDuration] = useState<4 | 6 | 8>(6);
  const [reelAspect, setReelAspect] = useState<'9:16' | '16:9'>('9:16');
  const [reelCameraMotion, setReelCameraMotion] = useState<'tracking' | 'drone' | 'sunset' | 'studio'>('tracking');
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [cleanVideoUrl, setCleanVideoUrl] = useState<string | null>(null);
  const [reelOverlays, setReelOverlays] = useState<Array<{
    id: string;
    startTime: number;
    endTime: number;
    badge?: string;
    title: string;
    subtitle?: string;
    cta?: string;
    position?: 'top' | 'center' | 'bottom';
    theme?: 'glass-dark' | 'amber-glow' | 'minimal-white';
  }>>([]);
  const [activeReelView, setActiveReelView] = useState<'overlaid' | 'clean'>('overlaid');
  const [audioSuggestion, setAudioSuggestion] = useState<string | null>(null);



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

  const handleGenerateReel = async () => {
    if (!prompt.trim()) {
      addToast({ type: 'error', title: 'Prompt required', message: 'Please enter a concept or car model for your video reel.' });
      return;
    }

    setIsGenerating(true);
    setVideoUrl(null);
    setStepIndex(1); // Detailing Prompt Concept

    try {
      setStepIndex(1);
      await new Promise((r) => setTimeout(r, 600));

      setStepIndex(2); // Contacting Google Veo 3.1
      await new Promise((r) => setTimeout(r, 700));

      setStepIndex(3); // Synthesizing vehicle motion

      const reelRes = await api.post<{
        success: boolean;
        videoUrl: string;
        thumbnailUrl: string;
        cleanVideoUrl?: string;
        overlays?: any[];
        duration: number;
        aspectRatio: string;
        headline: string;
        caption: string;
        hashtags: string[];
        audioSuggestion: string;
      }>('/creatives/generate-reel', {
        prompt,
        brand: selectedBrand,
        model_name: detectedModel?.model_name || '',
        camera_motion: reelCameraMotion,
        duration_seconds: reelDuration,
        aspect_ratio: reelAspect,
        platforms: selectedPlatforms,
      });

      if (!reelRes.success || !reelRes.videoUrl) {
        throw new Error("Failed to generate video reel with Veo.");
      }

      setStepIndex(4); // Video stream encoded
      await new Promise((r) => setTimeout(r, 600));

      setStepIndex(5); // Viral caption & audio

      setVideoUrl(reelRes.videoUrl);
      setCleanVideoUrl(reelRes.cleanVideoUrl || reelRes.videoUrl);
      setReelOverlays(reelRes.overlays || []);
      setActiveReelView('overlaid');
      setCaption(reelRes.caption || '');
      setTags(reelRes.hashtags || []);
      setAudioSuggestion(reelRes.audioSuggestion || null);
      addToast({ type: 'success', title: 'Reel Generated', message: 'Your Veo 3.1 AI Reel is ready with clean video & crisp text overlays!' });
    } catch (err: any) {
      console.error("Reel generation error:", err);
      // Detect Veo rate limit (429) and show a clear retry message
      const isRateLimit = err?.status === 429 ||
        String(err?.message).includes('rate limit') ||
        String(err?.message).includes('429') ||
        String(err?.message).toLowerCase().includes('too many requests');

      if (isRateLimit) {
        addToast({
          type: 'error',
          title: '⏳ Veo Rate Limit Reached',
          message: 'Google Veo allows only a few video generations per minute. Please wait 1–2 minutes, then try again.',
        });
      } else {
        addToast({ type: 'error', title: 'Generation failed', message: err.message || 'Veo video generation encountered an error.' });
      }
    } finally {
      setIsGenerating(false);
      setStepIndex(0);
    }
  };

  const handleGenerate = async () => {
    if (creativeType === 'reel') {
      await handleGenerateReel();
      return;
    }

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

      setSelectedCreativeIdx(0);
      setSelectedCaptionIdx(0);

      setVariants({
        captions: mappedCaptions,
        hindi_captions: null,
        creatives: mappedCreatives,
        inventory_matched: null,
        platforms_requested: selectedPlatforms,
      });

      // Initialize tags
      const generatedTags = postRes.captions[0]?.hashtags || [];
      setTags(generatedTags);

      // Default caption: Option 1 text + hashtags joined
      const tagsStr = generatedTags.length
        ? `\n\n${generatedTags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
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

      setSelectedCreativeIdx(0);
      setSelectedCaptionIdx(0);

      setVariants({
        captions: mappedCaptions,
        hindi_captions: null,
        creatives: mappedCreatives,
        inventory_matched: null,
        platforms_requested: selectedPlatforms,
      });

      // Initialize tags
      const generatedTags = postRes.captions[0]?.hashtags || [];
      setTags(generatedTags);

      // Default caption: Option 1 text + hashtags joined
      const tagsStr = generatedTags.length
        ? `\n\n${generatedTags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')}`
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

  const handleAddTag = (tag: string) => {
    const cleanTag = tag.trim().replace(/^#/, '');
    if (!cleanTag) return;
    if (!tags.includes(cleanTag)) {
      const newTags = [...tags, cleanTag];
      setTags(newTags);
      
      // Append to caption textarea if not already present
      setCaption(prev => {
        const tagStr = `#${cleanTag}`;
        if (prev.includes(tagStr)) return prev;
        return `${prev.trim()} ${tagStr}`;
      });
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (idx: number) => {
    const tagToRemove = tags[idx];
    if (!tagToRemove) return;
    const newTags = tags.filter((_, i) => i !== idx);
    setTags(newTags);
    
    // Remove from caption text
    const tagStr = `#${tagToRemove}`;
    setCaption(prev => prev.replace(tagStr, '').replace(/\s+/g, ' ').trim());
  };

  const handleSuggestTags = () => {
    const modelName = detectedModel?.model_name || 'Creta';
    const brandName = detectedModel?.brand || selectedBrand;
    const suggestions = [
      `${brandName}${modelName}`,
      modelName,
      `${brandName}India`,
      'CarDeals',
      'DiscountOffer',
      'SUVLife'
    ];
    
    suggestions.forEach(t => {
      if (!tags.includes(t)) {
        handleAddTag(t);
      }
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* Top Bar / Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <NavLink to="/" className="text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </NavLink>
          <span className="text-slate-300 font-light">/</span>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 leading-tight">Create</h1>
            <p className="text-[11px] text-slate-500 font-medium">One prompt → publish to every platform in the right format.</p>
          </div>
        </div>

        {/* Language selector */}
        <div className="relative">
          <div className="flex items-center gap-2 border border-slate-200 hover:border-slate-350 rounded-xl px-3 py-1.5 bg-white text-xs font-bold text-slate-700 cursor-pointer shadow-xs transition-colors">
            <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>English</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Form Controls */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 max-w-3xl border-r border-slate-200 bg-white">
          
          {/* Section: What are you creating */}
          <div className="space-y-2.5">
            <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
              WHAT ARE YOU CREATING?
            </label>
            <div className="grid grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() => setCreativeType('image')}
                className={`p-4 rounded-2xl border-2 text-left flex items-start gap-3.5 transition-all duration-200 cursor-pointer ${
                  creativeType === 'image'
                    ? 'border-orange-500 bg-orange-50/5 shadow-xs'
                    : 'border-slate-200 bg-slate-50/10 hover:border-slate-300'
                }`}
              >
                <div className={`p-2.5 rounded-xl ${creativeType === 'image' ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                  <ImagePlus className="w-5 h-5" />
                </div>
                <div>
                  <span className={`block text-xs font-extrabold tracking-tight ${creativeType === 'image' ? 'text-orange-700' : 'text-slate-700'}`}>
                    Image Post
                  </span>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-tight">A branded photo post</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCreativeType('reel')}
                className={`p-4 rounded-2xl border-2 text-left flex items-start gap-3.5 transition-all duration-200 cursor-pointer ${
                  creativeType === 'reel'
                    ? 'border-orange-500 bg-orange-50/5 shadow-xs'
                    : 'border-slate-200 bg-slate-50/10 hover:border-slate-300'
                }`}
              >
                <div className={`p-2.5 rounded-xl ${creativeType === 'reel' ? 'bg-orange-500 text-white shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <span className={`block text-xs font-extrabold tracking-tight ${creativeType === 'reel' ? 'text-orange-700' : 'text-slate-700'}`}>
                    Reel (Video)
                  </span>
                  <p className="text-[10px] text-slate-500 font-semibold mt-0.5 leading-tight">A short vertical video</p>
                </div>
              </button>
            </div>
          </div>

          {/* Section: Post To */}
          <div className="space-y-2.5">
            <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
              POST TO
            </label>
            <div className="flex flex-wrap gap-3">
              {[
                { id: 'facebook', label: 'Facebook', color: 'text-[#1877F2]', dot: 'bg-[#1877F2]' },
                { id: 'instagram', label: 'Instagram', color: 'text-pink-500', dot: 'bg-pink-500' }
              ].map((p) => {
                const isSelected = selectedPlatforms.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPlatforms(prev =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      );
                    }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-xs font-black transition-all cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-50/5 text-orange-700 shadow-xs'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${p.dot}`} />
                    <span>{p.label}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-orange-600 ml-1" />}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-slate-450 font-bold leading-none">
              {creativeType === 'reel'
                ? `Output format: ${reelAspect} (Vertical Reel) — optimized for Instagram Reels, Facebook Reels, and Shorts.`
                : 'Output format: 1:1 — common format for the selected platforms.'}
            </p>
          </div>

          {/* Section: Visual Source or Reel Camera Motion */}
          {creativeType === 'reel' ? (
            <div className="space-y-4">
              <div className="space-y-2.5">
                <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
                  CINEMATIC CAMERA MOTION
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    { id: 'tracking', title: 'Dynamic Tracking', desc: 'Road motion blur', emoji: '🏎️' },
                    { id: 'drone', title: 'Cinematic Drone', desc: 'Aerial sweep', emoji: '🚁' },
                    { id: 'sunset', title: 'Golden Cruise', desc: 'Sunset reflections', emoji: '🌅' },
                    { id: 'studio', title: 'Luxury Reveal', desc: '360 showroom pan', emoji: '💎' }
                  ].map((motion) => {
                    const isActive = reelCameraMotion === motion.id;
                    return (
                      <button
                        key={motion.id}
                        type="button"
                        onClick={() => setReelCameraMotion(motion.id as any)}
                        className={`p-3 rounded-2xl border-2 text-left transition-all duration-200 cursor-pointer ${
                          isActive
                            ? 'border-orange-500 bg-orange-50/5 shadow-xs'
                            : 'border-slate-200 bg-slate-50/10 hover:border-slate-300'
                        }`}
                      >
                        <span className="text-xl block mb-1">{motion.emoji}</span>
                        <span className={`block text-xs font-black tracking-tight ${isActive ? 'text-orange-700' : 'text-slate-700'}`}>
                          {motion.title}
                        </span>
                        <p className="text-[9.5px] text-slate-500 font-semibold leading-tight mt-0.5">{motion.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Reel Duration & Ratio Config */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">DURATION</label>
                  <div className="flex gap-1.5">
                    {([4, 6, 8] as const).map((dur) => (
                      <button
                        key={dur}
                        type="button"
                        onClick={() => setReelDuration(dur)}
                        className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                          reelDuration === dur
                            ? 'border-orange-500 bg-orange-500 text-white shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {dur}s {dur === 6 && '★'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider">ASPECT RATIO</label>
                  <div className="flex gap-1.5">
                    {[
                      { id: '9:16', label: '9:16 (Reel)' },
                      { id: '16:9', label: '16:9 (Wide)' }
                    ].map((ratio) => (
                      <button
                        key={ratio.id}
                        type="button"
                        onClick={() => setReelAspect(ratio.id as any)}
                        className={`flex-1 py-2 text-xs font-black rounded-xl border transition-all cursor-pointer ${
                          reelAspect === ratio.id
                            ? 'border-orange-500 bg-orange-500 text-white shadow-xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {ratio.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
                VISUAL SOURCE
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { id: 'generate_scratch', title: 'Scratch AI', desc: 'AI scene + your car', icon: Sparkles },
                  { id: 'add_inspiration', title: 'Inspiration', desc: 'Recreate a reference', icon: Layout },
                  { id: 'add_creative', title: 'Branded', desc: 'Use your image as-is', icon: ImagePlus }
                ].map((mode) => {
                  const isActive = imageMode === mode.id;
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      onClick={() => setImageMode(mode.id as any)}
                      className={`p-4 rounded-2xl border-2 text-left flex flex-col justify-between transition-all duration-200 cursor-pointer ${
                        isActive
                          ? 'border-orange-500 bg-orange-50/5 shadow-xs'
                          : 'border-slate-200 bg-slate-50/10 hover:border-slate-250'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-orange-500' : 'text-slate-400'}`} />
                          <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${isActive ? 'border-orange-500 bg-orange-500' : 'border-slate-300'}`}>
                            {isActive && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                        </div>
                        <span className={`block text-xs font-extrabold tracking-tight mt-3 ${isActive ? 'text-orange-700' : 'text-slate-705'}`}>
                          {mode.title}
                        </span>
                        <p className="text-[9.5px] text-slate-500 font-semibold leading-normal mt-1">{mode.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section: Campaign Prompt Textarea */}
          <div className="space-y-3">
            <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
              WHAT DO YOU WANT TO POST?
            </label>
            <div className="bg-slate-50/40 border border-slate-200 rounded-2xl p-3 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/10 transition-colors shadow-inner">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="e.g. Create a promotion post for summer for Creta Model, offering a special exchange discount"
                className="w-full h-24 bg-transparent text-xs text-slate-800 font-medium resize-none focus:outline-none placeholder:text-slate-450 leading-relaxed"
                maxLength={400}
              />
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[9.5px] text-slate-400 font-bold">
                <span>{prompt.length} / 400 characters</span>
                {prompt.trim() && (
                  <button onClick={() => setPrompt('')} className="text-red-500 hover:underline cursor-pointer">
                    Clear Concept
                  </button>
                )}
              </div>
            </div>

            {/* Contextual Upload Box or Library Matched Model */}
            {imageMode === 'generate_scratch' ? (
              <div className="space-y-2">
                {detectedModel ? (
                  <div className="flex items-center gap-4 p-3.5 border border-slate-200 rounded-2xl bg-slate-50/30 shadow-xs relative group overflow-hidden">
                    <div className="w-20 h-14 rounded-xl border border-slate-200 overflow-hidden bg-white shrink-0">
                      {selectedModelImage ? (
                        <img src={selectedModelImage} alt={detectedModel.model_name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-350 bg-slate-100 text-xs">🚗</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[8.5px] font-black text-orange-600 tracking-wider uppercase">{detectedModel.brand}</span>
                      <h4 className="font-extrabold text-slate-800 text-xs truncate mt-0.5">{detectedModel.model_name}</h4>
                      <p className="text-[9.5px] text-slate-500 font-bold mt-0.5 leading-none">
                        Auto-Matched From Your Prompt - Default
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowModelPickerModal(true)}
                        className="text-[10.5px] px-2.5 py-1.5 font-bold border border-slate-200 bg-white hover:bg-slate-55 text-slate-700 rounded-lg shadow-xs cursor-pointer flex items-center gap-1 leading-none"
                      >
                        Customize View
                      </button>
                      <button
                        onClick={() => setShowAllModelsSelector(true)}
                        className="text-[10.5px] px-2.5 py-1.5 font-bold border border-slate-250 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-xs cursor-pointer leading-none"
                      >
                        Change Model
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="border border-dashed border-slate-250 rounded-2xl p-4 text-center bg-slate-50/20 space-y-2">
                    <p className="text-[10.5px] font-bold text-slate-500">No matched model found in prompt</p>
                    <button
                      onClick={() => setShowAllModelsSelector(true)}
                      className="px-3.5 py-1.5 text-[10.5px] font-bold bg-white border border-slate-255 text-slate-750 hover:bg-slate-55 rounded-lg shadow-xs cursor-pointer leading-none"
                    >
                      Select Model manually
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {uploadedImageUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-slate-200 w-full aspect-[21/9] shadow-xs group bg-slate-50">
                    <img src={uploadedImageUrl} alt="Attached" className="w-full h-full object-cover" />
                    <button
                      onClick={() => { setUploadedImageUrl(null); }}
                      className="absolute top-2.5 right-2.5 w-7 h-7 bg-black/60 hover:bg-black/85 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 text-white" />
                    </button>
                    <span className="absolute bottom-2.5 left-2.5 text-[10px] text-white font-bold bg-black/50 px-2.5 py-1 rounded-full">
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
                    className={`border border-dashed rounded-2xl p-6 text-center transition-all flex flex-col items-center justify-center min-h-[140px] focus:outline-none cursor-pointer ${
                      isDropzoneFocused
                        ? 'border-orange-500 bg-orange-50/15 shadow-sm ring-2 ring-orange-500/10'
                        : 'border-slate-250 hover:border-slate-350 bg-slate-50/20 hover:bg-slate-55'
                    }`}
                  >
                    {isDropzoneFocused && (
                      <div className="mb-2 bg-orange-500 text-white text-[9px] font-black uppercase px-2 py-0.5 rounded-full animate-pulse shadow-sm">
                        Ready to Paste!
                      </div>
                    )}
                    <ImagePlus className={`w-7 h-7 mb-1.5 transition-colors ${isDropzoneFocused ? 'text-orange-500' : 'text-slate-400'}`} />
                    <p className="text-[11px] font-bold text-slate-700">Click to focus box, copy-paste or upload reference image</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        document.getElementById('contextual-creative-file')?.click();
                      }}
                      className="mt-3 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-750 border border-slate-200 rounded-xl text-[10.5px] font-bold transition-all shadow-xs cursor-pointer leading-none"
                    >
                      Upload File
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
          </div>

          {/* Toggle Advanced AI parameters button */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvancedParams(!showAdvancedParams)}
              className="text-[11px] font-bold text-slate-655 hover:text-slate-900 flex items-center gap-1.5 cursor-pointer bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors leading-none"
            >
              <Layout className="w-3.5 h-3.5" />
              {showAdvancedParams ? 'Hide Advanced AI Parameters' : 'Show Advanced AI Parameters'}
            </button>
          </div>

          {/* Collapsible Detailing Layers */}
          {showAdvancedParams && elaboratedBrief && (
            <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50 space-y-4 animate-in slide-in-from-top-2 duration-200">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Headline Text</label>
                  <input
                    type="text"
                    value={elaboratedBrief.headline}
                    onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, headline: e.target.value })}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-205 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Car Angle</label>
                  <input
                    type="text"
                    value={elaboratedBrief.car_angle}
                    onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, car_angle: e.target.value })}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-205 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Lighting & Mood</label>
                  <input
                    type="text"
                    value={elaboratedBrief.lighting_mood}
                    onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, lighting_mood: e.target.value })}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-205 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Background theme</label>
                  <input
                    type="text"
                    value={elaboratedBrief.background_theme}
                    onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, background_theme: e.target.value })}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-205 rounded-lg bg-white focus:outline-none focus:border-orange-500"
                  />
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Background Scene Details (AI Generation Prompt)</label>
                  <textarea
                    value={elaboratedBrief.background_details}
                    onChange={(e) => setElaboratedBrief({ ...elaboratedBrief, background_details: e.target.value })}
                    rows={2}
                    className="w-full text-xs font-semibold px-2.5 py-1.5 border border-slate-205 rounded-lg bg-white focus:outline-none focus:border-orange-500 resize-none leading-relaxed"
                  />
                </div>
              </div>

              <button
                onClick={handleRegenerateDetailedPost}
                disabled={isGenerating}
                className="w-full py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate Design Variants
                  </>
                )}
              </button>
            </div>
          )}

          {/* Primary Generate Button */}
          {creativeType === 'reel' ? (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-black text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-orange-500/25 transition-all active:scale-98 disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating Reel with Veo 3.1...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  🎬 Generate AI Reel with Veo
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim() || (imageMode !== 'generate_scratch' && !uploadedImageUrl)}
              className="w-full py-3.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-orange-500/10 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer active:scale-98"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating post…
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  Generate post
                </>
              )}
            </button>
          )}

          {/* Divider */}
          <div className="h-px bg-slate-100" />

          {/* Section: CHOOSE A DESIGN / REEL */}
          <div className="space-y-3">
            <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
              {creativeType === 'reel' ? 'AI VIDEO REEL' : 'CHOOSE A DESIGN'}
            </label>

            {creativeType === 'reel' ? (
              videoUrl ? (
                <div className="flex flex-col p-4 rounded-2xl border-2 border-orange-500 bg-orange-50/10 shadow-md space-y-4">
                  {/* View Mode Switcher: Overlaid vs Clean */}
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-orange-200/50">
                    <div className="flex items-center gap-1 p-1 bg-slate-100/90 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setActiveReelView('overlaid')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeReelView === 'overlaid'
                            ? 'bg-white text-orange-600 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🎬 Overlaid Reel (With Text)
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveReelView('clean')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          activeReelView === 'clean'
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        🎥 Clean Video (Raw)
                      </button>
                    </div>

                    <span className="text-[10.5px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="w-3 h-3" /> No AI Text Disruption
                    </span>
                  </div>

                  <div className="flex flex-col sm:flex-row items-start gap-4">
                    <div className={`relative ${reelAspect === '16:9' ? 'aspect-[16/9] max-w-[220px]' : 'aspect-[9/16] max-w-[170px]'} w-full rounded-2xl overflow-hidden shadow-lg bg-black shrink-0 flex items-center justify-center`}>
                      {/* Ambient glow */}
                      <video
                        src={activeReelView === 'clean' ? (cleanVideoUrl || videoUrl) : videoUrl}
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="absolute inset-0 w-full h-full object-cover blur-xl opacity-35 scale-125 pointer-events-none"
                      />
                      <video
                        src={activeReelView === 'clean' ? (cleanVideoUrl || videoUrl) : videoUrl}
                        controls
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="relative z-10 max-w-full max-h-full object-contain"
                      />
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white text-[9px] font-black px-2 py-0.5 rounded-full shadow flex items-center gap-1 z-20">
                        <Check className="w-3 h-3" /> Ready
                      </div>
                      <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-md z-20">
                        {activeReelView === 'clean' ? 'Clean Veo 3.1' : 'With Overlays'}
                      </div>
                    </div>

                    <div className="flex-1 space-y-2.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-800">
                            {activeReelView === 'clean' ? 'Raw AI Cinematography' : 'Commercial Reel with Text Overlays'}
                          </span>
                          <span className="text-[10px] font-extrabold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                            {reelDuration}s · {reelAspect}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">
                          {activeReelView === 'clean'
                            ? 'Pure video footage generated by Google Veo 3.1 with zero text, logos, or artificial distortion.'
                            : 'Generated by Google Veo 3.1 with crisp, professional typography composited into the frames.'}
                        </p>
                      </div>

                      {audioSuggestion && (
                        <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 border border-slate-200/60 text-xs font-semibold text-slate-700">
                          <span className="text-base">🎵</span>
                          <div className="truncate">
                            <span className="text-[9px] text-slate-400 font-bold block uppercase tracking-wider">Suggested Audio</span>
                            <span className="text-xs text-slate-800 font-bold truncate">{audioSuggestion}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={videoUrl}
                          download="cardekho-overlaid-reel.mp4"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3.5 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download Overlaid Reel (.mp4)
                        </a>

                        {cleanVideoUrl && (
                          <a
                            href={cleanVideoUrl}
                            download="cardekho-clean-raw-video.mp4"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-950 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            Download Clean Video (.mp4)
                          </a>
                        )}

                        <button
                          type="button"
                          onClick={handleGenerate}
                          disabled={isGenerating}
                          className="px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          Regenerate
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Timed Text Overlays Breakdown */}
                  {reelOverlays && reelOverlays.length > 0 && (
                    <div className="pt-3 border-t border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <span>⏱️</span> Timed Frame Overlays
                        </span>
                        <span className="text-[9.5px] font-semibold text-slate-400">
                          {reelOverlays.length} Beats Synced
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {reelOverlays.map((beat, idx) => (
                          <div
                            key={beat.id || idx}
                            className="p-2.5 rounded-xl bg-white border border-slate-200/70 shadow-2xs space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-[8.5px] font-black bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                {beat.startTime}s – {beat.endTime}s
                              </span>
                              {beat.badge && (
                                <span className="text-[8.5px] font-extrabold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded truncate max-w-[80px]">
                                  {beat.badge}
                                </span>
                              )}
                            </div>
                            <h5 className="font-black text-slate-800 text-xs truncate" title={beat.title}>
                              {beat.title}
                            </h5>
                            {beat.subtitle && (
                              <p className="text-[10px] text-slate-500 font-medium truncate" title={beat.subtitle}>
                                {beat.subtitle}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-2 bg-slate-50/40">
                  <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto">
                    <Video className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-bold text-slate-700">No Reel Generated Yet</p>
                  <p className="text-[11px] text-slate-400">Click &ldquo;Generate AI Reel with Veo&rdquo; above to create a commercial 9:16 reel.</p>
                </div>
              )
            ) : aiImageUrls.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="relative aspect-square w-full max-w-[180px] rounded-2xl overflow-hidden border-2 border-orange-500 shadow-md">
                  <img src={aiImageUrls[selectedCreativeIdx || 0]} alt="Generated creative" className="w-full h-full object-cover" />
                  <div className="absolute top-2 right-2 bg-orange-500 text-white rounded-full p-1 shadow-sm">
                    <Check className="w-3 h-3.5" />
                  </div>
                  
                  {/* Studio overlay button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCanvasStudioOpen(true);
                    }}
                    className="absolute bottom-2 left-2 bg-black/60 hover:bg-orange-500 text-white p-1.5 rounded-lg transition-all z-10 cursor-pointer shadow"
                    title="Edit in Canvas Studio"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-slate-500 font-medium leading-relaxed">
                    This creative is auto-generated using Google AI Studio. You can edit the text layers, badges, and layout manually in our integrated Studio editor.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCanvasStudioOpen(true)}
                    className="text-xs px-3 py-1.5 font-bold border border-slate-205 bg-white hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer leading-none transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-orange-500" />
                    Edit in Studio
                  </button>
                </div>
              </div>
            ) : (
              <div className="border border-slate-200 border-dashed rounded-2xl p-8 text-center bg-slate-50/10 text-slate-400">
                <Layout className="w-8 h-8 mx-auto stroke-1.5 text-slate-300 mb-1.5" />
                <p className="text-xs font-bold text-slate-500">No design generated yet</p>
                <p className="text-[10px] text-slate-450 mt-0.5 leading-none">Click the Generate button above to compile your visual design.</p>
              </div>
            )}
          </div>

          {/* Section: CAPTION */}
          <div className="space-y-3.5">
            <label className="block text-[10.5px] font-black text-slate-400 uppercase tracking-widest">
              CAPTION
            </label>
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={!variants}
                placeholder="Awaiting campaign copy generation..."
                rows={4}
                className="w-full border border-slate-200 rounded-2xl px-4 py-3 bg-white text-xs text-slate-800 font-medium focus:outline-none focus:border-orange-500 leading-relaxed shadow-xs resize-none disabled:bg-slate-50/50 disabled:text-slate-400"
              />
              
              {/* Hashtags display */}
              {variants && (
                <div className="space-y-2 pt-1">
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10.5px] font-bold rounded-lg border border-slate-200/50"
                        >
                          #{tag.replace(/^#/, '')}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(idx)}
                            className="text-slate-400 hover:text-red-500 ml-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Add tag form */}
                  <div className="flex items-center gap-2 pt-1">
                    <div className="relative flex-1 max-w-[180px]">
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTag(newTagInput);
                          }
                        }}
                        placeholder="add tag"
                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1 text-[10.5px] font-medium text-slate-850 bg-white focus:outline-none focus:border-orange-500 leading-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSuggestTags}
                      className="text-[10.5px] font-bold text-orange-500 hover:text-orange-600 transition-colors cursor-pointer bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-lg leading-none"
                    >
                      # Suggest
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section: Buttons at the bottom */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <button
              onClick={handlePublishNow}
              disabled={isPublishing || !variants || selectedPlatforms.length === 0}
              className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-bold rounded-2xl text-sm flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-orange-500/10 active:scale-98 transition-all"
            >
              {isPublishing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Publish everywhere
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={!variants}
                className="flex-1 py-3 border border-slate-250 text-slate-700 bg-white hover:bg-slate-50 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                Schedule
              </button>
              <button
                onClick={handlePublishNow}
                disabled={!variants}
                className="flex-1 py-3 border border-slate-250 text-slate-700 bg-white hover:bg-slate-50 font-bold rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Check className="w-4 h-4 text-emerald-500" />
                Approval
              </button>
            </div>
          </div>

        </div>

        {/* Right Column: Platform Preview Column */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-50 flex flex-col justify-between max-w-xl">
          <div className="space-y-5 flex flex-col">
            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">PREVIEW</h3>
              
              {/* Platform Switcher Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPreviewTab('facebook')}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                    previewTab === 'facebook'
                      ? 'bg-[#1877F2] text-white ring-2 ring-[#1877F2]/20'
                      : 'bg-white border border-slate-200 text-slate-400 hover:text-[#1877F2]'
                  }`}
                  title="Facebook Preview"
                >
                  <svg className="w-3.5 h-3.5 fill-currentColor" viewBox="0 0 24 24">
                    <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" />
                  </svg>
                </button>
                <button
                  onClick={() => setPreviewTab('instagram')}
                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                    previewTab === 'instagram'
                      ? 'bg-gradient-to-tr from-yellow-400 to-pink-500 text-white ring-2 ring-pink-500/20'
                      : 'bg-white border border-slate-200 text-slate-400 hover:text-pink-500'
                  }`}
                  title="Instagram Preview"
                >
                  <svg className="w-3.5 h-3.5 stroke-currentColor fill-none" strokeWidth="2.5" viewBox="0 0 24 24">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Mobile Post Simulator Frame */}
            <div className="flex items-center justify-center py-4">
              <div className="w-full max-w-[460px] border border-slate-250 bg-white rounded-3xl overflow-hidden shadow-lg flex flex-col shrink-0">
                <PlatformPreview
                  platform={previewTab === 'gmb' ? 'google' : previewTab as any}
                  dealerName={dealerProfile?.name || 'SocialGenie'}
                  dealerInitials={dealerProfile?.name ? dealerProfile.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : 'AD'}
                  caption={caption}
                  imageUrl={aiImageUrls[selectedCreativeIdx || 0] || null}
                  isGenerating={isGenerating}
                  promptText={prompt}
                  selectedDesign={selectedCreativeIdx || 0}
                  videoUrl={activeReelView === 'clean' ? (cleanVideoUrl || videoUrl) : videoUrl}
                  audioSuggestion={audioSuggestion}
                  isReel={creativeType === 'reel'}
                  aspectRatio={reelAspect}
                  overlays={activeReelView === 'clean' ? [] : reelOverlays}
                />
              </div>
            </div>
          </div>
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
                    <span className="text-[9px] font-bold text-slate-455 uppercase tracking-wide block">{model.brand}</span>
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
              <h3 className="font-extrabold text-slate-900 text-base">
                {creativeType === 'reel' ? 'Generating AI Reel with Veo 3.1' : 'Creating Branded Post'}
              </h3>
              <p className="text-xs text-slate-550">
                {creativeType === 'reel'
                  ? 'Google Veo 3.1 is synthesizing your commercial video...'
                  : 'Gemini is details-layering your campaign...'}
              </p>
            </div>

            <div className="space-y-3.5 text-left border-t border-slate-200/50 pt-4">
              {(creativeType === 'reel'
                ? [
                    { step: 1, label: 'Detailing cinematic scene & camera path' },
                    { step: 2, label: 'Dispatching to Google Veo 3.1 video engine' },
                    { step: 3, label: 'Synthesizing vehicle motion, lighting & physics' },
                    { step: 4, label: 'Encoding high-definition video stream (.mp4)' },
                    { step: 5, label: 'Writing viral caption, hook & trending hashtags' }
                  ]
                : [
                    { step: 1, label: 'Detailing Prompt Concept' },
                    { step: 2, label: 'Generating background setting scene' },
                    { step: 3, label: 'Extracting car subject & lighting matching' },
                    { step: 4, label: 'Overlaying dealer branding details' },
                    { step: 5, label: 'Writing Hinglish post caption & tags' }
                  ]
              ).map((s) => {
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


