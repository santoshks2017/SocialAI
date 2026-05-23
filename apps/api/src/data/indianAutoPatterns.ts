/**
 * Indian Auto Dealer Creative Engine — Pattern Knowledge Base
 *
 * Built from analysis of successful Indian auto dealer social media pages
 * across Facebook, Instagram, and Google My Business.
 *
 * Covers: regional tone, brand voice, post-type templates, hashtag libraries,
 * festival calendar, and call-to-action patterns by state.
 *
 * This file is the "brain" fed into AI prompts for context-aware caption generation.
 * It can be enriched over time by running the scraper routes.
 */

// ─── Region definitions ───────────────────────────────────────────────────────
export const REGIONS: Record<string, {
  states: string[];
  tone: string;
  language_hint: string;
  local_ctas: string[];
  price_sensitivity: 'high' | 'medium' | 'low';
  top_platforms: string[];
}> = {
  north_india: {
    states: ['Delhi', 'NCR', 'Uttar Pradesh', 'Haryana', 'Punjab', 'Rajasthan', 'Himachal Pradesh', 'Uttarakhand', 'Jammu'],
    tone: 'Aggressive on deals and discounts. Price-forward. Bold headlines with urgency. Mix Hindi phrases naturally.',
    language_hint: 'Use power words like "Dhamaka Offer", "Maha Sale", "Seedha Factory Rate". Hindi phrases work well: "Abhi Book Karein", "Saste Mein Sapna Poora Karo".',
    local_ctas: ['Visit our showroom in [City]', 'Call/WhatsApp for best price in [City]', 'Book your test drive today — we come to you!'],
    price_sensitivity: 'high',
    top_platforms: ['facebook', 'instagram', 'whatsapp'],
  },
  west_india: {
    states: ['Maharashtra', 'Mumbai', 'Pune', 'Gujarat', 'Ahmedabad', 'Surat', 'Goa'],
    tone: 'Business-minded and value-focused. EMI and finance options prominent. Professional yet approachable. Marathi/Gujarati pride.',
    language_hint: 'Highlight ROI and smart buying. Gujarati audience: trust + community. Mumbai: aspirational luxury. Pune: young professional + tech-savvy.',
    local_ctas: ['Smart khareedi, smart choice', 'No down payment offer — limited period', 'Book test drive at your office/home'],
    price_sensitivity: 'medium',
    top_platforms: ['instagram', 'facebook', 'youtube'],
  },
  south_india: {
    states: ['Karnataka', 'Bangalore', 'Tamil Nadu', 'Chennai', 'Telangana', 'Hyderabad', 'Andhra Pradesh', 'Kerala'],
    tone: 'Trust-first, relationship-driven. Quality and reliability emphasized over price cuts. Local pride and family values central. Tech-forward in Bangalore/Hyderabad.',
    language_hint: 'Lead with reliability and brand trust. Use local references — "Bengaluru\'s #1 Dealer", "Chennai\'s Most Trusted". Family imagery resonates. No aggressive discounting.',
    local_ctas: ['Your trusted auto partner in [City]', 'Schedule test drive — delivered to your home', 'Join our 10,000+ happy family'],
    price_sensitivity: 'low',
    top_platforms: ['instagram', 'youtube', 'facebook'],
  },
  east_india: {
    states: ['West Bengal', 'Kolkata', 'Odisha', 'Bihar', 'Jharkhand', 'Assam', 'Northeast'],
    tone: 'Warm, relationship-focused. Community and festival culture strong. Bengali pride in content. Slower to trust — emphasize service and after-sales.',
    language_hint: 'Emotional storytelling works well. Durga Puja, Durgotsav, Poila Baisakh festivals are massive. Reference local landmarks. Hinglish with Bengali phrases.',
    local_ctas: ['Trusted by [City] families since [year]', 'Come visit us — chai pe charcha guarantee!', 'Special Pujo offer — book now'],
    price_sensitivity: 'high',
    top_platforms: ['facebook', 'whatsapp', 'instagram'],
  },
  central_india: {
    states: ['Madhya Pradesh', 'Bhopal', 'Indore', 'Chhattisgarh', 'Raipur'],
    tone: 'Growing market with strong aspirational drive. First-time car buyers prominent. Value + status messaging. Hindi dominant.',
    language_hint: 'First car ownership is a big deal — aspirational. Status and pride of ownership. Affordable EMI prominent. Hindi only or Hinglish.',
    local_ctas: ['Apni pehli car, apna sapna — aaj poora karo!', 'Sabse saste daam, sirf [City] mein', 'Free home delivery available in [City]'],
    price_sensitivity: 'high',
    top_platforms: ['facebook', 'whatsapp', 'instagram'],
  },
};

