import type { FastifyInstance } from "fastify"
import { randomUUID } from "crypto"
import { readFile, writeFile, mkdir, unlink } from "fs/promises"
import path from "path"
import { execFile } from "child_process"
import { promisify } from "util"
import sharp from "sharp"
import { prisma } from "../db/prisma.js"
import { generateCaptions as openaiGenerateCaptions } from "../services/openai.js"
import {
  generateCaptions as groqGenerateCaptions,
  transformCaption as groqTransformCaption,
  isGroqAvailable,
} from "../services/groq.js"
import {
  generateCaptions as openrouterGenerateCaptions,
  transformCaption as openrouterTransformCaption,
  isOpenRouterAvailable,
} from "../services/openrouter.js"
import {
  renderCreatives,
  extractHeadline,
} from "../services/templateRenderer.js"
import { ORIGINALS_DIR, CREATIVES_DIR } from "./upload.js"
import { uploadFile } from "../lib/storage.js"
import type { GeneratedCaptions } from "../services/openai.js"
import {
  generateImage as cfGenerateImage,
  isCloudflareAvailable,
} from "../services/cloudflareAI.js"
import { generateOpenRouterImage, isOpenRouterImageAvailable } from "../services/openrouterImage.js"
import { generateGeminiImage, isGeminiImageAvailable } from "../services/geminiImage.js"
import { removeBackground } from "../services/backgroundRemoval.js"
import {
  compositeLayered,
  type DealerBranding,
} from "../services/layeredCompositor.js"
import {
  generateGeminiCreativeContent,
  generateGeminiCaptions,
  isGeminiTextAvailable,
} from "../services/geminiService.js"
import { getBrandLogoSvg } from "../services/brandLogoService.js"


const execFileAsync = promisify(execFile)

// ── Gradient background fallback (no external AI needed) ──────────────────────
// Generates a rich automotive-themed 1080×1080 gradient PNG using Sharp + SVG.
async function generateGradientBackground(primaryColor = '#f97316'): Promise<Buffer> {
  // Parse hex to safe string
  const color = primaryColor.startsWith('#') ? primaryColor : '#f97316'
  const svg = `<svg width="1080" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0a0c14"/>
        <stop offset="60%" stop-color="#141824"/>
        <stop offset="100%" stop-color="#1e1030"/>
      </linearGradient>
      <radialGradient id="glow" cx="70%" cy="35%" r="55%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="glow2" cx="20%" cy="80%" r="40%">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="1080" height="1080" fill="url(#g1)"/>
    <rect width="1080" height="1080" fill="url(#glow)"/>
    <rect width="1080" height="1080" fill="url(#glow2)"/>
    <!-- Subtle grid lines -->
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 90}" y1="0" x2="${i * 90}" y2="1080" stroke="white" stroke-opacity="0.02"/>`).join('')}
    ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="1080" y2="${i * 90}" stroke="white" stroke-opacity="0.02"/>`).join('')}
    <!-- Diagonal accent -->
    <line x1="0" y1="1080" x2="1080" y2="0" stroke="${color}" stroke-opacity="0.06" stroke-width="180"/>
  </svg>`
  return sharp(Buffer.from(svg)).png().toBuffer()
}

// Simple in-memory cache: key → {result, expires}
const captionCache = new Map<string, { result: unknown; expires: number }>()

// Try Groq → OpenRouter → mock
async function generateCaptionsAI(
  prompt: string,
  dealerContext: Parameters<typeof openaiGenerateCaptions>[1],
  inventoryContext?: Parameters<typeof openaiGenerateCaptions>[2],
  languageMode: 'en' | 'hi' | 'hinglish' | 'bilingual' = 'en',
  inspirationPosts?: string[],
  postType?: string,
): Promise<GeneratedCaptions> {
  // 1. Try Gemini direct (primary)
  if (isGeminiTextAvailable()) {
    try {
      return await generateGeminiCaptions(prompt, dealerContext, inventoryContext, inspirationPosts, postType, languageMode)
    } catch (err) {
      console.error("Gemini caption generation failed, falling back to Groq:", err)
    }
  }

  // 2. Try Groq (fallback)
  if (isGroqAvailable()) {
    try {
      return await groqGenerateCaptions(prompt, dealerContext, inventoryContext, inspirationPosts, postType, languageMode)
    } catch (err) {
      console.error("Groq generation failed, falling back to OpenRouter:", err)
    }
  }

  // 3. Try OpenRouter (fallback)
  if (isOpenRouterAvailable()) {
    try {
      return await openrouterGenerateCaptions(
        prompt,
        dealerContext,
        inventoryContext,
        inspirationPosts,
        postType,
        languageMode,
      )
    } catch (err) {
      console.error("OpenRouter generation failed, falling back to mock:", err)
    }
  }

  // 3. Mock fallback — 3 distinct angles
  const city = dealerContext.city.replace(/\s/g, "")
  return {
    variants: [
      {
        caption_text: `⚡ LIMITED TIME OFFER!\n\n${prompt}\n\nDon't miss out — visit ${dealerContext.name} in ${dealerContext.city} TODAY. Stock is limited!\n📞 Call now: ${dealerContext.phone}`,
        hashtags: [`#${city}`, "#LimitedOffer", "#CarDeal", "#ActNow"],
        suggested_emoji: ["⚡", "🚗", "📞"],
        platform_notes: "Best for Instagram Stories/Reels",
        style: "punchy",
      },
      {
        caption_text: `Here's why ${dealerContext.city} customers choose ${dealerContext.name}:\n\n✅ ${prompt}\n✅ Easy finance & EMI options\n✅ Trusted dealership with expert support\n✅ Test drive at your convenience\n\nVisit our showroom or call us at ${dealerContext.phone} to know more. We're here to make your car buying journey smooth and exciting!`,
        hashtags: [
          `#${city}`,
          "#CarBuying",
          "#TestDrive",
          "#AutoFinance",
          "#TrustedDealer",
        ],
        suggested_emoji: ["✅", "🚗", "💰"],
        platform_notes: "Best for Facebook",
        style: "detailed",
      },
      {
        caption_text: `Some journeys change everything.\n\n${prompt}.\n\nAt ${dealerContext.name}, we believe every family deserves the car of their dreams. Let us make yours happen.\n\n💬 WhatsApp us: ${dealerContext.whatsapp}`,
        hashtags: [`#${city}`, "#DreamCar", "#FamilyFirst", "#NewBeginnings"],
        suggested_emoji: ["❤️", "🌟", "🚗"],
        platform_notes: "Best for Instagram Feed",
        style: "emotional",
      },
    ],
  }
}

