import { prisma } from '../db/prisma.js';
import { CARDEKHO_OEM_DATABASE } from '../data/cardekhoOemDb.js';

export async function syncDealerModels(dealer_id: string, brands: string[]) {
  // Update the dealer's profile with selected brands
  await prisma.dealer.update({
    where: { id: dealer_id },
    data: { brands },
  });

  for (const brand of brands) {
    // Fetch models for this brand from our mock database
    const mockModels = CARDEKHO_OEM_DATABASE.filter(
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
