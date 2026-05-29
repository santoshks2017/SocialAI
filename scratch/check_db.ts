import { prisma } from '../apps/api/src/db/prisma.js';

async function main() {
  const count = await prisma.syncedModel.count();
  console.log(`Total models in SyncedModel table: ${count}`);
  
  const sample = await prisma.syncedModel.findMany({
    take: 5,
    select: {
      brand: true,
      model_name: true,
      variants: true,
      source: true
    }
  });
  console.log('Sample models:', sample);
}

main();