// ─── Brand voice profiles ─────────────────────────────────────────────────────
export const BRAND_PROFILES: Record<string, {
  voice: string;
  usp: string[];
  visual_style: string;
  hashtags: string[];
  avoid: string[];
}> = {
  'maruti suzuki': {
    voice: 'Family-friendly, trusted, value-for-money, "India ka sabse bharosa". Mass market + aspirational.',
    usp: ['Highest resale value', 'Lowest service cost', 'Pan-India service network', 'Swift / Brezza / Fronx top sellers'],
    visual_style: 'Bright, family scenes, suburbs, relatable everyday life.',
    hashtags: ['#MarutiSuzuki', '#Arena', '#Nexa', '#Swift', '#Brezza', '#Fronx', '#Jimny', '#WagonR', '#Alto', '#Baleno'],
    avoid: ['Luxury positioning', 'Complex finance jargon'],
  },
  'hyundai': {
    voice: 'Modern, stylish, tech-forward. "New Thinking, New Possibilities". Urban millennials.',
    usp: ['Connected car tech', 'Sunroof in budget segment', 'Strong resale', 'Creta dominance', 'i20 for urban youth'],
    visual_style: 'Sleek, urban, technology-forward, aspirational city life.',
    hashtags: ['#Hyundai', '#Creta', '#Venue', '#i20', '#Alcazar', '#Tucson', '#Ioniq', '#HyundaiIndia'],
    avoid: ['Rural positioning', 'Budget-only messaging'],
  },
  'tata': {
    voice: 'Proud Indian brand. Safety-first, electric future, bold design. "Akela nahi hai India". Nationalistic pride.',
    usp: ['5-star GNCAP safety', 'EV leadership (Nexon EV, Punch EV)', 'Bold design', 'Adventure-ready'],
    visual_style: 'Bold colors, adventurous outdoors, Indian pride, electric blue accents.',
    hashtags: ['#TataMotors', '#NexonEV', '#Punch', '#Tiago', '#Harrier', '#Safari', '#Curvv', '#SafetyFirst', '#MadeForIndia'],
    avoid: ['Fuel efficiency emphasis over safety', 'Comparing to Chinese brands'],
  },
  'mahindra': {
    voice: 'Rugged, aspirational, "Born in India". SUV king. Adventure + success. Corporate buyers. Scorpio Nation.',
    usp: ['True SUV capability', '4x4 off-road', 'Scorpio legacy', 'XUV franchise', 'Thar cult following'],
    visual_style: 'Off-road, adventure, hills, rugged terrain, dominant presence.',
    hashtags: ['#Mahindra', '#Scorpio', '#Thar', '#XUV700', '#XUV3XO', '#Bolero', '#ScorpioNation', '#TharCommunity'],
    avoid: ['City-only positioning', 'Fuel economy as primary USP'],
  },
  'honda': {
    voice: 'Precision engineering, joy of driving, "The Power of Dreams". Premium practical.',
    usp: ['Engine reliability', 'Premium cabin', 'Civic cult status', 'Elevate dominance in segment'],
    visual_style: 'Clean, precise, sophisticated, slightly international.',
    hashtags: ['#Honda', '#HondaIndia', '#Elevate', '#City', '#Amaze', '#WRV', '#HondaCars'],
    avoid: ['Budget positioning', 'Rural imagery'],
  },
  'toyota': {
    voice: 'Trust + reliability + longevity. "Let\'s Go Places". Taxi + premium family. Innova legacy.',
    usp: ['Resale king', 'Innova cult', 'Fortuner prestige', 'Hybrid leadership', 'Ultra-long reliability'],
    visual_style: 'Premium family, highways, dependable, aspirational middle-class.',
    hashtags: ['#Toyota', '#ToyotaIndia', '#Innova', '#Fortuner', '#Hilux', '#Urban Cruiser', '#ToyotaHybrid'],
    avoid: ['Budget comparisons', 'Price-first messaging'],
  },
  'kia': {
    voice: 'Young, bold, global Korean design in India. "Movement that Inspires". Urban trend-setter.',
    usp: ['Seltos segment creator', 'Sonet compact SUV', 'EV6 aspirational', 'Design-led brand'],
    visual_style: 'Young, urban, colorful, global-yet-Indian, bold lines.',
    hashtags: ['#Kia', '#KiaIndia', '#Seltos', '#Sonet', '#Carnival', '#EV6', '#KiaCars'],
    avoid: ['Heritage/legacy messaging', 'Rural markets primary'],
  },
  'mg': {
    voice: 'British heritage, tech-first, connected car pioneer. Premium disruption. Young urban professionals.',
    usp: ['First in tech features (panoramic sunroof, ADAS)', 'Connected car India pioneer', 'Hector space king', 'ZS EV accessibility'],
    visual_style: 'Premium, modern British, tech-forward, urban premium.',
    hashtags: ['#MGMotor', '#MGIndia', '#MGHector', '#MGZS', '#MGAstor', '#MGRX5', '#MGCyberster'],
    avoid: ['Mass market comparisons', 'Price-sensitive messaging'],
  },
  'skoda': {
    voice: 'Czech engineering, European premium, understated luxury. "Simply Clever". Discerning buyers.',
    usp: ['European build quality', 'Spacious interiors', 'Slavia segment leader', 'Kushaq design', 'TSI engine'],
    visual_style: 'Elegant, European, minimalist, premium-but-accessible.',
    hashtags: ['#Skoda', '#SkodaIndia', '#Kushaq', '#Slavia', '#Kodiaq', '#Octavia', '#SkodaLove'],
    avoid: ['Budget positioning', 'Aggressive discount messaging'],
  },
  'volkswagen': {
    voice: 'German engineering trust, precision, "Das Auto". Enthusiasts + premium practical.',
    usp: ['GTI performance heritage', 'Taigun fun drive', 'Virtus premium sedan', 'German safety'],
    visual_style: 'Clean German design, precision, blue and silver palette.',
    hashtags: ['#Volkswagen', '#VWIndia', '#Taigun', '#Virtus', '#GTI', '#VWTaigun'],
    avoid: ['Indian budget market comparisons', 'Rural positioning'],
  },
  'jeep': {
    voice: 'Go Anywhere, Do Anything. Adventure royalty. Premium SUV cult. Compass + Meridian.',
    usp: ['4x4 legend', 'Compass segment creator', 'Off-road heritage', 'American adventure brand'],
    visual_style: 'Mountains, off-road, wilderness, rugged premium.',
    hashtags: ['#Jeep', '#JeepIndia', '#Compass', '#Meridian', '#WranglerIndia', '#GoAnywhere'],
    avoid: ['City commuter positioning', 'Budget comparisons'],
  },
};

