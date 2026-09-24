import type { FastifyInstance, FastifyRequest } from "fastify"
import axios from "axios"
import { prisma } from "../db/prisma.js"
import type { InboxMessage, PlatformConnection } from "../generated/client/index.js"
import { generateMockEmails } from "../services/emailMock.js"
import { replyToGmbReview } from "../services/gmb.js"
import { dealerReplyContext, draftTestimonial, suggestReplies } from "../lib/inboxReplies.js"
import { mapMessages, truncateText } from "../lib/inboxView.js"
import { ingestInboxMessage, resolvePostId } from "../lib/inboxIngest.js"
import { can, PERMISSIONS, requirePermissionHook } from "../lib/permissions.js"
import { isMockConnection, isMockId } from "../lib/platformMock.js"
import { resolveAccessToken } from "../lib/publishDirect.js"

const META_GRAPH_BASE = "https://graph.facebook.com/v19.0"
const INBOX_TAGS = new Set(["lead", "complaint", "general", "spam"])
const AI_NOT_CONFIGURED = { error: { code: "AI_NOT_CONFIGURED", message: "AI replies are not set up yet." } }
const AI_FAILED = { error: { code: "AI_FAILED", message: "The AI request failed. Please try again." } }
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err))

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

// Sends a reply on the platform. False (the reply is still saved) when it cannot be delivered.
async function sendReplyToPlatform(message: InboxMessage, replyText: string, connection: PlatformConnection): Promise<boolean> {
  // Local and demo connections carry mock_ ids; nothing may reach a real platform with them.
  if (isMockConnection(connection) || isMockId(message.platform_message_id)) return false
  try {
    const accessToken = await resolveAccessToken(connection)
    if (connection.platform === "gmb") {
      await replyToGmbReview(message.platform_message_id, accessToken, replyText)
      return true
    }
    if (connection.platform === "facebook" || connection.platform === "instagram") {
      if (message.message_type === "comment") {
        // Instagram answers a comment through /replies, Facebook through /comments.
        const edge = connection.platform === "instagram" ? "replies" : "comments"
        await axios.post(`${META_GRAPH_BASE}/${message.platform_message_id}/${edge}`, { message: replyText, access_token: accessToken })
        return true
      }
      if (message.customer_platform_id) {
        await axios.post(`${META_GRAPH_BASE}/me/messages`, {
          recipient: { id: message.customer_platform_id },
          message: { text: replyText },
          access_token: accessToken,
        })
        return true
      }
    }
  } catch (err) {
    console.error("[inbox] Could not deliver a reply to the platform:", errorText(err))
  }
  return false
}

