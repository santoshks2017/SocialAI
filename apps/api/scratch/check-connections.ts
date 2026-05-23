import { prisma } from '../src/db/prisma.js';

async function main() {
  const platformConnections = await prisma.platformConnection.findMany();
  console.log('--- Platform Connections ---');
  console.log(platformConnections.map(c => ({
    id: c.id,
    dealer_id: c.dealer_id,
    platform: c.platform,
    account_id: c.platform_account_id,
    account_name: c.platform_account_name,
    is_connected: c.is_connected
  })));

  const socialConnections = await prisma.socialConnection.findMany();
  console.log('--- Social Connections (New) ---');
  console.log(socialConnections.map(c => ({
    id: c.id,
    dealer_id: c.dealer_id,
    platform: c.platform,
    account_id: c.account_id,
    account_name: c.account_name,
    is_active: c.is_active
  })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
