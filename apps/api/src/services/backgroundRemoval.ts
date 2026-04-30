import sharp from "sharp"

const REMOVE_BG_KEY = process.env["REMOVE_BG_API_KEY"]

/**
 * Attempts to remove the background from an image using remove.bg.
 * Falls back to returning the original buffer when the API key is absent or the call fails.
 * Caller always receives a valid PNG buffer.
 */
export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  if (!REMOVE_BG_KEY) return ensurePng(imageBuffer)

  try {
    // Node 18+ has FormData/Blob/fetch built-in
    const form = new FormData()
    form.append("image_file", new Blob([new Uint8Array(imageBuffer)]), "subject.jpg")
    form.append("size", "auto")
    form.append("format", "png")

    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": REMOVE_BG_KEY },
      body: form,
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) throw new Error(`remove.bg (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return ensurePng(imageBuffer)
  }
}

async function ensurePng(buf: Buffer): Promise<Buffer> {
  return sharp(buf).png().toBuffer()
}

export function isBackgroundRemovalAvailable(): boolean {
  return !!REMOVE_BG_KEY
}