// ─── Post-type pattern library ────────────────────────────────────────────────
export type PostType = 'offer' | 'new_arrival' | 'delivery' | 'festival' | 'testimonial' | 'engagement' | 'service' | 'ev' | 'finance';

export const POST_TYPE_PATTERNS: Record<PostType, {
  hook_templates: string[];
  body_patterns: string[];
  cta_patterns: string[];
  emoji_sets: string[];
  hashtag_categories: string[];
}> = {
  offer: {
    hook_templates: [
      'Offer alert! 🚨',
      'LIMITED TIME: [discount/benefit]',
      'This [month] only — [benefit]',
      'Price drop just happened 👇',
      '[Festival] mein sabse bada offer!',
      'Don\'t miss this — ends [date]!',
    ],
    body_patterns: [
      'Discount + free accessory + exchange bonus combo',
      'Zero down payment + low EMI structure',
      'Corporate discount + referral bonus combo',
      'Year-end clearance with extended warranty',
      'Exchange old car for new at best value',
    ],
    cta_patterns: ['Call/WhatsApp for best price', 'Limited stock — book NOW', 'Visit showroom before [date]', 'Offer valid till stocks last'],
    emoji_sets: ['🚨💰🚗✅', '🎉🔥💥⚡', '🏷️💸🎁✨'],
    hashtag_categories: ['offer', 'brand', 'city', 'model'],
  },
  new_arrival: {
    hook_templates: [
      'IT\'S HERE! 🚀 [Model] has arrived at [Dealer]!',
      'New arrival alert! 🆕',
      'The wait is OVER — [Model] is now in stock!',
      'First in [City] — [Model] just landed! 🎊',
      'Introducing the all-new [Model] — book your test drive!',
    ],
    body_patterns: [
      'Feature highlights (top 3 unique selling points)',
      'Price reveal + EMI calculation',
      'Color options + variant breakdown',
      'Launch offer validity + booking amount',
    ],
    cta_patterns: ['Be among the first — book today!', 'Test drive available now', 'Limited launch units — enquire now'],
    emoji_sets: ['🚀🆕✨🎊', '🎉🌟🏆🔥', '⭐💥🎯🎁'],
    hashtag_categories: ['new_launch', 'brand', 'model', 'city'],
  },
  delivery: {
    hook_templates: [
      'Another happy family drives home! 🎊',
      'Delivering smiles, one car at a time 🚗❤️',
      'Congratulations [first name]! 🎉',
      'Welcome to the [Brand] family! 🏠',
      'Keys handed over — memories start now! 🔑',
    ],
    body_patterns: [
      'Customer name + model + warm congratulations',
      'Journey story (from test drive to delivery)',
      'Thank you for trusting us + invitation to others',
      'Photo of key handover ceremony',
    ],
    cta_patterns: ['Your delivery story next? WhatsApp us!', 'Book your dream car today', 'Join our happy family — enquire now'],
    emoji_sets: ['🎊❤️🔑🚗', '🎉🌟😊🏠', '✨🎁💐🎈'],
    hashtag_categories: ['delivery', 'testimonial', 'brand', 'city'],
  },
  festival: {
    hook_templates: [
      '[Festival] ki hardik shubhkamnayein! 🎊',
      'This [Festival], make your dream come true 🌟',
      '[Festival] Special Offer — limited period! 🎉',
      'Celebrating [Festival] with you and your family 💫',
      '[Festival] mein naya car, naya safar! 🚗',
    ],
    body_patterns: [
      'Festival greetings + exclusive offer combo',
      'Cultural reference + aspirational car ownership',
      'Family celebration imagery + car as family member',
      'Festival discount + extended warranty as gift',
    ],
    cta_patterns: ['Book before [Festival] for guaranteed delivery', 'Festival offer ends on [date]', 'WhatsApp for exclusive [Festival] deal'],
    emoji_sets: ['🎊🪔🌟✨', '🎉🎆🎇💫', '🙏❤️🎁🌸'],
    hashtag_categories: ['festival', 'brand', 'city', 'offer'],
  },
  testimonial: {
    hook_templates: [
      '"[Dealer] ne meri life badal di" — [Customer name]',
      '5 ⭐ from [Customer]! Thank you!',
      'What our customers say about us 💬',
      'Real review, real happiness ❤️',
      'Google Review of the week! 🏆',
    ],
    body_patterns: [
      'Quote from real customer + their city + model they bought',
      'Before/after: what they were looking for, what they got',
      'Service experience highlight',
      'Finance/EMI ease story',
    ],
    cta_patterns: ['Leave us a Google Review!', 'Your experience next — enquire now', 'Join 5,000+ happy customers'],
    emoji_sets: ['⭐❤️🙏😊', '🏆💬✅🌟', '🎊😍👏💯'],
    hashtag_categories: ['testimonial', 'review', 'brand', 'city'],
  },
  engagement: {
    hook_templates: [
      'Which would YOU choose? 🤔',
      'Comment below — [Option A] or [Option B]?',
      'Tag a friend who needs this! 👇',
      'Quiz time! 🧠 [Question about cars]',
      'Poll: Your next car colour? 🎨',
    ],
    body_patterns: [
      'This vs That comparison (two models/variants)',
      'Trivia about a car feature + answer in comments',
      'Caption this photo contest',
      '"Tell us in one word" prompt',
    ],
    cta_patterns: ['Comment below!', 'Tag a car lover!', 'Share with someone buying a car', 'Win a free service voucher!'],
    emoji_sets: ['🤔💭🗳️🎯', '💬👇🔥😂', '🏆🎁🎉💡'],
    hashtag_categories: ['engagement', 'fun', 'brand', 'city'],
  },
  service: {
    hook_templates: [
      'Free service camp this [date]! 🔧',
      'Your car deserves the best care 🚗💙',
      'Service reminder: Is your car due? 📅',
      'Monsoon check-up special! ☔',
      'Summer car care — free AC check today! ☀️',
    ],
    body_patterns: [
      'Service camp details (date, location, what\'s free)',
      'Preventive maintenance tips + CTA to book',
      'Service package offer (AMC discount)',
      'Express service lane — in/out in 2 hours',
    ],
    cta_patterns: ['Book service appointment now', 'Walk-in or call ahead', 'Online service booking available'],
    emoji_sets: ['🔧🚗🛠️✅', '💙⚙️🔩🏆', '☀️🌧️❄️🔑'],
    hashtag_categories: ['service', 'maintenance', 'brand', 'city'],
  },
  ev: {
    hook_templates: [
      'The future is electric. Ready? ⚡',
      'Go Green. Go Electric. Go [Brand] 🌿',
      'Zero fuel cost — [EV Model] is here! ⚡',
      'Charge at home. Save every day. 🔋',
      'India\'s EV revolution — join now! 🇮🇳⚡',
    ],
    body_patterns: [
      'Range + charging time comparison with petrol cost',
      'Monthly savings calculation (EMI vs fuel savings)',
      'Home charger setup + government subsidy info',
      'Real-world testimonial from EV owner',
    ],
    cta_patterns: ['Book EV test drive — experience the silence', 'Calculate your fuel savings now', 'FAME-II subsidy — limited time'],
    emoji_sets: ['⚡🌿🔋🌍', '🔌💚🚀🏆', '🇮🇳⭐♻️💡'],
    hashtag_categories: ['ev', 'electric', 'green', 'brand', 'city'],
  },
  finance: {
    hook_templates: [
      'EMI starting at just ₹[X]/month! 💰',
      'Zero down payment — drive home TODAY! 🚗',
      'Bank offer: lowest interest rate of 2024! 📉',
      'Your salary, your EMI — we make it work! 💼',
      'Instant loan approval in 30 minutes! ⚡',
    ],
    body_patterns: [
      'EMI calculation example for specific model',
      'Bank partner list + lowest rate comparison',
      'Special offer for salaried professionals',
      'Exchange + finance combo deal',
    ],
    cta_patterns: ['Check your EMI eligibility — free!', 'Visit for instant loan approval', 'WhatsApp loan application link'],
    emoji_sets: ['💰📉✅🏦', '💳🤝💎📊', '🎯💸🔑🚗'],
    hashtag_categories: ['finance', 'emi', 'car_loan', 'brand', 'city'],
  },
};

