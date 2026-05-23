import axios from "axios";

export interface GeminiCreativeOptionOutput {
  headline: string;
  caption_text: string;
  hashtags: string[];
  background_prompt: string;
}

export interface GeminiMultiCreativeOutput {
  options: GeminiCreativeOptionOutput[];
}

export interface GeminiImageInput {
  buffer: Buffer;
  mimeType: string;
}

/**
  * Direct Google Gemini API call helper.
  */
async function callGoogleGeminiApi(
  model: string,
  apiKey: string,
  promptText: string,
  images: GeminiImageInput[]
): Promise<GeminiMultiCreativeOutput> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const textPart = {
    text: `${promptText}

Return the result strictly as a JSON object matching this schema:
{
  "options": [
    {
      "headline": "...",
      "caption_text": "...",
      "hashtags": ["...", "..."],
      "background_prompt": "..."
    }
  ]
}`
  };

  const parts: Array<Record<string, any>> = [textPart];

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.buffer.toString("base64")
      }
    });
  }

  const payload = {
    contents: [
      {
        parts: parts
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          options: {
            type: "ARRAY",
            minItems: 3,
            maxItems: 3,
            items: {
              type: "OBJECT",
              properties: {
                headline: { type: "STRING" },
                caption_text: { type: "STRING" },
                hashtags: {
                  type: "ARRAY",
                  items: { type: "STRING" }
                },
                background_prompt: { type: "STRING" }
              },
              required: ["headline", "caption_text", "hashtags", "background_prompt"]
            }
          }
        },
        required: ["options"]
      }
    }
  };

  const response = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000 // 30 seconds timeout
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini response payload:", JSON.stringify(response.data));
    throw new Error("Invalid response structure from Gemini API");
  }

  const parsed = JSON.parse(text.trim()) as GeminiMultiCreativeOutput;
  if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) {
    throw new Error("Invalid options field in Gemini API response");
  }
  return parsed;
}

/**
  * OpenRouter Text Fallback call helper.
  */
async function callOpenRouterText(
  userPrompt: string,
  images: GeminiImageInput[] = []
): Promise<GeminiMultiCreativeOutput> {
  const apiKey = process.env.OPENROUTER_TEXT_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_TEXT_API_KEY is not configured");
  }

  const model = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.5-flash-lite";

  const systemInstructions = `You are an expert automotive copywriter and creative director for premium Indian car dealerships.
Generate exactly 3 distinct creative options/variants, each with a different vibe/style:
- Option 1: Celebratory/Festive or High-Energy (suitable for sales events, festivals, or active campaigns).
- Option 2: Premium/Luxury or Brand-Focused (focused on prestige, design, comfort, and state-of-the-art tech).
- Option 3: Value/Offer-Oriented or Call-To-Action (direct, clean, highlight on price, EMI options, ease of purchase, and CTAs).

For each option, generate:
1. A visual poster headline (overlay text). Max 50 characters.
2. A detailed social media post caption/copy. In professional, conversational Indian English or Hinglish.
3. Relevant hashtags (4 to 6 items).
4. A highly descriptive prompt for generating the ENTIRE creative image (containing both the car and the matching background scene integrated naturally) in background_prompt. If there is an attached car image, identify the car's model, color, and posture and describe the exact same car in the prompt (e.g. "A photorealistic forest green Hyundai Creta compact SUV, viewed from a front-three-quarter angle"). If no car image is attached, describe a suitable premium car matching the context. Describe the car parked naturally in a premium scene (e.g. scenic mountains, dealer showroom, modern city street) with realistic contact shadows, lighting, and reflections. The prompt MUST NOT ask for any text, headlines, dealer names, phone numbers, or logos to be generated in the image itself, as those will be added dynamically later.

Return the result STRICTLY as a JSON object matching this schema:
{
  "options": [
    {
      "headline": "...",
      "caption_text": "...",
      "hashtags": ["...", "..."],
      "background_prompt": "..."
    }
  ]
}`;

  const messages: any[] = [
    { role: "system", content: systemInstructions },
  ];

  const userContentParts: any[] = [
    {
      type: "text",
      text: `Analyze the user's creative requirements/prompt: "${userPrompt}"`
    }
  ];

  // Only pass images if the model supports it (multimodal models)
  if (images.length > 0 && (model.includes("gemini") || model.includes("gpt-4") || model.includes("claude-3"))) {
    for (const img of images) {
      userContentParts.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`
        }
      });
    }
  }

  messages.push({ role: "user", content: userContentParts });

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.85,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
        "X-Title": "CarDekho Social AI",
      },
      timeout: 30000,
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response from OpenRouter API");
  }

  const parsed = JSON.parse(text.trim()) as GeminiMultiCreativeOutput;
  if (!parsed.options || !Array.isArray(parsed.options) || parsed.options.length === 0) {
    throw new Error("Invalid options field in OpenRouter response");
  }

  return parsed;
}

/**
  * Hardcoded fallback defaults if all API calls fail.
  */
function getHardcodedDefaults(userPrompt: string): GeminiMultiCreativeOutput {
  return {
    options: [
      {
        headline: "Festive Season Launch!",
        caption_text: `Celebrate this festive season with exclusive launch offers! Experience power, prestige, and unmatched performance. Perfect for your family's joy. Specially generated for: ${userPrompt}`,
        hashtags: ["#FestiveLaunch", "#DriveJoy", "#Celebration", "#ExclusiveOffer"],
        background_prompt: "A festive modern car showroom decorated with warm lights and golden flower garlands, polished floor reflecting ambient light, no cars, no people, open lower-center area."
      },
      {
        headline: "Experience Premium Luxury.",
        caption_text: `Elevate your lifestyle with state-of-the-art design, premium interiors, and advanced safety features. Experience true automotive luxury. Specially generated for: ${userPrompt}`,
        hashtags: ["#PremiumLuxury", "#NextGenSUV", "#SophisticatedDrive", "#Innovation"],
        background_prompt: "A modern architectural villa driveway at dusk with clean lines and luxury ambient lighting, scenic view, no cars, no people, open lower-center area."
      },
      {
        headline: "Special Launch Offer: Book Today!",
        caption_text: `Own your dream car with attractive EMI options, special finance rates, and exciting benefits. Limited period offer. Book your test drive now! Specially generated for: ${userPrompt}`,
        hashtags: ["#SpecialOffer", "#CarDeals", "#DriveHomeLuxury", "#BookNow"],
        background_prompt: "A clean, bright modern dealership delivery area with high reflective floor and large windows, no cars, no people, open lower-center area."
      }
    ]
  };
}

