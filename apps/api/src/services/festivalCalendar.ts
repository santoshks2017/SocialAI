export interface Festival {
  id: string;
  name: string;
  regions: string[]; // State names, or ["Nationwide"]
  description: string;
  marketingIdea: string;
  dates: {
    [year: string]: string; // "YYYY-MM-DD"
  };
}

export const FESTIVALS: Festival[] = [
  {
    id: 'diwali',
    name: 'Diwali (Deepavali)',
    regions: ['Nationwide'],
    description: 'The festival of lights, celebrating the victory of light over darkness.',
    marketingIdea: 'Offer "Diwali Dhamaka" discounts, exchange bonuses, and special financing schemes for new cars.',
    dates: { '2026': '2026-11-08', '2027': '2027-10-29' },
  },
  {
    id: 'holi',
    name: 'Holi',
    regions: ['Nationwide'],
    description: 'The festival of colors, celebrating the arrival of spring and victory of good over evil.',
    marketingIdea: 'Launch a "Colors of Joy" campaign, offering color-protection paint sealant coatings and detail packages.',
    dates: { '2026': '2026-03-03', '2027': '2027-03-22' },
  },
  {
    id: 'dussehra',
    name: 'Dussehra (Vijayadashami)',
    regions: ['Nationwide'],
    description: 'Celebrating the victory of Lord Rama over Ravana, symbolizing victory of good over evil.',
    marketingIdea: 'Promote "Shubh Muhurat" delivery schedules for Dussehra booking, with guaranteed delivery options.',
    dates: { '2026': '2026-10-20', '2027': '2027-10-09' },
  },
  {
    id: 'ganesh_chaturthi',
    name: 'Ganesh Chaturthi',
    regions: ['Maharashtra', 'Karnataka', 'Andhra Pradesh', 'Telangana'],
    description: 'Honoring the birth of Lord Ganesha, the remover of obstacles.',
    marketingIdea: 'Showcase eco-friendly decoration ideas in showroom, offer "Bappa Special" delivery hampers.',
    dates: { '2026': '2026-09-15', '2027': '2027-09-04' },
  },
  {
    id: 'durga_puja',
    name: 'Durga Puja',
    regions: ['West Bengal', 'Odisha', 'Assam', 'Tripura', 'Bihar'],
    description: 'Celebrating the victory of Goddess Durga over the buffalo demon Mahishasura.',
    marketingIdea: 'Run a "Pujo Ride" safety checkup camp and customized regional accessory packs.',
    dates: { '2026': '2026-10-15', '2027': '2027-10-05' },
  },
  {
    id: 'pongal',
    name: 'Pongal',
    regions: ['Tamil Nadu', 'Puducherry'],
    description: 'Harvest festival celebrated by Tamilians to thank the Sun God.',
    marketingIdea: 'Offer "Pongal Special" rural exchange schemes and custom accessories for SUV buyers.',
    dates: { '2026': '2026-01-14', '2027': '2027-01-15' },
  },
  {
    id: 'onam',
    name: 'Onam',
    regions: ['Kerala'],
    description: 'Annual harvest festival of Kerala, commemorating King Mahabali.',
    marketingIdea: 'Provide "Onam Sadya" test drive campaigns and special gold coin offers on delivery.',
    dates: { '2026': '2026-08-27', '2027': '2027-09-14' },
  },
  {
    id: 'baisakhi',
    name: 'Baisakhi',
    regions: ['Punjab', 'Haryana'],
    description: 'Sikh New Year and harvest festival of Punjab.',
    marketingIdea: 'Target agricultural buyers with special crop-cycle based financing plans and tractor trade-ins.',
    dates: { '2026': '2026-04-14', '2027': '2027-04-14' },
  },
  {
    id: 'makar_sankranti',
    name: 'Makar Sankranti',
    regions: ['Gujarat', 'Maharashtra', 'Rajasthan', 'Karnataka', 'Andhra Pradesh', 'Telangana'],
    description: 'Harvest festival dedicated to the Sun God, marked by kite flying in Rajasthan and Gujarat.',
    marketingIdea: 'Promote "Uttarayan / Sankranti Special" paint protection options and kite-flying showroom events.',
    dates: { '2026': '2026-01-14', '2027': '2027-01-15' },
  },
  {
    id: 'eid_ul_fitr',
    name: 'Eid ul-Fitr',
    regions: ['Nationwide'],
    description: 'Festival breaking the fast, marking the end of Ramadan.',
    marketingIdea: 'Celebrate with "Eid Mubarak" customized car perfume cards and family segment finance deals.',
    dates: { '2026': '2026-03-20', '2027': '2027-03-10' },
  },
  {
    id: 'eid_al_adha',
    name: 'Eid al-Adha',
    regions: ['Nationwide'],
    description: 'The Feast of the Sacrifice, honoring the willingness of Ibrahim to sacrifice his son.',
    marketingIdea: 'Highlight large boot space and 7-seater vehicles for Eid family travels and get-togethers.',
    dates: { '2026': '2026-05-27', '2027': '2027-05-17' },
  },
  {
    id: 'raksha_bandhan',
    name: 'Raksha Bandhan',
    regions: ['Nationwide'],
    description: 'Celebrating the bond and safety between brothers and sisters.',
    marketingIdea: 'Promote "Gift Her Safety" campaign featuring cars with high safety ratings (GNCAP 5 Star).',
    dates: { '2026': '2026-08-28', '2027': '2027-08-17' },
  },
  {
    id: 'janmashtami',
    name: 'Krishna Janmashtami',
    regions: ['Nationwide'],
    description: 'Celebrating the birth of Lord Krishna.',
    marketingIdea: 'Organize "Dahi Handi" themed showroom visits and fun social media contest with free services.',
    dates: { '2026': '2026-09-04', '2027': '2027-08-25' },
  },
  {
    id: 'chhath_puja',
    name: 'Chhath Puja',
    regions: ['Bihar', 'Jharkhand', 'Uttar Pradesh'],
    description: 'Sun worship festival celebrated with ancient Vedic rituals.',
    marketingIdea: 'Provide free highway road-side assistance packages for dealers in Bihar/UP during Chhath homecoming.',
    dates: { '2026': '2026-11-15', '2027': '2027-11-04' },
  },
  {
    id: 'gudi_padwa',
    name: 'Gudi Padwa',
    regions: ['Maharashtra'],
    description: 'Marathi New Year, celebrating harvest and new beginnings.',
    marketingIdea: 'Promote special Gudi Padwa booking benefits and decorative door garlands for new cars.',
    dates: { '2026': '2026-03-19', '2027': '2027-04-07' },
  },
  {
    id: 'ugadi',
    name: 'Ugadi',
    regions: ['Andhra Pradesh', 'Telangana', 'Karnataka'],
    description: 'New Year festival for people of Deccan region.',
    marketingIdea: 'Introduce custom Ugadi bumper-to-bumper assurance schemes and sweet gifting on delivery.',
    dates: { '2026': '2026-03-19', '2027': '2027-04-07' },
  },
  {
    id: 'karwa_chauth',
    name: 'Karwa Chauth',
    regions: ['Delhi', 'Punjab', 'Haryana', 'Uttar Pradesh', 'Rajasthan'],
    description: 'Wives fasting for the longevity and safety of their husbands.',
    marketingIdea: 'Focus marketing on luxury car models or premium upgrades as a premium surprise gift.',
    dates: { '2026': '2026-10-28', '2027': '2027-10-18' },
  },
  {
    id: 'christmas',
    name: 'Christmas',
    regions: ['Nationwide'],
    description: 'Annual commemoration of the birth of Jesus Christ.',
    marketingIdea: 'Run "Year End Santa Offers", offering massive stock clearances and free insurance options.',
    dates: { '2026': '2026-12-25', '2027': '2027-12-25' },
  },
  {
    id: 'independence_day',
    name: 'Independence Day',
    regions: ['Nationwide'],
    description: 'India\'s Independence Day celebrating freedom (August 15).',
    marketingIdea: 'Run "Freedom Drive" service camps with 15% discount on labor and spare parts.',
    dates: { '2026': '2026-08-15', '2027': '2027-08-15' },
  },
  {
    id: 'republic_day',
    name: 'Republic Day',
    regions: ['Nationwide'],
    description: 'Celebrating the day the Constitution of India came into effect.',
    marketingIdea: 'Advertise "Republic Day Parade of Offers" featuring custom high-spec variants at special prices.',
    dates: { '2026': '2026-01-26', '2027': '2027-01-26' },
  },
  {
    id: 'maha_shivratri',
    name: 'Maha Shivratri',
    regions: ['Nationwide'],
    description: 'The Great Night of Shiva, celebrating overcoming darkness and ignorance.',
    marketingIdea: 'Promote silent/EV electric vehicle test drives (peaceful/noiseless driving).',
    dates: { '2026': '2026-02-15', '2027': '2027-03-06' },
  },
];

