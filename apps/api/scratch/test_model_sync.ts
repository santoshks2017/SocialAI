import { prisma } from '../src/db/prisma.js';
import { CARDEKHO_OEM_DATABASE } from '../src/data/cardekhoOemDb.js';

async function main() {
  console.log("=== OEM Model Sync & Auto-Image Selection Dry Run ===");

  // Find a dealer or create a dummy one
  let dealer = await prisma.dealer.findFirst();
  if (!dealer) {
    console.log("Creating a dummy dealer for testing...");
    dealer = await prisma.dealer.create({
      data: {
        name: "Test Dealership",
        phone: "1234567890",
        city: "Mumbai",
        state: "Maharashtra",
      }
    });
  }

  const dealerId = dealer.id;
  console.log(`Using dealer: ${dealer.name} (ID: ${dealerId})`);

  // 1. Sync brands (e.g. Maruti Suzuki, Hyundai)
  const brandsToSync = ["Hyundai", "Maruti Suzuki"];
  console.log(`Syncing brands: ${brandsToSync.join(", ")}...`);

  await prisma.dealer.update({
    where: { id: dealerId },
    data: { brands: brandsToSync },
  });

  let syncCount = 0;
  for (const brand of brandsToSync) {
    const mockModels = CARDEKHO_OEM_DATABASE.filter(
      (m) => m.brand.toLowerCase() === brand.toLowerCase()
    );
    console.log(`Found ${mockModels.length} models in CARDEKHO_OEM_DATABASE for brand ${brand}`);

    for (const model of mockModels) {
      await prisma.syncedModel.upsert({
        where: {
          dealer_id_canonical_id: {
            dealer_id: dealerId,
            canonical_id: model.canonical_id
          }
        },
        update: {
          model_name: model.model_name,
          alias_names: model.alias_names,
          variants: model.variants,
          colours: model.colours as any,
          images: model.images as any,
          synced_at: new Date(),
          source: 'cardekho_oem_db'
        },
        create: {
          dealer_id: dealerId,
          brand: model.brand,
          model_name: model.model_name,
          canonical_id: model.canonical_id,
          alias_names: model.alias_names,
          variants: model.variants,
          colours: model.colours as any,
          images: model.images as any,
          source: 'cardekho_oem_db'
        }
      });
      syncCount++;
    }
  }

  console.log(`Successfully synced ${syncCount} models to database.`);

  // 2. Test prompt matching
  const testPrompts = [
    "Come check out the new Maruti Swift today!",
    "Diwali discount on Hyundai Creta SX model",
    "Compare the Fortuner and Thar", // "thar" or "fortuner" won't match since they are not Hyundai/Maruti
    "Custom offer for any customer"
  ];

  console.log("\n--- Testing Model Detection from Prompts ---");
  const syncedModels = await prisma.syncedModel.findMany({
    where: { dealer_id: dealerId }
  });

  for (const prompt of testPrompts) {
    const lowerPrompt = prompt.toLowerCase();
    let matched = null;

    for (const model of syncedModels) {
      const matchAlias = model.alias_names.some((alias: string) =>
        lowerPrompt.includes(alias.toLowerCase())
      );
      if (matchAlias) {
        matched = model;
        break;
      }
    }

    if (matched) {
      console.log(`Prompt: "${prompt}"`);
      console.log(`   👉 Match found: ${matched.brand} ${matched.model_name} (Canonical ID: ${matched.canonical_id})`);
      const defaultImg = (matched.colours as any)?.[0]?.images?.find((img: any) => img.angle === 'front_exterior')?.url 
        || (matched.images as any)?.find((img: any) => img.angle === 'front_exterior')?.url 
        || (matched.images as any)?.[0]?.url;
      console.log(`   👉 Default image: ${defaultImg}`);
    } else {
      console.log(`Prompt: "${prompt}"`);
      console.log(`   ❌ No match found.`);
    }
  }

  console.log("\n=== Dry Run Completed Successfully ===");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
