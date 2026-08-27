import sharp from 'sharp';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import type { DealerBranding } from './layeredCompositor.js';

export interface DeliveryRenderInput {
  imageBuffer: Buffer;
  headline: string;
  dealer: DealerBranding;
  outputDir: string;
  filePrefix: string;
}

export interface DeliveryRenderOutput {
  deliveryFrameA: {
    filename: string;
    buffer: Buffer;
  };
  deliveryFrameB: {
    filename: string;
    buffer: Buffer;
  };
}

// Word-wrap text into lines for SVG (no native wrapping in SVG)
export function wrapText(text: string, maxChars: number, maxLines = 2): string[] {
  const words = text.replace(/[\n\r]/g, ' ').split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (lines.length >= maxLines) break;
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word.length > maxChars ? `${word.slice(0, maxChars - 3)}...` : word;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.slice(0, maxLines);
}

// Escape XML special characters
export function x(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Parse hex color to RGB tuple
export function hexRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '').match(/[0-9a-f]{2}/gi);
  if (!m || m.length < 3) return [24, 119, 242]; // Default branded blue
  return [parseInt(m[0]!, 16), parseInt(m[1]!, 16), parseInt(m[2]!, 16)];
}

/**
 * Builds the SVG overlay for Template A: Clean Modern Delivery.
 */