// Helper mapping common cities to states to ease regional filters
const CITY_TO_STATE: Record<string, string> = {
  mumbai: 'Maharashtra',
  pune: 'Maharashtra',
  nagpur: 'Maharashtra',
  thane: 'Maharashtra',
  kolkata: 'West Bengal',
  howrah: 'West Bengal',
  chennai: 'Tamil Nadu',
  coimbatore: 'Tamil Nadu',
  madurai: 'Tamil Nadu',
  bengaluru: 'Karnataka',
  bangalore: 'Karnataka',
  mysore: 'Karnataka',
  kochi: 'Kerala',
  cochin: 'Kerala',
  trivandrum: 'Kerala',
  thiruvananthapuram: 'Kerala',
  hyderabad: 'Telangana',
  secunderabad: 'Telangana',
  vijayawada: 'Andhra Pradesh',
  visakhapatnam: 'Andhra Pradesh',
  patna: 'Bihar',
  gaya: 'Bihar',
  ranchi: 'Jharkhand',
  jamshedpur: 'Jharkhand',
  lucknow: 'Uttar Pradesh',
  kanpur: 'Uttar Pradesh',
  noida: 'Uttar Pradesh',
  ghaziabad: 'Uttar Pradesh',
  amritsar: 'Punjab',
  ludhiana: 'Punjab',
  jalandhar: 'Punjab',
  gurugram: 'Haryana',
  gurgaon: 'Haryana',
  faridabad: 'Haryana',
  jaipur: 'Rajasthan',
  jodhpur: 'Rajasthan',
  udaipur: 'Rajasthan',
  ahmedabad: 'Gujarat',
  surat: 'Gujarat',
  vadodara: 'Gujarat',
  delhi: 'Delhi',
  new_delhi: 'Delhi',
};

