export type Platform = 'facebook' | 'instagram' | 'gmb';
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'partially_published' | 'failed';
export type VehicleCondition = 'new' | 'used';
export type VehicleStatus = 'in_stock' | 'sold' | 'reserved';
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';
export type MessageType = 'comment' | 'dm' | 'review';
export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Tag = 'lead' | 'complaint' | 'general' | 'spam';
export type PlanType = 'starter' | 'growth' | 'enterprise';
export interface Dealer {
    id: string;
    phone: string;
    email?: string;
    name: string;
    city: string;
    state?: string;
    latitude?: number;
    longitude?: number;
    brands: string[];
    showroomType: ShowroomType[];
    logoUrl?: string;
    primaryColor: string;
    secondaryColor: string;
    contactPhone?: string;
    whatsappNumber?: string;
    plan: PlanType;
    planExpiresAt?: string;
    onboardingStep: number;
    onboardingCompleted: boolean;
    languagePreferences: Language[];
    region: Region;
    timezone: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export type ShowroomType = 'new_car' | 'pre_owned' | 'two_wheeler' | 'multi_brand';
export type Language = 'en' | 'hi' | 'ta' | 'te' | 'kn' | 'ml' | 'mr';
export type Region = 'north_india' | 'south_india' | 'east_india' | 'west_india' | 'maharashtra' | 'karnataka' | 'tamil_nadu' | 'kerala' | 'telangana' | 'gujarat' | 'punjab' | 'rajasthan';
export interface PlatformConnection {
    id: string;
    dealerId: string;
    platform: Platform;
    platformAccountId: string;
    platformAccountName?: string;
    isConnected: boolean;
    tokenExpiresAt?: string;
    adAccountId?: string;
    lastSyncAt?: string;
    createdAt: string;
    updatedAt: string;
}
export interface Template {
    id: string;
    name: string;
    category: TemplateCategory;
    spec: TemplateSpec;
    thumbnailUrl?: string;
    platforms: Platform[];
    regionalVariants: Language[];
    festivalId?: string;
    isActive: boolean;
    usageCount: number;
    createdAt: string;
    updatedAt: string;
}
export type TemplateCategory = 'new_arrival' | 'festival_offer' | 'service_camp' | 'testimonial' | 'inventory_showcase' | 'engagement' | 'seasonal';
export interface TemplateSpec {
    templateId: string;
    category: TemplateCategory;
    name: string;
    platforms: Platform[];
    dimensions: Record<Platform, {
        width: number;
        height: number;
    }>;
    layers: TemplateLayer[];
    colorScheme: 'dark' | 'light';
    regionalVariants: Language[];
    tags: string[];
}
export type TemplateLayer = BackgroundLayer | ImageLayer | TextLayer;
export interface BackgroundLayer {
    type: 'background';
    source: 'solid_color' | 'gradient' | 'image';
    color?: string;
    gradientColors?: [string, string];
    imageUrl?: string;
    fallbackColor: string;
}
export interface ImageLayer {
    type: 'image';
    source: 'inventory_image' | 'dealer_logo' | 'testimonial_photo' | 'static';
    imageUrl?: string;
    position: {
        x: string | number;
        y: string | number;
    };
    size: {
        width: string | number;
        height: string | number;
    };
    fallback?: string;
}
export interface TextLayer {
    type: 'text';
    content: string;
    font: string;
    size: number;
    color: string;
    position: {
        x: string | number;
        y: string | number;
    };
    maxWidth?: string;
    maxLines?: number;
}
export interface Prompt {
    id: string;
    category: PromptCategory;
    textEn: string;
    textHi?: string;
    textRegional?: Record<string, string>;
    isActive: boolean;
    usageCount: number;
    sortOrder: number;
    createdAt: string;
    updatedAt: string;
}
export type PromptCategory = 'new_arrival' | 'festival_offer' | 'service_camp' | 'testimonial' | 'showcase' | 'engagement';
export interface Post {
    id: string;
    dealerId: string;
    promptText: string;
    promptId?: string;
    selectedVariantIndex?: number;
    captionText?: string;
    captionHashtags: string[];
    creativeUrls?: Record<Platform, string>;
    templateId?: string;
    inventoryItemIds: string[];
    platforms: Platform[];
    status: PostStatus;
    scheduledAt?: string;
    publishedAt?: string;
    publishResults?: PublishResult[];
    metrics?: PostMetrics;
    metricsLastFetched?: string;
    createdAt: string;
    updatedAt: string;
}
export interface PublishResult {
    platform: Platform;
    status: 'success' | 'failed';
    postId?: string;
    postUrl?: string;
    error?: string;
    publishedAt?: string;
}
export interface PostMetrics {
    facebook?: PlatformMetrics;
    instagram?: PlatformMetrics;
    gmb?: GmbMetrics;
}
export interface PlatformMetrics {
    reach: number;
    likes: number;
    comments: number;
    shares?: number;
    saves?: number;
}
export interface GmbMetrics {
    views: number;
    clicks: number;
    directionRequests: number;
}
export interface CreativeVariant {
    id: number;
    template: string;
    templateId: string;
    background: string;
    caption: string;
    hashtags: string[];
    emoji: string[];
    platformNotes?: string;
    creativeUrls?: Record<Platform, string>;
}
export interface CaptionVariant {
    captionText: string;
    hashtags: string[];
    suggestedEmoji: string[];
    platformNotes?: string;
    language: Language;
}
export interface AIGenerationResponse {
    variants: CaptionVariant[];
    suggestedPostingTime?: string;
    matchedTemplateCategory?: TemplateCategory;
}
export interface BoostCampaign {
    id: string;
    dealerId: string;
    postId: string;
    metaCampaignId?: string;
    metaAdsetId?: string;
    metaAdId?: string;
    dailyBudget: number;
    durationDays: number;
    startDate?: string;
    endDate?: string;
    targetingSpec: TargetingSpec;
    status: CampaignStatus;
    totalSpent: number;
    metrics?: BoostMetrics;
    metricsLastFetched?: string;
    createdAt: string;
    updatedAt: string;
}
export interface TargetingSpec {
    location: {
        city: string;
        latitude: number;
        longitude: number;
        radius: number;
        unit: 'kilometer';
    };
    ageMin: number;
    ageMax: number;
    gender?: 'all' | 'male' | 'female';
    interests?: Array<{
        id: string;
        name: string;
    }>;
    language?: string;
}
export interface BoostMetrics {
    reach: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
    spend: number;
    calls?: number;
}
export interface InboxMessage {
    id: string;
    dealerId: string;
    platform: Platform;
    messageType: MessageType;
    platformMessageId: string;
    postId?: string;
    customerName: string;
    customerAvatarUrl?: string;
    customerPlatformId?: string;
    messageText: string;
    sentiment?: Sentiment;
    tag?: Tag;
    aiSuggestedReply?: string;
    replyText?: string;
    repliedAt?: string;
    isRead: boolean;
    requiresApproval: boolean;
    receivedAt: string;
    createdAt: string;
    updatedAt: string;
}
export interface Lead {
    id: string;
    dealerId: string;
    customerName?: string;
    customerPhone?: string;
    sourcePlatform?: Platform;
    sourceType?: 'post' | 'campaign' | 'inbox';
    sourcePostId?: string;
    sourceCampaignId?: string;
    sourceMessageId?: string;
    vehicleInterest?: string;
    notes?: string;
    createdAt: string;
    updatedAt: string;
}
export interface InventoryItem {
    id: string;
    dealerId: string;
    make: string;
    model: string;
    variant?: string;
    year: number;
    price: number;
    condition: VehicleCondition;
    color?: string;
    fuelType?: string;
    transmission?: string;
    mileageKm?: number;
    stockCount: number;
    imageUrls: string[];
    status: VehicleStatus;
    source: 'manual' | 'csv' | 'api';
    createdAt: string;
    updatedAt: string;
}
export interface InventoryImportResult {
    totalRows: number;
    successCount: number;
    errorCount: number;
    warnings: string[];
    errors: ImportError[];
}
export interface ImportError {
    row: number;
    field: string;
    message: string;
}
export interface Festival {
    id: string;
    nameEn: string;
    nameHi?: string;
    nameRegional?: Record<string, string>;
    date: string;
    regions: Region[];
    category?: string;
    campaignType?: string;
    templateIds: string[];
    autoSuggestDaysBefore: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}
export interface DashboardStats {
    postsThisMonth: number;
    postsChange: number;
    totalReach: number;
    reachChange: number;
    leadsGenerated: number;
    leadsChange: number;
    inboxPending: number;
    negativeReviews: number;
}
export interface LeadSource {
    source: Platform | 'whatsapp' | 'organic';
    leads: number;
    percentage: number;
}
export interface WeeklyLeadData {
    week: string;
    leads: number;
}
export interface TopPost {
    id: string;
    title: string;
    thumbnail: string;
    platform: Platform[];
    reach: number;
    leads: number;
    boosted: boolean;
    publishedAt: string;
}
export interface MonthlyReport {
    month: string;
    year: number;
    postsPublished: number;
    totalReach: number;
    leads: number;
    adSpend: number;
    topPosts: TopPost[];
    leadSources: LeadSource[];
}
export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface ToastMessage {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message?: string;
    duration?: number;
    action?: {
        label: string;
        onClick: () => void;
    };
}
export interface ModalState {
    isOpen: boolean;
    title?: string;
    content?: React.ReactNode;
    onClose?: () => void;
    onConfirm?: () => void;
}
export interface LoadingState {
    isLoading: boolean;
    error?: string;
}
export interface BadgeProps {
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info';
    size?: 'sm' | 'md' | 'lg';
    children: React.ReactNode;
}
export interface AvatarProps {
    src?: string;
    initials?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}
export interface ProgressBarProps {
    value: number;
    max?: number;
    variant?: 'default' | 'success' | 'warning' | 'error';
    size?: 'sm' | 'md' | 'lg';
    showLabel?: boolean;
    className?: string;
}
export interface TabsProps {
    tabs: Array<{
        id: string;
        label: string;
        icon?: React.ReactNode;
        badge?: number;
    }>;
    activeTab: string;
    onChange: (tabId: string) => void;
    variant?: 'underline' | 'pills' | 'buttons';
    className?: string;
}
export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: string;
    description?: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    className?: string;
}
export interface SkeletonLoaderProps {
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string | number;
    height?: string | number;
    className?: string;
}
export interface DealerFormData {
    name: string;
    phone: string;
    email?: string;
    city: string;
    state?: string;
    brands: string[];
    showroomType: ShowroomType[];
    primaryColor: string;
    secondaryColor: string;
    contactPhone?: string;
    whatsappNumber?: string;
    languagePreferences: Language[];
    region: Region;
}
export interface BoostSetupFormData {
    postId: string;
    dailyBudget: number;
    durationDays: number;
    targeting: TargetingSpec;
}
export interface InventoryUploadData {
    file: File;
    mode: 'append' | 'update' | 'replace';
    columnMapping: Record<string, string>;
}
export interface LeadFormData {
    customerName: string;
    customerPhone?: string;
    sourcePlatform: Platform;
    sourceMessageId?: string;
    vehicleInterest?: string;
    notes?: string;
}
export type AppEventType = 'POST_CREATED' | 'POST_PUBLISHED' | 'POST_FAILED' | 'INVENTORY_UPDATED' | 'BOOST_LAUNCHED' | 'BOOST_COMPLETED' | 'TOKEN_EXPIRED' | 'FESTIVAL_APPROACHING';
export interface AppEvent<T = unknown> {
    type: AppEventType;
    payload: T;
    timestamp: string;
    source: string;
}
//# sourceMappingURL=types.d.ts.map