/**
 * Calls the Google Gemini API to analyze the raw car images and prompt,
 * generating 3 options of copy, hashtags, headline, and background prompts.
 * Automatically falls back to other models and OpenRouter if primary requests fail.
 */
export interface ExpandedPromptBrief {
  expanded_brief: string;
  positive_prompt: string;
  negative_prompt: string;
  suggested_headline: string;
  suggested_cta: string;
  color_mood: "warm" | "cool" | "neutral";
}

/**
 * Stage 1: Google Gemini brief generation.
 */
async function callGoogleGeminiBrief(
  model: string,
  apiKey: string,
  promptText: string,
  images: GeminiImageInput[]
): Promise<ExpandedPromptBrief> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const textPart = {
    text: `${promptText}

Return the result strictly as a JSON object matching this schema:
{
  "expanded_brief": "...",
  "positive_prompt": "...",
  "negative_prompt": "...",
  "suggested_headline": "...",
  "suggested_cta": "...",
  "color_mood": "warm" | "cool" | "neutral"
}`
  };

  const parts: Array<Record<string, any>> = [textPart];

  for (const img of images) {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.buffer.toString("base64")
      }
    });
  }

  const payload = {
    contents: [
      {
        parts: parts
      }
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          expanded_brief: { type: "STRING" },
          positive_prompt: { type: "STRING" },
          negative_prompt: { type: "STRING" },
          suggested_headline: { type: "STRING" },
          suggested_cta: { type: "STRING" },
          color_mood: {
            type: "STRING",
            enum: ["warm", "cool", "neutral"]
          }
        },
        required: ["expanded_brief", "positive_prompt", "negative_prompt", "suggested_headline", "suggested_cta", "color_mood"]
      }
    }
  };

  const response = await axios.post(url, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 30000
  });

  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error("Gemini response payload:", JSON.stringify(response.data));
    throw new Error("Invalid response structure from Gemini API in prompt engine");
  }

  return JSON.parse(text.trim()) as ExpandedPromptBrief;
}

/**
 * Stage 1: OpenRouter brief generation fallback.
 */
