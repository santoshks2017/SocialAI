import sharp from "sharp"

export interface DealerBranding {
  name: string
  city: string
  phone: string
  whatsapp?: string
  primaryColor?: string
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
}

export interface LayeredCompositeResult {
  finalBuffer: Buffer
  layerBuffers: {
    background: Buffer
    subject?: Buffer
    overlay: Buffer
  }
}

/**
 * Composites 3 layers into a single branded creative using Sharp:
 *   Layer 2 (bottom): AI background, resized to fill canvas
 *   Layer 1 (middle): Subject/car image, centered in upper 65% with transparent bg
 *   Layer 3 (top):    SVG branding overlay (dealer name, phone, WhatsApp, city, headline)
 */
export async function compositeLayered(
  input: LayeredCompositeInput,
): Promise<LayeredCompositeResult> {
  const { backgroundBuffer, subjectBuffer, dealer, headline, size = 1080 } = input
  const primaryColor =
    dealer.primaryColor?.startsWith("#") ? dealer.primaryColor : "#f97316"

  // Resize background to canvas (fill, no letterbox)
  const bgResized = await sharp(backgroundBuffer)
    .resize(size, size, { fit: "cover", position: "center" })
    .png()
    .toBuffer()

  const compositeInputs: sharp.OverlayOptions[] = []

  // Layer 1 — subject positioned in upper-centre of the canvas
  let processedSubject: Buffer | undefined
  if (subjectBuffer) {
    const maxW = size
    const maxH = Math.round(size * 0.65)

    processedSubject = await sharp(subjectBuffer)
      .resize(maxW, maxH, { fit: "inside" })
      .png()
      .toBuffer()

    const meta = await sharp(processedSubject).metadata()
    const subW = meta.width ?? maxW
    const subH = meta.height ?? maxH

    // Vertically centre within the top 65%, horizontally centre always
    const topOffset = Math.round((maxH - subH) / 2)
    const leftOffset = Math.round((size - subW) / 2)

    compositeInputs.push({
      input: processedSubject,
      top: Math.max(0, topOffset),
      left: Math.max(0, leftOffset),
      blend: "over",
    })
  }

  // Layer 3 — SVG branding overlay
  const svgOverlay = buildBrandingOverlay(dealer, headline, size, primaryColor)
  const overlayBuffer = await sharp(Buffer.from(svgOverlay)).png().toBuffer()

  compositeInputs.push({ input: overlayBuffer, top: 0, left: 0, blend: "over" })

  const finalBuffer = await sharp(bgResized)
    .composite(compositeInputs)
    .jpeg({ quality: 90 })
    .toBuffer()

  return {
    finalBuffer,
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
): string {
  const hs = (pct: number) => Math.round(size * pct) // helper: fraction → px
  const showWa = dealer.whatsapp && dealer.whatsapp !== dealer.phone

  return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bottomFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.82"/>
    </linearGradient>
  </defs>

  <!-- Bottom scrim for text legibility -->
  <rect x="0" y="${hs(0.55)}" width="${size}" height="${hs(0.45)}" fill="url(#bottomFade)"/>

  <!-- Primary colour accent bar -->
  <rect x="0" y="${size - hs(0.075)}" width="${size}" height="${hs(0.006)}" fill="${primaryColor}" opacity="0.95"/>

  ${
    headline
      ? `<!-- Headline -->
  <text
    x="${size / 2}" y="${hs(0.73)}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${hs(0.044)}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    dominant-baseline="middle"
  >${x(headline.slice(0, 52))}</text>`
      : ""
  }

  <!-- Dealer name -->
  <text
    x="${hs(0.05)}" y="${size - hs(0.115)}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${hs(0.034)}"
    font-weight="bold"
    fill="${primaryColor}"
  >${x(dealer.name)}</text>

  <!-- City -->
  <text
    x="${hs(0.05)}" y="${size - hs(0.075)}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${hs(0.023)}"
    fill="rgba(255,255,255,0.72)"
  >${x(dealer.city)}</text>

  <!-- Phone -->
  <text
    x="${hs(0.05)}" y="${size - hs(0.04)}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${hs(0.023)}"
    fill="rgba(255,255,255,0.88)"
  >${x(dealer.phone)}</text>

  ${
    showWa
      ? `<!-- WhatsApp (right side) -->
  <text
    x="${size - hs(0.05)}" y="${size - hs(0.04)}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${hs(0.023)}"
    fill="rgba(255,255,255,0.88)"
    text-anchor="end"
  >WA: ${x(dealer.whatsapp!)}</text>`
      : ""
  }

  <!-- Subtle watermark -->
  <text
    x="${size - hs(0.018)}" y="${size - hs(0.008)}"
    font-family="Arial,Helvetica,sans-serif"
    font-size="${hs(0.017)}"
    fill="rgba(255,255,255,0.22)"
    text-anchor="end"
  >SocialGenie</text>
</svg>`
}

/** XML-escape helper */
function x(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
