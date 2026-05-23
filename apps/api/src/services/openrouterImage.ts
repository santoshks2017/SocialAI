// services/openrouterImage.ts
import axios from 'axios';

/** Generate an image using OpenRouter's image model. Returns a Buffer of the JPEG/PNG data. */
export async function generateOpenRouterImage(prompt: string): Promise<Buffer> {
  const apiKey = process.env['OPENROUTER_IMAGE_API_KEY'];
  if (!apiKey) throw new Error('OPENROUTER_IMAGE_API_KEY is not set');

  const model = process.env['OPENROUTER_IMAGE_MODEL'] || 'google/gemini-3.1-flash-image-preview';
  const url = 'https://openrouter.ai/api/v1/chat/completions';

  const payload = {
    model: model,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
    modalities: ['image', 'text'],
  };

  const response = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': process.env['FRONTEND_URL'] ?? 'https://cardekho-social-ai-web.vercel.app',
      'X-Title': 'CarDekho Social AI',
    },
    timeout: 60000,
  });

  const choice = response.data?.choices?.[0];
  const message = choice?.message;

  // Extract base64 image
  let base64Data: string | null = null;

  // Option A: check message.images
  if (message?.images && message.images.length > 0) {
    const imgUrl = message.images[0]?.image_url?.url || message.images[0]?.url;
    if (imgUrl && imgUrl.startsWith('data:image')) {
      base64Data = imgUrl.split(',')[1] || null;
    } else if (imgUrl) {
      base64Data = imgUrl;
    }
  }

  // Option B: check content for data URL
  if (!base64Data && typeof message?.content === 'string') {
    if (message.content.includes('data:image')) {
      const match = message.content.match(/data:image\/[a-zA-Z]+;base64,([a-zA-Z0-9+/=]+)/);
      if (match) {
        base64Data = match[1];
      }
    }
  }

  if (!base64Data) {
    console.error('OpenRouter Image generation response error (no image extracted):', JSON.stringify(response.data));
    throw new Error('Failed to extract generated image from OpenRouter response');
  }

  return Buffer.from(base64Data, 'base64');
}

/** Availability check for image generation via OpenRouter */
export function isOpenRouterImageAvailable(): boolean {
  return !!process.env['OPENROUTER_IMAGE_API_KEY'];
}

