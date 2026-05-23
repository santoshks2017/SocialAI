import sharp from "sharp"

export interface DealerBranding {
  name: string
  city: string
  address?: string
  phone: string
  whatsapp?: string
  primaryColor?: string
  font?: string
  logoBuffer?: Buffer
  brandLogoSvg?: string
}

export interface LayeredCompositeInput {
  /** Layer 2: AI-generated or gradient background (required) */
  backgroundBuffer: Buffer
  /** Layer 1: Subject/car image with background already removed (optional) */
  subjectBuffer?: Buffer
  /** Layer 3: Dealer branding context */
  dealer: DealerBranding
  /** Headline text rendered on the overlay */
  headline?: string
  /** Canvas size in pixels (square), default 1080 */
  size?: number
  /** Template style */
  templateStyle?: 'festive' | 'premium' | 'value' | undefined
  /** Color temperature mood for color grading matching */
  colorMood?: 'warm' | 'cool' | 'neutral' | undefined
}

export interface LayeredCompositeResult {
  finalBuffer: Buffer // JPEG Quality 92
  pngBuffer: Buffer // Lossless PNG
  layerBuffers: {
    background: Buffer
    subject?: Buffer
    overlay: Buffer
  }
}

/**
 * Composites 3 layers into a single branded creative using Sharp:
 *   Layer 2 (bottom): AI background, resized to fill canvas
 *   Layer 1 (middle): Subject/car image, centered and scaled to 62%, sitting on footer band with ground shadow
 *   Layer 3 (top):    SVG branding overlay (dealer name, phone, WhatsApp, city/address, headline, logos, font)
 */
