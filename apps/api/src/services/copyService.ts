import axios from 'axios';

export interface CopyOutput {
  headlines: string[];       // length 3
  captions: string[];        // length 3
  hashtagsSets: string[][];  // length 1 (containing hashtags)
}

/**
 * Service to generate creative copy using Gemini or fallbacks.
 */
export async function generateCopy(params: {
  prompt: string;
  dealerName: string;
  city: string;
  intentType: string;
  languageMode?: string;
}): Promise<CopyOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
  const language = params.languageMode || 'hinglish';
  
  const systemInstructions = `You are an expert automotive copywriter for Indian car dealerships.
Generate exactly 3 distinct options/variants of creative copy based on the user's prompt: "${params.prompt}".
For the dealer: "${params.dealerName}" located in "${params.city}".
The intent type is "${params.intentType}".
The output language/style should be "${language}".

Generate exactly:
1. 3 headlines (short overlay texts, max 50 characters each).
2. 3 caption variants (detailed captions for social media).
3. 1 set of hashtags (4 to 6 hashtags) that will be shared across all captions.

Return the result STRICTLY as a JSON object matching this schema:
{
  "headlines": ["Headline 1", "Headline 2", "Headline 3"],
  "captions": ["Caption 1", "Caption 2", "Caption 3"],
  "hashtags": ["#Tag1", "#Tag2", "#Tag3"]
}`;

  // 1. Call Google Gemini API
  if (apiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          { parts: [{ text: systemInstructions }] }
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              headlines: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                minItems: 3,
                maxItems: 3
              },
              captions: {
                type: 'ARRAY',
                items: { type: 'STRING' },
                minItems: 3,
                maxItems: 3
              },
              hashtags: {
                type: 'ARRAY',
                items: { type: 'STRING' }
              }
            },
            required: ['headlines', 'captions', 'hashtags']
          }
        }
      };

      const response = await axios.post(url, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 25000,
      });

      const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        const result = JSON.parse(text.trim());
        return {
          headlines: result.headlines,
          captions: result.captions,
          hashtagsSets: [result.hashtags]
        };
      }
    } catch (err: any) {
      console.warn(`Gemini generateCopy failed: ${err.message || err}`);
    }
  }

  // 2. OpenRouter Fallback
  if (process.env.OPENROUTER_TEXT_API_KEY) {
    try {
      const orModel = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.5-flash-lite";
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: orModel,
          messages: [
            { role: "user", content: systemInstructions }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_TEXT_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
            "X-Title": "CarDekho Social AI",
          },
          timeout: 25000,
        }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      if (text) {
        const result = JSON.parse(text.trim());
        return {
          headlines: result.headlines,
          captions: result.captions,
          hashtagsSets: [result.hashtags]
        };
      }
    } catch (err: any) {
      console.warn(`OpenRouter generateCopy fallback failed: ${err.message || err}`);
    }
  }

  // 3. Hardcoded Fallback
  console.warn("All LLM copy generation failed, falling back to local defaults.");
  const cityTag = params.city.replace(/\s/g, "");
  return {
    headlines: [
      `Congratulations on your new drive! 🚗`,
      `Welcome to the family! 🔑`,
      `New car, new memories! 🎉`
    ],
    captions: [
      `A proud moment for the new owner! Congratulations on driving home your new companion. We are thrilled to be part of your journey! #NewCar #${cityTag}`,
      `Smiles, keys, and a brand new car! Warmest congratulations to the family on their latest addition. Drive safe! #CarDelivery #${cityTag}`,
      `Wishing you endless happy miles and wonderful journeys. Thank you for choosing us for your dream car! #HappyCustomer #${cityTag}`
    ],
    hashtagsSets: [[`#NewCar`, `#DeliveryDay`, `#${cityTag}`, `#CarDekho`]]
  };
}
