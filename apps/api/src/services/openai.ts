import OpenAI from "openai"

// verbatimModuleSyntax requires InstanceType<typeof X> instead of X as a type annotation
type OpenAIClient = InstanceType<typeof OpenAI>

let client: OpenAIClient | null = null

function getClient(): OpenAIClient {
  if (!client) {
    const apiKey = process.env["OPENAI_API_KEY"]
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set")
    client = new OpenAI({ apiKey })
  }
  return client
}

export interface DealerContext {
  name: string
  city: string
  brands: string[]
  phone: string
  whatsapp: string
  language_preferences: string[]
}

export interface InventoryContext {
  make?: string
  model?: string
  variant?: string
  price?: number
  features?: string[]
  stock_count?: number
}

export interface CaptionVariant {
  caption_text: string
  hashtags: string[]
  suggested_emoji: string[]
  platform_notes: string
  style: "punchy" | "detailed" | "emotional"
}

export interface GeneratedCaptions {
  variants: [CaptionVariant, CaptionVariant, CaptionVariant]
  hindi_variants?: [string, string, string]
}

const SYSTEM_PROMPT = `You are a social media marketing expert for Indian automobile dealerships.
You write captions that drive footfall, enquiries, and leads.

RULES:
1. Never invent or approximate prices. If no price provided, omit pricing entirely.
2. Never invent vehicle specifications. Only use provided data.
3. Include a clear call-to-action: visit showroom, call now, WhatsApp us.
4. Use the dealer's city name for local relevance.
5. Keep tone professional but warm — trusted local business, not a meme page.
6. If festival context is provided, weave it naturally — do not force it.
7. Generate exactly 3 variants:
   - "punchy": Short (under 60 words), bold, urgent. Best for Instagram.
   - "detailed": Informative (100-150 words), lists key details, EMI/price if available.
   - "emotional": Aspirational (80-120 words), connects the car to lifestyle/family/dreams.

OUTPUT FORMAT (valid JSON only, no markdown fences):
{
  "variants": [
    { "caption_text": "...", "hashtags": ["#tag1",...], "suggested_emoji": ["🚗"], "platform_notes": "...", "style": "punchy" },
    { "caption_text": "...", "hashtags": ["#tag1",...], "suggested_emoji": ["✨"], "platform_notes": "...", "style": "detailed" },
    { "caption_text": "...", "hashtags": ["#tag1",...], "suggested_emoji": ["❤️"], "platform_notes": "...", "style": "emotional" }
  ]
}`

export async function generateCaptions(
  prompt: string,
  dealer: DealerContext,
  inventory?: InventoryContext,
  festivalContext?: string,
  languageMode: 'en' | 'hi' | 'hinglish' | 'bilingual' = 'en',
): Promise<GeneratedCaptions> {
  const openai = getClient()
  const includeHindi = languageMode === 'bilingual'

  let languageInstruction = 'All captions must be written in fluent Indian English, incorporating local English idioms if relevant.';
  if (languageMode === 'hi') {
    languageInstruction = 'All captions must be written in pure Devanagari script (Hindi - हिंदी) only. Do not use Roman script except for technical words or models if necessary. Ensure correct grammar and natural Indian automobile dealer tone.';
  } else if (languageMode === 'hinglish') {
    languageInstruction = 'All captions must be written in Hinglish (Hindi words written in the Roman/Latin script - e.g., "Nayi car lene ka soch rahe hain? Aaj hi humare showroom visit karein aur test drive lein!"). Use colloquial, trendy, and conversational Hinglish.';
  } else if (languageMode === 'bilingual') {
    languageInstruction = 'All captions must be written in a bilingual format: provide a section in fluent English followed by a corresponding section in Hindi (Devanagari script), separated by a line break.';
  }

  const systemPrompt = `You are a social media marketing expert for Indian automobile dealerships.
You write captions that drive footfall, enquiries, and leads.

LANGUAGE DIRECTION:
${languageInstruction}

RULES:
1. Never invent or approximate prices. If no price provided, omit pricing entirely.
2. Never invent vehicle specifications. Only use provided data.
3. Include a clear call-to-action: visit showroom, call now, WhatsApp us.
4. Use the dealer's city name for local relevance.
5. Keep tone professional but warm — trusted local business, not a meme page.
6. If festival context is provided, weave it naturally — do not force it.
7. Generate exactly 3 variants:
   - "punchy": Short (under 60 words), bold, urgent. Best for Instagram.
   - "detailed": Informative (100-150 words), lists key details, EMI/price if available.
   - "emotional": Aspirational (80-120 words), connects the car to lifestyle/family/dreams.

OUTPUT FORMAT (valid JSON only, no markdown fences):
{
  "variants": [
    { "caption_text": "...", "hashtags": ["#tag1",...], "suggested_emoji": ["🚗"], "platform_notes": "...", "style": "punchy" },
    { "caption_text": "...", "hashtags": ["#tag1",...], "suggested_emoji": ["✨"], "platform_notes": "...", "style": "detailed" },
    { "caption_text": "...", "hashtags": ["#tag1",...], "suggested_emoji": ["❤️"], "platform_notes": "...", "style": "emotional" }
  ]${includeHindi ? ',\n  "hindi_variants": ["<variant 1 in Hindi>", "<variant 2 in Hindi>", "<variant 3 in Hindi>"]' : ''}
}`

  const vehicleBlock = inventory
    ? `VEHICLE CONTEXT:
- Make/Model: ${inventory.make ?? ""} ${inventory.model ?? ""} ${inventory.variant ?? ""}
- Price: ${inventory.price ? `₹${(inventory.price / 100000).toFixed(2)} Lakhs (exact — do not approximate)` : "not provided — omit pricing"}
- Key Features: ${inventory.features?.join(", ") ?? "not provided"}
- Stock: ${inventory.stock_count ?? "available"} units`
    : "VEHICLE CONTEXT: Not provided — use prompt details only."

  const userMessage = `DEALER CONTEXT:
- Name: ${dealer.name}
- City: ${dealer.city}
- Brand(s): ${dealer.brands.join(", ")}
- Phone: ${dealer.phone}
- WhatsApp: ${dealer.whatsapp}

${vehicleBlock}
${festivalContext ? `\nFESTIVAL CONTEXT: ${festivalContext}` : ""}

DEALER PROMPT: "${prompt}"

Generate 3 caption variants as specified.`

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.8,
    max_tokens: 1500,
    response_format: { type: "json_object" },
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error("Empty response from OpenAI")

  const parsed = JSON.parse(content) as {
    variants: [CaptionVariant, CaptionVariant, CaptionVariant]
  }

  // Generate Hindi variants if requested or dealer prefers Hindi
  let hindi_variants: [string, string, string] | undefined
  if (includeHindi || dealer.language_preferences.includes("hi")) {
    hindi_variants = await generateHindiVariants(
      openai,
      parsed.variants,
      dealer,
    )
  }

  return hindi_variants
    ? { variants: parsed.variants, hindi_variants }
    : { variants: parsed.variants }
}