export async function compositeLayered(
  input: LayeredCompositeInput,
): Promise<LayeredCompositeResult> {
  const { backgroundBuffer, subjectBuffer, dealer, headline, size = 1080, templateStyle, colorMood = 'neutral' } = input
  const primaryColor =
    dealer.primaryColor?.startsWith("#") ? dealer.primaryColor : "#f97316"

  // Resize background to canvas (fill, no letterbox)
  const bgResized = await sharp(backgroundBuffer)
    .resize(size, size, { fit: "cover", position: "center" })
    .png()
    .toBuffer()

  const compositeInputs: sharp.OverlayOptions[] = []
  const footerHeight = Math.round(size * 0.16)

  // Layer 1 — subject positioned resting on top of the bottom band
  let processedSubject: Buffer | undefined
  if (subjectBuffer) {
    // Car occupies 62% of the frame width in square format
    const maxW = Math.round(size * 0.62)

    processedSubject = await sharp(subjectBuffer)
      .resize({ width: maxW })
      .png()
      .toBuffer()

    const meta = await sharp(processedSubject).metadata()
    const subW = meta.width ?? maxW
    const subH = meta.height ?? 350

    const leftOffset = Math.round((size - subW) / 2)
    const topOffset = size - footerHeight - subH // sit exactly on top of bottom band

    // ── Generate ground shadow layer (soft drop shadow, opacity ~48%, blur 2% of size) ──
    const shadowBlurRadius = Math.round(size * 0.02)
    const shadowSvg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadowBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="${shadowBlurRadius}" />
        </filter>
      </defs>
      <ellipse cx="${size / 2}" cy="${size - footerHeight}" rx="${Math.round(subW * 0.46)}" ry="${Math.round(subH * 0.08)}" fill="#000000" opacity="0.48" filter="url(#shadowBlur)" />
    </svg>
    `;
    const shadowBuffer = Buffer.from(shadowSvg)

    // Add shadow first (below car)
    compositeInputs.push({
      input: shadowBuffer,
      top: 0,
      left: 0,
      blend: "over"
    })

    // ── Apply subtle color grade to match background tone ──
    let subjectSharp = sharp(processedSubject)
    if (colorMood === 'warm') {
      subjectSharp = subjectSharp.recomb([
        [1.06, 0, 0],
        [0, 1.02, 0],
        [0, 0, 0.94]
      ]);
    } else if (colorMood === 'cool') {
      subjectSharp = subjectSharp.recomb([
        [0.94, 0, 0],
        [0, 1.01, 0],
        [0, 0, 1.08]
      ]);
    }
    processedSubject = await subjectSharp.toBuffer()

    // Add car cutout on top of shadow
    compositeInputs.push({
      input: processedSubject,
      top: Math.max(0, topOffset),
      left: Math.max(0, leftOffset),
      blend: "over",
    })
  }

  // Layer 3 — SVG branding overlay
  const svgOverlay = buildBrandingOverlay(dealer, headline, size, primaryColor, templateStyle)
  const overlayBuffer = await sharp(Buffer.from(svgOverlay)).png().toBuffer()

  compositeInputs.push({ input: overlayBuffer, top: 0, left: 0, blend: "over" })

  // JPEG export (quality 92)
  const finalBuffer = await sharp(bgResized)
    .composite(compositeInputs)
    .jpeg({ quality: 92 })
    .toBuffer()

  // Lossless PNG export
  const pngBuffer = await sharp(bgResized)
    .composite(compositeInputs)
    .png()
    .toBuffer()

  return {
    finalBuffer,
    pngBuffer,
    layerBuffers: {
      background: bgResized,
      ...(processedSubject !== undefined ? { subject: processedSubject } : {}),
      overlay: overlayBuffer,
    },
  }
}

function buildBrandingOverlay(
  dealer: DealerBranding,
  headline: string | undefined,
  size: number,
  primaryColor: string,
  templateStyle?: 'festive' | 'premium' | 'value',
): string {
  const hs = (pct: number) => Math.round(size * pct) // helper: fraction → px
  const showWa = dealer.whatsapp && dealer.whatsapp !== dealer.phone
  const fontFamily = dealer.font ? `${dealer.font}, Arial, sans-serif` : "Arial, Helvetica, sans-serif"
  const addressText = dealer.address || dealer.city || ""

  // Base SVG definitions
  let svgContent = "";

  const defs = `
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.85"/>
    </linearGradient>
    <linearGradient id="topFade" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.5"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="2" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.6"/>
    </filter>
  </defs>
  `;

  if (templateStyle === 'festive') {
    // 1. FESTIVE & HIGH ENERGY LAYOUT
    const footerHeight = hs(0.16);
    const footerY = size - footerHeight;

    const brandLogo = dealer.brandLogoSvg
      ? `<g transform="translate(${hs(0.05)}, ${hs(0.04)}) scale(${(size / 1080) * 1.7})" filter="url(#shadow)">${dealer.brandLogoSvg}</g>`
      : "";

    const dealerLogo = dealer.logoBuffer
      ? `<image x="${size - hs(0.35)}" y="${hs(0.04)}" width="${hs(0.3)}" height="${hs(0.11)}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${dealer.logoBuffer.toString("base64")}" filter="url(#shadow)"/>`
      : "";

    svgContent = `
      ${defs}
      <!-- Thin decorative festive border -->
      <rect x="${hs(0.015)}" y="${hs(0.015)}" width="${size - hs(0.03)}" height="${size - hs(0.03)}" fill="none" stroke="#eab308" stroke-width="2.5" opacity="0.65"/>
      <rect x="${hs(0.02)}" y="${hs(0.02)}" width="${size - hs(0.04)}" height="${size - hs(0.04)}" fill="none" stroke="#eab308" stroke-width="1" opacity="0.35"/>

      <!-- Top scrim for headline readability -->
      <rect x="0" y="0" width="${size}" height="${hs(0.3)}" fill="url(#topFade)" opacity="0.8"/>

      <!-- Logos floating at the top -->
      ${brandLogo}
      ${dealerLogo}

      <!-- Headline -->
      ${headline ? `
      <text
        x="${size / 2}" y="${hs(0.18)}"
        font-family="${fontFamily}"
        font-size="${hs(0.044)}"
        font-weight="900"
        fill="#facc15"
        text-anchor="middle"
        dominant-baseline="middle"
        filter="url(#shadow)"
        letter-spacing="0.5"
      >${x(headline.slice(0, 52))}</text>
      ` : ""}

      <!-- White Bottom Footer Panel -->
      <rect x="0" y="${footerY}" width="${size}" height="${footerHeight}" fill="#ffffff"/>
      <rect x="0" y="${footerY}" width="${size}" height="${hs(0.005)}" fill="${primaryColor}"/>

      <!-- Dealer Text Details in slate-gray -->
      <text
        x="${hs(0.06)}" y="${footerY + hs(0.055)}"
        font-family="${fontFamily}"
        font-size="${hs(0.036)}"
        font-weight="bold"
        fill="#1e293b"
      >${x(dealer.name.slice(0, 50))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.095)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#475569"
        font-weight="500"
      >${x(addressText.slice(0, 65))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.13)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#475569"
        font-weight="600"
      >Call: ${x(dealer.phone)}${showWa ? ` | WA: ${x(dealer.whatsapp!)}` : ""}</text>
    `;
  } else if (templateStyle === 'premium') {
    // 2. PREMIUM & LUXURY LAYOUT
    const footerHeight = hs(0.16);
    const footerY = size - footerHeight;

    const brandLogo = dealer.brandLogoSvg
      ? `<g transform="translate(${hs(0.05)}, ${hs(0.04)}) scale(${(size / 1080) * 1.7})" filter="url(#shadow)">${dealer.brandLogoSvg}</g>`
      : "";

    const dealerLogo = dealer.logoBuffer
      ? `<image x="${size - hs(0.35)}" y="${hs(0.04)}" width="${hs(0.3)}" height="${hs(0.11)}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${dealer.logoBuffer.toString("base64")}" filter="url(#shadow)"/>`
      : "";

    const serifFont = `Georgia, 'Playfair Display', ${fontFamily}`;

    svgContent = `
      ${defs}
      <!-- Soft vignette at the top -->
      <rect x="0" y="0" width="${size}" height="${hs(0.3)}" fill="url(#topFade)" opacity="0.8"/>

      <!-- Logos floating at the top -->
      ${brandLogo}
      ${dealerLogo}

      <!-- Elegant Serif Headline -->
      ${headline ? `
      <text
        x="${size / 2}" y="${hs(0.18)}"
        font-family="${serifFont}"
        font-size="${hs(0.042)}"
        font-style="italic"
        font-weight="bold"
        fill="#fef9c3"
        text-anchor="middle"
        dominant-baseline="middle"
        filter="url(#shadow)"
      >${x(headline.slice(0, 52))}</text>
      ` : ""}

      <!-- Solid Dark Footer Bar -->
      <rect x="0" y="${footerY}" width="${size}" height="${footerHeight}" fill="#0f172a" opacity="0.95"/>
      <rect x="0" y="${footerY}" width="${size}" height="${hs(0.005)}" fill="#facc15" opacity="0.8"/>

      <!-- Dealer details inside footer (Left-aligned) -->
      <text
        x="${hs(0.06)}" y="${footerY + hs(0.055)}"
        font-family="${fontFamily}"
        font-size="${hs(0.036)}"
        font-weight="bold"
        fill="#fef9c3"
      >${x(dealer.name.slice(0, 50))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.095)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#ffffff"
        opacity="0.85"
      >${x(addressText.slice(0, 65))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.13)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#ffffff"
        font-weight="600"
      >Call: ${x(dealer.phone)}${showWa ? ` | WA: ${x(dealer.whatsapp!)}` : ""}</text>
    `;
  } else if (templateStyle === 'value') {
    // 3. VALUE & CTA LAYOUT
    const footerHeight = hs(0.16);
    const footerY = size - footerHeight;

    const brandLogo = dealer.brandLogoSvg
      ? `<g transform="translate(${hs(0.05)}, ${hs(0.04)}) scale(${(size / 1080) * 1.7})" filter="url(#shadow)">${dealer.brandLogoSvg}</g>`
      : "";

    const dealerLogo = dealer.logoBuffer
      ? `<image x="${size - hs(0.35)}" y="${hs(0.04)}" width="${hs(0.3)}" height="${hs(0.11)}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${dealer.logoBuffer.toString("base64")}" filter="url(#shadow)"/>`
      : "";

    svgContent = `
      ${defs}
      <!-- Scrims for text visibility -->
      <rect x="0" y="0" width="${size}" height="${hs(0.3)}" fill="url(#topFade)" opacity="0.8"/>

      <!-- Floating logos -->
      ${brandLogo}
      ${dealerLogo}

      <!-- Left-aligned bold headline -->
      ${headline ? `
      <text
        x="${hs(0.06)}" y="${hs(0.17)}"
        font-family="${fontFamily}"
        font-size="${hs(0.042)}"
        font-weight="900"
        fill="#ffffff"
        text-anchor="start"
        dominant-baseline="middle"
        filter="url(#shadow)"
      >${x(headline.slice(0, 52))}</text>
      ` : ""}

      <!-- Solid Primary Footer Bar -->
      <rect x="0" y="${footerY}" width="${size}" height="${footerHeight}" fill="${primaryColor}" opacity="0.95"/>
      <rect x="0" y="${footerY}" width="${size}" height="${hs(0.005)}" fill="#ffffff" opacity="0.4"/>

      <!-- Dealer details inside footer (Left-aligned) -->
      <text
        x="${hs(0.06)}" y="${footerY + hs(0.055)}"
        font-family="${fontFamily}"
        font-size="${hs(0.036)}"
        font-weight="bold"
        fill="#ffffff"
      >${x(dealer.name.slice(0, 40))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.095)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#ffffff"
        opacity="0.85"
      >${x(addressText.slice(0, 50))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.13)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#ffffff"
        font-weight="600"
      >Call: ${x(dealer.phone)}${showWa ? ` | WA: ${x(dealer.whatsapp!)}` : ""}</text>

      <!-- Right-aligned CTA Pill inside footer -->
      <rect
        x="${size - hs(0.29)}" y="${footerY + hs(0.0475)}"
        width="${hs(0.24)}" height="${hs(0.065)}"
        rx="${hs(0.0325)}"
        fill="#ffffff"
        filter="url(#shadow)"
      />
      <text
        x="${size - hs(0.17)}" y="${footerY + hs(0.08)}"
        font-family="${fontFamily}"
        font-size="${hs(0.020)}"
        font-weight="900"
        fill="${primaryColor}"
        text-anchor="middle"
        dominant-baseline="middle"
      >BOOK NOW</text>
    `;
  } else {
    // DEFAULT ORIGINAL LAYOUT (backward compatibility)
    const footerHeight = hs(0.16);
    const footerY = size - footerHeight;

    const brandLogo = dealer.brandLogoSvg
      ? `<g transform="translate(${hs(0.05)}, ${hs(0.04)}) scale(${(size / 1080) * 1.7})">${dealer.brandLogoSvg}</g>`
      : "";

    const dealerLogo = dealer.logoBuffer
      ? `<image x="${size - hs(0.35)}" y="${hs(0.04)}" width="${hs(0.3)}" height="${hs(0.11)}" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${dealer.logoBuffer.toString("base64")}"/>`
      : "";

    svgContent = `
      ${defs}
      <!-- Top scrim for text visibility -->
      <rect x="0" y="0" width="${size}" height="${hs(0.3)}" fill="url(#topFade)" opacity="0.8"/>

      <!-- Floating logos -->
      ${brandLogo}
      ${dealerLogo}

      ${headline ? `
      <!-- Headline -->
      <text
        x="${size / 2}" y="${hs(0.18)}"
        font-family="${fontFamily}"
        font-size="${hs(0.044)}"
        font-weight="bold"
        fill="white"
        text-anchor="middle"
        dominant-baseline="middle"
        filter="url(#shadow)"
      >${x(headline.slice(0, 52))}</text>
      ` : ""}

      <!-- Solid Footer Bar -->
      <rect x="0" y="${footerY}" width="${size}" height="${footerHeight}" fill="#1e293b" opacity="0.95"/>
      <rect x="0" y="${footerY}" width="${size}" height="${hs(0.005)}" fill="${primaryColor}"/>

      <!-- Dealer details inside footer -->
      <text
        x="${hs(0.06)}" y="${footerY + hs(0.055)}"
        font-family="${fontFamily}"
        font-size="${hs(0.036)}"
        font-weight="bold"
        fill="${primaryColor}"
      >${x(dealer.name.slice(0, 50))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.095)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#ffffff"
        opacity="0.85"
      >${x(addressText.slice(0, 65))}</text>

      <text
        x="${hs(0.06)}" y="${footerY + hs(0.13)}"
        font-family="${fontFamily}"
        font-size="${hs(0.022)}"
        fill="#ffffff"
        font-weight="600"
      >Call: ${x(dealer.phone)}${showWa ? ` | WA: ${x(dealer.whatsapp!)}` : ""}</text>
    `;
  }

  // Common subtle watermark
  const watermark = `
    <!-- Subtle watermark -->
    <text
      x="${size - hs(0.018)}" y="${size - hs(0.008)}"
      font-family="${fontFamily}"
      font-size="${hs(0.015)}"
      fill="rgba(255,255,255,0.25)"
      text-anchor="end"
    >CarDekho Social AI</text>
  `;

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    ${svgContent}
    ${watermark}
  </svg>`;
}

/** XML-escape helper */
function x(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
