import axios from "axios";

/**
 * Generates an image using Google AI Studio (Gemini / Imagen 3 model).
 * Returns a Buffer of the generated image.
 */
export async function generateGeminiImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set. Please configure it in your .env file.");
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

  if (model.startsWith("gemini-") || model.includes("banana")) {
    // Use generateContent API for Gemini-based image models (e.g. gemini-3.1-flash-image-preview / Nano Banana 2)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [
        {
          parts: [
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 60000, // 60 seconds timeout for image generation
    });

    const candidates = response.data?.candidates;
    if (!candidates || candidates.length === 0) {
      console.error("Gemini Image generation response error (no candidates):", JSON.stringify(response.data));
      throw new Error(`Failed to generate image from Gemini API: no candidates returned`);
    }

    const parts = candidates[0]?.content?.parts || [];
    let b64: string | null = null;
    for (const part of parts) {
      if (part.inlineData) {
        b64 = part.inlineData.data;
        break;
      }
    }

    if (!b64) {
      console.error("Gemini Image generation response error (no inlineData):", JSON.stringify(response.data));
      throw new Error("Failed to generate image from Gemini API: no inlineData returned");
    }

    return Buffer.from(b64, "base64");
  } else {
    // Use predict API for Imagen models (e.g. imagen-3.0-generate-002)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`;
    const payload = {
      instances: [
        {
          prompt: prompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: "1:1",
      },
    };

    const response = await axios.post(url, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 45000, // 45 seconds timeout for image generation
    });

    const prediction = response.data?.predictions?.[0];
    const b64 = prediction?.bytesBase64Encoded || prediction?.imageBytes || prediction?.image?.imageBytes;

    if (!b64) {
      console.error("Gemini Image generation response error:", JSON.stringify(response.data));
      throw new Error("Failed to generate image from Google AI Studio / Imagen API");
    }

    return Buffer.from(b64, "base64");
  }
}

/**
 * Checks if Google AI Studio Image generation is available.
 */
export function isGeminiImageAvailable(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

