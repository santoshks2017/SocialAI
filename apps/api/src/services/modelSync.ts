import { prisma } from '../db/prisma.js';
import { CARDEKHO_OEM_DATABASE } from '../data/cardekhoOemDb.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load models from the scraped JSON file and merge with fallback OEM database
const modelsMap = new Map<string, any>();

// 1. Add mock models first
for (const m of CARDEKHO_OEM_DATABASE) {
  modelsMap.set(m.canonical_id, m);
}

// 2. Add/overwrite with scraped models if they exist
try {
  const jsonPath = path.resolve(__dirname, '../data/fullScrapedModels.json');
  if (fs.existsSync(jsonPath)) {
    const scraped = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    for (const m of scraped) {
      modelsMap.set(m.canonical_id, m);
    }
  }
} catch (e) {
  console.error('Error loading fullScrapedModels.json', e);
}

const ALL_MODELS = Array.from(modelsMap.values());

export async function syncDealerModels(dealer_id: string, brands: string[]) {
  // Update the dealer's profile with selected brands
  await prisma.dealer.update({
    where: { id: dealer_id },
    data: { brands },
  });

  for (const brand of brands) {
    // Fetch models for this brand from our combined database
    const mockModels = ALL_MODELS.filter(
      (m) => m.brand.toLowerCase() === brand.toLowerCase()
    );

    // Save matched models in database
    for (const model of mockModels) {
      const existing = await prisma.syncedModel.findUnique({
        where: {
          dealer_id_canonical_id: {
            dealer_id,
            canonical_id: model.canonical_id
          }
        }
      });

      if (existing && existing.source === 'manual_upload') {
        // Skip overwriting user-customized/manually added models
        continue;
      }

      await prisma.syncedModel.upsert({
        where: {
          dealer_id_canonical_id: {
            dealer_id,
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
          dealer_id,
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
    }
  }
}
