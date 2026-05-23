import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Building2, Palette, Sparkles, Check, 
  RefreshCw, 
  ArrowRight, ArrowLeft, Lightbulb, CheckCircle2 
} from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDealerProfile } from '../contexts/DealerProfileContext';
import { useToast } from '../components/ui/Toast';
import api from '../services/api';

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
  </svg>
);

const GlobeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
);

const OEMs = [
  { id: 'maruti', name: 'Maruti Suzuki', logo: 'MS', primary: '#0A4DA2', secondary: '#F2F2F2' },
  { id: 'hyundai', name: 'Hyundai', logo: 'H', primary: '#002C5F', secondary: '#00AAD2' },
  { id: 'toyota', name: 'Toyota', logo: 'T', primary: '#EB0A1E', secondary: '#FFFFFF' },
  { id: 'tata', name: 'Tata Motors', logo: 'TM', primary: '#00A9E0', secondary: '#002C5F' },
  { id: 'mahindra', name: 'Mahindra', logo: 'M', primary: '#DD1D25', secondary: '#1A1A1A' },
  { id: 'kia', name: 'Kia', logo: 'K', primary: '#05141F', secondary: '#EA0A2A' },
  { id: 'honda', name: 'Honda', logo: 'H', primary: '#E31837', secondary: '#F5F5F5' },
];

