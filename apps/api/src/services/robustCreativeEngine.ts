import { createHash, randomUUID } from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import axios from 'axios';
import sharp from 'sharp';
import { prisma } from '../db/prisma.js';
import { uploadFile } from '../lib/storage.js';
import { getCache, setCache } from '../lib/cache.js';
import { ORIGINALS_DIR, CREATIVES_DIR } from '../routes/upload.js';
import type { DealerBranding } from './layeredCompositor.js';
import { compositeLayered } from './layeredCompositor.js';
import { getBrandLogoSvg } from './brandLogoService.js';
import { generateCopy } from './copyService.js';
import type { CopyOutput } from './copyService.js';
import { renderDeliveryCreatives, wrapText } from './deliveryTemplateRenderer.js';
import { generateGeminiCreativeContent, isGeminiTextAvailable } from './geminiService.js';
import { generateGeminiImage, isGeminiImageAvailable } from './geminiImage.js';
import { generateImage as cfGenerateImage, isCloudflareAvailable } from './cloudflareAI.js';
import { generateOpenRouterImage, isOpenRouterImageAvailable } from './openrouterImage.js';

export interface RobustGenerateRequest {
  dealerId: string;
  prompt: string;
  deliveryPhotoUrl?: string;
  deliveryPhotoId?: string;
  recipientName?: string;
  platforms?: Array<'facebook' | 'instagram' | 'gmb' | 'whatsapp'>;
}

export interface RobustGenerateResponse {
  success: boolean;
  plan: {
    intentType: 'delivery' | 'offer' | 'festival' | 'new_arrival' | 'custom' | 'other';
    renderStrategy: 'delivery_photo_first' | 'image_generation_fallback';
    templateIds: string[];
  };
  copy: {
    headlines: string[];
    captions: string[];
    hashtagsSets: string[][];
  };
  creatives: Array<{
    templateId: string;
    imageUrl: string;
  }>;
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function findDealer(dealerId: string) {
  let dealer = await prisma.dealer.findUnique({ where: { id: dealerId } });
  if (!dealer) {
    // Fallback to any demo dealer
    dealer = await prisma.dealer.findFirst({
      where: { name: { contains: 'demo', mode: 'insensitive' } },
    });
  }
  if (!dealer) {
    dealer = await prisma.dealer.findFirst({
      where: { name: { contains: 'janani', mode: 'insensitive' } },
    });
  }
  if (!dealer) {
    dealer = await prisma.dealer.findFirst();
  }
  return dealer;
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 20000,
  });
  return Buffer.from(response.data);
}

// Gradient background generator for fallback path
async function generateGradientBackground(primaryColor = '#f97316'): Promise<Buffer> {
  const color = primaryColor.startsWith('#') ? primaryColor : '#f97316';
  const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0c14"/>
        <stop offset="60%" stop-color="#141824"/>
        <stop offset="100%" stop-color="#1e1030"/>
      </linearGradient>
      <radialGradient id="glow" cx="70%" cy="35%" r="55%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="20%" cy="80%" r="40%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#g1)"/>
    <rect width="1080" height="1080" fill="url(#glow)"/>
    <rect width="1080" height="1080" fill="url(#glow2)"/>
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="1080" stroke="white" stroke-opacity="0.02"/>`).join('')}
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="1080" y2="${i * 90}" stroke="white" stroke-opacity="0.02"/>`).join('')}
    <line x1="0" y1="1080" x2="1080" y2="0" stroke="${color}" stroke-opacity="0.06" stroke-width="180"/>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Robust Creative Engine Orchestrator
 */