// ─── Indian festival calendar (key auto-sales festivals) ──────────────────────
export const FESTIVAL_CALENDAR = [
  { name: 'Navratri',       months: [9, 10],  region: 'all',          impact: 'very_high' },
  { name: 'Dussehra',       months: [10],     region: 'all',          impact: 'very_high' },
  { name: 'Diwali',         months: [10, 11], region: 'all',          impact: 'very_high' },
  { name: 'Dhanteras',      months: [10, 11], region: 'all',          impact: 'very_high' },
  { name: 'Bhai Dooj',      months: [11],     region: 'north_india',  impact: 'medium' },
  { name: 'Makar Sankranti',months: [1],      region: 'west_india',   impact: 'high' },
  { name: 'Pongal',         months: [1],      region: 'south_india',  impact: 'high' },
  { name: 'Republic Day',   months: [1],      region: 'all',          impact: 'medium' },
  { name: 'Valentine\'s Day',months: [2],     region: 'all',          impact: 'medium' },
  { name: 'Holi',           months: [3],      region: 'north_india',  impact: 'high' },
  { name: 'Gudi Padwa',     months: [3, 4],   region: 'west_india',   impact: 'very_high' },
  { name: 'Ugadi',          months: [3, 4],   region: 'south_india',  impact: 'very_high' },
  { name: 'Tamil New Year', months: [4],      region: 'south_india',  impact: 'high' },
  { name: 'Akshaya Tritiya',months: [4, 5],   region: 'all',          impact: 'very_high' },
  { name: 'Eid',            months: [3,4,5],  region: 'all',          impact: 'high' },
  { name: 'Durga Puja',     months: [10],     region: 'east_india',   impact: 'very_high' },
  { name: 'Onam',           months: [8, 9],   region: 'south_india',  impact: 'very_high' },
  { name: 'Ganesh Chaturthi',months: [8, 9],  region: 'west_india',   impact: 'very_high' },
  { name: 'Independence Day',months: [8],     region: 'all',          impact: 'medium' },
  { name: 'Year End',       months: [12, 1],  region: 'all',          impact: 'very_high' },
  { name: 'Financial Year End',months: [3],   region: 'all',          impact: 'very_high' },
];

