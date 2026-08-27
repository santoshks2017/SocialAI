import { prisma } from '../apps/api/src/db/prisma.js';
import fs from 'fs';
import path from 'path';

async function main() {
  const models = await prisma.syncedModel.findMany({
    where: {
      source: 'cardekho_oem_db'
    },
    orderBy: {
      synced_at: 'desc'
    }
  });

  const uniqueModelsMap = new Map<string, any>();
  for (const model of models) {
    if (!uniqueModelsMap.has(model.canonical_id)) {
      uniqueModelsMap.set(model.canonical_id, {
        brand: model.brand,
        model_name: model.model_name,
        canonical_id: model.canonical_id,
        alias_names: model.alias_names,
        variants: model.variants,
        colours: model.colours,
        images: model.images
      });
    }
  }

  const uniqueModelsList = Array.from(uniqueModelsMap.values());
  console.log(`Found ${uniqueModelsList.length} unique models to export.`);

  const outputPath = path.resolve('apps/api/src/data/fullScrapedModels.json');
  // Ensure the directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(uniqueModelsList, null, 2), 'utf-8');
  console.log(`Successfully exported unique models to ${outputPath}`);
}

main();