export async function runRobustCreativeEngine(input: RobustGenerateRequest): Promise<RobustGenerateResponse> {
  const dealer = await findDealer(input.dealerId);
  if (!dealer) {
    throw new Error('No dealer found in database to execute request');
  }

  const promptText = input.prompt ? input.prompt.trim() : '';
  if (!promptText) {
    throw new Error('prompt is a required field');
  }

  const isDeliveryPhoto = !!(input.deliveryPhotoId || input.deliveryPhotoUrl);
  const promptHash = sha256(dealer.id + promptText.toLowerCase() + 'v0');

  // Compute intentType
  let intentType: RobustGenerateResponse['plan']['intentType'] = 'custom';
  if (isDeliveryPhoto || promptText.toLowerCase().includes('delivery') || promptText.toLowerCase().includes('congratulations')) {
    intentType = 'delivery';
  } else if (promptText.toLowerCase().includes('offer') || promptText.toLowerCase().includes('discount') || promptText.toLowerCase().includes('emi')) {
    intentType = 'offer';
  } else if (promptText.toLowerCase().includes('diwali') || promptText.toLowerCase().includes('festive') || promptText.toLowerCase().includes('eid') || promptText.toLowerCase().includes('celebrat')) {
    intentType = 'festival';
  } else if (promptText.toLowerCase().includes('new') || promptText.toLowerCase().includes('launch') || promptText.toLowerCase().includes('arrival')) {
    intentType = 'new_arrival';
  }

  // --- PATH 1: Delivery Photo First ---
  if (isDeliveryPhoto) {
    // 1. Get photo buffer and hash
    let imageBuffer: Buffer;
    let photoHash: string;

    if (input.deliveryPhotoId) {
      const filepath = path.join(ORIGINALS_DIR, input.deliveryPhotoId);
      imageBuffer = await readFile(filepath);
      photoHash = input.deliveryPhotoId;
    } else {
      imageBuffer = await fetchImageBuffer(input.deliveryPhotoUrl!);
      photoHash = sha256(imageBuffer);
    }

    // 2. Check Copy Cache
    const copyCacheKey = `copy:${dealer.id}:${intentType}:${promptHash}:hinglish`;
    let copyData = await getCache<CopyOutput>(copyCacheKey);
    if (!copyData) {
      copyData = await generateCopy({
        prompt: promptText,
        dealerName: dealer.name,
        city: dealer.city,
        intentType,
        languageMode: 'hinglish'
      });
      await setCache(copyCacheKey, copyData, 86400 * 7); // cache copy for 7 days
    }

    // 3. Check Creatives Cache
    const headline = copyData.headlines[0] || 'Congratulations!';
    const headlineHash = sha256(headline);
    const creativeCacheKey = `delivery:${dealer.id}:${photoHash}:${headlineHash}`;
    const cachedCreatives = await getCache<RobustGenerateResponse['creatives']>(creativeCacheKey);

    if (cachedCreatives) {
      return {
        success: true,
        plan: {
          intentType,
          renderStrategy: 'delivery_photo_first',
          templateIds: ['delivery_frame_a', 'delivery_frame_b']
        },
        copy: {
          headlines: copyData.headlines,
          captions: copyData.captions,
          hashtagsSets: copyData.hashtagsSets
        },
        creatives: cachedCreatives
      };
    }

    // 4. Load dealer branding
    const branding: DealerBranding = {
      name: dealer.name,
      city: dealer.city,
      phone: dealer.contact_phone ?? dealer.phone,
      primaryColor: dealer.primary_color ?? '#1A1A2E',
      font: dealer.font ?? 'Arial'
    };

    const addressText = dealer.address || [dealer.city, dealer.state].filter(Boolean).join(', ');
    if (addressText) branding.address = addressText;

    const whatsappNum = dealer.whatsapp_number ?? dealer.contact_phone ?? dealer.phone;
    if (whatsappNum) branding.whatsapp = whatsappNum;

    if (dealer.logo_url) {
      try {
        const logoFilename = path.basename(dealer.logo_url);
        const localLogoPath = path.join(ORIGINALS_DIR, logoFilename);
        try {
          branding.logoBuffer = await readFile(localLogoPath);
        } catch {
          const logoRes = await axios.get(dealer.logo_url, {
            responseType: 'arraybuffer',
            timeout: 10000
          });
          if (logoRes.status === 200) {
            branding.logoBuffer = Buffer.from(logoRes.data);
          }
        }
      } catch (err) {
        console.warn(`Failed to load dealer logo from: ${dealer.logo_url}`, err);
      }
    }

    const activeBrand = (Array.isArray(dealer.brands) && dealer.brands.length > 0) ? (dealer.brands[0] as string) : 'Car';
    branding.brandLogoSvg = getBrandLogoSvg(activeBrand, '#ffffff');

    // 5. Render Templates
    const filePrefix = randomUUID();
    let renderResult = await renderDeliveryCreatives({
      imageBuffer,
      headline,
      dealer: branding,
      outputDir: CREATIVES_DIR,
      filePrefix
    });

    // 6. Run Validators (Cheap)
    const validate = (buf: Buffer): boolean => {
      // Must be > 10KB to ensure it's a valid rendered image
      if (buf.length < 10000) return false;
      // Wrap count validate: we verify that wrapText returns <= 2 lines
      const wrapLines = wrapText(headline, 28, 2);
      if (wrapLines.length > 2) return false;
      return true;
    };

    const isAValid = validate(renderResult.deliveryFrameA.buffer);
    const isBValid = validate(renderResult.deliveryFrameB.buffer);

    // If validation fails, re-render overlays with sanitized headline
    if (!isAValid || !isBValid) {
      const safeHeadline = headline.substring(0, 50).replace(/[<>&'"]/g, '');
      renderResult = await renderDeliveryCreatives({
        imageBuffer,
        headline: safeHeadline,
        dealer: branding,
        outputDir: CREATIVES_DIR,
        filePrefix
      });
    }

    // 7. Upload to Storage (returns S3 URL or local path URL)
    const urlA = await uploadFile(
      renderResult.deliveryFrameA.buffer,
      `creatives/${renderResult.deliveryFrameA.filename}`,
      'image/jpeg',
      CREATIVES_DIR
    );

    const urlB = await uploadFile(
      renderResult.deliveryFrameB.buffer,
      `creatives/${renderResult.deliveryFrameB.filename}`,
      'image/jpeg',
      CREATIVES_DIR
    );

    const creativesList = [
      { templateId: 'delivery_frame_a', imageUrl: urlA },
      { templateId: 'delivery_frame_b', imageUrl: urlB }
    ];

    // Cache creative URLs
    await setCache(creativeCacheKey, creativesList, 86400 * 7);

    return {
      success: true,
      plan: {
        intentType,
        renderStrategy: 'delivery_photo_first',
        templateIds: ['delivery_frame_a', 'delivery_frame_b']
      },
      copy: {
        headlines: copyData.headlines,
        captions: copyData.captions,
        hashtagsSets: copyData.hashtagsSets
      },
      creatives: creativesList
    };
  }

  // --- PATH 2: Image Generation Fallback (Prompt-only) ---
  const copyCacheKey = `copy:${dealer.id}:${intentType}:${promptHash}:fallback`;
  let copyData = await getCache<any>(copyCacheKey);

  let creativeOptions: any[] = [];
  let promptBrief: any = { color_mood: 'neutral' };

  if (copyData) {
    creativeOptions = copyData.options;
    promptBrief = copyData.brief;
  } else {
    // Use Gemini creative engine to elaborate
    const geminiResult = await generateGeminiCreativeContent(promptText, []);
    creativeOptions = geminiResult.options;
    promptBrief = geminiResult.brief;
    
    await setCache(copyCacheKey, { options: creativeOptions, brief: promptBrief }, 86400 * 7);
  }

  // Load dealer branding
  const branding: DealerBranding = {
    name: dealer.name,
    city: dealer.city,
    phone: dealer.contact_phone ?? dealer.phone,
    primaryColor: dealer.primary_color ?? '#1A1A2E',
    font: dealer.font ?? 'Arial'
  };

  const addressText = dealer.address || [dealer.city, dealer.state].filter(Boolean).join(', ');
  if (addressText) branding.address = addressText;

  const whatsappNum = dealer.whatsapp_number ?? dealer.contact_phone ?? dealer.phone;
  if (whatsappNum) branding.whatsapp = whatsappNum;

  if (dealer.logo_url) {
    try {
      const logoFilename = path.basename(dealer.logo_url);
      const localLogoPath = path.join(ORIGINALS_DIR, logoFilename);
      try {
        branding.logoBuffer = await readFile(localLogoPath);
      } catch {
        const logoRes = await axios.get(dealer.logo_url, {
          responseType: 'arraybuffer',
          timeout: 10000
        });
        if (logoRes.status === 200) {
          branding.logoBuffer = Buffer.from(logoRes.data);
        }
      }
    } catch (err) {
      console.warn(`Failed to load dealer logo from: ${dealer.logo_url}`, err);
    }
  }

  const activeBrand = (Array.isArray(dealer.brands) && dealer.brands.length > 0) ? (dealer.brands[0] as string) : 'Car';
  branding.brandLogoSvg = getBrandLogoSvg(activeBrand, '#ffffff');

  // Parallel render & composition of 3 options
  const templateStyles: Array<'festive' | 'premium' | 'value'> = ['festive', 'premium', 'value'];
  
  const creatives = await Promise.all(
    creativeOptions.map(async (option, i) => {
      const bgPrompt = option.background_prompt;
      let backgroundBuffer: Buffer | null = null;

      if (bgPrompt) {
        if (isGeminiImageAvailable()) {
          try {
            backgroundBuffer = await generateGeminiImage(bgPrompt);
          } catch (err) {
            console.error(`Gemini image generation failed for fallback option ${i}:`, err);
          }
        }
        if (!backgroundBuffer && isCloudflareAvailable()) {
          try {
            backgroundBuffer = await cfGenerateImage(bgPrompt.slice(0, 500));
          } catch (err) {
            console.error(`Cloudflare image generation failed for fallback option ${i}:`, err);
          }
        }
        if (!backgroundBuffer && isOpenRouterImageAvailable()) {
          try {
            backgroundBuffer = await generateOpenRouterImage(bgPrompt.slice(0, 500));
          } catch (err) {
            console.error(`OpenRouter image generation failed for fallback option ${i}:`, err);
          }
        }
      }

      if (!backgroundBuffer) {
        backgroundBuffer = await generateGradientBackground(dealer.primary_color ?? '#f97316');
      }

      const templateStyle = templateStyles[i % templateStyles.length] as 'festive' | 'premium' | 'value';

      const { finalBuffer } = await compositeLayered({
        backgroundBuffer,
        dealer: branding,
        headline: option.headline,
        templateStyle,
        colorMood: promptBrief.color_mood,
      });

      const filePrefix = randomUUID();
      const filename = `${filePrefix}_fallback_creative_${i}.jpg`;
      const url = await uploadFile(finalBuffer, `creatives/${filename}`, 'image/jpeg', CREATIVES_DIR);

      return {
        templateId: `tpl_${templateStyle}`,
        imageUrl: url
      };
    })
  );

  return {
    success: true,
    plan: {
      intentType,
      renderStrategy: 'image_generation_fallback',
      templateIds: ['tpl_festive', 'tpl_premium', 'tpl_value']
    },
    copy: {
      headlines: creativeOptions.map(o => o.headline),
      captions: creativeOptions.map(o => o.caption_text),
      hashtagsSets: [creativeOptions.flatMap(o => o.hashtags || [])]
    },
    creatives
  };
}