async function callOpenRouterBrief(
  promptText: string,
  images: GeminiImageInput[] = []
): Promise<ExpandedPromptBrief> {
  const apiKey = process.env.OPENROUTER_TEXT_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_TEXT_API_KEY is not configured");
  }

  const model = process.env.OPENROUTER_TEXT_MODEL || "google/gemini-2.5-flash-lite";

  const messages: any[] = [
    { role: "system", content: "You are a professional automotive advertising creative director. Output valid JSON matching the requested schema only." },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: promptText
        }
      ]
    }
  ];

  if (images.length > 0 && (model.includes("gemini") || model.includes("gpt-4") || model.includes("claude-3"))) {
    for (const img of images) {
      messages[1].content.push({
        type: "image_url",
        image_url: {
          url: `data:${img.mimeType};base64,${img.buffer.toString("base64")}`
        }
      });
    }
  }

  const response = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: model,
      messages: messages,
      response_format: { type: "json_object" },
      temperature: 0.7,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
        "X-Title": "CarDekho Social AI",
      },
      timeout: 30000,
    }
  );

  const text = response.data?.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("Empty response from OpenRouter API in prompt engine");
  }

  return JSON.parse(text.trim()) as ExpandedPromptBrief;
}

/**
 * Stage 1: Fallback brief.
 */
function getHardcodedBrief(userPrompt: string): ExpandedPromptBrief {
  const isMonsoon = userPrompt.toLowerCase().includes("monsoon") || userPrompt.toLowerCase().includes("rain");
  const isDiwali = userPrompt.toLowerCase().includes("diwali") || userPrompt.toLowerCase().includes("festive");

  if (isMonsoon) {
    return {
      expanded_brief: `Monsoon season test drive and promotional campaign for vehicle: ${userPrompt}`,
      positive_prompt: "Dramatic monsoon evening, heavy rain falling on empty open road, puddle reflections with city lights, overcast moody sky, rain streaks on a glass surface in the foreground, mist in the background, empty road surface in the lower third for vehicle placement, cinematic automotive photography, cool-blue color grading, backlit rain droplets, f/2.8 bokeh, professional automotive campaign, 8K, hyperrealistic, no cars, no people, no text",
      negative_prompt: "no cars, no vehicles, no text, no watermarks, no logos, no people, no animals, blurry, low resolution, distorted, cartoon, illustration",
      suggested_headline: "Made for Every Monsoon",
      suggested_cta: "Book Your Test Drive Today",
      color_mood: "cool"
    };
  }

  if (isDiwali) {
    return {
      expanded_brief: `Festive Diwali promotional and offer campaign for vehicle: ${userPrompt}`,
      positive_prompt: "Festive Diwali night scene, warm golden bokeh lights, glowing diyas in the background, string lights draped across the upper frame, wet road with golden reflections, clear empty showroom pedestal in the foreground center, cinematic automotive photography lighting, soft warm key light from upper left, dramatic rim light, shallow depth of field, 85mm lens aesthetic, hyperrealistic, 8K, automotive advertising campaign visual, no cars, no vehicles, no text, no people",
      negative_prompt: "no cars, no vehicles, no text, no watermarks, no logos, no people, no animals, blurry, low resolution, distorted, cartoon, illustration",
      suggested_headline: "Drive Home Your Diwali Dream",
      suggested_cta: "Special Offers This Diwali",
      color_mood: "warm"
    };
  }

  return {
    expanded_brief: `Premium launch promotional campaign for vehicle: ${userPrompt}`,
    positive_prompt: "Modern minimalist villa driveway at dusk with clean architectural lines, warm ambient garden lights, sunset sky reflections, clear flat empty platform road surface in the lower third for vehicle placement, cinematic automotive lighting, dramatic rim lighting on vehicle silhouette, shallow depth of field, professional automotive campaign photography, 8K, hyperrealistic, no cars, no vehicles, no text, no people",
    negative_prompt: "no cars, no vehicles, no text, no watermarks, no logos, no people, no animals, blurry, low resolution, distorted, cartoon, illustration",
    suggested_headline: "Experience Premium Luxury",
    suggested_cta: "Book Your Drive Today",
    color_mood: "neutral"
  };
}

/**
 * Creative Prompt Engine.
 * Takes user's input/prompt and optional images, analyzing and detailing them out.
 */
