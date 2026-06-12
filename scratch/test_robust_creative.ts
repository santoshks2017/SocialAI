import 'dotenv/config';
import sharp from 'sharp';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { prisma } from '../apps/api/src/db/prisma.js';
import { runRobustCreativeEngine } from '../apps/api/src/services/robustCreativeEngine.js';
import { ORIGINALS_DIR, CREATIVES_DIR } from '../apps/api/src/routes/upload.js';

async function main() {
  console.log('--- Robust Creative Engine v0 Test Script ---');

  // 1. Ensure directories exist
  await mkdir(ORIGINALS_DIR, { recursive: true });
  await mkdir(CREATIVES_DIR, { recursive: true });

  // 2. Generate a mock delivery photo buffer
  console.log('Generating mock delivery photo...');
  const mockPhotoBuffer = await sharp({
    create: {
      width: 1200,
      height: 900,
      channels: 3,
      background: { r: 80, g: 160, b: 240 } // Light blue background
    }
  })
  .composite([
    {
      input: Buffer.from(`
        <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
          <rect x="100" y="100" width="1000" height="700" fill="none" stroke="white" stroke-width="10" stroke-dasharray="20,10"/>
          <text x="600" y="450" font-family="Arial" font-size="60" font-weight="bold" fill="white" text-anchor="middle">MOCK CAR DELIVERY PHOTO</text>
          <text x="600" y="520" font-family="Arial" font-size="30" fill="white" text-anchor="middle">Ramesh Kumar taking delivery of his new Creta</text>
        </svg>
      `),
      top: 0,
      left: 0
    }
  ])
  .jpeg({ quality: 80 })
  .toBuffer();

  const photoId = 'test_delivery_photo.jpg';
  await writeFile(path.join(ORIGINALS_DIR, photoId), mockPhotoBuffer);
  console.log(`Saved mock delivery photo to ${path.join(ORIGINALS_DIR, photoId)}`);

  // 3. Find a dealer to use
  let dealer = await prisma.dealer.findFirst();
  if (!dealer) {
    console.log('No dealer found in DB. Creating a mock dealer...');
    dealer = await prisma.dealer.create({
      data: {
        name: 'Mock Test Motors',
        phone: '9999988888',
        city: 'Jaipur',
        state: 'Rajasthan',
        primary_color: '#EF4444', // Red
        address: '10, Showroom Road, Jaipur',
        brands: ['Hyundai', 'Tata']
      }
    });
  }
  console.log(`Using dealer: ${dealer.name} (${dealer.id}), Primary Color: ${dealer.primary_color}`);

  // 4. Test run Robust Engine
  console.log('\nRunning Robust Creative Engine (Delivery Photo Path)...');
  const start = Date.now();
  const response = await runRobustCreativeEngine({
    dealerId: dealer.id,
    prompt: 'Ramesh Kumar drives home his brand new Hyundai Creta SUV in style!',
    deliveryPhotoId: photoId
  });
  const duration = Date.now() - start;

  console.log(`Completed in ${duration}ms!`);
  console.log('\n--- ENGINE RESPONSE ---');
  console.log(JSON.stringify(response, null, 2));

  // 5. Verify caching
  console.log('\nRunning again with same input to verify cache hit...');
  const cacheStart = Date.now();
  const cacheResponse = await runRobustCreativeEngine({
    dealerId: dealer.id,
    prompt: 'Ramesh Kumar drives home his brand new Hyundai Creta SUV in style!',
    deliveryPhotoId: photoId
  });
  const cacheDuration = Date.now() - cacheStart;

  console.log(`Completed in ${cacheDuration}ms!`);
  if (cacheDuration < 200) {
    console.log('✅ Success! Cache hit verified (response under 200ms).');
  } else {
    console.log('⚠️ Warning: Second run took longer than expected. Cache might not be working.');
  }

  // 6. Test fallback path (prompt-only)
  console.log('\nRunning Robust Creative Engine (Fallback/Prompt-only Path)...');
  const fallbackStart = Date.now();
  const fallbackResponse = await runRobustCreativeEngine({
    dealerId: dealer.id,
    prompt: 'Special Diwali Discount Offer: Save up to ₹50,000 on bookings this week!'
  });
  const fallbackDuration = Date.now() - fallbackStart;
  console.log(`Completed in ${fallbackDuration}ms!`);
  console.log('\n--- FALLBACK RESPONSE ---');
  console.log(JSON.stringify(fallbackResponse, null, 2));

  // Cleanup DB client
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