async function transformCaptionAI(caption: string, instruction: string): Promise<string> {
  if (isGroqAvailable()) {
    try { return await groqTransformCaption(caption, instruction) } catch (err) {
      console.error("Groq transform failed, falling back to OpenRouter:", err)
    }
  }
  if (isOpenRouterAvailable()) {
    try { return await openrouterTransformCaption(caption, instruction) } catch (err) {
      console.error("OpenRouter transform failed:", err)
    }
  }
  return caption
}

async function getDealerOrFallback(dealerId?: string): Promise<any> {
  let dealer = dealerId ? await prisma.dealer.findUnique({ where: { id: dealerId } }) : null
  if (!dealer) {
    dealer = await prisma.dealer.findFirst({
      where: { name: { contains: 'demo', mode: 'insensitive' } },
    })
  }
  if (!dealer) {
    dealer = await prisma.dealer.findFirst({
      where: { name: { contains: 'janani', mode: 'insensitive' } },
    })
  }
  if (!dealer) {
    dealer = await prisma.dealer.findFirst()
  }
  return dealer
}

export default async function creativeRoutes(fastify: FastifyInstance) {
  // POST /v1/creatives/generate
  fastify.post(
    "/generate",
    {
      preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const body = request.body as {
        prompt: string
        platforms?: string[]
        image_id?: string // filename from POST /v1/upload/image
        force?: boolean // bypass caption cache
        includeHindi?: boolean
        language?: string
        languageMode?: 'en' | 'hi' | 'hinglish' | 'bilingual'
        post_type?: string // offer | new_arrival | delivery | festival | testimonial | engagement | service | ev | finance
      }
      const { prompt, platforms, image_id, force } = body
      
      let languageMode: 'en' | 'hi' | 'hinglish' | 'bilingual' = body.languageMode || 'en'
      if (!body.languageMode) {
        if (body.includeHindi || body.language === "hi") {
          languageMode = 'bilingual'
        }
      }
      const postType = body.post_type

      if (!prompt?.trim()) {
        return reply
          .code(400)
          .send({
            error: { code: "INVALID_INPUT", message: "prompt is required" },
          })
      }

      let dealer = await prisma.dealer.findUnique({
        where: { id: dealer_id },
      })
      if (!dealer) {
        // Attempt fallback by dealer name (case-insensitive) for legacy clients like Janani
        const fallbackDealer = await prisma.dealer.findFirst({
          where: { name: { contains: 'janani', mode: 'insensitive' } },
        });
        if (fallbackDealer) {
          // Continue with found dealer
          dealer = fallbackDealer;
        } else {
          return reply
            .code(404)
            .send({ error: { code: "NOT_FOUND", message: "Dealer not found" } });
        }
      }

      const dealerContext = {
        name: dealer.name,
        city: dealer.city,
        brands: (dealer.brands as string[] | null) ?? [],
        phone: dealer.contact_phone ?? dealer.phone,
        whatsapp: dealer.whatsapp_number ?? dealer.phone,
        language_preferences:
          (dealer.language_preferences as string[] | null) ?? [],
      }

      // Fetch inspiration handles for this dealer (cached posts for AI context)
      const inspirationHandles = await prisma.inspirationHandle.findMany({
        where: { dealer_id },
        select: { posts_cache: true },
      });
      const inspirationPosts: string[] = inspirationHandles
        .flatMap((h) => {
          const cache = h.posts_cache;
          if (Array.isArray(cache)) return cache as string[];
          return [];
        })
        .filter(Boolean)
        .slice(0, 10); // Cap at 10 posts to avoid bloating the prompt

      // Match inventory from prompt keywords
      const words = prompt.toLowerCase().split(/\s+/)
      const vehicleMatch = await prisma.inventoryItem.findFirst({
        where: {
          dealer_id,
          status: "in_stock",
          OR: words.map((w) => ({
            OR: [
              { make: { contains: w, mode: "insensitive" } },
              { model: { contains: w, mode: "insensitive" } },
            ],
          })),
        },
      })

      const inventoryContext = vehicleMatch
        ? {
            make: vehicleMatch.make,
            model: vehicleMatch.model,
            ...(vehicleMatch.variant ? { variant: vehicleMatch.variant } : {}),
            price: vehicleMatch.price,
            features: [] as string[],
            stock_count: vehicleMatch.stock_count,
          }
        : undefined

      // Cache captions (not images)
      const cacheKey = `${dealer_id}:${prompt}:${vehicleMatch?.id ?? "none"}:${languageMode}`
      const cached = captionCache.get(cacheKey)
      const cachedCaptions =
        !force && cached && cached.expires > Date.now()
          ? (cached.result as GeneratedCaptions)
          : null

      let captions: GeneratedCaptions
      if (cachedCaptions) {
        captions = cachedCaptions
      } else {
        try {
          captions = await generateCaptionsAI(
            prompt,
            dealerContext,
            inventoryContext,
            languageMode,
            inspirationPosts.length > 0 ? inspirationPosts : undefined,
            postType,
          )
          captionCache.set(cacheKey, {
            result: captions,
            expires: Date.now() + 24 * 60 * 60 * 1000,
          })
        } catch (err) {
          fastify.log.error(err, "Caption generation failed")
          return reply
            .code(500)
            .send({
              error: {
                code: "AI_ERROR",
                message: "Caption generation failed. Please try again.",
              },
            })
        }
      }

      // Render templates if an image was uploaded
      let creatives: Array<{
        id: string
        template_name: string
        thumbnail_url: string | null
        platform_urls: Record<string, string | null>
      }>

      if (image_id) {
        try {
          const imageBuffer = await readFile(path.join(ORIGINALS_DIR, image_id))
          const headline = extractHeadline(
            captions.variants[0]?.caption_text ?? prompt,
          )
          const filePrefix = randomUUID()

          const rendered = await renderCreatives({
            imageBuffer,
            headline,
            dealerName: dealer.name,
            city: dealer.city,
            phone: dealer.contact_phone ?? dealer.phone,
            whatsapp:
              dealer.whatsapp_number ?? dealer.contact_phone ?? dealer.phone,
            address: [dealer.city, dealer.state].filter(Boolean).join(", "),
            primaryColor: dealer.primary_color ?? "#1877F2",
            ...(inventoryContext?.price != null
              ? { price: inventoryContext.price }
              : {}),
            outputDir: CREATIVES_DIR,
            filePrefix,
          })

          // Upload rendered files (S3/R2 in prod, local URL in dev)
          const { readFile: readRendered } = await import("fs/promises")
          const uploadRendered = async (filename: string) => {
            const buf = await readRendered(path.join(CREATIVES_DIR, filename))
            return uploadFile(
              buf,
              `creatives/${filename}`,
              "image/png",
              CREATIVES_DIR,
            )
          }

          const [bbUrl, msUrl, ocUrl] = await Promise.all([
            uploadRendered(rendered.boldBanner),
            uploadRendered(rendered.minimalShowcase),
            uploadRendered(rendered.offerCard),
          ])

          creatives = [
            {
              id: "tpl_bold_banner",
              template_name: "Bold Banner",
              thumbnail_url: bbUrl,
              platform_urls: {
                facebook: bbUrl,
                instagram: bbUrl,
                instagram_story: null,
                gmb: bbUrl,
              },
            },
            {
              id: "tpl_minimal",
              template_name: "Minimal Showcase",
              thumbnail_url: msUrl,
              platform_urls: {
                facebook: msUrl,
                instagram: msUrl,
                instagram_story: null,
                gmb: msUrl,
              },
            },
            {
              id: "tpl_offer_card",
              template_name: "Offer Card",
              thumbnail_url: ocUrl,
              platform_urls: {
                facebook: ocUrl,
                instagram: ocUrl,
                instagram_story: null,
                gmb: ocUrl,
              },
            },
          ]
        } catch (err) {
          fastify.log.error(
            err,
            "Template rendering failed, using placeholders",
          )
          creatives = mockCreatives()
        }
      } else {
        creatives = mockCreatives()
      }

      const hindiCaptions =
        captions.hindi_variants?.length === 3
          ? captions.hindi_variants.map((captionText, idx) => ({
              caption_text: captionText,
              hashtags: captions.variants[idx]?.hashtags ?? [],
              suggested_emoji: captions.variants[idx]?.suggested_emoji ?? [],
              platform_notes: captions.variants[idx]?.platform_notes ?? "",
              style: captions.variants[idx]?.style,
            }))
          : null

      return {
        success: true,
        captions: captions.variants,
        hindi_captions: hindiCaptions,
        creatives,
        inventory_matched: vehicleMatch
          ? {
              id: vehicleMatch.id,
              make: vehicleMatch.make,
              model: vehicleMatch.model,
              price: vehicleMatch.price,
            }
          : null,
        platforms_requested: platforms ?? ["facebook", "instagram", "gmb"],
        cached: !!cachedCaptions,
      }
    },
  )

  // POST /v1/creatives/generate-branded  (AI image + Sharp template composite → branded creative URL)
  fastify.post(
    "/generate-branded",
    { preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const body = request.body as {
        headline: string
        template_index?: 0 | 1 | 2
      }

      if (!body.headline?.trim()) {
        return reply.code(400).send({
          error: { code: "INVALID_INPUT", message: "headline is required" },
        })
      }

      const dealer = await getDealerOrFallback(dealer_id)
      if (!dealer)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Dealer not found" } })

      try {
        // Use Cloudflare SDXL if available, otherwise fall back to a Sharp-rendered
        // gradient background that looks polished with the dealer overlay.
        let imageBuffer: Buffer | null = null;
        const imagePrompt =
          `Professional automotive photography for Indian car dealership. ` +
          `${body.headline.slice(0, 120)}. ` +
          `Photorealistic, cinematic lighting, 4K quality, no text overlay, ` +
          `clean background, showroom or open road setting.`

        if (isGeminiImageAvailable()) {
          try {
            imageBuffer = await generateGeminiImage(imagePrompt)
          } catch (err) {
            fastify.log.error(err, "Gemini image generation failed, falling back")
          }
        }
        if (!imageBuffer && isCloudflareAvailable()) {
          try {
            imageBuffer = await cfGenerateImage(imagePrompt.slice(0, 500))
          } catch (err) {
            fastify.log.error(err, "Cloudflare image generation failed, falling back")
          }
        }
        if (!imageBuffer && isOpenRouterImageAvailable()) {
          try {
            imageBuffer = await generateOpenRouterImage(imagePrompt.slice(0, 500))
          } catch (err) {
            fastify.log.error(err, "OpenRouter image generation failed, falling back")
          }
        }
        if (!imageBuffer) {
          imageBuffer = await generateGradientBackground(dealer.primary_color ?? '#f97316')
        }
        const filePrefix = randomUUID()

        const rendered = await renderCreatives({
          imageBuffer,
          headline: body.headline,
          dealerName: dealer.name,
          city: dealer.city,
          phone: dealer.contact_phone ?? dealer.phone,
          whatsapp:
            dealer.whatsapp_number ?? dealer.contact_phone ?? dealer.phone,
          address: [dealer.city, dealer.state].filter(Boolean).join(", "),
          primaryColor: dealer.primary_color ?? "#1877F2",
          outputDir: CREATIVES_DIR,
          filePrefix,
        })

        const templateFiles = [
          rendered.boldBanner,
          rendered.minimalShowcase,
          rendered.offerCard,
        ] as const
        const templateNames = [
          "Bold Banner",
          "Minimal Showcase",
          "Offer Card",
        ] as const
        const idx = Math.min(body.template_index ?? 0, 2) as 0 | 1 | 2
        const targetFile = templateFiles[idx]
        const templateName = templateNames[idx]

        const buf = await readFile(path.join(CREATIVES_DIR, targetFile))
        const url = await uploadFile(
          buf,
          `creatives/${targetFile}`,
          "image/jpeg",
          CREATIVES_DIR,
        )

        return { url, template_name: templateName }
      } catch (err) {
        fastify.log.error(err, "AI branded creative generation failed")
        return reply.code(500).send({
          error: {
            code: "AI_ERROR",
            message: "Creative generation failed. Please try again.",
          },
        })
      }
    },
  )

  // POST /v1/creatives/generate-layered  (3-layer: subject + AI background + SVG branding)
  fastify.post(
    "/generate-layered",
    { preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const body = request.body as {
        headline: string
        template_index?: 0 | 1 | 2
        /** Filename from POST /v1/upload/image — becomes Layer 1 subject */
        subject_image_id?: string
        /** External URL to fetch as Layer 1 subject */
        subject_image_url?: string
      }

      if (!body.headline?.trim()) {
        return reply.code(400).send({
          error: { code: "INVALID_INPUT", message: "headline is required" },
        })
      }

      const dealer = await getDealerOrFallback(dealer_id)
      if (!dealer)
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Dealer not found" } })

      const branding: DealerBranding = {
        name: dealer.name,
        city: dealer.city,
        phone: dealer.contact_phone ?? dealer.phone,
        whatsapp: dealer.whatsapp_number ?? dealer.contact_phone ?? dealer.phone,
        primaryColor: dealer.primary_color ?? "#f97316",
      }

      try {
        // ── Layer 2: background ───────────────────────────────────────────────
        let backgroundBuffer: Buffer | null = null
        const bgPrompt =
          `Professional automotive background for Indian car dealership. ` +
          `${body.headline.slice(0, 100)}. ` +
          `Cinematic lighting, photorealistic, 4K, no cars, no text, clean scene, ` +
          `showroom or scenic outdoor road setting.`

        if (isGeminiImageAvailable()) {
          try {
            backgroundBuffer = await generateGeminiImage(bgPrompt)
          } catch (err) {
            fastify.log.error(err, "Gemini background generation failed, falling back")
          }
        }
        if (!backgroundBuffer && isCloudflareAvailable()) {
          try {
            backgroundBuffer = await cfGenerateImage(bgPrompt.slice(0, 500))
          } catch (err) {
            fastify.log.error(err, "Cloudflare background generation failed, falling back")
          }
        }
        if (!backgroundBuffer && isOpenRouterImageAvailable()) {
          try {
            backgroundBuffer = await generateOpenRouterImage(bgPrompt.slice(0, 500))
          } catch (err) {
            fastify.log.error(err, "OpenRouter background generation failed, falling back")
          }
        }
        if (!backgroundBuffer) {
          backgroundBuffer = await generateGradientBackground(branding.primaryColor)
        }

        // ── Layer 1: subject (optional) ───────────────────────────────────────
        let subjectBuffer: Buffer | undefined
        if (body.subject_image_id) {
          try {
            const rawBuf = await readFile(path.join(ORIGINALS_DIR, body.subject_image_id))
            subjectBuffer = await removeBackground(rawBuf)
          } catch {
            // skip layer 1 if file read fails
          }
        } else if (body.subject_image_url) {
          try {
            const res = await fetch(body.subject_image_url, { signal: AbortSignal.timeout(20_000) })
            if (res.ok) {
              const rawBuf = Buffer.from(await res.arrayBuffer())
              subjectBuffer = await removeBackground(rawBuf)
            }
          } catch {
            // skip layer 1 if fetch fails
          }
        }

        // ── Composite all layers ──────────────────────────────────────────────
        const { finalBuffer } = await compositeLayered({
          backgroundBuffer,
          ...(subjectBuffer !== undefined ? { subjectBuffer } : {}),
          dealer: branding,
          headline: body.headline,
        })

        const filePrefix = randomUUID()
        const filename = `${filePrefix}_layered.jpg`
        const url = await uploadFile(finalBuffer, `creatives/${filename}`, "image/jpeg", CREATIVES_DIR)

        return {
          url,
          has_subject: !!subjectBuffer,
          template_name: "Layered Creative",
        }
      } catch (err) {
        fastify.log.error(err, "Layered creative generation failed")
        return reply.code(500).send({
          error: {
            code: "AI_ERROR",
            message: "Layered creative generation failed. Please try again.",
          },
        })
      }
    },
  )

  // POST /v1/creatives/generate-gemini — multimodal Gemini creative pipeline
  fastify.post(
    "/generate-gemini",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const body = request.body as {
        prompt: string
        brand?: string
        subject_image_ids?: string[]
        subject_image_id?: string
        subject_image_urls?: string[]
        subject_image_url?: string
      }

      if (!body.prompt?.trim()) {
        return reply.code(400).send({
          error: { code: "INVALID_INPUT", message: "prompt is required" },
        })
      }

      const dealer = await getDealerOrFallback(dealer_id)
      if (!dealer) {
        return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Dealer not found" } })
      }

      const apiKey = process.env.GEMINI_API_KEY
      if (!apiKey) {
        return reply.code(400).send({
          error: {
            code: "MISSING_API_KEY",
            message: "Gemini API key is not configured on the server. Please set GEMINI_API_KEY in the environment.",
          },
        })
      }

      try {
        // ── Load raw car image buffers ─────────────────────────────────────────
        const imageIds = body.subject_image_ids ?? (body.subject_image_id ? [body.subject_image_id] : [])
        const imageUrls = body.subject_image_urls ?? (body.subject_image_url ? [body.subject_image_url] : [])

        const rawImages: Array<{ buffer: Buffer; mimeType: string }> = []

        for (const id of imageIds) {
          try {
            const ext = path.extname(id).toLowerCase()
            const mimeType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg"
            const buf = await readFile(path.join(ORIGINALS_DIR, id))
            rawImages.push({ buffer: buf, mimeType })
          } catch (err) {
            fastify.log.warn(err, `Failed to read subject_image_id: ${id}`)
          }
        }

        for (const url of imageUrls) {
          try {
            const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
            if (res.ok) {
              const contentType = res.headers.get("content-type")
              const mimeType = contentType || "image/jpeg"
              const buf = Buffer.from(await res.arrayBuffer())
              rawImages.push({ buffer: buf, mimeType })
            }
          } catch (err) {
            fastify.log.warn(err, `Failed to fetch subject_image_url: ${url}`)
          }
        }

        // ── Call Gemini to generate content & prompts (3 options) ─────────────
        const geminiResult = await generateGeminiCreativeContent(
          body.prompt,
          rawImages
        )
        const promptBrief = geminiResult.brief
        const creativeOptions = geminiResult.options

        // ── Background removal on the car subjects ──────────────────────────────
        const subjectBuffers: Buffer[] = []
        for (const img of rawImages) {
          try {
            const cleanBuf = await removeBackground(img.buffer)
            subjectBuffers.push(cleanBuf)
          } catch (err) {
            fastify.log.error(err, "Background removal failed, falling back to original buffer")
            subjectBuffers.push(img.buffer)
          }
        }

        // ── Retrieve dealer logo buffer ───────────────────────────────────────
        let dealerLogoBuffer: Buffer | undefined
        if (dealer.logo_url) {
          try {
            const logoFilename = path.basename(dealer.logo_url)
            const localLogoPath = path.join(ORIGINALS_DIR, logoFilename)
            try {
              dealerLogoBuffer = await readFile(localLogoPath)
            } catch {
              // Try HTTP fetch if local file read fails
              const logoRes = await fetch(dealer.logo_url, { signal: AbortSignal.timeout(10_000) })
              if (logoRes.ok) {
                dealerLogoBuffer = Buffer.from(await logoRes.arrayBuffer())
              }
            }
          } catch (err) {
            fastify.log.warn(err, `Failed to load dealer logo from: ${dealer.logo_url}`)
          }
        }

        // ── Retrieve brand logo SVG ───────────────────────────────────────────
        const activeBrand = body.brand || (Array.isArray(dealer.brands) && dealer.brands.length > 0 ? (dealer.brands[0] as string) : "Car")
        const brandLogoSvg = getBrandLogoSvg(activeBrand, "#ffffff")

        // ── Prepare branding info ─────────────────────────────────────────────
        const branding: DealerBranding = {
          name: dealer.name,
          city: dealer.city,
          phone: dealer.contact_phone ?? dealer.phone,
        }
        
        const addressText = dealer.address || [dealer.city, dealer.state].filter(Boolean).join(", ")
        if (addressText) {
          branding.address = addressText
        }
        
        const whatsappNum = dealer.whatsapp_number ?? dealer.contact_phone ?? dealer.phone
        if (whatsappNum) {
          branding.whatsapp = whatsappNum
        }
        
        if (dealer.primary_color) {
          branding.primaryColor = dealer.primary_color
        }
        
        if (dealer.font) {
          branding.font = dealer.font
        }
        
        if (dealerLogoBuffer) {
          branding.logoBuffer = dealerLogoBuffer
        }
        
        if (brandLogoSvg) {
          branding.brandLogoSvg = brandLogoSvg
        }

        // ── Composite and upload each option — parallel for speed ─────────────
        const templateStyles: Array<'festive' | 'premium' | 'value'> = ['festive', 'premium', 'value']
        const optionBrandLogoSvg = getBrandLogoSvg(activeBrand, "#ffffff")
        const optionBranding = { ...branding, brandLogoSvg: optionBrandLogoSvg }

        const options = await Promise.all(
          creativeOptions.map(async (option, i) => {
            if (!option) return null
            const bgPrompt = option.background_prompt

            let backgroundBuffer: Buffer | null = null
            let isGradient = false

            if (bgPrompt) {
              if (isGeminiImageAvailable()) {
                try {
                  backgroundBuffer = await generateGeminiImage(bgPrompt)
                } catch (err) {
                  fastify.log.error(err, `Gemini background generation failed for option ${i}, falling back`)
                }
              }
              if (!backgroundBuffer && isCloudflareAvailable()) {
                try {
                  backgroundBuffer = await cfGenerateImage(bgPrompt.slice(0, 500))
                } catch (err) {
                  fastify.log.error(err, `Cloudflare background generation failed for option ${i}, falling back`)
                }
              }
              if (!backgroundBuffer && isOpenRouterImageAvailable()) {
                try {
                  backgroundBuffer = await generateOpenRouterImage(bgPrompt.slice(0, 500))
                } catch (err) {
                  fastify.log.error(err, `OpenRouter background generation failed for option ${i}, falling back`)
                }
              }
            }

            if (!backgroundBuffer) {
              backgroundBuffer = await generateGradientBackground(dealer.primary_color ?? "#f97316")
              isGradient = true
            }

            const subjectBuffer = (isGradient && subjectBuffers.length > 0)
              ? subjectBuffers[i % subjectBuffers.length]
              : undefined

            const templateStyle = templateStyles[i % templateStyles.length] as 'festive' | 'premium' | 'value'

            const { finalBuffer, pngBuffer } = await compositeLayered({
              backgroundBuffer,
              ...(subjectBuffer !== undefined ? { subjectBuffer } : {}),
              dealer: optionBranding,
              headline: option.headline,
              templateStyle,
              colorMood: promptBrief.color_mood,
            })

            const filePrefix = randomUUID()
            const urlJpg = await uploadFile(finalBuffer, `creatives/${filePrefix}_gemini_creative_${i}.jpg`, "image/jpeg", CREATIVES_DIR)
            const urlPng = await uploadFile(pngBuffer, `creatives/${filePrefix}_gemini_creative_${i}.png`, "image/png", CREATIVES_DIR)

            return {
              creativeUrl: urlJpg,
              pngUrl: urlPng,
              headline: option.headline,
              copy: option.caption_text,
              hashtags: option.hashtags,
              backgroundPrompt: option.background_prompt,
              metadata: {
                prompt: option.background_prompt,
                negativePrompt: promptBrief.negative_prompt,
                colorMood: promptBrief.color_mood,
                seed: Math.floor(Math.random() * 1000000000),
                modelVersion: process.env.GEMINI_IMAGE_MODEL ?? "gemini-3.1-flash-image-preview",
                timestamp: new Date().toISOString(),
              }
            }
          })
        ).then(results => results.filter(Boolean))

        return {
          success: true,
          promptBrief,
          options,
        }
      } catch (err) {
        fastify.log.error(err, "Gemini creative generation pipeline failed")
        return reply.code(500).send({
          error: {
            code: "AI_ERROR",
            message: "Failed to generate AI creative. Please try again.",
          },
        })
      }
    }
  )

  // POST /v1/creatives/generate-scenes — automotive background scenes per pose

  fastify.post(
    '/generate-scenes',
    { preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')] },
    async (request, reply) => {
      const body = request.body as { brief: string; model?: string; poses?: string[] }

      if (!body.brief?.trim()) {
        return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'brief is required' } })
      }

      const poses = (body.poses ?? ['front-three-quarter', 'side-profile', 'hero-low-angle']).slice(0, 3)

      function inferModelClassLocal(name: string): string {
        const m = (name ?? '').toLowerCase()
        if (/sierra|creta|brezza|nexon|venue|seltos|sonet|kushaq|taigun|harrier|safari|hector/.test(m)) return 'compact-suv'
        if (/fortuner|endeavour|gloster|alcazar|innova/.test(m)) return 'suv'
        if (/swift|baleno|i20|altroz|polo|tiago|punch/.test(m)) return 'hatchback'
        if (/dzire|amaze|aura|tigor|rapid|virtus|slavia|verna|city/.test(m)) return 'sedan'
        if (/audi|bmw|mercedes|jaguar|volvo/.test(m)) return 'luxury-sedan'
        return 'compact-suv'
      }

      function pickSceneTypeLocal(cls: string, brief: string): string {
        const b = brief.toLowerCase()
        if (/diwali|festive|holi|navratri/.test(b)) return 'modern upscale Indian city street at dusk with warm festive ambient light, wet asphalt, bokeh of warm lights, no people'
        if (/adventure|rugged|off-road/.test(b) && /suv/.test(cls)) return 'wide dirt road at golden hour, rolling hills, dramatic sky'
        if (/premium|luxury|elegant/.test(b)) return 'glass-facade building plaza at blue hour, polished granite, minimal architecture'
        if (/sport|energetic|fast|dynamic/.test(b)) return 'empty highway at night, motion-blurred streetlights, wet asphalt'
        if (/family|safe|trust/.test(b)) return 'quiet suburban Indian street at afternoon, tree-lined road, soft light'
        if (/showroom|test drive|studio/.test(b)) return 'clean automotive studio with light-gray cyclorama, subtle floor reflection'
        const fallbacks: Record<string, string> = {
          'compact-suv': 'Indian metro street at golden hour, glass buildings in soft bokeh',
          'suv': 'coastal highway at sunset, smooth tarmac, distant hills',
          'sedan': 'business district street at dusk, polished asphalt',
          'hatchback': 'vibrant urban street with colorful market stalls in bokeh',
          'luxury-sedan': 'private mansion driveway with stone-paved approach',
        }
        return fallbacks[cls] ?? 'clean studio with seamless gradient backdrop'
      }

      const modelClass = inferModelClassLocal(body.model ?? '')
      const sceneType = pickSceneTypeLocal(modelClass, body.brief)

      const results = await Promise.all(
        poses.map(async (pose) => {
          const prompt = (
            `Empty automotive background scene for a ${pose.replace(/-/g, ' ')} view car advertisement. ` +
            `SCENE: ${sceneType}. ` +
            `NO cars, NO people, NO text, NO logos. Leave open space in lower-center for vehicle placement. ` +
            `Premium automotive editorial photography, cinematic lighting, 4K.`
          ).slice(0, 500)

          try {
            let buf: Buffer | null = null
            if (isGeminiImageAvailable()) {
              try {
                buf = await generateGeminiImage(prompt)
              } catch (err) {
                fastify.log.error(err, "Gemini scene generation failed, falling back")
              }
            }
            if (!buf && isCloudflareAvailable()) {
              try {
                buf = await cfGenerateImage(prompt)
              } catch (err) {
                fastify.log.error(err, "Cloudflare scene generation failed, falling back")
              }
            }
            if (!buf && isOpenRouterImageAvailable()) {
              try {
                buf = await generateOpenRouterImage(prompt)
              } catch (err) {
                fastify.log.error(err, "OpenRouter scene generation failed, falling back")
              }
            }
            if (!buf) {
              throw new Error('No image generation service available or succeeded')
            }

            const filename = `${randomUUID()}_scene_${pose}.jpg`
            const url = await uploadFile(buf, `creatives/${filename}`, 'image/jpeg', CREATIVES_DIR)
            return { url, pose }
          } catch {
            const buf = await generateGradientBackground('#f97316')
            const filename = `${randomUUID()}_scene_${pose}_grad.png`
            const url = await uploadFile(buf, `creatives/${filename}`, 'image/png', CREATIVES_DIR)
            return { url, pose }
          }
        })
      )

      return { scenes: results }
    }
  )

  // POST /v1/creatives/generate-image  (Cloudflare Workers AI fallback for image generation)
  fastify.post(
    "/generate-image",
    {
      preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')],
    },
    async (request, reply) => {
      const { prompt } = request.body as { prompt: string }
      if (!prompt?.trim()) {
        return reply
          .code(400)
          .send({
            error: { code: "INVALID_INPUT", message: "prompt is required" },
          })
      }

      if (!isGeminiImageAvailable() && !isCloudflareAvailable() && !isOpenRouterImageAvailable()) {
        return reply
          .code(503)
          .send({
            error: {
              code: "SERVICE_UNAVAILABLE",
              message: "Image generation not configured",
            },
          })
      }

      try {
        let imageBuffer: Buffer | null = null;
        if (isGeminiImageAvailable()) {
          try {
            imageBuffer = await generateGeminiImage(prompt)
          } catch (err) {
            fastify.log.error(err, "Gemini image generation failed, falling back")
          }
        }
        if (!imageBuffer && isCloudflareAvailable()) {
          try {
            imageBuffer = await cfGenerateImage(prompt.slice(0, 500))
          } catch (err) {
            fastify.log.error(err, "Cloudflare image generation failed, falling back")
          }
        }
        if (!imageBuffer && isOpenRouterImageAvailable()) {
          try {
            imageBuffer = await generateOpenRouterImage(prompt.slice(0, 500))
          } catch (err) {
            fastify.log.error(err, "OpenRouter image generation failed, falling back")
          }
        }

        if (!imageBuffer) {
          throw new Error("All image generation services failed");
        }

        const base64 = imageBuffer.toString("base64")
        return { image: base64 }
      } catch (err) {
        fastify.log.error(err, "Image generation failed")
        return reply
          .code(500)
          .send({
            error: {
              code: "AI_ERROR",
              message: "Image generation failed. Please try again.",
            },
          })
      }
    },
  )

  // POST /v1/creatives/rephrase
  fastify.post("/rephrase", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { caption, tone } = request.body as { caption: string; tone?: string }
    if (!caption?.trim()) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "caption is required" } })
    }
    const toneMap: Record<string, string> = {
      punchy: "Rewrite as a short punchy post under 60 words. Keep the core message.",
      detailed: "Rewrite with more detail and benefits, 100-150 words. Keep brand voice.",
      emotional: "Rewrite with emotional storytelling tone, 70-100 words. Focus on aspirations.",
      shorter: "Shorten to under 40 words without losing the CTA.",
      formal: "Rewrite in a professional, formal tone.",
      casual: "Rewrite in a friendly, casual, conversational tone.",
    }
    const instruction = toneMap[tone ?? ''] ?? "Rephrase this caption in a fresh way while keeping the same meaning and CTA."
    try {
      const result = await transformCaptionAI(caption, instruction)
      return { success: true, caption: result }
    } catch (err) {
      fastify.log.error(err, "Rephrase failed")
      return reply.code(500).send({ error: { code: "AI_ERROR", message: "Rephrase failed. Please try again." } })
    }
  })

  // POST /v1/creatives/translate
  fastify.post("/translate", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { caption, to } = request.body as { caption: string; to: string }
    if (!caption?.trim() || !to?.trim()) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "caption and to are required" } })
    }
    const langMap: Record<string, string> = {
      hi: "Hindi (Devanagari script)",
      mr: "Marathi (Devanagari script)",
      ta: "Tamil (Tamil script)",
      te: "Telugu (Telugu script)",
      kn: "Kannada (Kannada script)",
      gu: "Gujarati (Gujarati script)",
      bn: "Bengali (Bengali script)",
      en: "English",
    }
    const targetLang = langMap[to] ?? to
    const instruction = `Translate this caption to ${targetLang}. Preserve all phone numbers, hashtags, and emojis as-is. Return only the translated caption.`
    try {
      const result = await transformCaptionAI(caption, instruction)
      return { success: true, caption: result }
    } catch (err) {
      fastify.log.error(err, "Translation failed")
      return reply.code(500).send({ error: { code: "AI_ERROR", message: "Translation failed. Please try again." } })
    }
  })

  // POST /v1/creatives/hashtags
  fastify.post("/hashtags", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { caption, brand, city } = request.body as { caption: string; brand?: string; city?: string }
    if (!caption?.trim()) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "caption is required" } })
    }
    const context = [brand && `Brand: ${brand}`, city && `City: ${city}`].filter(Boolean).join(", ")
    const instruction = `Generate 15 highly relevant hashtags for this Indian automobile dealer caption.${context ? ` Context: ${context}.` : ""} Include: city hashtags, brand hashtags, model hashtags (if mentioned), and engagement hashtags. Return ONLY a JSON array of hashtag strings, e.g. ["#tag1","#tag2"]. No other text.`
    try {
      const result = await transformCaptionAI(caption, instruction)
      let hashtags: string[] = []
      try {
        const parsed = JSON.parse(result) as unknown
        if (Array.isArray(parsed)) hashtags = (parsed as string[]).filter((h) => typeof h === 'string')
      } catch {
        hashtags = result.match(/#\w+/g) ?? []
      }
      return { success: true, hashtags }
    } catch (err) {
      fastify.log.error(err, "Hashtag generation failed")
      return reply.code(500).send({ error: { code: "AI_ERROR", message: "Hashtag generation failed. Please try again." } })
    }
  })

  // GET /v1/creatives/prompts
  fastify.get("/prompts", async (request, _reply) => {
    const { category, limit = "10" } = request.query as {
      category?: string
      limit?: string
    }
    const where = category ? { category, is_active: true } : { is_active: true }
    const prompts = await prisma.prompt.findMany({
      where,
      orderBy: [{ usage_count: "desc" }, { sort_order: "asc" }],
      take: parseInt(limit),
    })
    return { success: true, data: prompts }
  })

  // POST /v1/creatives/generate-video — FFmpeg-based animated video from still image
  // Uses Ken Burns effect (slow zoom + pan) on a car creative with caption overlay.
  fastify.post(
    '/generate-video',
    { preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string;
      const { prompt, image_id, duration_seconds = 15, aspect_ratio = '9:16' } = request.body as {
        prompt: string;
        image_id?: string; // filename from /v1/upload/image
        duration_seconds?: number;
        aspect_ratio?: string;
      };

      if (!prompt?.trim()) {
        return reply.code(400).send({ error: { code: 'INVALID_INPUT', message: 'prompt is required' } });
      }

      const dealer = await getDealerOrFallback(dealer_id);
      if (!dealer) return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Dealer not found' } });

      const dur = Math.min(Math.max(duration_seconds, 5), 60);
      const [w, h] = aspect_ratio === '16:9' ? [1920, 1080] : aspect_ratio === '1:1' ? [1080, 1080] : [1080, 1920];
      const fps = 30;
      const frames = dur * fps;

      const fileId = randomUUID();
      const videoFilename = `${fileId}.mp4`;
      await mkdir(CREATIVES_DIR, { recursive: true });
      const videoPath = path.join(CREATIVES_DIR, videoFilename);

      try {
        // Prepare base image: use uploaded image or generate gradient background
        let sourceImagePath: string;
        if (image_id) {
          sourceImagePath = path.join(ORIGINALS_DIR, image_id);
        } else {
          // Generate a branded gradient image using Sharp
          const gradientBuf = await generateGradientBackground(dealer.primary_color ?? '#f97316');
          const tmpImg = path.join(CREATIVES_DIR, `${fileId}_bg.png`);
          await writeFile(tmpImg, gradientBuf);
          sourceImagePath = tmpImg;
        }

        // Prepare base image at target resolution
        const resizedPath = path.join(CREATIVES_DIR, `${fileId}_resized.jpg`);
        await sharp(sourceImagePath)
          .resize(w, h, { fit: 'cover', position: 'center' })
          .jpeg({ quality: 90 })
          .toFile(resizedPath);

        // Build text for video overlay — headline from prompt
        const headline = prompt.length > 60 ? `${prompt.slice(0, 57)}...` : prompt;
        const safeHeadline = headline.replace(/'/g, '').replace(/:/g, ' ').replace(/[\\]/g, '');
        const safeName = dealer.name.replace(/'/g, '').replace(/:/g, ' ');
        const safePhone = (dealer.contact_phone ?? dealer.phone).replace(/[+]/g, '').replace(/\s/g, '');

        // Ken Burns effect: gentle zoom from 1.0 to 1.08 + slight pan
        // Text overlays: headline at bottom-third, dealer name + phone at bottom
        const zoomStart = 1.0;
        const zoomEnd = 1.08;
        const zoomStep = (zoomEnd - zoomStart) / frames;

        // FFmpeg filter complex with zoompan + text overlays
        const fontSizeH = Math.round(h * 0.042); // ~45px on 1080 tall
        const fontSizeSmall = Math.round(h * 0.028);
        const padBottom = Math.round(h * 0.07);
        const textY = Math.round(h * 0.62);

        // Using FFmpeg built-in drawtext (no font file needed — uses default)
        const filterComplex = [
          `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},`,
          `zoompan=z='min(zoom+${zoomStep.toFixed(6)},${zoomEnd})':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${w}x${h}:fps=${fps},`,
          `drawtext=text='${safeHeadline}':fontsize=${fontSizeH}:fontcolor=white:`,
          `x='(w-text_w)/2':y=${textY}:`,
          `box=1:boxcolor=black@0.55:boxborderw=18:line_spacing=8,`,
          `drawtext=text='${safeName}  •  ${safePhone}':fontsize=${fontSizeSmall}:fontcolor=white@0.80:`,
          `x='(w-text_w)/2':y=h-${padBottom}:`,
          `box=1:boxcolor=black@0.45:boxborderw=10`,
          `[out]`
        ].join('')

        const ffmpegArgs = [
          '-loop', '1',
          '-i', resizedPath,
          '-filter_complex', filterComplex,
          '-map', '[out]',
          '-t', String(dur),
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          '-y',
          videoPath,
        ];

        await execFileAsync('ffmpeg', ffmpegArgs, { timeout: 120_000 });

        // Upload video
        const videoBuf = await readFile(videoPath);
        const videoUrl = await uploadFile(videoBuf, `creatives/${videoFilename}`, 'video/mp4', CREATIVES_DIR);

        // Clean up temp files
        await Promise.allSettled([
          unlink(resizedPath),
          ...(!image_id ? [unlink(path.join(CREATIVES_DIR, `${fileId}_bg.png`))] : []),
        ]);

        return {
          success: true,
          video_url: videoUrl,
          duration_seconds: dur,
          aspect_ratio,
          thumbnail_url: null,
        };
      } catch (err) {
        fastify.log.error(err, 'Video generation failed');
        // Clean up any partial files
        await unlink(videoPath).catch(() => {});
        return reply.code(500).send({
          error: { code: 'VIDEO_GENERATION_FAILED', message: 'Video generation failed. Make sure ffmpeg is installed.' },
        });
      }
    },
  )
}

function mockCreatives() {
  return [
    {
      id: "tpl_bold_banner",
      template_name: "Bold Banner",
      thumbnail_url: null,
      platform_urls: {
        facebook: null,
        instagram: null,
        instagram_story: null,
        gmb: null,
      },
    },
    {
      id: "tpl_minimal",
      template_name: "Minimal Showcase",
      thumbnail_url: null,
      platform_urls: {
        facebook: null,
        instagram: null,
        instagram_story: null,
        gmb: null,
      },
    },
    {
      id: "tpl_offer_card",
      template_name: "Offer Card",
      thumbnail_url: null,
      platform_urls: {
        facebook: null,
        instagram: null,
        instagram_story: null,
        gmb: null,
      },
    },
  ]
}
