import 'dotenv/config';
import { FirestoreCollection, firestore } from './firestore.js';
import type {
  Dealer,
  DealerUser,
  PlatformConnection,
  Template,
  Prompt,
  Post,
  BoostCampaign,
  InboxMessage,
  InventoryItem,
  Lead,
  ActivityLog,
  Subscription,
  InspirationHandle,
  SyncedModel,
  AutoReplyRule,
  AutoReplyTemplate,
  DealerStyle,
  UserSession,
  SocialConnection,
} from '../generated/client/index.js';

// Prisma-compatible Firestore database adapter with strong typing
class FirestoreDb {
  dealer = new FirestoreCollection<Dealer>('dealers');
  dealerUser = new FirestoreCollection<DealerUser>('dealer_users');
  post = new FirestoreCollection<Post>('posts');
  platformConnection = new FirestoreCollection<PlatformConnection>('platform_connections');
  activityLog = new FirestoreCollection<ActivityLog>('activity_logs');
  inboxMessage = new FirestoreCollection<InboxMessage>('inbox_messages');
  autoReplyRule = new FirestoreCollection<AutoReplyRule>('auto_reply_rules');
  autoReplyTemplate = new FirestoreCollection<AutoReplyTemplate>('auto_reply_templates');
  inspirationHandle = new FirestoreCollection<InspirationHandle>('inspiration_handles');
  lead = new FirestoreCollection<Lead>('leads');
  syncedModel = new FirestoreCollection<SyncedModel>('synced_models');
  subscription = new FirestoreCollection<Subscription>('subscriptions');
  socialConnection = new FirestoreCollection<SocialConnection>('social_connections');
  boostCampaign = new FirestoreCollection<BoostCampaign>('boost_campaigns');
  inventoryItem = new FirestoreCollection<InventoryItem>('inventory_items');
  dealerStyle = new FirestoreCollection<DealerStyle>('dealer_styles');
  userSession = new FirestoreCollection<UserSession>('user_sessions');
  prompt = new FirestoreCollection<Prompt>('prompts');
  template = new FirestoreCollection<Template>('templates');
  mediaAsset = new FirestoreCollection<any>('media_assets');
  systemSetting = new FirestoreCollection<any>('system_settings');
  postAnalytics = new FirestoreCollection<any>('post_analytics');
  publishLog = new FirestoreCollection<any>('publish_logs');

  [key: string]: any;

  async $transaction<T>(arg: ((tx: FirestoreDb) => Promise<T>) | Promise<any>[]): Promise<any> {
    if (typeof arg === 'function') {
      return arg(this);
    }
    if (Array.isArray(arg)) {
      return Promise.all(arg);
    }
    return arg;
  }

  async $connect() {
    console.log('[Firestore] Connected to Google Cloud Firestore (default)');
  }

  async $disconnect() {
    // No-op for Firestore
  }
}

const baseDb = new FirestoreDb();

// Proxy to dynamically handle any unknown model collection
export const prisma: FirestoreDb = new Proxy(baseDb, {
  get(target, prop: string) {
    if (prop in target) {
      return (target as any)[prop];
    }
    if (typeof prop === 'string' && !prop.startsWith('$')) {
      const colName = prop.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() + 's';
      const col = new FirestoreCollection(colName);
      (target as any)[prop] = col;
      return col;
    }
    return (target as any)[prop];
  },
});

// Seed initial default dealer and admin user if Firestore is empty
async function seedDefaultDataIfNeeded() {
  try {
    const existingDealer = await prisma.dealer.findFirst();
    if (!existingDealer) {
      console.log('[Firestore] Seeding initial default dealer and admin user...');
      const dealer = await prisma.dealer.create({
        data: {
          id: 'demo-dealer-001',
          name: 'CarDekho Apex Motors (Demo)',
          city: 'Mumbai',
          phone: '9876543210',
          email: 'dealer@cardekho.com',
          plan: 'enterprise',
          onboarding_completed: true,
          onboarding_step: 4,
          primary_color: '#FF5722',
          secondary_color: '#1A1A2E',
        },
      });

      await prisma.dealerUser.create({
        data: {
          id: 'demo-user-001',
          dealer_id: dealer.id,
          name: 'Apex Admin',
          phone: '9876543210',
          email: 'admin@cardekho.com',
          role: 'owner',
          onboarding_completed: true,
          onboarding_step: 4,
          permissions: {
            create_post: true,
            approve_post: true,
            publish_post: true,
            run_boost: true,
            manage_inventory: true,
            view_reports: true,
            view_inbox: true,
            reply_inbox: true,
            manage_users: true,
            view_billing: true,
          },
        },
      });
      console.log('[Firestore] ✅ Default dealer and user seeded successfully.');
    }
  } catch (err: any) {
    console.warn('[Firestore] Seed notice:', err?.message || err);
  }
}

// Run in next tick
setTimeout(() => {
  seedDefaultDataIfNeeded().catch(() => {});
}, 100);