function buildTemplateAOverlay(dealer: DealerBranding, headline: string): string {
  const size = 1080;
  const hs = (pct: number) => Math.round(size * pct);
  const fallbackFontStack = "'Noto Sans', 'Noto Sans Devanagari', 'DejaVu Sans', 'Liberation Sans', Arial, Helvetica, sans-serif";
  const fontFamily = dealer.font ? `${dealer.font}, ${fallbackFontStack}` : fallbackFontStack;
  const addressText = dealer.address || dealer.city || "";
  const showWa = dealer.whatsapp && dealer.whatsapp !== dealer.phone;

  const lines = wrapText(headline, 28, 2);
  const headlineEls = lines
    .map((line, i) => `<text x="${size / 2}" y="${hs(0.12) + i * hs(0.05)}" font-family="${fontFamily}" font-size="${hs(0.042)}" font-weight="900" fill="white" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)">${x(line)}</text>`)
    .join('\n  ');

  let brandLogo = "";
  let dealerLogo = "";
  if (dealer.logoBuffer) {
    dealerLogo = `<image x="${hs(0.05)}" y="${hs(0.03)}" width="${hs(0.25)}" height="${hs(0.09)}" preserveAspectRatio="xMinYMid meet" href="data:image/png;base64,${dealer.logoBuffer.toString("base64")}"/>`;
  } else if (dealer.brandLogoSvg) {
    brandLogo = `<g transform="translate(${hs(0.05)}, ${hs(0.03)}) scale(1.5)">${dealer.brandLogoSvg}</g>`;
  }

  const panelY = 930;
  const primaryColor = dealer.primaryColor || '#1A1A2E';
  const [r, g, b] = hexRgb(primaryColor);
  const bgR = Math.max(0, r - 40), bgG = Math.max(0, g - 40), bgB = Math.max(0, b - 40);

  const contactLine = [
    dealer.phone ? `&#128222; ${x(dealer.phone)}` : '',
    showWa ? `&#x1F4AC; ${x(dealer.whatsapp!)}` : '',
  ].filter(Boolean).join('   ');

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.8"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
      </filter>
    </defs>
    <!-- Scrim at top for text/logo readability -->
    <rect x="0" y="0" width="${size}" height="${hs(0.26)}" fill="url(#topFade)"/>
    <rect x="0" y="${panelY - hs(0.1)}" width="${size}" height="${hs(0.1)}" fill="url(#bottomFade)"/>

    ${headlineEls}
    
    <!-- Dealer Panel at bottom -->
    <rect x="0" y="${panelY}" width="${size}" height="150" fill="rgb(${bgR},${bgG},${bgB})"/>
    <rect x="0" y="${panelY}" width="8" height="150" fill="${primaryColor}"/>
    <text x="40" y="${panelY + 45}" font-family="${fontFamily}" font-size="28" font-weight="700" fill="white">${x(dealer.name)}</text>
    <text x="40" y="${panelY + 85}" font-family="${fontFamily}" font-size="20" fill="rgba(255,255,255,0.85)">${contactLine}</text>
    <text x="40" y="${panelY + 118}" font-family="${fontFamily}" font-size="18" fill="rgba(255,255,255,0.65)">${x(addressText)}</text>

    <!-- Watermark -->
    <text x="${size - 40}" y="${size - 25}" font-family="${fontFamily}" font-size="16" fill="rgba(255,255,255,0.3)" text-anchor="end">CarDekho Social AI</text>
  </svg>`;
}

/**
 * Builds the SVG overlay for Template B: Celebration Delivery Frame.
 */
function buildTemplateBOverlay(dealer: DealerBranding, headline: string): string {
  const size = 1080;
  const hs = (pct: number) => Math.round(size * pct);
  const fallbackFontStack = "'Noto Sans', 'Noto Sans Devanagari', 'DejaVu Sans', 'Liberation Sans', Arial, Helvetica, sans-serif";
  const fontFamily = dealer.font ? `${dealer.font}, ${fallbackFontStack}` : fallbackFontStack;
  const addressText = dealer.address || dealer.city || "";
  const showWa = dealer.whatsapp && dealer.whatsapp !== dealer.phone;

  const lines = wrapText(headline, 28, 2);
  const headlineEls = lines
    .map((line, i) => `<text x="${size / 2}" y="${hs(0.14) + i * hs(0.055)}" font-family="${fontFamily}" font-size="${hs(0.046)}" font-weight="900" fill="#facc15" text-anchor="middle" dominant-baseline="middle" filter="url(#shadow)">${x(line)}</text>`)
    .join('\n  ');

  const panelY = 930;
  const primaryColor = dealer.primaryColor || '#1A1A2E';
  const [r, g, b] = hexRgb(primaryColor);
  const bgR = Math.max(0, r - 20), bgG = Math.max(0, g - 20), bgB = Math.max(0, b - 20);

  const contactLine = [
    dealer.phone ? `&#128222; ${x(dealer.phone)}` : '',
    showWa ? `&#x1F4AC; ${x(dealer.whatsapp!)}` : '',
  ].filter(Boolean).join('   ');

  // Decorative confetti and stars
  const decorations = `
    <!-- Celebration border -->
    <rect x="20" y="20" width="${size - 40}" height="${size - 40}" fill="none" stroke="#facc15" stroke-width="4" opacity="0.85"/>
    <rect x="28" y="28" width="${size - 56}" height="${size - 56}" fill="none" stroke="#e2e8f0" stroke-width="1" opacity="0.3"/>
    
    <!-- Ribbon/Confetti SVG elements -->
    <!-- Top-left confetti -->
    <path d="M 40,60 Q 60,50 80,70" fill="none" stroke="#ef4444" stroke-width="3" opacity="0.8"/>
    <circle cx="50" cy="80" r="5" fill="#3b82f6" opacity="0.8"/>
    <polygon points="90,40 98,48 90,56 82,48" fill="#eab308" opacity="0.8"/>

    <!-- Top-right confetti -->
    <path d="M 1000,60 Q 980,50 960,70" fill="none" stroke="#10b981" stroke-width="3" opacity="0.8"/>
    <circle cx="990" cy="80" r="5" fill="#f59e0b" opacity="0.8"/>
    <polygon points="950,40 958,48 950,56 942,48" fill="#ec4899" opacity="0.8"/>

    <!-- Left side garland (subtle golden drops) -->
    <circle cx="30" cy="200" r="6" fill="#facc15"/>
    <circle cx="30" cy="300" r="6" fill="#facc15"/>
    <circle cx="30" cy="400" r="6" fill="#facc15"/>
    <circle cx="30" cy="500" r="6" fill="#facc15"/>
    <circle cx="30" cy="600" r="6" fill="#facc15"/>
    <circle cx="30" cy="700" r="6" fill="#facc15"/>
    <circle cx="30" cy="800" r="6" fill="#facc15"/>

    <!-- Right side garland -->
    <circle cx="1050" cy="200" r="6" fill="#facc15"/>
    <circle cx="1050" cy="300" r="6" fill="#facc15"/>
    <circle cx="1050" cy="400" r="6" fill="#facc15"/>
    <circle cx="1050" cy="500" r="6" fill="#facc15"/>
    <circle cx="1050" cy="600" r="6" fill="#facc15"/>
    <circle cx="1050" cy="700" r="6" fill="#facc15"/>
    <circle cx="1050" cy="800" r="6" fill="#facc15"/>
  `;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="3" dy="4" stdDeviation="4" flood-color="#000" flood-opacity="0.75"/>
      </filter>
    </defs>
    <!-- Scrims -->
    <rect x="0" y="0" width="${size}" height="${hs(0.28)}" fill="url(#topFade)"/>
    <rect x="0" y="${panelY - hs(0.1)}" width="${size}" height="${hs(0.1)}" fill="url(#bottomFade)"/>

    ${decorations}
    ${headlineEls}
    
    <!-- Dealer Panel at bottom with celebration gold accent top border -->
    <rect x="0" y="${panelY}" width="${size}" height="150" fill="rgb(${bgR},${bgG},${bgB})"/>
    <rect x="0" y="${panelY}" width="${size}" height="6" fill="#facc15"/>
    <text x="40" y="${panelY + 50}" font-family="${fontFamily}" font-size="28" font-weight="700" fill="#facc15">${x(dealer.name)}</text>
    <text x="40" y="${panelY + 90}" font-family="${fontFamily}" font-size="20" fill="rgba(255,255,255,0.85)">${contactLine}</text>
    <text x="40" y="${panelY + 122}" font-family="${fontFamily}" font-size="18" fill="rgba(255,255,255,0.65)">${x(addressText)}</text>

    <!-- Watermark -->
    <text x="${size - 40}" y="${size - 25}" font-family="${fontFamily}" font-size="16" fill="rgba(255,255,255,0.3)" text-anchor="end">CarDekho Social AI</text>
  </svg>`;
}

/**
 * Main function to render Template A & B using Sharp and deterministic overlays.
 */
export async function renderDeliveryCreatives(input: DeliveryRenderInput): Promise<DeliveryRenderOutput> {
  const { imageBuffer, headline, dealer, outputDir, filePrefix } = input;
  
  await mkdir(outputDir, { recursive: true });

  // 1. Crop/resize photo to 1080x1080 (cover, center)
  const photoSquare = await sharp(imageBuffer)
    .resize(1080, 1080, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 90 })
    .toBuffer();

  // 2. Build template overlays
  const svgA = buildTemplateAOverlay(dealer, headline);
  const svgB = buildTemplateBOverlay(dealer, headline);

  // 3. Composite Template A
  const bufA = await sharp(photoSquare)
    .composite([{ input: Buffer.from(svgA), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
  const fileA = `${filePrefix}_delivery_frame_a.jpg`;
  await writeFile(path.join(outputDir, fileA), bufA);

  // 4. Composite Template B
  const bufB = await sharp(photoSquare)
    .composite([{ input: Buffer.from(svgB), top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toBuffer();
  const fileB = `${filePrefix}_delivery_frame_b.jpg`;
  await writeFile(path.join(outputDir, fileB), bufB);

  return {
    deliveryFrameA: {
      filename: fileA,
      buffer: bufA
    },
    deliveryFrameB: {
      filename: fileB,
      buffer: bufB
    }
  };
}
