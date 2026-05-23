import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';

interface AnalyticsQuery {
  range?: string;
  platform?: string;
  sortBy?: string;
}

export default async function analyticsRoutes(fastify: FastifyInstance) {
  // GET /v1/analytics/overview
  fastify.get('/overview', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string }).dealer_id;
    const { range = '30d' } = request.query as AnalyticsQuery;

    // Calculate dates
    const now = new Date();
    let days = 30;
    if (range === '7d') days = 7;
    if (range === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(now.getDate() - days);

    // Fetch real data from DB
    const [posts, leads, messages, boosts] = await Promise.all([
      prisma.post.findMany({
        where: {
          dealer_id,
          status: 'published',
          published_at: { gte: startDate },
        },
      }),
      prisma.lead.findMany({
        where: {
          dealer_id,
          created_at: { gte: startDate },
        },
      }),
      prisma.inboxMessage.findMany({
        where: {
          dealer_id,
          message_type: { in: ['comment', 'review'] },
          received_at: { gte: startDate },
        },
      }),
      prisma.boostCampaign.findMany({
        where: {
          dealer_id,
          start_date: { gte: startDate },
        },
      }),
    ]);

    // Check if we need to return mock data (empty DB fallback for local development/first-use experience)
    const useMockFallback = posts.length < 2;

    if (useMockFallback) {
      return getMockOverviewData(days);
    }

    // Process real metrics
    let totalReach = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalSharesSaves = 0;
    let totalClicks = 0;
    let totalViews = 0;

    // Platform distributions
    const platformStats: {
      facebook: { reach: number; engagement: number; leads: number };
      instagram: { reach: number; engagement: number; leads: number };
      gmb: { reach: number; engagement: number; leads: number };
      twitter: { reach: number; engagement: number; leads: number };
      youtube: { reach: number; engagement: number; leads: number };
      [key: string]: { reach: number; engagement: number; leads: number } | undefined;
    } = {
      facebook: { reach: 0, engagement: 0, leads: 0 },
      instagram: { reach: 0, engagement: 0, leads: 0 },
      gmb: { reach: 0, engagement: 0, leads: 0 },
      twitter: { reach: 0, engagement: 0, leads: 0 },
      youtube: { reach: 0, engagement: 0, leads: 0 },
    };

    posts.forEach((post) => {
      const m = post.metrics as any;
      if (!m) return;

      // Facebook
      if (m.facebook) {
        const r = m.facebook.reach ?? 0;
        const l = m.facebook.likes ?? 0;
        const c = m.facebook.comments ?? 0;
        const s = m.facebook.shares ?? 0;
        totalReach += r;
        totalLikes += l;
        totalComments += c;
        totalSharesSaves += s;

        platformStats.facebook.reach += r;
        platformStats.facebook.engagement += (l + c + s);
      }

      // Instagram
      if (m.instagram) {
        const r = m.instagram.reach ?? 0;
        const l = m.instagram.likes ?? 0;
        const c = m.instagram.comments ?? 0;
        const s = m.instagram.saved ?? 0;
        totalReach += r;
        totalLikes += l;
        totalComments += c;
        totalSharesSaves += s;

        platformStats.instagram.reach += r;
        platformStats.instagram.engagement += (l + c + s);
      }

      // GMB
      if (m.gmb) {
        const v = m.gmb.views ?? 0;
        const c = m.gmb.clicks ?? 0;
        const d = m.gmb.direction_requests ?? 0;
        totalViews += v;
        totalClicks += c;

        platformStats.gmb.reach += v;
        platformStats.gmb.engagement += (c + d);
      }

      // Twitter/X
      if (m.twitter) {
        const imp = m.twitter.impressions ?? 0;
        const l = m.twitter.likes ?? 0;
        const rt = m.twitter.retweets ?? 0;
        const rep = m.twitter.replies ?? 0;
        totalReach += imp;
        totalLikes += l;
        totalComments += rep;
        totalSharesSaves += rt;

        platformStats.twitter.reach += imp;
        platformStats.twitter.engagement += (l + rt + rep);
      }

      // YouTube
      if (m.youtube) {
        const v = m.youtube.views ?? 0;
        const l = m.youtube.likes ?? 0;
        const c = m.youtube.comments ?? 0;
        const s = m.youtube.shares ?? 0;
        totalReach += v;
        totalLikes += l;
        totalComments += c;
        totalSharesSaves += s;

        platformStats.youtube.reach += v;
        platformStats.youtube.engagement += (l + c + s);
      }
    });

    // Populate leads by platform
    leads.forEach((lead) => {
      const platform = lead.source_platform?.toLowerCase();
      if (platform) {
        const stats = platformStats[platform];
        if (stats) {
          stats.leads += 1;
        }
      }
    });

    const totalEngagement = totalLikes + totalComments + totalSharesSaves + totalClicks;
    const engagementRate = totalReach > 0 ? Number(((totalEngagement / totalReach) * 100).toFixed(2)) : 0;

    // Total spend
    const totalSpent = boosts.reduce((sum, b) => sum + b.total_spent, 0);
    const costPerLead = leads.length > 0 ? Math.round(totalSpent / leads.length) : 0;

    // Comment Sentiment Breakdown
    let positive = 0;
    let neutral = 0;
    let negative = 0;

    messages.forEach((msg) => {
      if (msg.sentiment === 'positive') positive++;
      else if (msg.sentiment === 'negative') negative++;
      else neutral++;
    });

    const totalSentiment = positive + neutral + negative;

    // Response rate & time
    const repliedMessages = messages.filter((m) => m.reply_text !== null);
    const responseRate = messages.length > 0 ? Math.round((repliedMessages.length / messages.length) * 100) : 0;

    let totalResponseTimeMinutes = 0;
    let timedCount = 0;
    repliedMessages.forEach((m) => {
      if (m.replied_at && m.received_at) {
        const diffMs = m.replied_at.getTime() - m.received_at.getTime();
        totalResponseTimeMinutes += Math.round(diffMs / (60 * 1000));
        timedCount++;
      }
    });
    const avgResponseTimeMinutes = timedCount > 0 ? Math.round(totalResponseTimeMinutes / timedCount) : 0;

    // Generate timeseries data
    const timeseries: Array<{ date: string; reach: number; leads: number }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

      // Find reach and leads for this specific day
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

      const dayLeads = leads.filter((l) => l.created_at >= dayStart && l.created_at <= dayEnd).length;
      
      // Reach daily estimate: sum page insights or estimate from post published dates
      const dayPosts = posts.filter((p) => p.published_at && p.published_at >= dayStart && p.published_at <= dayEnd);
      let dayReach = 0;
      dayPosts.forEach((post) => {
        const m = post.metrics as any;
        if (m?.facebook?.reach) dayReach += m.facebook.reach;
        if (m?.instagram?.reach) dayReach += m.instagram.reach;
        if (m?.gmb?.views) dayReach += m.gmb.views;
      });

      timeseries.push({
        date: dateStr,
        reach: dayReach || Math.round(totalReach / days * 0.4), // approximate background reach if no specific post published
        leads: dayLeads,
      });
    }

    return {
      success: true,
      useMockData: false,
      summary: {
        totalReach: totalReach || totalViews,
        totalLikes,
        totalComments,
        totalShares: totalSharesSaves,
        totalEngagement,
        engagementRate,
        totalLeads: leads.length,
        totalSpent,
        costPerLead,
      },
      platforms: platformStats,
      sentiment: {
        total: totalSentiment,
        positive,
        neutral,
        negative,
      },
      responses: {
        responseRate,
        avgResponseTimeMinutes,
      },
      timeseries,
    };
  });

  // GET /v1/analytics/posts
  fastify.get('/posts', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string }).dealer_id;
    const { range = '30d', platform = 'all', sortBy = 'date' } = request.query as AnalyticsQuery;

    const now = new Date();
    let days = 30;
    if (range === '7d') days = 7;
    if (range === '90d') days = 90;

    const startDate = new Date();
    startDate.setDate(now.getDate() - days);

    // Query published posts
    const posts = await prisma.post.findMany({
      where: {
        dealer_id,
        status: 'published',
        published_at: { gte: startDate },
      },
      orderBy: { published_at: 'desc' },
    });

    const useMockFallback = posts.length < 2;

    if (useMockFallback) {
      return {
        success: true,
        useMockData: true,
        data: getMockPostsData(days),
      };
    }

    // Format post list
    let formattedPosts = posts.map((post) => {
      const m = post.metrics as any;
      
      // Calculate aggregate values
      let reach = 0;
      let likes = 0;
      let comments = 0;
      let clicks = 0;

      if (m?.facebook) {
        reach += m.facebook.reach ?? 0;
        likes += m.facebook.likes ?? 0;
        comments += m.facebook.comments ?? 0;
      }
      if (m?.instagram) {
        reach += m.instagram.reach ?? 0;
        likes += m.instagram.likes ?? 0;
        comments += m.instagram.comments ?? 0;
      }
      if (m?.gmb) {
        reach += m.gmb.views ?? 0;
        clicks += m.gmb.clicks ?? 0;
      }
      if (m?.twitter) {
        reach += m.twitter.impressions ?? 0;
        likes += m.twitter.likes ?? 0;
        comments += m.twitter.replies ?? 0;
      }
      if (m?.youtube) {
        reach += m.youtube.views ?? 0;
        likes += m.youtube.likes ?? 0;
        comments += m.youtube.comments ?? 0;
      }

      return {
        id: post.id,
        prompt_text: post.prompt_text,
        caption_text: post.caption_text,
        creative_urls: post.creative_urls,
        platforms: post.platforms,
        published_at: post.published_at,
        reach,
        likes,
        comments,
        clicks,
        details: m ?? {},
      };
    });

    // Filter by platform if needed
    if (platform !== 'all') {
      formattedPosts = formattedPosts.filter((p) => p.platforms.includes(platform));
    }

    // Sort posts
    if (sortBy === 'reach') {
      formattedPosts.sort((a, b) => b.reach - a.reach);
    } else if (sortBy === 'likes') {
      formattedPosts.sort((a, b) => b.likes - a.likes);
    } else if (sortBy === 'comments') {
      formattedPosts.sort((a, b) => b.comments - a.comments);
    } else {
      // default: date desc
      formattedPosts.sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
    }

    return {
      success: true,
      useMockData: false,
      data: formattedPosts,
    };
  });
}