export default async function inboxRoutes(fastify: FastifyInstance) {
  // Meta calls the webhook routes directly; every other route needs a session and
  // a plan that includes the inbox. Matched on the route, not the raw URL, so a
  // query string or path segment containing "/webhook" cannot skip the checks.
  const webhookRoutes = new Set([`${fastify.prefix}/webhook/meta`])
  fastify.addHook('preHandler', async (request, reply) => {
    if (webhookRoutes.has(request.routeOptions.url ?? '')) return

    await fastify.authenticate(request, reply)
    if (reply.sent) return reply

    const planGateHook = fastify.checkPlanLimit('inbox')
    return planGateHook(request, reply)
  })

  // Reading the inbox needs view_inbox; answering, tagging and configuring it need reply_inbox.
  const canView = requirePermissionHook(PERMISSIONS.VIEW_INBOX)
  const canReply = requirePermissionHook(PERMISSIONS.REPLY_INBOX)
  const dealerOf = (request: FastifyRequest) => request.user.dealer_id as string

  // GET /v1/inbox — list messages, newest first
  fastify.get("/", { preHandler: [canView] }, async (request) => {
    const dealer_id = dealerOf(request)
    const { platform, tag, isRead, search, page = "1", pageSize = "30" } = request.query as Record<string, string>

    const where: Record<string, unknown> = { dealer_id }
    if (platform) where["platform"] = platform
    if (tag) where["tag"] = tag
    if (isRead !== undefined) where["is_read"] = isRead === "true"
    if (search) where["message_text"] = { contains: search, mode: "insensitive" }

    const size = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 30))
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * size
    const [messages, total, unreadCount] = await Promise.all([
      prisma.inboxMessage.findMany({ where, orderBy: { received_at: "desc" }, skip, take: size }),
      prisma.inboxMessage.count({ where }),
      prisma.inboxMessage.count({ where: { dealer_id, is_read: false } }),
    ])

    return { items: await mapMessages(dealer_id, messages), total, unreadCount }
  })

  // GET /v1/inbox/pending-count — unread messages, for the sidebar badge
  fastify.get("/pending-count", { preHandler: [canView] }, async (request) => {
    const pending = await prisma.inboxMessage.count({ where: { dealer_id: dealerOf(request), is_read: false } })
    return { pending }
  })

  // GET /v1/inbox/:id — single message
  fastify.get("/:id", { preHandler: [canView] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Not found" })
    const [item] = await mapMessages(dealer_id, [message])
    return { item }
  })

  // PATCH /v1/inbox/:id — { isRead } needs view_inbox; { tag } also needs reply_inbox
  fastify.patch("/:id", { preHandler: [canView] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const body = (request.body ?? {}) as { isRead?: unknown; tag?: unknown }

    const update: Record<string, unknown> = {}
    if (body.isRead !== undefined) {
      if (typeof body.isRead !== "boolean") {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "isRead must be true or false" } })
      }
      update["is_read"] = body.isRead
    }
    if (body.tag !== undefined) {
      if (!can(request.user, PERMISSIONS.REPLY_INBOX)) {
        return reply.code(403).send({ error: { code: "FORBIDDEN", message: `Missing permission: ${PERMISSIONS.REPLY_INBOX}` } })
      }
      if (body.tag !== null && (typeof body.tag !== "string" || !INBOX_TAGS.has(body.tag))) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "tag must be lead, complaint, general or spam" } })
      }
      update["tag"] = body.tag
    }
    if (Object.keys(update).length === 0) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "Send isRead or tag" } })
    }

    const result = await prisma.inboxMessage.updateMany({ where: { id, dealer_id }, data: update })
    if (result.count === 0) return reply.code(404).send({ error: "Not found" })

    const updated = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!updated) return reply.code(404).send({ error: "Not found" })
    const [item] = await mapMessages(dealer_id, [updated])
    return { item }
  })

  // POST /v1/inbox/mark-all-read
  fastify.post("/mark-all-read", { preHandler: [canView] }, async (request) => {
    await prisma.inboxMessage.updateMany({ where: { dealer_id: dealerOf(request), is_read: false }, data: { is_read: true } })
    return { success: true }
  })

  // POST /v1/inbox/:id/reply — saves the reply; `delivered` says whether the customer got it
  fastify.post("/:id/reply", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const { replyText } = (request.body ?? {}) as { replyText?: unknown }
    if (typeof replyText !== "string" || !replyText.trim()) return reply.code(400).send({ error: "replyText is required" })

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Not found" })

    const text = replyText.trim()
    const connection = await prisma.platformConnection.findFirst({ where: { dealer_id, platform: message.platform, is_connected: true } })
    const delivered = connection ? await sendReplyToPlatform(message, text, connection) : false

    const updated = await prisma.inboxMessage.update({ where: { id }, data: { reply_text: text, replied_at: new Date() } })
    const [item] = await mapMessages(dealer_id, [updated])
    return { item, delivered }
  })

  // POST /v1/inbox/:id/suggest-reply — up to three AI reply options; the first is stored
  fastify.post("/:id/suggest-reply", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }
    const { tone } = (request.body ?? {}) as { tone?: unknown }
    if (tone !== undefined && (typeof tone !== "string" || tone.length > 40)) {
      return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "tone must be a short word" } })
    }

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Not found" })

    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })

    let suggestions: string[] | null
    try {
      suggestions = await suggestReplies({ message, dealer: dealerReplyContext(dealer), ...(typeof tone === "string" && tone ? { tone } : {}) })
    } catch (err) {
      request.log.error({ message: errorText(err) }, "[inbox] reply suggestions failed")
      return reply.code(502).send(AI_FAILED)
    }
    if (!suggestions) return reply.code(503).send(AI_NOT_CONFIGURED)
    const [first] = suggestions
    if (!first) return reply.code(502).send(AI_FAILED)

    await prisma.inboxMessage.update({ where: { id }, data: { ai_suggested_reply: first } })
    return { suggestedReply: first, suggestions }
  })

  // POST /v1/inbox/webhook/meta — receive Meta webhook events
  fastify.post("/webhook/meta", async (request, reply) => {
    const signature = request.headers['x-hub-signature-256'] as string;
    // Meta signs webhook payloads with the app secret.
    const secret = process.env['META_APP_SECRET'];
    let isValid = false;
    if (process.env['NODE_ENV'] !== 'production' && (!signature || !secret)) {
      fastify.log.info('Bypassing Meta webhook signature verification in local development.');
      isValid = true;
    } else if (signature && secret) {
      const rawBody = (request as any).rawBody;
      const { validateMetaSignature } = await import('../lib/webhookSecurity.js');
      isValid = validateMetaSignature(rawBody, signature, secret);
    }

    if (!isValid) {
      return reply.code(400).send({ error: 'Invalid webhook signature' });
    }

    const payload = request.body as any;
    fastify.log.info(
      { payloadType: payload?.object },
      "Received Meta webhook event",
    );

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
          if (event.message?.is_echo) continue // the Page's own outgoing message
          const text = extractTextFromMetaMessage(event)
          const messageId =
            event.message?.mid ||
            event.message?.id ||
            event.standby?.[0]?.message?.mid
          if (!text || !messageId) continue

          const { created } = await ingestInboxMessage({
            dealer_id,
            platform,
            message_type: "dm",
            platform_message_id: messageId,
            message_text: text,
            customer_name: event.sender?.name,
            customer_platform_id: event.sender?.id,
            customer_avatar_url: event.sender?.profile_pic,
          })
          if (created) imported += 1 // a re-delivery refreshes the message but is not new
        }
      }

      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          const value = change.value ?? {}
          // Facebook "feed" events also cover new posts, reactions and edits; only comments belong in the inbox.
          if (change.field === "feed" && value.item && value.item !== "comment") continue
          if (value.verb === "remove") continue
          const text = extractTextFromMetaChange(change)
          const messageId = value.comment_id || value.message_id || value.id
          if (!text || !messageId) continue
          const customerId = value.from?.id ?? value.sender_id
          if (customerId && customerId === connection.platform_account_id) continue // the Page's own comment

          const { created } = await ingestInboxMessage({
            dealer_id,
            platform,
            message_type: "comment",
            platform_message_id: messageId,
            message_text: text,
            customer_name: value.from?.name ?? value.from?.username ?? value.sender_name,
            customer_platform_id: customerId,
            post_id: await resolvePostId(dealer_id, platform, value.post_id ?? value.media?.id),
          })
          if (created) imported += 1
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
      process.env["META_WEBHOOK_VERIFY_TOKEN"] ??
      (process.env["NODE_ENV"] === "production" ? undefined : "cardeko_webhook_secret")
    if (mode === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return reply.code(200).send(challenge)
    }
    return reply.code(403).send({ error: "Forbidden" })
  })

  // GET /v1/inbox/settings — get auto-reply settings
  fastify.get("/settings", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })
    return { autoReplyEnabled: dealer.auto_reply_enabled }
  })

  // POST /v1/inbox/settings — update auto-reply settings
  fastify.post("/settings", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { autoReplyEnabled } = request.body as { autoReplyEnabled: boolean }
    
    await prisma.dealer.update({
      where: { id: dealer_id },
      data: { auto_reply_enabled: autoReplyEnabled }
    })
    return { autoReplyEnabled }
  })

  // GET /v1/inbox/rules — list rules
  fastify.get("/rules", { preHandler: [canReply] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const rules = await prisma.autoReplyRule.findMany({
      where: { dealer_id },
      include: { template: true },
      orderBy: { created_at: "desc" }
    })
    return { items: rules }
  })

  // POST /v1/inbox/rules — create rule
  fastify.post("/rules", { preHandler: [canReply] }, async (request) => {
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
  fastify.put("/rules/:id", { preHandler: [canReply] }, async (request, reply) => {
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
  fastify.delete("/rules/:id", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }
    const rule = await prisma.autoReplyRule.findFirst({ where: { id, dealer_id } })
    if (!rule) return reply.code(404).send({ error: "Rule not found" })

    await prisma.autoReplyRule.delete({ where: { id } })
    return { success: true }
  })

  // GET /v1/inbox/templates — list templates
  fastify.get("/templates", { preHandler: [canReply] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const templates = await prisma.autoReplyTemplate.findMany({
      where: { dealer_id },
      orderBy: { created_at: "desc" }
    })
    return { items: templates }
  })

  // POST /v1/inbox/templates — create template
  fastify.post("/templates", { preHandler: [canReply] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { name, text } = request.body as { name: string; text: string }

    const template = await prisma.autoReplyTemplate.create({
      data: { dealer_id, name, text }
    })
    return { item: template }
  })

  // PUT /v1/inbox/templates/:id — update template
  fastify.put("/templates/:id", { preHandler: [canReply] }, async (request, reply) => {
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
  fastify.delete("/templates/:id", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const { id } = request.params as { id: string }
    const template = await prisma.autoReplyTemplate.findFirst({ where: { id, dealer_id } })
    if (!template) return reply.code(404).send({ error: "Template not found" })

    await prisma.autoReplyTemplate.delete({ where: { id } })
    return { success: true }
  })

  // POST /v1/inbox/mock/seed — seed mock email messages
  fastify.post("/mock/seed", { preHandler: [canReply] }, async (request) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string
    const items = await generateMockEmails(dealer_id)
    return { items: await mapMessages(dealer_id, items) }
  })

  // POST /v1/inbox/:id/generate-post-draft — a thank-you post draft from a review ("Turn into post")
  fastify.post("/:id/generate-post-draft", { preHandler: [canReply] }, async (request, reply) => {
    const dealer_id = dealerOf(request)
    const { id } = request.params as { id: string }

    const message = await prisma.inboxMessage.findFirst({ where: { id, dealer_id } })
    if (!message) return reply.code(404).send({ error: "Message not found" })

    const dealer = await prisma.dealer.findUnique({ where: { id: dealer_id } })
    if (!dealer) return reply.code(404).send({ error: "Dealer not found" })

    let draft: { caption: string; hashtags: string[] } | null
    try {
      draft = await draftTestimonial({
        reviewText: message.message_text,
        customerName: message.customer_name,
        rating: message.rating,
        dealer: { name: dealer.name, city: dealer.city },
      })
    } catch (err) {
      request.log.error({ message: errorText(err) }, "[inbox] testimonial draft failed")
      return reply.code(502).send(AI_FAILED)
    }
    if (!draft) return reply.code(503).send(AI_NOT_CONFIGURED)

    const post = await prisma.post.create({
      data: {
        dealer_id,
        created_by: request.user.dealer_user_id,
        prompt_text: `Thank-you post for ${message.customer_name}'s review: "${truncateText(message.message_text, 300)}"`,
        caption_text: draft.caption,
        caption_hashtags: draft.hashtags,
        platforms: ["facebook", "instagram"],
        status: "draft",
      },
    })

    return { post }
  })
}

