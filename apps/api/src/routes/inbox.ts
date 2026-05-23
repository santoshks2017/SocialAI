import type { FastifyInstance } from "fastify"
import axios from "axios"
import { prisma } from "../db/prisma.js"
import type { InboxMessage } from "../generated/client/index.js"
import { generateInboxReply as groqGenerateInboxReply, isGroqAvailable } from "../services/groq.js"
import { generateInboxReply as openaiGenerateInboxReply } from "../services/openai.js"
import { generateMockEmails } from "../services/emailMock.js"

async function generateReplyAI(
  messageText: string,
  sentiment: string,
  dealer: { name: string; city: string; brands: string[]; phone: string; whatsapp: string; language_preferences: string[] },
  messageType: "comment" | "dm" | "review",
  tone?: string,
): Promise<string> {
  if (isGroqAvailable()) {
    try { return await groqGenerateInboxReply(messageText, sentiment, dealer, messageType, tone) } catch {}
  }
  return openaiGenerateInboxReply(messageText, sentiment, dealer, messageType, undefined, tone)
}
import { replyToGmbReview } from "../services/gmb.js"

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0"

function mapMessage(m: InboxMessage) {
  return {
    id: m.id,
    dealerId: m.dealer_id,
    platform: m.platform,
    messageType: m.message_type,
    platformMessageId: m.platform_message_id,
    postId: m.post_id ?? undefined,
    customerName: m.customer_name,
    customerAvatarUrl: m.customer_avatar_url ?? undefined,
    customerPlatformId: m.customer_platform_id ?? undefined,
    emailSubject: m.email_subject ?? undefined,
    messageText: m.message_text,
    sentiment: m.sentiment ?? undefined,
    tag: m.tag ?? undefined,
    aiSuggestedReply: m.ai_suggested_reply ?? undefined,
    replyText: m.reply_text ?? undefined,
    repliedAt: m.replied_at?.toISOString() ?? undefined,
    isRead: m.is_read,
    requiresApproval: m.requires_approval,
    receivedAt: m.received_at.toISOString(),
  }
}


async function upsertInboxMessage(params: {
  dealer_id: string
  platform: string
  message_type: string
  platform_message_id: string
  message_text: string
  customer_name?: string
  customer_platform_id?: string
  customer_avatar_url?: string
  post_id?: string
}) {
  const {
    dealer_id,
    platform,
    message_type,
    platform_message_id,
    message_text,
    customer_name,
    customer_platform_id,
    customer_avatar_url,
    post_id,
  } = params

  return prisma.inboxMessage.upsert({
    where: { platform_message_id },
    update: {
      message_text,
      customer_name: customer_name ?? "Customer",
      customer_platform_id: customer_platform_id ?? null,
      customer_avatar_url: customer_avatar_url ?? null,
      post_id: post_id ?? null,
      received_at: new Date(),
    },
    create: {
      dealer_id,
      platform,
      message_type,
      platform_message_id,
      message_text,
      customer_name: customer_name ?? "Customer",
      customer_platform_id: customer_platform_id ?? null,
      customer_avatar_url: customer_avatar_url ?? null,
      post_id: post_id ?? null,
      received_at: new Date(),
    },
  })
}

function normalizeInboxType(value: string): "comment" | "dm" | "review" {
  const lower = value?.toLowerCase?.()
  if (lower === "review" || lower === "reviews") return "review"
  if (lower === "dm" || lower === "message" || lower === "messaging")
    return "dm"
  return "comment"
}

function extractTextFromMetaMessage(event: any): string | null {
  if (typeof event.message?.text === "string") return event.message.text
  if (
    typeof event.message?.text === "object" &&
    typeof event.message?.text?.body === "string"
  )
    return event.message.text.body
  if (typeof event.message?.attachments?.[0]?.title === "string")
    return event.message.attachments[0].title
  return null
}

function extractTextFromMetaChange(change: any): string | null {
  if (typeof change.value?.message === "string") return change.value.message
  if (typeof change.value?.comment_text === "string")
    return change.value.comment_text
  if (typeof change.value?.body === "string") return change.value.body
  if (typeof change.value?.message_text === "string")
    return change.value.message_text
  if (typeof change.value?.text === "string") return change.value.text
  if (typeof change.value?.item_message === "string")
    return change.value.item_message
  return null
}