// ─── MOCK DATA GENERATORS FOR Auto Dealer demo experience ────────────────────

function getMockOverviewData(days: number) {
  const is90d = days === 90;
  const is7d = days === 7;

  // Base coefficients based on date range
  const coef = is7d ? 0.25 : is90d ? 2.8 : 1.0;

  const totalReach = Math.round(48250 * coef);
  const totalLikes = Math.round(3820 * coef);
  const totalComments = Math.round(412 * coef);
  const totalShares = Math.round(295 * coef);
  const totalClicks = Math.round(940 * coef);
  const totalEngagement = totalLikes + totalComments + totalShares + totalClicks;
  const engagementRate = 11.24;

  const totalLeads = Math.round(114 * coef);
  const totalSpent = Math.round(18500 * coef);
  const costPerLead = totalLeads > 0 ? Math.round(totalSpent / totalLeads) : 162;

  // Platform metrics
  const platforms = {
    facebook: {
      reach: Math.round(21200 * coef),
      engagement: Math.round(1850 * coef),
      leads: Math.round(48 * coef),
    },
    instagram: {
      reach: Math.round(18600 * coef),
      engagement: Math.round(2230 * coef),
      leads: Math.round(38 * coef),
    },
    gmb: {
      reach: Math.round(8450 * coef), // views
      engagement: Math.round(1120 * coef), // clicks + directions
      leads: Math.round(28 * coef),
    },
    twitter: {
      reach: Math.round(4200 * coef), // impressions
      engagement: Math.round(680 * coef), // likes + retweets + replies
      leads: Math.round(12 * coef),
    },
    youtube: {
      reach: Math.round(1800 * coef), // views
      engagement: Math.round(220 * coef), // likes + comments + shares
      leads: Math.round(8 * coef),
    },
  };

  // Comments sentiment
  const positive = Math.round(290 * coef);
  const neutral = Math.round(98 * coef);
  const negative = Math.round(24 * coef);
  const totalSentiment = positive + neutral + negative;

  // Responses
  const responseRate = 96;
  const avgResponseTimeMinutes = 11; // 11 mins average response time (mostly AI handled)

  // Daily timeseries trend
  const timeseries: Array<{ date: string; reach: number; leads: number }> = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(now.getDate() - i);
    const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

    // Weekly cyclical pattern: reach & leads spike on weekends (Sat/Sun) and festival days
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    
    // Base values + noise
    let baseReach = 800 + Math.sin(i / 2) * 200 + (Math.random() * 150);
    let baseLeads = 2 + Math.sin(i / 2) * 1.2 + (Math.random() * 2);

    if (isWeekend) {
      baseReach *= 1.8;
      baseLeads *= 2.2;
    }

    // Add some random big peaks (representing successful ad boost campaigns)
    if (i % 8 === 3) {
      baseReach *= 2.5;
      baseLeads += 5;
    }

    timeseries.push({
      date: dateStr,
      reach: Math.round(baseReach),
      leads: Math.max(0, Math.round(baseLeads)),
    });
  }

  return {
    success: true,
    useMockData: true,
    summary: {
      totalReach,
      totalLikes,
      totalComments,
      totalShares,
      totalEngagement,
      engagementRate,
      totalLeads,
      totalSpent,
      costPerLead,
    },
    platforms,
    sentiment: {
      total: totalSentiment,
      positive,
      neutral,
      negative,
    },
    responses: {
      responseRate,
      avgResponseTimeMinutes,
    },
    timeseries,
  };
}

