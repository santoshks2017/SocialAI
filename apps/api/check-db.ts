import { prisma } from './src/db/prisma.js';

async function main() {
  const dealers = await prisma.dealer.findMany();
  console.log('Dealers:', dealers.length);
  if (dealers.length > 0) {
    console.log('First dealer id:', dealers[0]?.id);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