export async function runCreativePromptEngine(
  userPrompt: string,
  images: GeminiImageInput[] = []
): Promise<ExpandedPromptBrief> {
  const apiKey = process.env.GEMINI_API_KEY;

  const promptText = `You are a senior AI systems architect and creative director specializing in generative AI pipelines for premium automotive advertising.
Analyze the user's campaign brief: "${userPrompt}"
${images.length > 0 ? "And analyze the attached vehicle image(s) to understand the vehicle's model, color, and features, so you can build a background matching its mood." : "No car image is attached, so build a generic premium automotive mood."}

Detail it out and expand it into a high-quality campaign brief and image generation positive/negative prompt pair.

You must output a JSON object matching this schema:
{
  "expanded_brief": "One-sentence human-readable summary of the campaign",
  "positive_prompt": "Full background scene positive prompt (150-250 words) following the rules below",
  "negative_prompt": "Full negative prompt following the rules below",
  "suggested_headline": "Short punchy ad headline derived from user brief (5-8 words)",
  "suggested_cta": "Call-to-action text (4-6 words)",
  "color_mood": "warm" | "cool" | "neutral"
}

PROMPT STRUCTURE RULES:
1. Scene Setting: Describe the environment, time of day, weather, and mood fitting the campaign theme (e.g. Diwali -> warm golden bokeh, festive string lights; Monsoon -> rain on wet road, overcast sky; Summer sale -> golden hour highway, open road, warm haze).
2. Atmosphere Keywords: Include professional lighting terms like "cinematic lighting, soft key light from left, rim lighting on vehicle silhouette, lens flare, shallow depth of field, 85mm f/1.8 aesthetic".
3. Background Composition Rules: The background MUST be compositionally ready for a car to be placed in post. You MUST include this EXACT phrase: "empty foreground space reserved for vehicle placement, no objects in center-bottom third of frame, clear flat platform zone (showroom floor, road, or pedestal)".
4. Style Anchors: End the positive prompt with quality and style tags: "automotive advertising photography, hyperrealistic, 8K, shot for glossy magazine, no watermarks, no text, no people".
5. Negative Prompt: Always set the negative_prompt exactly to: "no cars, no vehicles, no text, no watermarks, no logos, no people, no animals, blurry, low resolution, distorted, cartoon, illustration".
`;

  // 1. Try Google Gemini API with gemini-2.5-flash
  if (apiKey) {
    try {
      console.log("Attempting prompt brief generation with gemini-2.5-flash...");
      return await callGoogleGeminiBrief("gemini-2.5-flash", apiKey, promptText, images);
    } catch (err: any) {
      console.warn(`Gemini gemini-2.5-flash brief generation failed: ${err.message || err}`);
    }

    try {
      console.log("Attempting prompt brief fallback with gemini-2.5-flash-lite...");
      return await callGoogleGeminiBrief("gemini-2.5-flash-lite", apiKey, promptText, images);
    } catch (err: any) {
      console.warn(`Gemini gemini-2.5-flash-lite brief generation failed: ${err.message || err}`);
    }

    try {
      console.log("Attempting prompt brief fallback with gemini-1.5-flash...");
      return await callGoogleGeminiBrief("gemini-1.5-flash", apiKey, promptText, images);
    } catch (err: any) {
      console.warn(`Gemini gemini-1.5-flash brief generation failed: ${err.message || err}`);
    }
  }

  // 2. Try OpenRouter Text API
  if (process.env.OPENROUTER_TEXT_API_KEY) {
    try {
      console.log("Attempting prompt brief fallback via OpenRouter...");
      return await callOpenRouterBrief(promptText, images);
    } catch (err: any) {
      console.warn(`OpenRouter brief generation failed: ${err.message || err}`);
    }
  }

  console.warn("All prompt engine API calls failed, using hardcoded fallback brief.");
  return getHardcodedBrief(userPrompt);
}

/**
 * Calls the Google Gemini API to analyze the raw car images and prompt,
 * generating a structured creative brief, and then producing 3 options
 * of copy, hashtags, headline, and background prompts matching that brief.
 */
