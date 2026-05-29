import { prisma } from '../apps/api/src/db/prisma.js';

async function main() {
  try {
    const dealers = await prisma.dealer.findMany();
    console.log('Dealers in Database:', dealers.map(d => ({ id: d.id, name: d.name, phone: d.phone })));
  } catch (e) {
    console.error('Error querying dealers:', e);
  }
}

main();