function getMockPostsData(days: number) {
  const now = new Date();
  
  // Create 6 highly realistic auto posts published over the last few weeks
  const mockPosts = [
    {
      id: 'mock-post-1',
      prompt_text: 'Publish special price details for Maruti Suzuki Swift with 7.99% EMI interest rates.',
      caption_text: '🚗 DRIVE HOME THE ALL-NEW SWIFT TODAY! 🚗\n\nStarting at just ₹7.99% EMI interest rates. Low downpayment option available. Get exchange bonus up to ₹25,000 on your old car!\n\n✅ 5-Star Safety Feel\n✅ Advanced Smartplay Pro Touchscreen\n✅ 22.3 kmpl Best-in-class mileage\n\nVisit CarDekho Plaza or call us to book your test drive. DM for detail pricing sheet!',
      creative_urls: {
        facebook: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&auto=format&fit=crop&q=60',
        instagram: 'https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800&auto=format&fit=crop&q=60',
      },
      platforms: ['facebook', 'instagram'],
      published_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
      reach: 12450,
      likes: 980,
      comments: 114,
      clicks: 0,
      details: {
        facebook: { reach: 6800, likes: 450, comments: 48, shares: 35 },
        instagram: { reach: 5650, likes: 530, comments: 66, saved: 42 }
      },
      mockComments: [
        { id: 'c1', customer_name: 'Rahul Sharma', message_text: 'Is this EMI rate applicable for pre-owned cars too?', sentiment: 'neutral', received_at: new Date(now.getTime() - 1.8 * 24 * 60 * 60 * 1000).toISOString(), reply_text: 'Hi Rahul, this specific 7.99% EMI rate is for the brand-new Swift. However, we have special pre-owned financing starting at 9.25%. Shall we schedule a call to detail this?' },
        { id: 'c2', customer_name: 'Priyanka Verma', message_text: 'Loving the red Swift. Delivered in Lucknow?', sentiment: 'positive', received_at: new Date(now.getTime() - 1.5 * 24 * 60 * 60 * 1000).toISOString(), reply_text: 'Yes Priyanka! We do deliveries in Lucknow. Please share your contact details or DM us, our team will get in touch with you.' },
        { id: 'c3', customer_name: 'Amit Patel', message_text: 'Too much interest rate, banks offer 7.5% direct.', sentiment: 'negative', received_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString() }
      ]
    },
    {
      id: 'mock-post-2',
      prompt_text: 'Create a banner for Tata Nexon EV booking updates and Eco-friendly advantages.',
      caption_text: '⚡ Future is Electric. Tata Nexon EV is here! ⚡\n\nNo petrol, no diesel, only pure performance and sustainability. Drive 465 km on a single charge!\n\n🔋 0 to 80% charge in 56 mins\n🔋 Battery warranty of 8 Years\n🔋 Automatic climate control & sunroof\n\nBooking open at special showroom rates. Visit CarDekho Plaza or tap below to calculate your savings.',
      creative_urls: {
        facebook: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=60',
        instagram: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=60',
        gmb: 'https://images.unsplash.com/photo-1563720223185-11003d516935?w=800&auto=format&fit=crop&q=60',
      },
      platforms: ['facebook', 'instagram', 'gmb'],
      published_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
      reach: 18900,
      likes: 1220,
      comments: 188,
      clicks: 430,
      details: {
        facebook: { reach: 8100, likes: 520, comments: 85, shares: 62 },
        instagram: { reach: 7400, likes: 700, comments: 103, saved: 78 },
        gmb: { views: 3400, clicks: 430, direction_requests: 120 }
      },
      mockComments: [
        { id: 'c4', customer_name: 'Sunil Kumar', message_text: 'What is the actual on-road price in New Delhi with subsidy?', sentiment: 'neutral', received_at: new Date(now.getTime() - 4.5 * 24 * 60 * 60 * 1000).toISOString(), reply_text: 'Hi Sunil, the on-road price in Delhi starts from ₹15.8 Lakhs after applying the state EV subsidy. We also offer free home wall charger installation!' },
        { id: 'c5', customer_name: 'Anjali Deshmukh', message_text: 'Took a test drive yesterday, very smooth drive and amazing cockpit.', sentiment: 'positive', received_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString() }
      ]
    },
    {
      id: 'mock-post-3',
      prompt_text: 'Promote Mahindra Scorpio-N rugged offroad drive and booking schedules.',
      caption_text: '🔥 The Big Daddy of SUVs — Mahindra Scorpio-N! 🔥\n\nConquer any terrain with the legendary 4XPLOR technology. Now booking with priority delivery slots at CarDekho Plaza.\n\n🛡️ 5-star GNCAP safety rating\n💪 Powerful mHawk Diesel engine\n🛋️ Luxurious Italian leatherette interiors\n\nBookings are filling fast. Test drives available today. Visit us!',
      creative_urls: {
        facebook: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=60',
        gmb: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800&auto=format&fit=crop&q=60',
      },
      platforms: ['facebook', 'gmb'],
      published_at: new Date(now.getTime() - 9 * 24 * 60 * 60 * 1000).toISOString(), // 9 days ago
      reach: 9800,
      likes: 640,
      comments: 65,
      clicks: 290,
      details: {
        facebook: { reach: 6200, likes: 640, comments: 65, shares: 48 },
        gmb: { views: 3600, clicks: 290, direction_requests: 95 }
      },
      mockComments: [
        { id: 'c6', customer_name: 'Vikram Singh', message_text: 'What is the waiting period for Z8 Luxury diesel automatic?', sentiment: 'neutral', received_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(), reply_text: 'Hi Vikram, the current waiting period for Z8 Luxury Diesel AT is around 3-4 months, but we have a few units arriving next week. Reach out to lock a priority allocation.' }
      ]
    },
    {
      id: 'mock-post-4',
      prompt_text: 'Create Google Business post informing customers about special Sunday Showroom timings and new inventory arrivals.',
      caption_text: '📢 WE ARE OPEN THIS SUNDAY! 📢\n\nLooking for your dream car? Make the most of your weekend. CarDekho Plaza is open this Sunday from 10:00 AM to 6:00 PM.\n\n✨ Exclusive Sunday Benefits:\n1. Instant on-spot finance approvals\n2. Valuation of your old car in 15 minutes\n3. Fresh stock arrivals (SUV, Sedan & Hatchbacks)\n\n📍 Visit us at Plot 45, Sector 18, Noida. Click below for directions.',
      creative_urls: {
        gmb: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&auto=format&fit=crop&q=60',
      },
      platforms: ['gmb'],
      published_at: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days ago
      reach: 4200,
      likes: 0,
      comments: 0,
      clicks: 340,
      details: {
        gmb: { views: 4200, clicks: 340, direction_requests: 160 }
      },
      mockComments: []
    },
    {
      id: 'mock-post-5',
      prompt_text: 'Announce Hyundai Creta Knight Edition showcase & booking rates.',
      caption_text: '🖤 Meet the Knight of the Road — Hyundai Creta Knight Edition! 🖤\n\nAll-black styling, premium dark chrome accents, and sporty red brake calipers. Turn heads wherever you go.\n\n🕶️ Panoramic Sunroof\n🕶️ Smart Panoramic Display\n🕶️ Advanced Bluelink connectivity\n\nExclusive showcases now open. Bookings start at ₹21,000. DM or call us to reserve your viewing slot.',
      creative_urls: {
        facebook: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=60',
        instagram: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=60',
      },
      platforms: ['facebook', 'instagram'],
      published_at: new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago
      reach: 14800,
      likes: 1180,
      comments: 92,
      clicks: 0,
      details: {
        facebook: { reach: 7600, likes: 490, comments: 38, shares: 20 },
        instagram: { reach: 7200, likes: 690, comments: 54, saved: 39 }
      },
      mockComments: [
        { id: 'c7', customer_name: 'Rajesh Mehta', message_text: 'Is this available in manual transmission diesel variant?', sentiment: 'neutral', received_at: new Date(now.getTime() - 19 * 24 * 60 * 60 * 1000).toISOString(), reply_text: 'Hi Rajesh! Yes, the Creta Knight Edition is available in both 1.5L Petrol Manual and 1.5L Diesel Manual, along with automatic options. Let us know when you want to see the car!' }
      ]
    },
    {
      id: 'mock-post-6',
      prompt_text: 'Tweet about Maruti Suzuki Brezza mileage features and compact SUV advantages.',
      caption_text: 'Looking for a compact SUV that is light on your pocket but heavy on performance? Maruti Brezza delivers an incredible 20.15 kmpl mileage! 🚗🔋\n\nEquipped with Smart Hybrid tech, electric sunroof & 360 camera. Book yours today!',
      creative_urls: {
        twitter: 'https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=800&auto=format&fit=crop&q=60'
      },
      platforms: ['twitter'],
      published_at: new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString(),
      reach: 4200,
      likes: 310,
      comments: 15,
      clicks: 0,
      details: {
        twitter: { impressions: 4200, likes: 310, retweets: 48, replies: 15 }
      },
      mockComments: [
        { id: 'c8', customer_name: 'Anup K', message_text: 'Does Brezza CNG also have hybrid tech?', sentiment: 'neutral', received_at: new Date(now.getTime() - 7.5 * 24 * 60 * 60 * 1000).toISOString(), reply_text: 'Hi Anup, the CNG variant has the standard K15C engine without the Smart Hybrid dual-battery system, but it gets an outstanding 25.51 km/kg mileage!' }
      ]
    },
    {
      id: 'mock-post-7',
      prompt_text: 'YouTube Shorts announcing Creta Knight walkaround video.',
      caption_text: 'The absolute beast: Hyundai Creta Knight Edition Walkaround! All-black sporty look is pure fire. 🔥🖤 #creta #knight #shorts',
      creative_urls: {
        youtube: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&auto=format&fit=crop&q=60'
      },
      platforms: ['youtube'],
      published_at: new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000).toISOString(),
      reach: 1800,
      likes: 92,
      comments: 18,
      clicks: 0,
      details: {
        youtube: { views: 1800, likes: 92, comments: 18, shares: 25 }
      },
      mockComments: [
        { id: 'c9', customer_name: 'Rahul G', message_text: 'Love the black styling, looks way better than regular Creta.', sentiment: 'positive', received_at: new Date(now.getTime() - 11.5 * 24 * 60 * 60 * 1000).toISOString() }
      ]
    }
  ];

  return mockPosts.filter((post) => {
    const pubTime = new Date(post.published_at).getTime();
    const cutOff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).getTime();
    return pubTime >= cutOff;
  });
}
