import { chromium } from 'playwright';
import { prisma } from '../apps/api/src/db/prisma.js';

const BRANDS_MAP = [
  { name: 'Maruti Suzuki', url: 'https://www.cardekho.com/cars/Maruti', slug: 'maruti' },
  { name: 'Hyundai', url: 'https://www.cardekho.com/cars/Hyundai', slug: 'hyundai' },
  { name: 'Tata', url: 'https://www.cardekho.com/cars/Tata', slug: 'tata' },
  { name: 'Mahindra', url: 'https://www.cardekho.com/cars/Mahindra', slug: 'mahindra' },
  { name: 'Honda', url: 'https://www.cardekho.com/cars/Honda', slug: 'honda' },
  { name: 'Toyota', url: 'https://www.cardekho.com/cars/Toyota', slug: 'toyota' },
  { name: 'Kia', url: 'https://www.cardekho.com/cars/Kia', slug: 'kia' }
];

async function main() {
  const dealers = await prisma.dealer.findMany();
  if (dealers.length === 0) {
    console.error('No dealers found in database to seed models for!');
    return;
  }
  console.log(`Found ${dealers.length} dealers to seed models for.`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  for (const brand of BRANDS_MAP) {
    console.log(`\n========================================`);
    console.log(`Scraping Brand: ${brand.name} (${brand.url})`);
    console.log(`========================================`);
    
    try {
      await page.goto(brand.url, { waitUntil: 'networkidle', timeout: 35000 });
      
      // Extract model URLs: pathname split by '/' should be length 2 and start with brand.slug
      const modelUrls = await page.evaluate((slug) => {
        return Array.from(document.querySelectorAll('a'))
          .map(a => a.href)
          .filter(href => {
            try {
              const url = new URL(href);
              if (url.hostname !== 'www.cardekho.com') return false;
              const pathSegments = url.pathname.split('/').filter(Boolean);
              return pathSegments.length === 2 && pathSegments[0] === slug;
            } catch {
              return false;
            }
          });
      }, brand.slug);

      const uniqueModelUrls = Array.from(new Set(modelUrls));
      console.log(`Found ${uniqueModelUrls.length} model pages for ${brand.name}:`, uniqueModelUrls);

      for (const modelUrl of uniqueModelUrls) {
        // Extract model slug from URL
        const modelSlug = modelUrl.split('/').filter(Boolean).pop()!;
        // Make nice title case model name
        const rawModelName = modelSlug.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
        
        console.log(`  Scraping model: ${rawModelName} at ${modelUrl}...`);
        
        const modelPage = await context.newPage();
        try {
          await modelPage.goto(modelUrl, { waitUntil: 'networkidle', timeout: 35000 });
          
          // Get og:image and variants
          const scrapeData = await modelPage.evaluate((name) => {
            // og:image
            const meta = document.querySelector('meta[property="og:image"]');
            const coverImage = meta ? meta.getAttribute('content') : null;
            
            // Variants list
            const modelNameLower = name.toLowerCase();
            const variantLinks = Array.from(document.querySelectorAll('a'))
              .map(el => el.textContent?.trim() || '')
              .filter(text => {
                const lower = text.toLowerCase();
                return (
                  lower.startsWith(modelNameLower + ' ') &&
                  text.length < 50 &&
                  !lower.includes('news') &&
                  !lower.includes('emi') &&
                  !lower.includes('price') &&
                  !lower.includes('compare') &&
                  !lower.includes('review') &&
                  !lower.includes('spec') &&
                  !lower.includes('color') &&
                  !lower.includes('image') &&
                  !lower.includes('video') &&
                  !lower.includes('road') &&
                  !lower.includes('insurance') &&
                  !lower.includes('offers')
                );
              });
              
            // Strip model prefix
            const variants = Array.from(new Set(variantLinks))
              .map(v => v.slice(name.length).trim())
              .filter(Boolean);

            return {
              coverImage,
              variants
            };
          }, rawModelName);

          const finalVariants = scrapeData.variants.length > 0 ? scrapeData.variants : ['Standard'];
          const finalImage = scrapeData.coverImage || 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=800&q=80';
          
          console.log(`    Cover Image: ${finalImage.substring(0, 70)}...`);
          console.log(`    Variants found (${finalVariants.length}):`, finalVariants);

          // Seed for all dealers in the DB
          for (const dealer of dealers) {
            const canonicalId = `${brand.name.toLowerCase().replace(/\s+/g, '_')}_${modelSlug.toLowerCase().replace(/\s+/g, '_')}`;
            
            // Check if model already exists and is a manual edit (protect it!)
            const existing = await prisma.syncedModel.findUnique({
              where: {
                dealer_id_canonical_id: {
                  dealer_id: dealer.id,
                  canonical_id: canonicalId
                }
              }
            });

            if (existing && existing.source === 'manual_upload') {
              console.log(`    [SKIPPED] Protection enabled (source=manual_upload) for dealer ${dealer.name}`);
              continue;
            }

            await prisma.syncedModel.upsert({
              where: {
                dealer_id_canonical_id: {
                  dealer_id: dealer.id,
                  canonical_id: canonicalId
                }
              },
              create: {
                dealer_id: dealer.id,
                brand: brand.name,
                model_name: rawModelName,
                canonical_id: canonicalId,
                alias_names: [modelSlug, `${brand.name.toLowerCase()} ${modelSlug}`],
                variants: finalVariants,
                colours: [
                  {
                    name: 'Default',
                    hex: '#888888',
                    images: [{ angle: 'front_exterior', url: finalImage }]
                  }
                ],
                images: [{ angle: 'front_exterior', url: finalImage }],
                source: 'cardekho_oem_db'
              },
              update: {
                brand: brand.name,
                model_name: rawModelName,
                alias_names: [modelSlug, `${brand.name.toLowerCase()} ${modelSlug}`],
                variants: finalVariants,
                colours: [
                  {
                    name: 'Default',
                    hex: '#888888',
                    images: [{ angle: 'front_exterior', url: finalImage }]
                  }
                ],
                images: [{ angle: 'front_exterior', url: finalImage }],
                source: 'cardekho_oem_db'
              }
            });
          }
          console.log(`    [SUCCESS] Seeded for all dealers.`);
        } catch (err) {
          console.error(`    [ERROR] Failed to scrape details for ${modelUrl}:`, err);
        } finally {
          await modelPage.close();
        }
      }
    } catch (e) {
      console.error(`[ERROR] Failed to scrape brand ${brand.name}:`, e);
    }
  }

  await browser.close();
  console.log('\nSeed script finished successfully!');
}

main();
