import sharp from "sharp"

const REMOVE_BG_KEY = process.env["REMOVE_BG_API_KEY"]

/**
 * Attempts to remove the background from an image using remove.bg.
 * Falls back to a local BFS chroma-keyer when the API key is absent or the call fails.
 * Caller always receives a valid transparent PNG buffer.
 */
export async function removeBackground(imageBuffer: Buffer): Promise<Buffer> {
  if (!REMOVE_BG_KEY) return removeBackgroundFallback(imageBuffer)

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
    return removeBackgroundFallback(imageBuffer)
  }
}

async function removeBackgroundFallback(imageBuffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer)
    const metadata = await image.metadata()
    const width = metadata.width
    const height = metadata.height
    if (!width || !height) return image.png().toBuffer()

    // Get raw pixel buffer (RGBA)
    const rawBuffer = await image.ensureAlpha().raw().toBuffer()

    // A queue for BFS: storing index in 1D array (y * width + x)
    const queue: number[] = []
    const visited = new Uint8Array(width * height)

    // Criteria for studio background white / light-grey
    const isTargetBg = (r: number, g: number, b: number) => {
      if (r > 245 && g > 245 && b > 245) return true
      if (r > 215 && g > 215 && b > 215) {
        const maxDiff = 15
        if (Math.abs(r - g) <= maxDiff && Math.abs(r - b) <= maxDiff && Math.abs(g - b) <= maxDiff) {
          return true
        }
      }
      return false
    }

    const checkBg = (idx: number) => {
      const r = rawBuffer[idx * 4] ?? 0
      const g = rawBuffer[idx * 4 + 1] ?? 0
      const b = rawBuffer[idx * 4 + 2] ?? 0
      return isTargetBg(r, g, b)
    }

    // Add all border pixels to queue
    for (let x = 0; x < width; x++) {
      // Top border
      let idx = x
      if (checkBg(idx)) {
        queue.push(idx)
        visited[idx] = 1
      }
      // Bottom border
      idx = (height - 1) * width + x
      if (checkBg(idx)) {
        queue.push(idx)
        visited[idx] = 1
      }
    }
    for (let y = 1; y < height - 1; y++) {
      // Left border
      let idx = y * width
      if (checkBg(idx)) {
        queue.push(idx)
        visited[idx] = 1
      }
      // Right border
      idx = y * width + (width - 1)
      if (checkBg(idx)) {
        queue.push(idx)
        visited[idx] = 1
      }
    }

    // Run BFS
    let head = 0
    while (head < queue.length) {
      const idx = queue[head++]
      if (idx === undefined) continue
      // Set alpha of background pixel to 0 (fully transparent)
      rawBuffer[idx * 4 + 3] = 0

      const cx = idx % width
      const cy = Math.floor(idx / width)

      // Check 4-neighbors
      const neighbors: [number, number][] = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ]

      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx
          if (visited[nidx] === 0) {
            visited[nidx] = 1
            if (checkBg(nidx)) {
              queue.push(nidx)
            }
          }
        }
      }
    }

    // Reconstruct PNG image
    return sharp(rawBuffer, {
      raw: {
        width,
        height,
        channels: 4
      }
    })
    .png()
    .toBuffer()
  } catch (err) {
    console.error("Local background removal fallback failed:", err)
    return sharp(imageBuffer).png().toBuffer()
  }
}

export function isBackgroundRemovalAvailable(): boolean {
  return !!REMOVE_BG_KEY || true // Always available due to local BFS keyer fallback
}