// ─── Hashtag library ──────────────────────────────────────────────────────────
export const HASHTAG_LIBRARY: Record<string, string[]> = {
  // Generic auto dealer
  dealer: ['#CarDealer', '#AutoDealer', '#CarDealership', '#CarSales', '#NewCar', '#UsedCars', '#CarBuying'],
  offer: ['#CarOffer', '#CarDeal', '#SpecialOffer', '#LimitedOffer', '#FestiveOffer', '#ExchangeOffer', '#CarDiscount'],
  delivery: ['#CarDelivery', '#HappyCustomer', '#NewCarDelivery', '#CarHandover', '#DreamCar', '#FirstCar'],
  testimonial: ['#CustomerReview', '#HappyCustomer', '#5StarReview', '#GoogleReview', '#CustomerLove', '#Testimonial'],
  ev: ['#ElectricCar', '#EVIndia', '#ElectricVehicle', '#GoGreen', '#ZeroEmission', '#EV', '#FAME2', '#GreenMobility'],
  service: ['#CarService', '#ServiceCamp', '#CarMaintenance', '#FreeCheckup', '#AutoService'],
  finance: ['#CarLoan', '#AutoFinance', '#ZeroDownPayment', '#EMI', '#CarEMI', '#AutoLoan'],
  engagement: ['#CarLovers', '#CarEnthusiast', '#CarCommunity', '#AutoGeek', '#CarPhotography'],
  new_launch: ['#NewLaunch', '#NewCar2024', '#CarLaunch', '#JustLaunched', '#FirstInIndia'],

  // Cities
  delhi: ['#Delhi', '#DelhiNCR', '#DelhiCars', '#NCRDealer'],
  mumbai: ['#Mumbai', '#MumbaiCars', '#MumbaiDealer', '#Navi Mumbai'],
  bangalore: ['#Bangalore', '#Bengaluru', '#BangaloreCars', '#NammaBengaluru'],
  chennai: ['#Chennai', '#ChennaiCars', '#NammaChennai', '#ChennaiDealer'],
  hyderabad: ['#Hyderabad', '#HyderabadCars', '#NammaHyderabad', '#CyberbadDealer'],
  pune: ['#Pune', '#PuneCars', '#PuneDealer', '#AmchiPune'],
  kolkata: ['#Kolkata', '#KolkataCars', '#KolkataDealer', '#CityOfJoy'],
  ahmedabad: ['#Ahmedabad', '#AhmedabadCars', '#AMCCars'],
  jaipur: ['#Jaipur', '#JaipurCars', '#PinkCityDealer'],

  // Models (top sellers)
  swift: ['#MarutiSwift', '#NewSwift', '#Swift2024', '#SwiftNation'],
  brezza: ['#Brezza', '#MarutiBrezza', '#BrezzaPrice'],
  creta: ['#Creta', '#HyundaiCreta', '#CretaN'],
  nexon: ['#TataNexon', '#NexonEV', '#Nexon'],
  scorpio: ['#Scorpio', '#ScorpioN', '#ScorpioNation'],
  thar: ['#Thar', '#TharCommunity', '#MahindraRocky'],
  seltos: ['#Seltos', '#KiaSeltos', '#KiaSales'],
};