async function sendReplyToPlatform(
  message: InboxMessage,
  replyText: string,
  connection: {
    platform: string
    access_token: string
    platform_account_id: string
  },
) {
  try {
    if (connection.platform === "gmb" && message.platform_message_id) {
      await replyToGmbReview(
        message.platform_message_id,
        connection.access_token,
        replyText,
      )
      return true
    }

    if (
      connection.platform === "facebook" ||
      connection.platform === "instagram"
    ) {
      if (message.message_type === "comment" && message.platform_message_id) {
        await axios.post(
          `${META_GRAPH_BASE}/${message.platform_message_id}/comments`,
          { message: replyText, access_token: connection.access_token },
        )
        return true
      }

      if (message.customer_platform_id) {
        await axios.post(`${META_GRAPH_BASE}/me/messages`, {
          recipient: { id: message.customer_platform_id },
          message: { text: replyText },
          access_token: connection.access_token,
        })
        return true
      }
    }
  } catch (err) {
    console.error("Failed to send inbox reply to platform", err)
  }
  return false
}

export default async function inboxRoutes(fastify: FastifyInstance) {
  // GET /v1/inbox — list messages
  fastify.get("/", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null })
      .dealer_id as string
    const {
      platform,
      tag,
      isRead,
      search,
      page = "1",
      pageSize = "30",
    } = request.query as Record<string, string>

    const where: Record<string, unknown> = { dealer_id }
    if (platform) where["platform"] = platform
    if (tag) where["tag"] = tag
    if (isRead !== undefined) where["is_read"] = isRead === "true"
    if (search)
      where["message_text"] = { contains: search, mode: "insensitive" }

    const skip = (parseInt(page) - 1) * parseInt(pageSize)
    const [messages, total, unreadCount] = await Promise.all([
      prisma.inboxMessage.findMany({
        where,
        orderBy: { received_at: "desc" },
        skip,
        take: parseInt(pageSize),
      }),
      prisma.inboxMessage.count({ where }),
      prisma.inboxMessage.count({ where: { dealer_id, is_read: false } }),
    ])

    return { items: messages.map(mapMessage), total, unreadCount }
  })

  // GET /v1/inbox/:id — single message
  fastify.get(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = (request.user as { dealer_id: string | null })
        .dealer_id as string
      const { id } = request.params as { id: string }
      const message = await prisma.inboxMessage.findFirst({
        where: { id, dealer_id },
      })
      if (!message) return reply.code(404).send({ error: "Not found" })
      return { item: mapMessage(message) }
    },
  )

  // PATCH /v1/inbox/:id — mark read or update tag
  fastify.patch(
    "/:id",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = (request.user as { dealer_id: string | null })
        .dealer_id as string
      const { id } = request.params as { id: string }
      const body = request.body as { isRead?: boolean; tag?: string }

      const update: Record<string, unknown> = {}
      if (body.isRead !== undefined) update["is_read"] = body.isRead
      if (body.tag !== undefined) update["tag"] = body.tag

      const message = await prisma.inboxMessage.updateMany({
        where: { id, dealer_id },
        data: update,
      })
      if (message.count === 0)
        return reply.code(404).send({ error: "Not found" })

      const updated = await prisma.inboxMessage.findFirst({ where: { id } })
      return { item: mapMessage(updated!) }
    },
  )

  // POST /v1/inbox/mark-all-read
  fastify.post(
    "/mark-all-read",
    { preHandler: [fastify.authenticate] },
    async (request) => {
      const dealer_id = (request.user as { dealer_id: string | null })
        .dealer_id as string
      await prisma.inboxMessage.updateMany({
        where: { dealer_id, is_read: false },
        data: { is_read: true },
      })
      return { success: true }
    },
  )

  // POST /v1/inbox/:id/reply — send reply
  fastify.post(
    "/:id/reply",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = (request.user as { dealer_id: string | null })
        .dealer_id as string
      const { id } = request.params as { id: string }
      const { replyText } = request.body as { replyText: string }
      if (!replyText)
        return reply.code(400).send({ error: "replyText is required" })

      const message = await prisma.inboxMessage.findFirst({
        where: { id, dealer_id },
      })
      if (!message) return reply.code(404).send({ error: "Not found" })

      const connection = await prisma.platformConnection.findFirst({
        where: { dealer_id, platform: message.platform, is_connected: true },
      })

      if (connection) {
        await sendReplyToPlatform(message, replyText, {
          platform: connection.platform,
          access_token: connection.access_token,
          platform_account_id: connection.platform_account_id,
        })
      }

      const repliedAt = new Date()
      await prisma.inboxMessage.update({
        where: { id },
        data: { reply_text: replyText, replied_at: repliedAt },
      })

      const updated = await prisma.inboxMessage.findFirst({
        where: { id, dealer_id },
      })
      return { item: mapMessage(updated!) }
    },
  )

  // POST /v1/inbox/:id/suggest-reply — AI-generated reply suggestion
  fastify.post(
    "/:id/suggest-reply",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const dealer_id = (request.user as { dealer_id: string | null })
        .dealer_id as string
      const { id } = request.params as { id: string }
      const { tone } = (request.body ?? {}) as { tone?: string }

      const message = await prisma.inboxMessage.findFirst({
        where: { id, dealer_id },
      })
      if (!message) return reply.code(404).send({ error: "Not found" })

      if (!tone && message.ai_suggested_reply) {
        return { suggestedReply: message.ai_suggested_reply }
      }

      const dealer = await prisma.dealer.findUnique({
        where: { id: dealer_id },
      })
      if (!dealer) return reply.code(404).send({ error: "Dealer not found" })

      const suggestedReply = await generateReplyAI(
        message.message_text,
        message.sentiment ?? "neutral",
        {
          name: dealer.name,
          city: dealer.city,
          brands: (dealer.brands as string[] | null) ?? [],
          phone: dealer.contact_phone ?? dealer.phone,
          whatsapp: dealer.whatsapp_number ?? dealer.phone,
          language_preferences:
            (dealer.language_preferences as string[] | null) ?? [],
        },
        normalizeInboxType(message.message_type),
        tone,
      )

      await prisma.inboxMessage.update({
        where: { id },
        data: { ai_suggested_reply: suggestedReply },
      })
      return { suggestedReply }
    },
  )


  // POST /v1/inbox/webhook/meta — receive Meta webhook events
  fastify.post("/webhook/meta", async (request, reply) => {
    const payload = request.body as any
    fastify.log.info(
      { payloadType: payload?.object },
      "Received Meta webhook event",
    )

    const entries = Array.isArray(payload?.entry) ? payload.entry : []
    let imported = 0

    for (const entry of entries) {
      const platformAccountId =
        entry.id ||
        entry.messaging?.[0]?.recipient?.id ||
        entry.changes?.[0]?.value?.page_id
      if (!platformAccountId) continue

      const connection = await prisma.platformConnection.findFirst({
        where: { platform_account_id: platformAccountId, is_connected: true },
      })
      if (!connection) continue

      const platform = connection.platform
      const dealer_id = connection.dealer_id

      if (Array.isArray(entry.messaging)) {
        for (const event of entry.messaging) {
          const text = extractTextFromMetaMessage(event)
          const messageId =
            event.message?.mid ||
            event.message?.id ||
            event.standby?.[0]?.message?.mid
          if (!text || !messageId) continue

          await upsertInboxMessage({
            dealer_id,
            platform,
            message_type: "dm",
            platform_message_id: messageId,
            message_text: text,
            customer_name: event.sender?.name ?? "Customer",
            customer_platform_id: event.sender?.id,
            customer_avatar_url: event.sender?.profile_pic,
          })
          imported += 1
        }
      }

      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const text = extractTextFromMetaChange(change)
          const messageId =
            change.value?.comment_id ||
            change.value?.message_id ||
            change.value?.id
          if (!text || !messageId) continue

          const customerName =
            change.value?.from?.name ?? change.value?.sender_name ?? "Customer"
          const customerId = change.value?.from?.id ?? change.value?.sender_id
          await upsertInboxMessage({
            dealer_id,
            platform,
            message_type: "comment",
            platform_message_id: messageId,
            message_text: text,
            customer_name: customerName,
            customer_platform_id: customerId,
            post_id: change.value?.post_id ?? undefined,
          })
          imported += 1
        }
      }
    }

    return reply.code(200).send({ success: true, imported })
  })

  // GET /v1/inbox/webhook/meta — Meta webhook verification challenge
  fastify.get("/webhook/meta", async (request, reply) => {
    const {
      "hub.mode": mode,
      "hub.verify_token": token,
      "hub.challenge": challenge,
    } = request.query as Record<string, string>
    const VERIFY_TOKEN =
      process.env["META_WEBHOOK_VERIFY_TOKEN"] ?? "cardeko_webhook_secret"
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return reply.code(200).send(challenge)
    }
    return reply.code(403).send({ error: "Forbidden" })
  })

  // GET /v1/inbox/settings — get auto-reply settings
  fastify.get("/settings", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })
    return { autoReplyEnabled: dealer.auto_reply_enabled }
  })

  // POST /v1/inbox/settings — update auto-reply settings
  fastify.post("/settings", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { autoReplyEnabled } = request.body as { autoReplyEnabled: boolean }
    
    await prisma.dealer.update({
      where: { id: dealer_id },
      data: { auto_reply_enabled: autoReplyEnabled }
    })
    return { autoReplyEnabled }
  })

  // GET /v1/inbox/rules — list rules
  fastify.get("/rules", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const rules = await prisma.autoReplyRule.findMany({
      where: { dealer_id },
      include: { template: true },
      orderBy: { created_at: "desc" }
    })
    return { items: rules }
  })

  // POST /v1/inbox/rules — create rule
  fastify.post("/rules", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const body = request.body as {
      platform: string
      messageType: string
      conditionType: string
      conditionValue: string
      actionType: string
      aiTone?: string
      templateId?: string
      isActive?: boolean
    }

    const rule = await prisma.autoReplyRule.create({
      data: {
        dealer_id,
        platform: body.platform,
        message_type: body.messageType,
        condition_type: body.conditionType,
        condition_value: body.conditionValue,
        action_type: body.actionType,
        ai_tone: body.aiTone ?? null,
        template_id: body.templateId ?? null,
        is_active: body.isActive ?? true
      },
      include: { template: true }
    })
    return { item: rule }
  })

  // PUT /v1/inbox/rules/:id — update rule
  fastify.put("/rules/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }
    const body = request.body as {
      platform?: string
      messageType?: string
      conditionType?: string
      conditionValue?: string
      actionType?: string
      aiTone?: string
      templateId?: string
      isActive?: boolean
    }

    const rule = await prisma.autoReplyRule.findFirst({ where: { id, dealer_id } })
    if (!rule) return reply.code(404).send({ error: "Rule not found" })

    const data: any = {}
    if (body.platform !== undefined) data.platform = body.platform
    if (body.messageType !== undefined) data.message_type = body.messageType
    if (body.conditionType !== undefined) data.condition_type = body.conditionType
    if (body.conditionValue !== undefined) data.condition_value = body.conditionValue
    if (body.actionType !== undefined) data.action_type = body.actionType
    if (body.aiTone !== undefined) data.ai_tone = body.aiTone
    if (body.templateId !== undefined) data.template_id = body.templateId
    if (body.isActive !== undefined) data.is_active = body.isActive

    const updated = await prisma.autoReplyRule.update({
      where: { id },
      data,
      include: { template: true }
    })
    return { item: updated }
  })

  // DELETE /v1/inbox/rules/:id — delete rule
  fastify.delete("/rules/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }
    const rule = await prisma.autoReplyRule.findFirst({ where: { id, dealer_id } })
    if (!rule) return reply.code(404).send({ error: "Rule not found" })

    await prisma.autoReplyRule.delete({ where: { id } })
    return { success: true }
  })

  // GET /v1/inbox/templates — list templates
  fastify.get("/templates", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const templates = await prisma.autoReplyTemplate.findMany({
      where: { dealer_id },
      orderBy: { created_at: "desc" }
    })
    return { items: templates }
  })

  // POST /v1/inbox/templates — create template
  fastify.post("/templates", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { name, text } = request.body as { name: string; text: string }

    const template = await prisma.autoReplyTemplate.create({
      data: { dealer_id, name, text }
    })
    return { item: template }
  })

  // PUT /v1/inbox/templates/:id — update template
  fastify.put("/templates/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }
    const { name, text } = request.body as { name?: string; text?: string }

    const template = await prisma.autoReplyTemplate.findFirst({ where: { id, dealer_id } })
    if (!template) return reply.code(404).send({ error: "Template not found" })

    const data: any = {}
    if (name !== undefined) data.name = name
    if (text !== undefined) data.text = text

    const updated = await prisma.autoReplyTemplate.update({
      where: { id },
      data
    })
    return { item: updated }
  })

  // DELETE /v1/inbox/templates/:id — delete template
  fastify.delete("/templates/:id", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }
    const template = await prisma.autoReplyTemplate.findFirst({ where: { id, dealer_id } })
    if (!template) return reply.code(404).send({ error: "Template not found" })

    await prisma.autoReplyTemplate.delete({ where: { id } })
    return { success: true }
  })

  // POST /v1/inbox/mock/seed — seed mock email messages
  fastify.post("/mock/seed", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const items = await generateMockEmails(dealer_id)
    return { items: items.map(mapMessage) }
  })

  // POST /v1/inbox/:id/generate-post-draft — convert positive review to post draft
  fastify.post("/:id/generate-post-draft", { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Message not found" })

    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })

    const { generateTestimonialCaption } = await import("../services/openai.js")
    const { caption, hashtags } = await generateTestimonialCaption(
      message.message_text,
      message.customer_name,
      { name: dealer.name, city: dealer.city }
    )

    const post = await prisma.post.create({
      data: {
        dealer_id,
        prompt_text: `Testimonial post based on review by ${message.customer_name}: "${message.message_text}"`,
        caption_text: caption,
        caption_hashtags: hashtags,
        platforms: ["facebook", "instagram"],
        status: "draft",
      }
    })

    return { post }
  })
}