export function getUpcomingFestivals(
  city?: string | null,
  state?: string | null,
  limit: number = 5
) {
  const now = new Date();
  
  // Resolve target state
  let resolvedState = state ? state.trim() : null;
  if (!resolvedState && city) {
    const cleanCity = city.trim().toLowerCase().replace(/\s+/g, '_');
    resolvedState = CITY_TO_STATE[cleanCity] || null;
  }

  const upcomingList: Array<{
    id: string;
    name: string;
    name_en: string;
    date: Date;
    daysRemaining: number;
    description: string;
    marketingIdea: string;
    isRegional: boolean;
    category: string | null;
  }> = [];

  for (const fest of FESTIVALS) {
    // Determine the year to check (check both current year and next year just in case)
    const currentYear = now.getFullYear().toString();
    const nextYear = (now.getFullYear() + 1).toString();

    const dateStr = fest.dates[currentYear] || fest.dates[nextYear];
    if (!dateStr) continue;

    let festDate = new Date(dateStr);
    
    // If current year's date has passed, try next year
    if (festDate < now && fest.dates[nextYear]) {
      festDate = new Date(fest.dates[nextYear]);
    }

    if (festDate >= now) {
      // Calculate days remaining
      const timeDiff = festDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(timeDiff / (1000 * 3600 * 24));

      // Regional filtering: matches if nationwide, or if states list matches the dealer's resolved state
      const isNationwide = fest.regions.includes('Nationwide');
      const matchesRegion = isNationwide || (resolvedState && fest.regions.some(r => r.toLowerCase() === resolvedState!.toLowerCase()));

      if (matchesRegion) {
        upcomingList.push({
          id: fest.id,
          name: fest.name,
          name_en: fest.name,
          date: festDate,
          daysRemaining,
          description: fest.description,
          marketingIdea: fest.marketingIdea,
          isRegional: !isNationwide,
          category: 'Festival',
        });
      }
    }
  }

  // Sort by date ascending (closest first)
  upcomingList.sort((a, b) => a.date.getTime() - b.date.getTime());

  return upcomingList.slice(0, limit);
}