export async function generateGeminiCreativeContent(
  userPrompt: string,
  images: GeminiImageInput[] = []
): Promise<{ brief: ExpandedPromptBrief; options: GeminiCreativeOptionOutput[] }> {
  const apiKey = process.env.GEMINI_API_KEY;

  // Step 1: Run Creative Prompt Engine
  const brief = await runCreativePromptEngine(userPrompt, images);

  // Step 2: Use the brief to generate 3 distinct layout variants
  const promptInstructions = `You are an expert automotive copywriter and creative director for premium Indian car dealerships.
Using the following Campaign Brief generated by our prompt engine, create exactly 3 distinct creative options/variants:
- Option 1: Celebratory/Festive or High-Energy (suitable for sales events, festivals, or active campaigns).
- Option 2: Premium/Luxury or Brand-Focused (focused on prestige, design, comfort, and state-of-the-art tech).
- Option 3: Value/Offer-Oriented or Call-To-Action (direct, clean, highlight on price, EMI options, ease of purchase, and CTAs).

CAMPAIGN BRIEF:
- Brief: ${brief.expanded_brief}
- Suggested Headline: ${brief.suggested_headline}
- Suggested CTA: ${brief.suggested_cta}
- Color Mood: ${brief.color_mood}
- Base Positive Prompt: ${brief.positive_prompt}

For each option, generate:
1. A visual poster headline (overlay text). Max 50 characters. Punchy, high-impact, specific. (e.g. Option 1 could be Diwali/Festive themed, Option 2 luxury-focused, Option 3 savings-focused).
2. A detailed social media post caption/copy. In professional, conversational Indian English or Hinglish.
3. Relevant hashtags (4 to 6 items).
4. A highly descriptive background_prompt. The background_prompt is used to generate the ENTIRE image containing BOTH the car and the matching background scene integrated naturally. You MUST adapt the Base Positive Prompt from the Campaign Brief to fit the specific style/vibe of the option:
   - Option 1 (Festive): Modify the Base Positive Prompt to include festive lights, golden string lights, diyas, flower garlands, or celebratory decorations in the background. Keep the composition rules ("empty foreground space reserved for vehicle placement, no objects in center-bottom third of frame, clear flat platform zone (showroom floor, road, or pedestal)").
   - Option 2 (Premium): Modify the Base Positive Prompt to emphasize high-end modern architecture, sleek reflections, dramatic shadows, and premium styling. Keep the composition rules.
   - Option 3 (Value): Modify the Base Positive Prompt to set it in a clean, bright, professional dealer delivery area, showroom bay, or modern studio setup suitable for a direct offer. Keep the composition rules.

The background_prompt MUST NOT ask for any text, headlines, dealer names, phone numbers, or logos to be generated in the image itself.`;

  let multiCreativeOutput: GeminiMultiCreativeOutput;

  // 1. Try Google Gemini API with gemini-2.5-flash
  if (apiKey) {
    try {
      console.log("Attempting creative option generation with gemini-2.5-flash...");
      multiCreativeOutput = await callGoogleGeminiApi("gemini-2.5-flash", apiKey, promptInstructions, images);
      return { brief, options: multiCreativeOutput.options };
    } catch (err: any) {
      console.warn(`Gemini gemini-2.5-flash content generation failed: ${err.message || err}`);
    }

    try {
      console.log("Attempting creative option generation fallback with gemini-2.5-flash-lite...");
      multiCreativeOutput = await callGoogleGeminiApi("gemini-2.5-flash-lite", apiKey, promptInstructions, images);
      return { brief, options: multiCreativeOutput.options };
    } catch (err: any) {
      console.warn(`Gemini gemini-2.5-flash-lite content generation failed: ${err.message || err}`);
    }

    try {
      console.log("Attempting creative option generation fallback with gemini-1.5-flash...");
      multiCreativeOutput = await callGoogleGeminiApi("gemini-1.5-flash", apiKey, promptInstructions, images);
      return { brief, options: multiCreativeOutput.options };
    } catch (err: any) {
      console.warn(`Gemini gemini-1.5-flash content generation failed: ${err.message || err}`);
    }
  }

  // 2. Try OpenRouter Text API
  if (process.env.OPENROUTER_TEXT_API_KEY) {
    try {
      console.log("Attempting creative option generation fallback via OpenRouter...");
      multiCreativeOutput = await callOpenRouterText(promptInstructions, images);
      return { brief, options: multiCreativeOutput.options };
    } catch (err: any) {
      console.warn(`OpenRouter content generation failed: ${err.message || err}`);
    }
  }

  // 3. Final fallback to high-quality hardcoded defaults
  console.warn("All LLM creative content generation failed, falling back to local defaults.");
  return { brief, options: getHardcodedDefaults(userPrompt).options };
}