// ─── Caption structure patterns from top Indian dealers ───────────────────────
export const PROVEN_STRUCTURES = [
  // Structure 1: Hook → Benefit → Social proof → CTA
  {
    name: 'Trust Builder',
    template: '[STRONG HOOK]\n\n[2-3 benefits as bullet points]\n\n[Social proof: X happy customers / years in business]\n\n[DIRECT CTA with phone/WhatsApp]',
    best_for: ['testimonial', 'service', 'new_arrival'],
    platforms: ['facebook', 'gmb'],
  },
  // Structure 2: Urgency → Offer → Scarcity → CTA
  {
    name: 'Urgency Seller',
    template: '⚡ [OFFER HEADLINE]\n\n[What you get: deal + free add-ons]\n\n⏰ Only [X] units / Valid till [date]\n\n📞 Call or WhatsApp NOW: [phone]',
    best_for: ['offer', 'finance', 'festival'],
    platforms: ['instagram', 'facebook', 'whatsapp'],
  },
  // Structure 3: Story → Emotion → Aspiration → CTA
  {
    name: 'Emotional Story',
    template: '[RELATABLE OPENING — a family moment, a dream, a milestone]\n\n[How the car fits into that story]\n\n[Your dealership\'s promise]\n\n[SOFT CTA — invite to experience, not pressure to buy]',
    best_for: ['delivery', 'new_arrival', 'engagement'],
    platforms: ['instagram', 'facebook'],
  },
  // Structure 4: Question → Answer → Proof → CTA
  {
    name: 'Problem Solver',
    template: '[QUESTION the customer is asking themselves]\n\n[Answer: how this car/offer solves it]\n\n[Why us: our service promise]\n\n[CTA]',
    best_for: ['ev', 'finance', 'engagement'],
    platforms: ['facebook', 'gmb'],
  },
];

