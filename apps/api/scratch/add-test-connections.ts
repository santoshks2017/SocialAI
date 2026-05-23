import { prisma } from '../src/db/prisma.js';

async function main() {
  // Let's get all dealer IDs in the database
  const dealers = await prisma.dealer.findMany();
  console.log('Adding test connections for dealers:', dealers.map(d => d.id));

  for (const dealer of dealers) {
    const dealerId = dealer.id;

    // 1. Facebook: Expiring in 5 days (yellow warning)
    const fbExpiry = new Date();
    fbExpiry.setDate(fbExpiry.getDate() + 5);

    await prisma.platformConnection.upsert({
      where: { dealer_id_platform: { dealer_id: dealerId, platform: 'facebook' } },
      create: {
        dealer_id: dealerId,
        platform: 'facebook',
        platform_account_id: `mock_fb_page_id_${dealerId.slice(0, 4)}`,
        platform_account_name: `${dealer.name} FB Page`,
        access_token: 'mock_fb_token_with_expiry',
        token_expires_at: fbExpiry,
        is_connected: true
      },
      update: {
        platform_account_id: `mock_fb_page_id_${dealerId.slice(0, 4)}`,
        platform_account_name: `${dealer.name} FB Page`,
        access_token: 'mock_fb_token_with_expiry',
        token_expires_at: fbExpiry,
        is_connected: true
      }
    });

    await prisma.socialConnection.upsert({
      where: { dealer_id_platform: { dealer_id: dealerId, platform: 'facebook' } },
      create: {
        dealer_id: dealerId,
        platform: 'facebook',
        account_id: `mock_fb_page_id_${dealerId.slice(0, 4)}`,
        account_name: `${dealer.name} FB Page`,
        access_token: 'mock_fb_token_with_expiry',
        token_expires_at: fbExpiry,
        is_active: true
      },
      update: {
        account_id: `mock_fb_page_id_${dealerId.slice(0, 4)}`,
        account_name: `${dealer.name} FB Page`,
        access_token: 'mock_fb_token_with_expiry',
        token_expires_at: fbExpiry,
        is_active: true
      }
    });

    // 2. Instagram: Expired (red warning)
    const igExpiry = new Date();
    igExpiry.setHours(igExpiry.getHours() - 3);

    await prisma.platformConnection.upsert({
      where: { dealer_id_platform: { dealer_id: dealerId, platform: 'instagram' } },
      create: {
        dealer_id: dealerId,
        platform: 'instagram',
        platform_account_id: `mock_ig_id_${dealerId.slice(0, 4)}`,
        platform_account_name: `@${dealer.name.toLowerCase().replace(/\s+/g, '')}_ig`,
        access_token: 'mock_ig_token_expired',
        token_expires_at: igExpiry,
        is_connected: true
      },
      update: {
        platform_account_id: `mock_ig_id_${dealerId.slice(0, 4)}`,
        platform_account_name: `@${dealer.name.toLowerCase().replace(/\s+/g, '')}_ig`,
        access_token: 'mock_ig_token_expired',
        token_expires_at: igExpiry,
        is_connected: true
      }
    });

    await prisma.socialConnection.upsert({
      where: { dealer_id_platform: { dealer_id: dealerId, platform: 'instagram' } },
      create: {
        dealer_id: dealerId,
        platform: 'instagram',
        account_id: `mock_ig_id_${dealerId.slice(0, 4)}`,
        account_name: `@${dealer.name.toLowerCase().replace(/\s+/g, '')}_ig`,
        access_token: 'mock_ig_token_expired',
        token_expires_at: igExpiry,
        is_active: true
      },
      update: {
        account_id: `mock_ig_id_${dealerId.slice(0, 4)}`,
        account_name: `@${dealer.name.toLowerCase().replace(/\s+/g, '')}_ig`,
        access_token: 'mock_ig_token_expired',
        token_expires_at: igExpiry,
        is_active: true
      }
    });
  }

  console.log('Test connections successfully added for all dealers!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