async function generateHindiVariants(
  openai: OpenAIClient,
  variants: CaptionVariant[],
  dealer: DealerContext,
): Promise<[string, string, string]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a Hindi copywriter for Indian automobile dealerships in ${dealer.city}.
Generate captions NATIVELY in Hindi — do NOT translate from English.
Use idioms, phrasing, and expressions natural to Hindi-speaking automobile buyers.
Keep the same intent and call-to-action as the English version.
Return JSON: { "hi_0": "...", "hi_1": "...", "hi_2": "..." }`,
      },
      {
        role: "user",
        content: `Create Hindi versions of these 3 captions for ${dealer.name}, ${dealer.city}:
0: ${variants[0]?.caption_text ?? ""}
1: ${variants[1]?.caption_text ?? ""}
2: ${variants[2]?.caption_text ?? ""}`,
      },
    ],
    temperature: 0.7,
    max_tokens: 1000,
    response_format: { type: "json_object" },
  })

  const content = response.choices[0]?.message?.content
  if (!content) return ["", "", ""]
  const parsed = JSON.parse(content) as {
    hi_0: string
    hi_1: string
    hi_2: string
  }
  return [parsed.hi_0 ?? "", parsed.hi_1 ?? "", parsed.hi_2 ?? ""]
}

export async function generateInboxReply(
  messageText: string,
  sentiment: string,
  dealer: DealerContext,
  messageType: "comment" | "dm" | "review",
  inventory?: { make: string; model: string; price?: number }[],
  tone?: string,
): Promise<string> {
  const openai = getClient()

  const maxWords = messageType === "comment" ? 80 : 180

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a helpful customer service assistant for ${dealer.name}, an automobile dealership in ${dealer.city}.

RULES:
1. Be polite, professional, and helpful.
2. If the customer asks about a specific vehicle and inventory data is provided, include basic info.
3. If the customer is complaining, acknowledge their concern sincerely and offer a callback from the manager.
4. Never make promises about pricing or discounts unless provided.
5. Always include a CTA: visit showroom, call ${dealer.phone}, or WhatsApp ${dealer.whatsapp}.
6. Keep the response under ${maxWords} words.
7. Match the language of the customer's message (Hindi reply for Hindi message, etc.).
8. SENTIMENT: ${sentiment}.${tone ? ` TONE OF RESPONSE: Use a strictly ${tone} tone.` : ""}

Return only the reply text — no JSON, no labels.`,
      },
      {
        role: "user",
        content: `Customer ${messageType}: "${messageText}"${inventory && inventory.length > 0 ? `\n\nAvailable inventory context: ${inventory.map((i) => `${i.make} ${i.model}${i.price ? ` at ₹${(i.price / 100000).toFixed(2)}L` : ""}`).join(", ")}` : ""}`,
      },
    ],
    temperature: 0.6,
    max_tokens: 300,
  })

  return response.choices[0]?.message?.content?.trim() ?? ""
}

export async function generateTestimonialCaption(
  reviewText: string,
  customerName: string,
  dealer: { name: string; city: string },
): Promise<{ caption: string; hashtags: string[] }> {
  const openai = getClient()
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a social media copywriter for Indian automobile dealerships.
Convert a positive customer review/comment into a highly engaging social media testimonial post.
Write an enthusiastic caption thanking the customer, highlight their positive feedback, and add relevant hashtags (e.g., #CustomerReview, #HappyCustomer, #CarDekho, etc.).
Keep it under 100 words.
Return JSON: { "caption": "...", "hashtags": ["#tag1", "#tag2", ...] }`,
      },
      {
        role: "user",
        content: `Review from ${customerName} for ${dealer.name} in ${dealer.city}:\n"${reviewText}"`,
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
  })

  const content = response.choices[0]?.message?.content
  if (!content) throw new Error("Empty response from OpenAI")
  const parsed = JSON.parse(content) as { caption: string; hashtags: string[] }
  return {
    caption: parsed.caption || "",
    hashtags: parsed.hashtags || [],
  }
}