const TONES = [
  { id: 'professional', label: 'Professional', desc: 'Trustworthy, formal & authoritative', emoji: '👔' },
  { id: 'exciting', label: 'Exciting', desc: 'High energy, bold & engaging', emoji: '⚡' },
  { id: 'friendly', label: 'Friendly', desc: 'Warm, approachable & community-focused', emoji: '🤝' },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { profile, reload } = useDealerProfile();
  const { addToast } = useToast();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Profile Info
  const [dealershipName, setDealershipName] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [showroomType, setShowroomType] = useState('new'); // new, pre-owned, multi-brand
  const [selectedOem, setSelectedOem] = useState('');

  // Step 2: Account Link
  const [connectedPlatforms, setConnectedPlatforms] = useState<Record<string, { connected: boolean; loading: boolean }>>({
    facebook: { connected: false, loading: false },
    instagram: { connected: false, loading: false },
    gmb: { connected: false, loading: false },
  });

  // Step 3: Brand Identity
  const [primaryColor, setPrimaryColor] = useState('#1877F2');
  const [secondaryColor, setSecondaryColor] = useState('#1A1A2E');
  const [toneOfVoice, setToneOfVoice] = useState('friendly');

  // Step 4: First Post
  const [aiLoading, setAiLoading] = useState(false);
  const [aiStatusIdx, setAiStatusIdx] = useState(0);
  const [posts, setPosts] = useState<Array<{ id: number; title: string; caption: string }>>([]);
  const [selectedPostIdx, setSelectedPostIdx] = useState(0);

  // Load existing profile values if available
  useEffect(() => {
    if (profile) {
      setDealershipName(profile.name || '');
      setCity(profile.city || '');
      setState(profile.state || '');
      if (profile.brands && profile.brands.length > 0) {
        const matchingOem = OEMs.find(o => profile.brands.includes(o.name));
        if (matchingOem) {
          setSelectedOem(matchingOem.id);
        }
      }
      if (profile.primary_color) setPrimaryColor(profile.primary_color);
      if (profile.secondary_color) setSecondaryColor(profile.secondary_color);
    }
  }, [profile]);

  // Set colors automatically when OEM changes
  const handleOemSelect = (oemId: string) => {
    setSelectedOem(oemId);
    const oem = OEMs.find(o => o.id === oemId);
    if (oem) {
      setPrimaryColor(oem.primary);
      setSecondaryColor(oem.secondary);
      addToast({
        type: 'info',
        title: 'OEM Brand Selected',
        message: `Applying brand presets: Primary (${oem.primary}) and Secondary (${oem.secondary}).`
      });
    }
  };

  const handleProfileSubmit = async () => {
    if (!dealershipName || !city || !state || !selectedOem) {
      addToast({ type: 'error', title: 'Missing Info', message: 'Please fill in all profile details and select an OEM brand.' });
      return;
    }
    setLoading(true);
    try {
      const oemName = OEMs.find(o => o.id === selectedOem)?.name || '';
      await api.put('/dealer/profile', {
        name: dealershipName,
        city,
        state,
        brands: [oemName]
      });
      reload();
      addToast({ type: 'success', title: 'Profile Updated', message: 'Dealership details saved successfully.' });
      setStep(2);
    } catch (err) {
      addToast({ type: 'error', title: 'Error Saving Profile', message: 'Could not save profile details.' });
    } finally {
      setLoading(false);
    }
  };

  // Simulate Social Connections
  const handleConnectPlatform = (platform: string) => {
    setConnectedPlatforms(prev => ({
      ...prev,
      [platform]: { ...prev[platform], loading: true }
    }));

    setTimeout(() => {
      setConnectedPlatforms(prev => ({
        ...prev,
        [platform]: { connected: true, loading: false }
      }));
      const names: Record<string, string> = { facebook: 'Facebook Page', instagram: 'Instagram Business', gmb: 'Google My Business' };
      addToast({
        type: 'success',
        title: 'Platform Connected',
        message: `Successfully connected your ${names[platform]} account.`
      });
    }, 1500);
  };

  const handleBrandIdentitySubmit = async () => {
    setLoading(true);
    try {
      await api.put('/dealer/profile', {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        language_preferences: ['en', 'hi']
      });
      reload();
      addToast({ type: 'success', title: 'Brand Configured', message: 'Brand colors and parameters updated.' });
      setStep(4);
      triggerAiGeneration();
    } catch (err) {
      addToast({ type: 'error', title: 'Error Saving Brand Details', message: 'Could not save brand settings.' });
    } finally {
      setLoading(false);
    }
  };

  // AI Generation Loading Simulation
  const loadingStatuses = [
    'Scanning dealership profile...',
    'Analyzing regional market data...',
    'Applying brand guidelines and logo cues...',
    'Formulating post variations in Hinglish & English...',
    'Synthesizing AI templates with selected tone...',
    'Almost ready!'
  ];

  const triggerAiGeneration = () => {
    setAiLoading(true);
    setAiStatusIdx(0);
    
    // Increment statuses
    const interval = setInterval(() => {
      setAiStatusIdx(prev => {
        if (prev < loadingStatuses.length - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          return prev;
        }
      });
    }, 850);

    setTimeout(() => {
      const oemName = OEMs.find(o => o.id === selectedOem)?.name || 'vehicle';
      // Pre-populate 3 posts based on selection
      setPosts([
        {
          id: 1,
          title: '🚗 Inaugural Showroom Launch',
          caption: `We are officially OPEN in ${city}! 🎉 Exclusively bringing you the best ${oemName} experience. Visit us at ${dealershipName} to check out our launch discounts and grab hot deals on your dream car. Test drives are open. Aaiye aur apni manpasand gaadi ghar le jaiye! 🌟🔑`
        },
        {
          id: 2,
          title: '⚡ Book a Priority Test Drive',
          caption: `Experience the future of driving today. The all-new ${oemName} line-up is waiting for you at ${dealershipName}, ${city}. Book a test drive with our experts. High performance, premium comfort, aur shandaar mileage! DM us now or call us to reserve your slot. 📞✨`
        },
        {
          id: 3,
          title: '🌟 Special Festive Offer',
          caption: `Is Tyohaar ke mausam, treat your family to the luxury they deserve! 🎁 Get special discounts, 100% on-road financing options, and exchange bonuses on all ${oemName} models. Only at ${dealershipName}, ${city}. Jaldi karein, limited period offer! 🚗❤️`
        }
      ]);
      setAiLoading(false);
    }, 5500);
  };

  const handlePostSelection = async () => {
    setLoading(true);
    try {
      const activePost = posts[selectedPostIdx];
      await api.post('/publisher', {
        promptText: activePost.title,
        captionText: activePost.caption,
        platforms: Object.keys(connectedPlatforms).filter(k => connectedPlatforms[k].connected) || ['facebook']
      });
      addToast({ type: 'success', title: 'Post Saved', message: 'Your first post has been successfully scheduled!' });
      setStep(5);
    } catch (err) {
      addToast({ type: 'error', title: 'Failed to Save Post', message: 'Could not store generated post.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    setLoading(true);
    try {
      await api.post('/dealer/onboarding/complete');
      reload();
      addToast({ type: 'success', title: 'Welcome Aboard!', message: 'Onboarding completed. Welcome to SocialGenie!' });
      navigate('/');
    } catch (err) {
      console.error(err);
      // Fallback
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  // Confetti Animation Particles
  const confettiParticles = Array.from({ length: 40 }).map((_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 3;
    const duration = Math.random() * 2 + 2;
    const size = Math.random() * 8 + 6;
    const colors = ['#f97316', '#3b82f6', '#10b981', '#eab308', '#ec4899', '#8b5cf6'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shapeClass = Math.random() > 0.5 ? 'rounded-full' : 'transform rotate-45';
    
    return (
      <div
        key={i}
        className={`absolute confetti ${shapeClass}`}
        style={{
          left: `${left}%`,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
          backgroundColor: color,
          width: `${size}px`,
          height: `${size}px`,
          top: `-20px`,
        }}
      />
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col items-center justify-center p-4 md:p-8 text-slate-100 relative overflow-hidden">
      
      {/* Background blobs */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-[300px] h-[300px] bg-orange-500/5 rounded-full blur-[80px] pointer-events-none" />
      
      {/* Container Card */}
      <div className="w-full max-w-4xl relative z-10">
        
        {/* Header Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/20 mb-3">
            <span className="font-black text-white text-xl">SG</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white/95">
            Social<span className="text-orange-400">Genie</span> Onboarding
          </h1>
          <p className="text-slate-400 text-xs mt-1">Configure your workspace for AI automation</p>
        </div>

        <Card className="bg-slate-900/55 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
          
          {/* Step Progress Tracker */}
          <div className="border-b border-slate-800/80 px-6 py-4 bg-slate-900/30">
            <div className="flex justify-between items-center max-w-2xl mx-auto">
              {[
                { label: 'Profile', stepNum: 1 },
                { label: 'Socials', stepNum: 2 },
                { label: 'Identity', stepNum: 3 },
                { label: 'First Post', stepNum: 4 },
                { label: 'Launch', stepNum: 5 },
              ].map((s) => (
                <div key={s.stepNum} className="flex items-center flex-1 last:flex-initial">
                  <div className="flex flex-col items-center gap-1.5 relative">
                    <div 
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                        step === s.stepNum 
                          ? 'bg-orange-500 text-white ring-4 ring-orange-500/20 scale-110 shadow-lg' 
                          : step > s.stepNum 
                            ? 'bg-teal-500 text-white' 
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {step > s.stepNum ? <Check className="w-4 h-4" /> : s.stepNum}
                    </div>
                    <span className={`text-[10px] font-medium hidden sm:block ${
                      step === s.stepNum ? 'text-white' : 'text-slate-500'
                    }`}>{s.label}</span>
                  </div>
                  {s.stepNum < 5 && (
                    <div className="flex-1 mx-3 h-0.5 bg-slate-800 rounded">
                      <div 
                        className="h-full bg-gradient-to-r from-orange-500 to-teal-500 transition-all duration-500" 
                        style={{ width: step > s.stepNum ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <CardContent className="p-6 md:p-8">
            
            {/* Step 1: Dealership Details */}
            {step === 1 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-orange-400" />
                    Tell us about your dealership
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">Let's build your dealership's regional profile for local-context generation.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Dealership Name</label>
                    <Input 
                      placeholder="e.g. Maruti Suzuki Plaza Mumbai" 
                      value={dealershipName}
                      onChange={(e) => setDealershipName(e.target.value)}
                      className="bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600 focus:border-orange-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">Showroom Type</label>
                    <select 
                      value={showroomType}
                      onChange={(e) => setShowroomType(e.target.value)}
                      className="w-full bg-slate-950/60 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                    >
                      <option value="new">New Cars Showroom</option>
                      <option value="pre-owned">True Value / Certified Used Cars</option>
                      <option value="multi-brand">Multi-brand Car Dealership</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">City</label>
                    <Input 
                      placeholder="e.g. Mumbai" 
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-300">State</label>
                    <Input 
                      placeholder="e.g. Maharashtra" 
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="bg-slate-950/60 border-slate-800 text-white placeholder:text-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <label className="text-xs font-semibold text-slate-300 block">Select Primary OEM Brand</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {OEMs.map((oem) => (
                      <button
                        key={oem.id}
                        type="button"
                        onClick={() => handleOemSelect(oem.id)}
                        className={`p-3.5 rounded-xl border text-left transition-all relative ${
                          selectedOem === oem.id 
                            ? 'border-orange-500 bg-orange-500/10 shadow-lg ring-2 ring-orange-500/20' 
                            : 'border-slate-850 bg-slate-950/40 hover:bg-slate-950/70 hover:border-slate-700'
                        }`}
                      >
                        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{oem.logo}</div>
                        <div className="text-sm font-bold text-white mt-1.5">{oem.name}</div>
                        <div className="flex gap-1.5 mt-2.5">
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-800" style={{ backgroundColor: oem.primary }} />
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-800" style={{ backgroundColor: oem.secondary }} />
                        </div>
                        {selectedOem === oem.id && (
                          <div className="absolute top-2 right-2 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                            <Check className="w-2.5 h-2.5 text-white stroke-[3px]" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end pt-4 border-t border-slate-800/80">
                  <Button 
                    className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2 shadow-lg shadow-orange-500/10"
                    onClick={handleProfileSubmit}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Save & Continue'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Social Connects */}
            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <GlobeIcon className="w-5 h-5 text-orange-400" />
                    Connect your showroom accounts
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">Link your social media to allow scheduled publishing. (You can skip this step and link later).</p>
                </div>

                <div className="space-y-3">
                  {[
                    { id: 'facebook', name: 'Facebook Page', icon: <FacebookIcon className="w-5 h-5 text-blue-500" />, desc: 'Publish visual posts directly to your official page feed' },
                    { id: 'instagram', name: 'Instagram Business', icon: <InstagramIcon className="w-5 h-5 text-pink-500" />, desc: 'Schedule reels, car photos, and local launch promotions' },
                    { id: 'gmb', name: 'Google My Business', icon: <GlobeIcon className="w-5 h-5 text-orange-500" />, desc: 'Automatically showcase vehicle updates on Google Maps' },
                  ].map((plat) => {
                    const status = connectedPlatforms[plat.id];
                    return (
                      <div key={plat.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 bg-slate-950/40 border border-slate-850 rounded-2xl gap-3 hover:border-slate-800 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                            {plat.icon}
                          </div>
                          <div>
                            <h3 className="font-bold text-white text-sm">{plat.name}</h3>
                            <p className="text-slate-500 text-xs mt-0.5">{plat.desc}</p>
                          </div>
                        </div>
                        <div className="w-full sm:w-auto shrink-0 flex justify-end">
                          {status.connected ? (
                            <span className="flex items-center gap-1.5 text-xs text-teal-400 bg-teal-500/10 px-3 py-1.5 rounded-full border border-teal-500/20 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Connected
                            </span>
                          ) : (
                            <Button 
                              variant="secondary" 
                              className="text-xs bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5 px-4"
                              disabled={status.loading}
                              onClick={() => handleConnectPlatform(plat.id)}
                            >
                              {status.loading ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                'Link'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-between pt-4 border-t border-slate-800/80">
                  <Button variant="secondary" onClick={() => setStep(1)} className="text-white hover:bg-slate-800 border-slate-800">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button 
                    className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
                    onClick={() => setStep(3)}
                  >
                    Skip or Continue
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 3: Brand Identity */}
            {step === 3 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Palette className="w-5 h-5 text-orange-400" />
                    Configure brand styling & tone
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">These preferences set default templates and styles for your AI generated content.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left Controls */}
                  <div className="lg:col-span-7 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5 p-3.5 bg-slate-950/40 border border-slate-850 rounded-xl">
                        <label className="text-xs font-semibold text-slate-400 block">Primary Theme Color</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={primaryColor} 
                            onChange={(e) => setPrimaryColor(e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0" 
                          />
                          <span className="text-xs font-mono uppercase text-white">{primaryColor}</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 p-3.5 bg-slate-950/40 border border-slate-850 rounded-xl">
                        <label className="text-xs font-semibold text-slate-400 block">Secondary Accent</label>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={secondaryColor} 
                            onChange={(e) => setSecondaryColor(e.target.value)}
                            className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0" 
                          />
                          <span className="text-xs font-mono uppercase text-white">{secondaryColor}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-400 block">Writing Tone of Voice</label>
                      <div className="space-y-2">
                        {TONES.map((tone) => (
                          <button
                            key={tone.id}
                            type="button"
                            onClick={() => setToneOfVoice(tone.id)}
                            className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                              toneOfVoice === tone.id
                                ? 'border-orange-500 bg-orange-500/10 shadow-lg'
                                : 'border-slate-850 bg-slate-950/20 hover:bg-slate-950/40'
                            }`}
                          >
                            <span className="text-2xl mt-0.5">{tone.emoji}</span>
                            <div>
                              <div className="text-xs font-bold text-white">{tone.label}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5">{tone.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Preview */}
                  <div className="lg:col-span-5 space-y-2.5">
                    <span className="text-xs font-semibold text-slate-400 block">Live Creative Preview</span>
                    <div className="bg-slate-950 border border-slate-850 rounded-2xl overflow-hidden aspect-[4/3] flex flex-col p-4 relative shadow-inner">
                      
                      {/* Simulated Post Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: primaryColor }}>
                          {dealershipName ? dealershipName[0].toUpperCase() : 'S'}
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-white">{dealershipName || 'Your Dealership'}</p>
                          <p className="text-[9px] text-slate-500">{city || 'Mumbai'}</p>
                        </div>
                      </div>

                      {/* Simulated Poster Image Area */}
                      <div className="flex-1 bg-gradient-to-br rounded-xl p-4 flex flex-col justify-between relative overflow-hidden" style={{ backgroundImage: `linear-gradient(135deg, ${primaryColor}dd, ${secondaryColor}dd)` }}>
                        <div className="text-[9px] text-white/50 tracking-widest font-semibold uppercase">Premium Selection</div>
                        <div className="space-y-1">
                          <h3 className="text-white text-xs font-black tracking-tight leading-tight">THE ALL-NEW CAR ARRIVAL</h3>
                          <p className="text-white/70 text-[9px]">Experience Luxury and Performance today.</p>
                        </div>
                        <div className="flex items-center justify-between border-t border-white/10 pt-2 mt-2">
                          <span className="text-[9px] text-white/80 font-bold">Exclusively At {dealershipName || 'SocialGenie'}</span>
                          <span className="text-[9px] bg-white text-slate-900 px-2 py-0.5 rounded-full font-bold">Book Test Drive</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="flex justify-between pt-4 border-t border-slate-800/80">
                  <Button variant="secondary" onClick={() => setStep(2)} className="text-white hover:bg-slate-800 border-slate-800">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button 
                    className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
                    onClick={handleBrandIdentitySubmit}
                    disabled={loading}
                  >
                    {loading ? 'Saving...' : 'Confirm Brand Styles'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 4: First Post */}
            {step === 4 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-400" />
                    Review your first AI generated post
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">Our engine has automatically drafted posts matching your OEM catalog, city, and selected brand colors.</p>
                </div>

                {aiLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center space-y-4">
                    <div className="relative w-16 h-16">
                      <div className="absolute inset-0 rounded-full border-4 border-slate-850 border-t-orange-500 animate-spin" />
                      <div className="absolute inset-2 rounded-full border-4 border-slate-850 border-b-teal-500 animate-spin [animation-direction:reverse]" />
                    </div>
                    <div className="text-center space-y-1 max-w-sm">
                      <p className="text-sm font-semibold text-white animate-pulse">
                        {loadingStatuses[aiStatusIdx]}
                      </p>
                      <p className="text-xs text-slate-500">Creating custom variations using {toneOfVoice} templates</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
                    
                    {/* Post Titles Column */}
                    <div className="md:col-span-5 space-y-2">
                      {posts.map((post, idx) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setSelectedPostIdx(idx)}
                          className={`w-full p-4 rounded-xl border text-left transition-all ${
                            selectedPostIdx === idx
                              ? 'border-orange-500 bg-orange-500/10 shadow-lg'
                              : 'border-slate-850 bg-slate-950/20 hover:bg-slate-950/40'
                          }`}
                        >
                          <div className="text-xs font-bold text-white">{post.title}</div>
                          <p className="text-[10px] text-slate-500 truncate mt-1">{post.caption}</p>
                        </button>
                      ))}
                    </div>

                    {/* Post Preview Column */}
                    <div className="md:col-span-7 bg-slate-950 border border-slate-850 rounded-2xl p-4 flex flex-col justify-between shadow-inner">
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white" style={{ backgroundColor: primaryColor }}>
                            {dealershipName ? dealershipName[0].toUpperCase() : 'S'}
                          </div>
                          <div>
                            <p className="text-[11px] font-bold text-white">{dealershipName || 'Your Dealership'}</p>
                            <p className="text-[9px] text-slate-500">{city} · Now</p>
                          </div>
                        </div>

                        {/* Post caption content */}
                        <div className="bg-slate-900 border border-slate-850 rounded-xl p-3.5">
                          <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                            {posts[selectedPostIdx]?.caption}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-slate-500 border-t border-slate-900 pt-3 mt-4">
                        <Lightbulb className="w-4 h-4 text-orange-400 flex-shrink-0" />
                        <span>This post will be saved as a draft for Facebook/Instagram scheduling.</span>
                      </div>
                    </div>

                  </div>
                )}

                <div className="flex justify-between pt-4 border-t border-slate-800/80">
                  <Button variant="secondary" onClick={() => setStep(3)} className="text-white hover:bg-slate-800 border-slate-800">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back
                  </Button>
                  <Button 
                    className="bg-orange-500 hover:bg-orange-600 text-white flex items-center gap-2"
                    onClick={handlePostSelection}
                    disabled={loading || aiLoading}
                  >
                    {loading ? 'Creating...' : 'Schedule Selected Post'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* Step 5: Success & Redirection */}
            {step === 5 && (
              <div className="text-center py-8 space-y-6 relative">
                
                {/* Simulated CSS Confetti */}
                {confettiParticles}

                <div className="w-16 h-16 bg-gradient-to-tr from-teal-400 to-emerald-500 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-teal-500/20 animate-bounce">
                  <Check className="w-8 h-8 text-slate-950 stroke-[3px]" />
                </div>

                <div className="space-y-2 max-w-md mx-auto">
                  <h2 className="text-2xl font-extrabold text-white">🎉 Dealership Onboarded!</h2>
                  <p className="text-slate-400 text-sm">
                    {dealershipName} is completely set up on SocialGenie. Your brand profile is ready and first post draft has been scheduled.
                  </p>
                </div>

                {/* Settings list preview */}
                <div className="bg-slate-950/40 border border-slate-850 rounded-2xl max-w-sm mx-auto p-4 text-left space-y-2.5">
                  <div className="flex justify-between text-xs border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-semibold">OEM Preset</span>
                    <span className="text-white font-bold">{OEMs.find(o => o.id === selectedOem)?.name}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-semibold">Showroom Type</span>
                    <span className="text-white font-bold capitalize">{showroomType}</span>
                  </div>
                  <div className="flex justify-between text-xs border-b border-slate-900 pb-2">
                    <span className="text-slate-500 font-semibold">Tone of Voice</span>
                    <span className="text-white font-bold capitalize">{toneOfVoice}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500 font-semibold">Primary Color</span>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3.5 h-3.5 rounded border border-slate-800" style={{ backgroundColor: primaryColor }} />
                      <span className="text-white font-mono uppercase">{primaryColor}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/80 max-w-sm mx-auto">
                  <Button 
                    className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-slate-950 font-bold shadow-lg shadow-orange-500/10 text-sm py-2.5"
                    onClick={handleCompleteOnboarding}
                    disabled={loading}
                  >
                    {loading ? 'Completing...' : 'Go to Dashboard'}
                  </Button>
                </div>
              </div>
            )}

          </CardContent>
        </Card>
      </div>

      <style>{`
        @keyframes fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
        }
        .confetti {
          position: absolute;
          width: 8px;
          height: 8px;
          opacity: 0.8;
          animation: fall 4s linear infinite;
          pointer-events: none;
          z-index: 100;
        }
      `}</style>

    </div>
  );
}
