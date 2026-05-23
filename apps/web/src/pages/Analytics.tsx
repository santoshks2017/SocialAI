import { useState, useEffect, useRef } from 'react';
import { 
  TrendingUp, 
  Download, 
  Search, 
  Filter, 
  MessageSquare, 
  ThumbsUp, 
  MousePointerClick, 
  Eye, 
  MapPin, 
  Phone, 
  ArrowRight, 
  Clock, 
  Sparkles, 
  CheckCircle2, 
  X, 
  ExternalLink, 
  Star 
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { PlatformIcon } from '../components/ui/PlatformIcon';
import analyticsService, { 
  type AnalyticsSummary, 
  type PlatformMetrics, 
  type SentimentMetrics, 
  type ResponseMetrics, 
  type TimeseriesDataPoint,
  type PostAnalyticsItem
} from '../services/analytics';
import { inboxService } from '../services/inbox';

// Helper to format large numbers (e.g. 100K or 1.2L)
function formatNumber(n: number) {
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

export default function AnalyticsPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'posts' | 'reviews' | 'boosts'>('overview');
  const [range, setRange] = useState<'7d' | '30d' | '90d'>('30d');
  
  // Overview State
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [platformShare, setPlatformShare] = useState<Record<string, PlatformMetrics>>({});
  const [sentiment, setSentiment] = useState<SentimentMetrics | null>(null);
  const [responses, setResponses] = useState<ResponseMetrics | null>(null);
  const [timeseries, setTimeseries] = useState<TimeseriesDataPoint[]>([]);
  const [isMockData, setIsMockData] = useState(false);

  // Posts State
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [posts, setPosts] = useState<PostAnalyticsItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'facebook' | 'instagram' | 'gmb' | 'twitter' | 'youtube'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'reach' | 'likes' | 'comments'>('date');
  const [selectedPost, setSelectedPost] = useState<PostAnalyticsItem | null>(null);

  // Comments Reply state inside Drawer
  const [replyInputs, setReplyInputs] = useState<Record<string, string>>({});
  const [submittingReply, setSubmittingReply] = useState<Record<string, boolean>>({});
  const [suggestingReply, setSuggestingReply] = useState<Record<string, boolean>>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // SVG Chart Mouse Tracking
  const [hoveredPoint, setHoveredPoint] = useState<{ index: number; x: number; y: number; data: TimeseriesDataPoint } | null>(null);
  const chartRef = useRef<SVGSVGElement | null>(null);

  // Donut chart hover
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);

  useEffect(() => {
    fetchOverviewData();
  }, [range]);

  useEffect(() => {
    fetchPostsData();
  }, [range, platformFilter, sortBy]);

  const fetchOverviewData = async () => {
    setLoadingOverview(true);
    try {
      const res = await analyticsService.getOverview(range);
      if (res.success) {
        setSummary(res.summary);
        setPlatformShare(res.platforms);
        setSentiment(res.sentiment);
        setResponses(res.responses);
        setTimeseries(res.timeseries);
        setIsMockData(res.useMockData);
      }
    } catch (err) {
      console.error('Failed to fetch analytics overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  };

  const fetchPostsData = async () => {
    setLoadingPosts(true);
    try {
      const res = await analyticsService.getPosts({ 
        range, 
        platform: platformFilter, 
        sortBy 
      });
      if (res.success) {
        setPosts(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch analytics posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  // Generate CSV for Export
  const handleExportCSV = () => {
    if (!posts.length) return;
    
    const headers = ['Post ID', 'Published Date', 'Prompt Prompt', 'Platforms', 'Total Reach', 'Likes', 'Comments', 'Clicks/GMB Clicks'];
    const rows = posts.map(p => [
      p.id,
      p.published_at ? new Date(p.published_at).toLocaleDateString('en-IN') : 'N/A',
      `"${p.prompt_text.replace(/"/g, '""')}"`,
      p.platforms.join(' & '),
      p.reach,
      p.likes,
      p.comments,
      p.clicks
    ]);

    const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `CarDekho_Social_AI_Analytics_Report_${range}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // SVG Line Chart Coordinate Generator
  const getLineCoordinates = (width: number, height: number, padding: number) => {
    if (timeseries.length === 0) return { reachPath: '', areaPath: '', points: [], maxReach: 100 };

    const maxReach = Math.max(...timeseries.map(d => d.reach), 100);
    const chartWidth = width - padding * 2;
    const chartHeight = height - padding * 2;

    const points = timeseries.map((d, i) => {
      const x = padding + (i / (timeseries.length - 1)) * chartWidth;
      const y = padding + chartHeight - (d.reach / maxReach) * chartHeight;
      return { x, y, data: d, index: i };
    });

    const reachPath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    
    // Area path (closed at the bottom)
    const areaPath = reachPath ? `${reachPath} L ${points[points.length - 1].x} ${height - padding} L ${points[0].x} ${height - padding} Z` : '';

    return { reachPath, areaPath, points, maxReach };
  };

  const handleMouseMoveChart = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!chartRef.current || timeseries.length === 0) return;
    
    const svgRect = chartRef.current.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;
    
    const width = 800; // viewBox width
    const padding = 50;
    const chartWidth = width - padding * 2;
    
    // Convert client coordinate ratio to viewbox coordinate
    const svgMouseX = (mouseX / svgRect.width) * width;
    
    // Find closest data index based on X
    const relativeX = svgMouseX - padding;
    let index = Math.round((relativeX / chartWidth) * (timeseries.length - 1));
    index = Math.max(0, Math.min(timeseries.length - 1, index));

    const maxReach = Math.max(...timeseries.map(d => d.reach), 100);
    const chartHeight = 250 - padding * 2;
    const x = padding + (index / (timeseries.length - 1)) * chartWidth;
    const y = padding + chartHeight - (timeseries[index].reach / maxReach) * chartHeight;

    setHoveredPoint({
      index,
      x,
      y,
      data: timeseries[index]
    });
  };

  const handleMouseLeaveChart = () => {
    setHoveredPoint(null);
  };

  // SVG Donut Chart Slices Calculations
  const getDonutSlices = () => {
    const data = [
      { name: 'Facebook', value: platformShare.facebook?.reach ?? 0, color: '#1877F2', key: 'facebook' },
      { name: 'Instagram', value: platformShare.instagram?.reach ?? 0, color: '#e1306c', key: 'instagram' },
      { name: 'Google GMB', value: platformShare.gmb?.reach ?? 0, color: '#4285F4', key: 'gmb' },
      { name: 'X (Twitter)', value: platformShare.twitter?.reach ?? 0, color: '#000000', key: 'twitter' },
      { name: 'YouTube', value: platformShare.youtube?.reach ?? 0, color: '#FF0000', key: 'youtube' },
    ];
    
    const total = data.reduce((sum, item) => sum + item.value, 0) || 1;
    let accumulatedAngle = -90; // Start at 12 o'clock

    return data.map(item => {
      const percentage = (item.value / total) * 100;
      const angle = (item.value / total) * 360;
      const startAngle = accumulatedAngle;
      const endAngle = accumulatedAngle + angle;
      accumulatedAngle += angle;

      // Arc calculation
      const r = 55;
      const cx = 80;
      const cy = 80;

      const rad = (deg: number) => (deg * Math.PI) / 180;
      const x1 = cx + r * Math.cos(rad(startAngle));
      const y1 = cy + r * Math.sin(rad(startAngle));
      const x2 = cx + r * Math.cos(rad(endAngle));
      const y2 = cy + r * Math.sin(rad(endAngle));

      const largeArc = angle > 180 ? 1 : 0;
      
      const pathData = `
        M ${x1} ${y1}
        A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}
      `;

      return {
        ...item,
        percentage,
        pathData,
        cx,
        cy,
        r
      };
    });
  };

  // Suggest AI Reply for a comment
  const handleSuggestReply = async (commentId: string) => {
    setSuggestingReply(prev => ({ ...prev, [commentId]: true }));
    try {
      const res = await inboxService.generateReply(commentId);
      if (res.suggestedReply) {
        setReplyInputs(prev => ({ ...prev, [commentId]: res.suggestedReply }));
      }
    } catch (err) {
      console.error('Failed to generate AI reply suggestion:', err);
    } finally {
      setSuggestingReply(prev => ({ ...prev, [commentId]: false }));
    }
  };

  // Send comment reply
  const handleSendReply = async (commentId: string) => {
    const text = replyInputs[commentId];
    if (!text?.trim()) return;

    setSubmittingReply(prev => ({ ...prev, [commentId]: true }));
    try {
      const res = await inboxService.sendReply(commentId, text);
      if (res.item) {
        // Update local comment list inside selectedPost
        if (selectedPost) {
          const updatedComments = selectedPost.mockComments?.map(c => 
            c.id === commentId ? { ...c, reply_text: text } : c
          );
          setSelectedPost({
            ...selectedPost,
            mockComments: updatedComments
          });
        }
        setSuccessToast('Reply sent successfully to platform!');
        setTimeout(() => setSuccessToast(null), 3000);
      }
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setSubmittingReply(prev => ({ ...prev, [commentId]: false }));
    }
  };

  const getFilteredComments = () => {
    return selectedPost?.mockComments ?? [];
  };

  // Grid background / timeline markers helper
  const chartWidth = 800;
  const chartHeight = 250;
  const chartPadding = 50;
  const { reachPath, areaPath, points, maxReach } = getLineCoordinates(chartWidth, chartHeight, chartPadding);

  return (
    <div className="max-w-6xl mx-auto space-y-6 px-1">
      {/* Toast Notification */}
      {successToast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-xl animate-bounce">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm font-semibold">{successToast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4 border-b border-stone-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-stone-900 tracking-tight">Performance Analytics</h1>
            {isMockData && (
              <span className="bg-amber-50 text-amber-700 text-xs font-semibold px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Demo View
              </span>
            )}
          </div>
          <p className="text-sm text-stone-500 mt-0.5">
            Real-time engagement, post metrics, and lead attribution summaries.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Range Selector */}
          <div className="flex bg-stone-100 rounded-lg p-0.5 border border-stone-200">
            {(['7d', '30d', '90d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-all ${
                  range === r 
                    ? 'bg-white text-stone-900 shadow-sm' 
                    : 'text-stone-500 hover:text-stone-950'
                }`}
              >
                {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>

          <Button variant="secondary" onClick={handleExportCSV} className="h-9 px-3 flex items-center gap-1.5 text-xs">
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'posts', label: 'Posts Performance' },
          { id: 'reviews', label: 'Reviews & GMB' },
          { id: 'boosts', label: 'Ad Boosts' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`py-3 px-5 text-sm font-semibold border-b-2 -mb-px transition-all ${
              activeTab === tab.id 
                ? 'border-orange-600 text-orange-600' 
                : 'border-transparent text-stone-500 hover:text-stone-900 hover:border-stone-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ────────────────── OVERVIEW TAB ────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {loadingOverview ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-28 bg-stone-100 rounded-xl" />
              ))}
            </div>
          ) : (
            <>
              {/* KPIs Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Total Reach', value: summary ? formatNumber(summary.totalReach) : '—', sub: 'Across FB, IG, GMB, X, YT', icon: Eye, color: 'text-blue-600 bg-blue-50' },
                  { label: 'Engagement Rate', value: summary ? `${summary.engagementRate}%` : '—', sub: 'Likes, comments, clicks', icon: TrendingUp, color: 'text-purple-600 bg-purple-50' },
                  { label: 'Leads Attributed', value: summary ? String(summary.totalLeads) : '—', sub: 'Organic & Boosted', icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
                  { label: 'Ad Spend ROI', value: summary ? `₹${formatNumber(summary.totalSpent)}` : '—', sub: summary && summary.totalLeads > 0 ? `₹${summary.costPerLead} per lead` : 'No spend', icon: ThumbsUp, color: 'text-orange-600 bg-orange-50' },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-stone-200/80 shadow-sm p-4 relative overflow-hidden group hover:border-stone-300 transition-all">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-xs font-semibold text-stone-400 tracking-wider uppercase">{kpi.label}</p>
                        <p className="text-3xl font-extrabold text-stone-900 mt-2">{kpi.value}</p>
                      </div>
                      <div className={`p-2.5 rounded-lg ${kpi.color}`}>
                        <kpi.icon className="w-5 h-5" />
                      </div>
                    </div>
                    <p className="text-xs text-stone-500 mt-3 flex items-center gap-1">
                      <span>{kpi.sub}</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* Charts Panel */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Custom SVG Line Chart */}
                <div className="lg:col-span-2 bg-white rounded-xl border border-stone-200/80 p-5 shadow-sm flex flex-col">
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="font-bold text-stone-800">Reach & Lead Trends</h3>
                      <p className="text-xs text-stone-500">Daily performance metrics across selected range</p>
                    </div>
                    <div className="flex gap-4 text-xs font-semibold">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-blue-500 rounded-full"></span> Reach</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Leads</span>
                    </div>
                  </div>

                  {/* SVG Container */}
                  <div className="relative flex-1 min-h-[220px]">
                    {timeseries.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-stone-400">
                        No trend data available.
                      </div>
                    ) : (
                      <svg 
                        ref={chartRef}
                        viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                        className="w-full h-full cursor-crosshair overflow-visible"
                        onMouseMove={handleMouseMoveChart}
                        onMouseLeave={handleMouseLeaveChart}
                      >
                        <defs>
                          {/* Area Gradient */}
                          <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>

                        {/* Y-axis gridlines */}
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                          const y = chartPadding + (chartHeight - chartPadding * 2) * ratio;
                          const gridVal = maxReach - (maxReach * ratio);
                          return (
                            <g key={i} className="opacity-70">
                              <line 
                                x1={chartPadding} 
                                y1={y} 
                                x2={chartWidth - chartPadding} 
                                y2={y} 
                                stroke="#f1f5f9" 
                                strokeWidth="1"
                                strokeDasharray="4,4" 
                              />
                              <text 
                                x={chartPadding - 10} 
                                y={y + 4} 
                                fill="#a8a29e" 
                                fontSize="10" 
                                textAnchor="end"
                                fontWeight="bold"
                              >
                                {formatNumber(Math.round(gridVal))}
                              </text>
                            </g>
                          );
                        })}

                        {/* X-axis labels (render alternate dates to save space) */}
                        {points.map((p, i) => {
                          if (timeseries.length > 10 && i % Math.round(timeseries.length / 5) !== 0) return null;
                          return (
                            <text
                              key={i}
                              x={p.x}
                              y={chartHeight - chartPadding + 18}
                              fill="#a8a29e"
                              fontSize="10"
                              textAnchor="middle"
                              fontWeight="bold"
                            >
                              {p.data.date}
                            </text>
                          );
                        })}

                        {/* Reach Area Fill */}
                        <path d={areaPath} fill="url(#area-grad)" />

                        {/* Reach Line */}
                        <path 
                          d={reachPath} 
                          fill="none" 
                          stroke="#3b82f6" 
                          strokeWidth="2.5" 
                          strokeLinecap="round" 
                        />

                        {/* Leads Bars overlay */}
                        {points.map((p, i) => {
                          const maxLeads = Math.max(...timeseries.map(d => d.leads), 5);
                          const barHeight = (p.data.leads / maxLeads) * (chartHeight - chartPadding * 2 - 20);
                          const barWidth = 10;
                          return (
                            <rect
                              key={i}
                              x={p.x - barWidth / 2}
                              y={chartHeight - chartPadding - barHeight}
                              width={barWidth}
                              height={barHeight}
                              fill="#10b981"
                              rx="2"
                              className="transition-all hover:fill-emerald-400"
                            />
                          );
                        })}

                        {/* Hover Overlay Marker */}
                        {hoveredPoint && (
                          <g>
                            <line 
                              x1={hoveredPoint.x} 
                              y1={chartPadding} 
                              x2={hoveredPoint.x} 
                              y2={chartHeight - chartPadding} 
                              stroke="#cbd5e1" 
                              strokeWidth="1.5" 
                              strokeDasharray="3,3" 
                            />
                            <circle 
                              cx={hoveredPoint.x} 
                              cy={hoveredPoint.y} 
                              r="6" 
                              fill="#3b82f6" 
                              stroke="white" 
                              strokeWidth="2" 
                              className="shadow"
                            />
                          </g>
                        )}
                      </svg>
                    )}

                    {/* Chart Tooltip DOM element */}
                    {hoveredPoint && (
                      <div 
                        className="absolute bg-stone-900 text-white rounded-lg p-2.5 shadow-xl text-xs space-y-1 z-15 pointer-events-none"
                        style={{ 
                          left: `${(hoveredPoint.x / chartWidth) * 100}%`, 
                          top: `${(hoveredPoint.y / chartHeight) * 100 - 30}%`,
                          transform: 'translateX(-50%)'
                        }}
                      >
                        <p className="font-bold border-b border-stone-700 pb-0.5 mb-1">{hoveredPoint.data.date}</p>
                        <p className="flex items-center justify-between gap-4">
                          <span className="text-stone-400">Reach:</span> 
                          <span className="font-semibold text-blue-400">{hoveredPoint.data.reach.toLocaleString('en-IN')}</span>
                        </p>
                        <p className="flex items-center justify-between gap-4">
                          <span className="text-stone-400">Leads:</span> 
                          <span className="font-semibold text-emerald-400">{hoveredPoint.data.leads}</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Donut platform distribution */}
                <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-stone-800">Leads by Channel</h3>
                    <p className="text-xs text-stone-500">Distribution across active platforms</p>
                  </div>

                  {/* SVG Donut */}
                  <div className="flex justify-center my-4 relative">
                    <svg width="160" height="160" viewBox="0 0 160 160" className="overflow-visible">
                      <circle cx="80" cy="80" r="55" fill="none" stroke="#f1f5f9" strokeWidth="16" />
                      
                      {getDonutSlices().map((slice, i) => (
                        <circle
                          key={i}
                          cx="80"
                          cy="80"
                          r="55"
                          fill="none"
                          stroke={slice.color}
                          strokeWidth={hoveredSlice === slice.key ? '20' : '16'}
                          strokeDasharray="345.57" // 2 * Math.PI * r
                          strokeDashoffset={345.57 - (345.57 * slice.percentage) / 100}
                          // Rotate slice according to accumulated percentage
                          transform={`rotate(${getDonutSlices().slice(0, i).reduce((sum, s) => sum + s.percentage, 0) * 3.6 - 90} 80 80)`}
                          strokeLinecap={slice.percentage > 0 ? 'round' : 'butt'}
                          className="transition-all duration-300 cursor-pointer"
                          onMouseEnter={() => setHoveredSlice(slice.key)}
                          onMouseLeave={() => setHoveredSlice(null)}
                        />
                      ))}
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p className="text-2xl font-black text-stone-900">{summary?.totalLeads ?? 0}</p>
                      <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Leads Total</p>
                    </div>
                  </div>

                  {/* Legend list */}
                  <div className="space-y-1.5 pt-2 border-t border-stone-100">
                    {getDonutSlices().map((slice) => (
                      <div 
                        key={slice.name} 
                        className={`flex items-center justify-between text-xs p-1.5 rounded-md transition-all ${
                          hoveredSlice === slice.key ? 'bg-stone-50 scale-[1.02]' : ''
                        }`}
                        onMouseEnter={() => setHoveredSlice(slice.key)}
                        onMouseLeave={() => setHoveredSlice(null)}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: slice.color }}></span>
                          <span className="font-semibold text-stone-700">{slice.name}</span>
                        </div>
                        <span className="font-bold text-stone-900">{slice.percentage.toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Engagement Sentiment & Response Rates */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Sentiment Breakdown */}
                <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="font-bold text-stone-800">Client Feedback Sentiment</h3>
                    <p className="text-xs text-stone-500">Analysis of comments and GMB reviews</p>
                  </div>

                  {sentiment && (
                    <div className="space-y-4">
                      {/* Percentages Bar */}
                      <div className="h-6 w-full bg-stone-100 rounded-lg overflow-hidden flex shadow-inner">
                        {sentiment.positive > 0 && (
                          <div 
                            style={{ width: `${(sentiment.positive / sentiment.total) * 100}%` }}
                            className="bg-emerald-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                            title={`Positive: ${sentiment.positive}`}
                          >
                            {Math.round((sentiment.positive / sentiment.total) * 100)}%
                          </div>
                        )}
                        {sentiment.neutral > 0 && (
                          <div 
                            style={{ width: `${(sentiment.neutral / sentiment.total) * 100}%` }}
                            className="bg-blue-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                            title={`Neutral: ${sentiment.neutral}`}
                          >
                            {Math.round((sentiment.neutral / sentiment.total) * 100)}%
                          </div>
                        )}
                        {sentiment.negative > 0 && (
                          <div 
                            style={{ width: `${(sentiment.negative / sentiment.total) * 100}%` }}
                            className="bg-amber-500 h-full flex items-center justify-center text-[10px] font-bold text-white transition-all hover:opacity-90"
                            title={`Negative: ${sentiment.negative}`}
                          >
                            {Math.round((sentiment.negative / sentiment.total) * 100)}%
                          </div>
                        )}
                      </div>

                      {/* Legend Grid */}
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-2">
                          <p className="font-semibold text-emerald-700">Positive</p>
                          <p className="text-lg font-bold text-emerald-950 mt-0.5">{sentiment.positive}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2">
                          <p className="font-semibold text-blue-700">Neutral</p>
                          <p className="text-lg font-bold text-blue-950 mt-0.5">{sentiment.neutral}</p>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                          <p className="font-semibold text-amber-700">Critical</p>
                          <p className="text-lg font-bold text-amber-950 mt-0.5">{sentiment.negative}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* AI & Manual Message Response Times */}
                <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-stone-800">Response Automation Efficiency</h3>
                    <p className="text-xs text-stone-500">Rate of answered comments and average delay time</p>
                  </div>

                  {responses && (
                    <div className="flex items-center gap-6 mt-4">
                      {/* circular progress for response rate */}
                      <div className="relative w-24 h-24 flex-shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                          <circle cx="18" cy="18" r="16" fill="none" stroke="#f1f5f9" strokeWidth="3" />
                          <circle 
                            cx="18" 
                            cy="18" 
                            r="16" 
                            fill="none" 
                            stroke="#ea580c" 
                            strokeWidth="3" 
                            strokeDasharray="100.53" 
                            strokeDashoffset={100.53 - (100.53 * responses.responseRate) / 100}
                            strokeLinecap="round"
                            className="transition-all duration-500"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-black text-stone-900">{responses.responseRate}%</span>
                          <span className="text-[8px] font-bold text-stone-400 uppercase">Answered</span>
                        </div>
                      </div>

                      {/* details text */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded bg-orange-50 text-orange-600">
                            <Clock className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">Avg Response Time</p>
                            <p className="text-xl font-extrabold text-stone-900">{responses.avgResponseTimeMinutes} Minutes</p>
                          </div>
                        </div>

                        <p className="text-xs text-stone-500 leading-relaxed">
                          92% of reviews and comments were answered immediately using AI automatic suggestions.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ────────────────── POSTS PERFORMANCE TAB ────────────────── */}
      {activeTab === 'posts' && (
        <div className="space-y-4">
          {/* Table Toolbar */}
          <div className="flex items-center justify-between gap-3 flex-wrap bg-stone-50 border border-stone-200/80 rounded-xl p-3.5">
            <div className="flex items-center gap-2 w-full sm:w-auto flex-1 min-w-[200px]">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-2.5" />
                <input 
                  type="text"
                  placeholder="Search posts prompt/caption..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white text-sm border border-stone-200 rounded-lg pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-600/20"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Platform filter */}
              <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-700">
                <Filter className="w-3.5 h-3.5 text-stone-400" />
                <select 
                  value={platformFilter} 
                  onChange={(e: any) => setPlatformFilter(e.target.value)}
                  className="focus:outline-none bg-transparent"
                >
                  <option value="all">All Channels</option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="gmb">Google Business</option>
                  <option value="twitter">X (Twitter)</option>
                  <option value="youtube">YouTube</option>
                </select>
              </div>

              {/* Sort filter */}
              <div className="flex items-center gap-1 bg-white border border-stone-200 rounded-lg px-2 py-1.5 text-xs font-semibold text-stone-700">
                <select 
                  value={sortBy} 
                  onChange={(e: any) => setSortBy(e.target.value)}
                  className="focus:outline-none bg-transparent"
                >
                  <option value="date">Newest Published</option>
                  <option value="reach">Highest Reach</option>
                  <option value="likes">Most Likes</option>
                  <option value="comments">Most Comments</option>
                </select>
              </div>
            </div>
          </div>

          {/* Posts List */}
          {loadingPosts ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-stone-100 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase">
                      <th className="py-3.5 px-4 w-12 text-center">No.</th>
                      <th className="py-3.5 px-4 min-w-[280px]">Published Post details</th>
                      <th className="py-3.5 px-4 text-center">Channels</th>
                      <th className="py-3.5 px-4 text-right">Reach</th>
                      <th className="py-3.5 px-4 text-right">Likes</th>
                      <th className="py-3.5 px-4 text-right">Comments</th>
                      <th className="py-3.5 px-4 text-right">Clicks</th>
                      <th className="py-3.5 px-4 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 text-sm">
                    {posts.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-10 text-stone-400">
                          No published posts found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      posts.filter(p => 
                        p.prompt_text.toLowerCase().includes(searchQuery.toLowerCase()) || 
                        p.caption_text?.toLowerCase().includes(searchQuery.toLowerCase())
                      ).map((post, idx) => (
                        <tr 
                          key={post.id} 
                          onClick={() => setSelectedPost(post)}
                          className="hover:bg-orange-50/20 cursor-pointer transition-all"
                        >
                          <td className="py-3.5 px-4 text-center text-xs font-bold text-stone-400">
                            {idx + 1}
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-3">
                              <img 
                                src={Object.values(post.creative_urls ?? {})[0] ?? '/fallback-car.jpg'} 
                                alt="car banner" 
                                className="w-12 h-9 rounded bg-stone-100 object-cover flex-shrink-0 border border-stone-200"
                              />
                              <div className="min-w-0">
                                <p className="font-semibold text-stone-900 truncate max-w-[240px]">{post.prompt_text}</p>
                                <p className="text-xs text-stone-400 mt-0.5">
                                  {post.published_at ? new Date(post.published_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {post.platforms.map((plat) => (
                                <div key={plat} className="p-1 bg-stone-50 rounded border border-stone-150">
                                  <PlatformIcon platform={plat as any} size="sm" />
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-bold text-stone-900">
                            {post.reach.toLocaleString('en-IN')}
                          </td>
                          <td className="py-3.5 px-4 text-right text-stone-600">
                            {post.likes > 0 ? post.likes.toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right text-stone-600">
                            {post.comments > 0 ? post.comments.toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-right text-stone-600">
                            {post.clicks > 0 ? post.clicks.toLocaleString('en-IN') : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <ArrowRight className="w-4 h-4 text-stone-400 group-hover:text-orange-600" />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── REVIEWS & GMB TAB ────────────────── */}
      {activeTab === 'reviews' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* GMB Rating Aggregates */}
            <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="font-bold text-stone-800">Google Rating Aggregate</h3>
                <p className="text-xs text-stone-500">Overview of GMB Star Ratings</p>
              </div>

              <div className="flex items-center gap-4 my-4">
                <div className="text-center">
                  <p className="text-5xl font-black text-stone-900">4.8</p>
                  <div className="flex items-center gap-0.5 justify-center mt-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="text-[10px] text-stone-400 font-bold mt-1 uppercase">128 Google Reviews</p>
                </div>
                
                {/* Visual Bar Distribution */}
                <div className="flex-1 space-y-1">
                  {[
                    { stars: 5, pct: 82 },
                    { stars: 4, pct: 12 },
                    { stars: 3, pct: 4 },
                    { stars: 2, pct: 1 },
                    { stars: 1, pct: 1 },
                  ].map((row) => (
                    <div key={row.stars} className="flex items-center gap-2 text-[10px] font-semibold text-stone-600">
                      <span>{row.stars}★</span>
                      <div className="flex-1 h-2 bg-stone-100 rounded overflow-hidden">
                        <div className="bg-yellow-400 h-full rounded" style={{ width: `${row.pct}%` }} />
                      </div>
                      <span className="w-6 text-right">{row.pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Local SEO metrics */}
            <div className="bg-white rounded-xl border border-stone-200/80 p-5 shadow-sm md:col-span-2 space-y-4">
              <div>
                <h3 className="font-bold text-stone-800">Google My Business local SEO</h3>
                <p className="text-xs text-stone-500">Showroom actions taken by Google Maps visitors</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'GMB Views', value: '8,450', sub: 'Maps & Search views', icon: Eye },
                  { label: 'Call Showroom', value: '420', sub: 'Clicks on phone CTA', icon: Phone },
                  { label: 'Get Directions', value: '380', sub: 'Driving directions clicks', icon: MapPin },
                ].map((act) => (
                  <div key={act.label} className="bg-stone-50 rounded-lg p-3 border border-stone-150">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{act.label}</p>
                        <p className="text-xl font-extrabold text-stone-900 mt-1">{act.value}</p>
                      </div>
                      <act.icon className="w-4 h-4 text-blue-600" />
                    </div>
                    <p className="text-[10px] text-stone-400 mt-2 font-medium">{act.sub}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* GMB reviews stream */}
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
              <h3 className="font-bold text-stone-800">Recent Customer Reviews (GMB)</h3>
              <Badge variant="default" className="text-xs">Pending AI reply checks</Badge>
            </div>
            
            <div className="divide-y divide-stone-150">
              {[
                { id: 'rev-1', author: 'Vikrant Rathi', rating: 5, comment: 'Highly recommended! Bought Creta from here yesterday. The sales executives were very professional and helped arrange financing inside 2 hours. Splendid pricing bonus offered too.', time: '1 day ago', replied: true, replyText: 'Thank you Vikrant for your wonderful feedback! We are absolutely thrilled to assist you with your Creta purchase. Wishing you many happy journeys ahead!' },
                { id: 'rev-2', author: 'Megha Gupta', rating: 5, comment: 'Amazing test drive experience of the Tata Nexon EV. The staff explained all electric motor aspects and battery charging cycles perfectly. Clean showroom.', time: '3 days ago', replied: false },
                { id: 'rev-3', author: 'Santosh Kumar', rating: 3, comment: 'The showroom is highly crowded on Sundays and test drive waiting time was almost 45 mins. Car options are good but staff management can be faster.', time: '1 week ago', replied: true, replyText: 'Hi Santosh, we sincerely regret the waiting delay you faced. Sundays do experience high footfall. We recommend booking a priority weekday slot next time. Thank you for your feedback!' }
              ].map((rev) => (
                <div key={rev.id} className="p-5 space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center font-bold text-stone-600 text-xs">
                        {rev.author[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-stone-900">{rev.author}</p>
                        <p className="text-[10px] text-stone-400">{rev.time}</p>
                      </div>
                    </div>

                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`w-3.5 h-3.5 ${s <= rev.rating ? 'fill-yellow-400 text-yellow-400' : 'text-stone-200'}`} />
                      ))}
                    </div>
                  </div>

                  <p className="text-sm text-stone-600 pl-10 italic">
                    "{rev.comment}"
                  </p>

                  <div className="pl-10">
                    {rev.replied ? (
                      <div className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs space-y-1">
                        <div className="flex items-center gap-1.5 text-stone-500 font-semibold mb-0.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Showroom Response
                        </div>
                        <p className="text-stone-700 leading-relaxed font-medium">{rev.replyText}</p>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button 
                          variant="secondary" 
                          onClick={() => {
                            // simulate suggest AI reply
                            setReplyInputs(prev => ({
                              ...prev,
                              [rev.id]: `Hi ${rev.author}, thank you for visiting our showroom! We are glad you enjoyed the Nexon EV test drive. Our team is always ready to guide our customers. Hope to see you again soon!`
                            }));
                          }} 
                          className="h-8 py-1 px-3 text-xs flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-orange-600" /> Pre-fill AI Reply
                        </Button>
                      </div>
                    )}

                    {replyInputs[rev.id] && !rev.replied && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={replyInputs[rev.id]}
                          onChange={(e) => setReplyInputs(prev => ({ ...prev, [rev.id]: e.target.value }))}
                          className="w-full text-xs border rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-orange-600 bg-stone-50 font-medium"
                          rows={3}
                        />
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="ghost" 
                            onClick={() => setReplyInputs(prev => ({ ...prev, [rev.id]: '' }))} 
                            className="h-8 py-1 px-3 text-xs"
                          >
                            Cancel
                          </Button>
                          <Button 
                            onClick={() => {
                              rev.replied = true;
                              rev.replyText = replyInputs[rev.id];
                              setReplyInputs(prev => ({ ...prev, [rev.id]: '' }));
                              setSuccessToast('Google Review response posted!');
                              setTimeout(() => setSuccessToast(null), 3000);
                            }} 
                            className="h-8 py-1 px-3 text-xs"
                          >
                            Publish Response
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── BOOST CAMPAIGNS TAB ────────────────── */}
      {activeTab === 'boosts' && (
        <div className="space-y-6">
          {/* Ad accounts status panel */}
          <div className="bg-gradient-to-r from-stone-900 to-stone-850 rounded-xl p-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <p className="text-xs text-orange-500 font-bold uppercase tracking-wider">Connected Facebook Ad Account</p>
              <h3 className="text-xl font-bold">CarDekho Showroom Plaza (ad_acc_9014382)</h3>
              <p className="text-xs text-stone-400">Sync status: Active · Last checked 6 hours ago</p>
            </div>
            
            <div className="flex gap-3">
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center min-w-[100px]">
                <p className="text-lg font-bold text-orange-400">₹18,500</p>
                <p className="text-[10px] text-stone-400 font-bold uppercase mt-0.5">Budget Spent</p>
              </div>
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center min-w-[100px]">
                <p className="text-lg font-bold text-emerald-400">114</p>
                <p className="text-[10px] text-stone-400 font-bold uppercase mt-0.5">Leads Generated</p>
              </div>
            </div>
          </div>

          {/* Boost campaigns table list */}
          <div className="bg-white rounded-xl border border-stone-200/80 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-stone-100">
              <h3 className="font-bold text-stone-800">Boost Campaigns Summary</h3>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-stone-50 border-b border-stone-200 text-xs font-bold text-stone-500 uppercase">
                    <th className="py-3 px-4">Campaign Target</th>
                    <th className="py-3 px-4">Ad Status</th>
                    <th className="py-3 px-4 text-right">Daily Budget</th>
                    <th className="py-3 px-4 text-right">Total Spent</th>
                    <th className="py-3 px-4 text-right">Clicks</th>
                    <th className="py-3 px-4 text-right">Leads</th>
                    <th className="py-3 px-4 text-right">CPL</th>
                    <th className="py-3 px-4 text-right">Date range</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 font-medium text-stone-700">
                  {[
                    { target: 'Swift EMI Offroad Offer Campaign', status: 'Active', budget: 500, spent: 4500, clicks: 880, leads: 28, cpl: 160, dates: '10 May - 19 May' },
                    { target: 'Tata Nexon EV Green Independence Showcase', status: 'Completed', budget: 1000, spent: 10000, clicks: 1940, leads: 62, cpl: 161, dates: '1 May - 10 May' },
                    { target: 'Scorpio-N Big Daddy Showroom Launch ad', status: 'Completed', budget: 800, spent: 4000, clicks: 760, leads: 24, cpl: 166, dates: '22 Apr - 27 Apr' },
                  ].map((boost, idx) => (
                    <tr key={idx} className="hover:bg-stone-50/50">
                      <td className="py-3.5 px-4 font-semibold text-stone-900">{boost.target}</td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          boost.status === 'Active' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-stone-100 text-stone-600 border-stone-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${boost.status === 'Active' ? 'bg-emerald-600 animate-pulse' : 'bg-stone-400'}`}></span>
                          {boost.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right text-stone-900">₹{boost.budget}/day</td>
                      <td className="py-3.5 px-4 text-right text-stone-950 font-bold">₹{boost.spent.toLocaleString('en-IN')}</td>
                      <td className="py-3.5 px-4 text-right text-stone-600">{boost.clicks}</td>
                      <td className="py-3.5 px-4 text-right text-emerald-600 font-bold">{boost.leads}</td>
                      <td className="py-3.5 px-4 text-right text-stone-900 font-bold">₹{boost.cpl}</td>
                      <td className="py-3.5 px-4 text-right text-stone-400 text-xs">{boost.dates}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ────────────────── DETAILS DRAWER ────────────────── */}
      {selectedPost && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            onClick={() => setSelectedPost(null)}
            className="absolute inset-0 bg-stone-950/40 backdrop-blur-sm transition-all"
          />

          {/* Sheet Panel */}
          <div className="relative w-full max-w-4xl bg-white h-full shadow-2xl flex flex-col md:flex-row overflow-hidden animate-slide-in">
            {/* Left side: Post Mockup Preview */}
            <div className="w-full md:w-[380px] bg-stone-50 border-r border-stone-200 p-5 overflow-y-auto flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Post Mock Preview</h4>
                  <div className="flex gap-1.5">
                    {selectedPost.platforms.map((plat) => (
                      <Badge key={plat} variant="default" className="text-[10px] py-0 px-2 capitalize flex items-center gap-1 bg-white border border-stone-200">
                        <PlatformIcon platform={plat as any} size="sm" /> {plat === 'gmb' ? 'Google' : plat}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Facebook/Instagram Mock Card */}
                <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
                  <div className="p-3.5 flex items-center justify-between border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center font-bold text-white text-xs">
                        CD
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-stone-900 leading-tight">CarDekho Plaza</h5>
                        <p className="text-[10px] text-stone-400">Published · Noida, UP</p>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-stone-400" />
                  </div>

                  {/* Caption */}
                  <div className="p-3.5 text-xs text-stone-800 leading-relaxed max-h-[140px] overflow-y-auto font-medium">
                    {selectedPost.caption_text ? selectedPost.caption_text : selectedPost.prompt_text}
                  </div>

                  {/* Image */}
                  <div className="aspect-[4/3] bg-stone-100 relative border-t border-b border-stone-100">
                    <img 
                      src={Object.values(selectedPost.creative_urls ?? {})[0] ?? '/fallback-car.jpg'} 
                      alt="mock asset" 
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {/* Mock Footer Actions */}
                  <div className="p-3 bg-stone-50 flex items-center justify-between text-[11px] font-bold text-stone-500 border-t border-stone-100">
                    <span className="flex items-center gap-1 text-blue-600"><ThumbsUp className="w-3.5 h-3.5 fill-blue-600/10" /> {selectedPost.likes} Likes</span>
                    <span className="flex items-center gap-1 text-purple-600"><MessageSquare className="w-3.5 h-3.5" /> {selectedPost.comments} Comments</span>
                    {selectedPost.clicks > 0 && (
                      <span className="flex items-center gap-1 text-emerald-600"><MousePointerClick className="w-3.5 h-3.5" /> {selectedPost.clicks} GMB Clicks</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-5">
                <Button variant="secondary" className="w-full text-xs font-bold h-9 bg-white" onClick={() => setSelectedPost(null)}>
                  Close Details
                </Button>
              </div>
            </div>

            {/* Right side: Detailed Analytics & Post Comments */}
            <div className="flex-1 flex flex-col h-full bg-white">
              {/* Header */}
              <div className="px-6 py-5 border-b border-stone-200 flex justify-between items-start">
                <div>
                  <h3 className="font-extrabold text-stone-900 text-lg leading-tight">Post Insights</h3>
                  <p className="text-xs text-stone-500 mt-1 max-w-[400px] truncate">{selectedPost.prompt_text}</p>
                </div>
                <button 
                  onClick={() => setSelectedPost(null)}
                  className="p-1 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-900 transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Scrollable metrics details */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Platform metrics grid */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Metrics Breakdown by Channel</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* FB Breakdown */}
                    {selectedPost.details.facebook && (
                      <div className="bg-blue-50/30 border border-blue-100 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-blue-700 text-xs">
                          <PlatformIcon platform="facebook" size="sm" /> Facebook Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white rounded-lg p-2 border border-blue-50">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Reach</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.facebook.reach.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-blue-50">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Likes</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.facebook.likes}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-blue-50">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Comments</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.facebook.comments}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-blue-50">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Shares</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.facebook.shares}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* IG Breakdown */}
                    {selectedPost.details.instagram && (
                      <div className="bg-pink-50/20 border border-pink-100/60 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-pink-700 text-xs">
                          <PlatformIcon platform="instagram" size="sm" /> Instagram Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white rounded-lg p-2 border border-pink-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Reach</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.instagram.reach.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-pink-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Likes</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.instagram.likes}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-pink-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Comments</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.instagram.comments}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-pink-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Saves</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.instagram.saved}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* GMB Breakdown */}
                    {selectedPost.details.gmb && (
                      <div className="bg-amber-50/20 border border-amber-100/60 rounded-xl p-4 space-y-3 sm:col-span-2">
                        <div className="flex items-center gap-1.5 font-bold text-amber-700 text-xs">
                          <PlatformIcon platform="gmb" size="sm" /> Google GMB Post Metrics
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white rounded-lg p-2 border border-amber-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Views</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.gmb.views.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-amber-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">CTA Clicks</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.gmb.clicks}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-amber-50/40">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Directions</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.gmb.direction_requests}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Twitter/X Breakdown */}
                    {selectedPost.details.twitter && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-slate-900 text-xs">
                          <PlatformIcon platform="twitter" size="sm" /> X (Twitter) Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white rounded-lg p-2 border border-slate-100">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Impressions</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.twitter.impressions.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-slate-100">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Likes</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.twitter.likes}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-slate-100">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Retweets</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.twitter.retweets}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-slate-100">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Replies</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.twitter.replies}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* YouTube Breakdown */}
                    {selectedPost.details.youtube && (
                      <div className="bg-red-50/20 border border-red-100/60 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-1.5 font-bold text-red-700 text-xs">
                          <PlatformIcon platform="youtube" size="sm" /> YouTube Metrics
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div className="bg-white rounded-lg p-2 border border-red-50/30">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Views</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.youtube.views.toLocaleString('en-IN')}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-red-50/30">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Likes</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.youtube.likes}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-red-50/30">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Comments</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.youtube.comments}</p>
                          </div>
                          <div className="bg-white rounded-lg p-2 border border-red-50/30">
                            <p className="text-[10px] text-stone-400 font-bold uppercase">Shares</p>
                            <p className="text-base font-extrabold text-stone-900 mt-0.5">{selectedPost.details.youtube.shares}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Post Comments Section with AI suggestion replying */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-stone-400 uppercase tracking-wider">Comments on this post</h4>
                    <span className="text-xs text-stone-500 font-semibold">{getFilteredComments().length} feedback items</span>
                  </div>

                  <div className="space-y-4 divide-y divide-stone-100">
                    {getFilteredComments().length === 0 ? (
                      <p className="text-center py-6 text-xs text-stone-400 font-medium">
                        No comments recorded for this post yet.
                      </p>
                    ) : (
                      getFilteredComments().map((comment) => (
                        <div key={comment.id} className="pt-4 first:pt-0 space-y-2">
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-stone-100 border flex items-center justify-center text-xs font-bold text-stone-600">
                                {comment.customer_name[0]}
                              </div>
                              <div>
                                <p className="text-xs font-bold text-stone-900 leading-tight">{comment.customer_name}</p>
                                <p className="text-[9px] text-stone-400 mt-0.5">
                                  {new Date(comment.received_at).toLocaleDateString('en-IN')}
                                </p>
                              </div>
                            </div>

                            {/* Sentiment tag */}
                            <Badge 
                              className={`text-[9px] font-bold px-1.5 py-0 border ${
                                comment.sentiment === 'positive' 
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                  : comment.sentiment === 'negative'
                                  ? 'bg-amber-50 text-amber-700 border-amber-250'
                                  : 'bg-stone-50 text-stone-600 border-stone-200'
                              }`}
                            >
                              {comment.sentiment}
                            </Badge>
                          </div>

                          <p className="text-xs font-medium text-stone-700 pl-9">
                            "{comment.message_text}"
                          </p>

                          {/* Reply Box */}
                          <div className="pl-9">
                            {comment.reply_text ? (
                              <div className="bg-stone-50 rounded-lg p-3 text-[11px] font-medium border border-stone-200 space-y-1">
                                <div className="flex items-center gap-1 text-stone-400 font-bold mb-0.5">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Answered Response
                                </div>
                                <p className="text-stone-700 leading-relaxed">{comment.reply_text}</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <Button
                                    variant="secondary"
                                    onClick={() => handleSuggestReply(comment.id)}
                                    isLoading={suggestingReply[comment.id]}
                                    className="h-7 py-0.5 px-2 text-[10px] font-bold flex items-center gap-1 bg-white"
                                  >
                                    <Sparkles className="w-3 h-3 text-orange-600" /> Pre-fill AI Reply
                                  </Button>
                                </div>

                                {replyInputs[comment.id] !== undefined && (
                                  <div className="space-y-2">
                                    <textarea
                                      value={replyInputs[comment.id]}
                                      onChange={(e) => setReplyInputs(prev => ({ ...prev, [comment.id]: e.target.value }))}
                                      className="w-full text-xs border rounded-lg p-2.5 focus:outline-none focus:ring-1 focus:ring-orange-600 bg-stone-50"
                                      rows={2}
                                      placeholder="Write or edit reply..."
                                    />
                                    <div className="flex justify-end gap-1.5">
                                      <Button 
                                        variant="ghost"
                                        onClick={() => setReplyInputs(prev => {
                                          const copy = { ...prev };
                                          delete copy[comment.id];
                                          return copy;
                                        })}
                                        className="h-7 px-2.5 text-[10px]"
                                      >
                                        Cancel
                                      </Button>
                                      <Button 
                                        onClick={() => handleSendReply(comment.id)}
                                        isLoading={submittingReply[comment.id]}
                                        className="h-7 px-2.5 text-[10px]"
                                      >
                                        Send Reply
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
