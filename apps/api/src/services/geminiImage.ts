import axios from "axios";
import sharp from "sharp";

/**
 * Generates an image using Google AI Studio (Gemini / Imagen 3 model).
 * Returns a Buffer of the generated image.
 */
export async function generateGeminiImage(prompt: string, carImageBuffer?: Buffer, modelName?: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not set. Please configure it in your .env file.");
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";

  if (model.startsWith("gemini-") || model.includes("banana")) {
    // Use generateContent API for Gemini-based image models (e.g. gemini-3.1-flash-image-preview / nano-banana-pro-preview)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    let payloadBuffer = carImageBuffer;
    if (carImageBuffer) {
      try {
        payloadBuffer = await sharp(carImageBuffer)
          .resize({ width: 768, height: 768, fit: "inside", withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer();
      } catch (err) {
        console.error("Failed to resize car image buffer for Gemini payload:", err);
      }
    }

    const carDetails = modelName ? `the ${modelName} car` : `the car`;
    const textPart = carImageBuffer
      ? `Create a high-quality, professional automotive commercial poster. Seamlessly integrate ${carDetails} from the attached photo into a new environment: ${prompt}. Place ${carDetails} in the center of the image, resting realistically on the road or surface. The perspective, ground shadows, lighting, reflections, and color grading must look completely natural and cohesive with the environment. Preserve the vehicle's features, brand badges, grille, headlights, and colors exactly as they appear in the photo without any distortion. Do not add any text overlays, labels, or logos to the image.`
      : prompt;

    const payload = {
      contents: [
        {
          parts: [
            {
              text: textPart,
            },
            ...(payloadBuffer ? [{
              inlineData: {
                mimeType: "image/jpeg",
                data: payloadBuffer.toString("base64")
              }
            }] : [])
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
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