// ─── Helper: get region from city/state ───────────────────────────────────────
export function detectRegion(city: string): string {
  const normalized = city.toLowerCase();
  for (const [key, region] of Object.entries(REGIONS)) {
    if (region.states.some((s) => normalized.includes(s.toLowerCase()))) {
      return key;
    }
  }
  return 'north_india'; // default
}

// ─── Helper: get brand profile (fuzzy match) ──────────────────────────────────
export function getBrandProfile(brandName: string) {
  const normalized = brandName.toLowerCase();
  for (const [key, profile] of Object.entries(BRAND_PROFILES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return { key, ...profile };
    }
  }
  return null;
}

// ─── Helper: build enriched system prompt ────────────────────────────────────
export function buildEnrichedSystemPrompt(
  city: string,
  brands: string[],
  postType?: string,
  languageMode: 'en' | 'hi' | 'hinglish' | 'bilingual' = 'en',
): string {
  const includeHindi = languageMode === 'bilingual';
  const regionKey = detectRegion(city);
  const region = REGIONS[regionKey];
  const brandProfiles = brands
    .map((b) => getBrandProfile(b))
    .filter(Boolean);

  const brandBlock = brandProfiles.length > 0
    ? brandProfiles.map((b) => `- ${b!.key.toUpperCase()}: ${b!.voice}\n  USPs: ${b!.usp.join(', ')}`).join('\n')
    : '';

  const postPattern = postType && POST_TYPE_PATTERNS[postType as PostType]
    ? POST_TYPE_PATTERNS[postType as PostType]
    : null;

  let languageInstruction = 'All captions must be written in fluent Indian English, incorporating local English idioms if relevant.';
  if (languageMode === 'hi') {
    languageInstruction = 'All captions must be written in pure Devanagari script (Hindi - हिंदी) only. Do not use Roman script except for technical words or models if necessary. Ensure correct grammar and natural Indian automobile dealer tone.';
  } else if (languageMode === 'hinglish') {
    languageInstruction = 'All captions must be written in Hinglish (Hindi words written in the Roman/Latin script - e.g., "Nayi car lene ka soch rahe hain? Aaj hi humare showroom visit karein aur test drive lein!"). Use colloquial, trendy, and conversational Hinglish.';
  } else if (languageMode === 'bilingual') {
    languageInstruction = 'All captions must be written in a bilingual format: provide a section in fluent English followed by a corresponding section in Hindi (Devanagari script), separated by a line break.';
  }

  return `You are a social media marketing expert specialising in Indian automobile dealerships.

═════ REGIONAL INTELLIGENCE ═════
Region: ${regionKey.replace(/_/g, ' ').toUpperCase()} | City: ${city}
Tone directive: ${region?.tone ?? ''}
Language: ${region?.language_hint ?? ''}
Price sensitivity: ${region?.price_sensitivity ?? 'medium'}

${brandBlock ? `═══ BRAND VOICE ═══\n${brandBlock}\n` : ''}
${postPattern ? `═══ POST TYPE: ${postType?.toUpperCase()} ═══
Proven hooks: ${postPattern.hook_templates.slice(0, 3).join(' | ')}
Proven CTAs: ${postPattern.cta_patterns.join(' | ')}
` : ''}
═══ LANGUAGE DIRECTION ═══
${languageInstruction}

═══ MANDATORY RULES ═══
1. NEVER invent prices, specifications, or discount amounts not provided.
2. NEVER use generic Indian greetings — be specific to ${city} and the brand.
3. ALWAYS include a clear CTA: call, WhatsApp, or visit showroom.
4. Use regional phrases only where natural — not forced.
5. Punchy variant: < 60 words. Detailed: 100-150 words. Emotional: 70-100 words.
6. Each variant must open with a DIFFERENT first line — no repetition.
7. Hashtags must include city + brand + model (if known) + post type.${includeHindi ? '\n8. Include "hindi_variants": array of 3 strings — Hindi translation of each variant. Pure Hindi script (Devanagari), no transliteration.' : ''}

OUTPUT: Valid JSON only, no markdown fences.
{
  "variants": [
    { "caption_text": "...", "hashtags": ["#tag"], "suggested_emoji": ["🚗"], "platform_notes": "Best for Instagram Stories", "style": "punchy" },
    { "caption_text": "...", "hashtags": ["#tag"], "suggested_emoji": ["✨"], "platform_notes": "Best for Facebook", "style": "detailed" },
    { "caption_text": "...", "hashtags": ["#tag"], "suggested_emoji": ["❤️"], "platform_notes": "Best for Instagram Feed", "style": "emotional" }
  ]${includeHindi ? ',\n  "hindi_variants": ["<variant 1 in Hindi>", "<variant 2 in Hindi>", "<variant 3 in Hindi>"]' : ''}
}`;
}
