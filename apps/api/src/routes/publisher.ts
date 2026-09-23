import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { prisma } from "../db/prisma.js"
import { publishQueue, isQueueAvailable } from "../queues/index.js"
import type { PublishJobData } from "../queues/index.js"
import { buildPublishData, platformLabel, publishPost } from "../lib/publishDirect.js"
import { deletePostIf, transitionPost } from "../lib/publishClaim.js"
import { spendApprovalLinks } from "../lib/approvals.js"
import { PERMISSIONS } from "../lib/permissions.js"
import { getUser, requirePermission } from "../lib/routeHelpers.js"

// Statuses that end in the post going live; moving a post into one needs publish_post.
const PUBLISH_STATUSES = new Set(["scheduled", "publishing", "published"])

const PUBLISH_IN_PROGRESS = {
  error: {
    code: "PUBLISH_IN_PROGRESS",
    message: "This post is being published right now. Try again once it finishes.",
  },
}

// Approval statuses change only through the approval routes (routes/approvals.ts).
const APPROVAL_STATUSES = new Set(["pending_approval", "approved"])

const AWAITING_APPROVAL = {
  error: {
    code: "AWAITING_APPROVAL",
    message: "Approve or reject this post before publishing it.",
  },
}

// Media URLs we store: absolute http(s) or our local /uploads/ path (dev storage fallback).
const isMediaUrl = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 2048 && /^(https?:\/\/|\/uploads\/)/i.test(value)

async function requirePublishPermission(request: FastifyRequest, reply: FastifyReply) {
  if (!requirePermission(reply, getUser(request), PERMISSIONS.PUBLISH_POST)) return reply
}

async function removeQueuedJobs(postId: string) {
  if (!isQueueAvailable() || !publishQueue) return
  const jobs = await publishQueue.getJobs(["delayed", "waiting"])
  for (const job of jobs) {
    if (job.data.post_id === postId) await job.remove()
  }
}

export default async function publisherRoutes(fastify: FastifyInstance) {
  // POST /v1/publisher/posts — create a draft post
  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate, fastify.checkPlanLimit('posts')],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const body = request.body as {
        promptText: string
        captionText?: string
        captionHashtags?: string[]
        creativeUrls?: Record<string, string>
        platforms: string[]
        mediaType?: string
        videoUrl?: string
        thumbnailUrl?: string
      }

      if (!body.promptText || !body.platforms?.length) {
        return reply.code(400).send({
          error: {
            code: "INVALID_INPUT",
            message: "promptText and platforms are required",
          },
        })
      }

      if (body.mediaType !== undefined && body.mediaType !== "image" && body.mediaType !== "video") {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "mediaType must be image or video" } })
      }
      const isVideo = body.mediaType === "video"
      if (isVideo && !isMediaUrl(body.videoUrl)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "videoUrl is required for video posts" } })
      }
      if (body.thumbnailUrl !== undefined && !isMediaUrl(body.thumbnailUrl)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "thumbnailUrl must be a media URL" } })
      }

      const post = await prisma.post.create({
        data: {
          dealer_id,
          prompt_text: body.promptText,
          ...(body.captionText ? { caption_text: body.captionText } : {}),
          caption_hashtags: body.captionHashtags ?? [],
          ...(body.creativeUrls ? { creative_urls: body.creativeUrls } : {}),
          platforms: body.platforms,
          status: "draft",
          created_by: request.user.dealer_user_id ?? null,
          media_type: isVideo ? "video" : "image",
          ...(isVideo ? { video_url: body.videoUrl, thumbnail_url: body.thumbnailUrl ?? null } : {}),
        },
      })

      return { success: true, item: post }
    },
  )

  // GET /v1/publisher/posts — list dealer posts
  fastify.get(
    "/posts",
    {
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const dealer_id = request.user.dealer_id!
      const {
        page = "1",
        pageSize = "20",
        status,
      } = request.query as Record<string, string>
      const pageNumber = Math.max(1, parseInt(page, 10) || 1)
      const pageSizeNumber = Math.max(
        1,
        Math.min(100, parseInt(pageSize, 10) || 20),
      )
      const skip = (pageNumber - 1) * pageSizeNumber

      const where: Record<string, unknown> = { dealer_id }
      if (status) where.status = status

      const [data, total] = await Promise.all([
        prisma.post.findMany({
          where,
          orderBy: [{ created_at: "desc" }],
          skip,
          take: pageSizeNumber,
        }),
        prisma.post.count({ where }),
      ])

      return {
        success: true,
        data,
        total,
        page: pageNumber,
        pageSize: pageSizeNumber,
      }
    },
  )

  // GET /v1/publisher/posts/counts — posts per status, for the Posts tabs and the dashboard pipeline
  fastify.get("/posts/counts", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!
    const groups = (await prisma.post.groupBy({
      by: ["status"],
      _count: { _all: true },
      where: { dealer_id },
    })) as Array<{ status: string | null; _count: { _all: number } }>
    const counts: Record<string, number> = {}
    for (const group of groups) {
      const status = group.status ?? "draft"
      counts[status] = (counts[status] ?? 0) + group._count._all
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0)
    return { success: true, counts, total }
  })

  // GET /v1/publisher/posts/activity?days=30 — when recent posts were created and their status,
  // for the dashboard chart. The browser buckets by local day, so one extra day is included.
  fastify.get("/posts/activity", { preHandler: [fastify.authenticate] }, async (request) => {
    const dealer_id = request.user.dealer_id!
    const { days: daysParam } = request.query as { days?: string }
    const days = Math.max(1, Math.min(90, parseInt(daysParam ?? "30", 10) || 30))
    const since = new Date(Date.now() - (days + 1) * 24 * 60 * 60 * 1000)
    const posts = await prisma.post.findMany({
      where: { dealer_id, created_at: { gte: since } },
      orderBy: { created_at: "asc" },
    })
    return {
      success: true,
      days,
      posts: posts.map((p) => ({ created_at: new Date(p.created_at).toISOString(), status: p.status })),
    }
  })

  // GET /v1/publisher/posts/:id — fetch a single post
  fastify.get(
    "/posts/:id",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { id } = request.params as { id: string }
      const post = await prisma.post.findFirst({ where: { id, dealer_id } })
      if (!post)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Post not found" } })
      return { success: true, data: post }
    },
  )

  // PATCH /v1/publisher/posts/:id — update an existing draft or scheduled post
  fastify.patch(
    "/posts/:id",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { id } = request.params as { id: string }
      const body = request.body as Partial<{
        promptText: string
        captionText: string
        captionHashtags: string[]
        creativeUrls: Record<string, string>
        platforms: string[]
        status: string
        scheduled_at: string
        mediaType: string
        videoUrl: string
        thumbnailUrl: string
      }>

      if (body.status !== undefined && APPROVAL_STATUSES.has(body.status)) {
        return reply.code(400).send({
          error: { code: "INVALID_STATUS", message: "Use the approval actions to send, approve or reject a post." },
        })
      }

      if (
        body.status !== undefined &&
        PUBLISH_STATUSES.has(body.status) &&
        !requirePermission(reply, getUser(request), PERMISSIONS.PUBLISH_POST)
      )
        return reply

      if (body.mediaType !== undefined && body.mediaType !== "image" && body.mediaType !== "video") {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "mediaType must be image or video" } })
      }
      if (body.videoUrl !== undefined && !isMediaUrl(body.videoUrl)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "videoUrl is required for video posts" } })
      }
      if (body.thumbnailUrl !== undefined && !isMediaUrl(body.thumbnailUrl)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "thumbnailUrl must be a media URL" } })
      }

      const existing = await prisma.post.findFirst({ where: { id, dealer_id } })
      if (!existing)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Post not found" } })

      if (body.mediaType === "video" && !isMediaUrl(body.videoUrl) && !isMediaUrl(existing.video_url)) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "videoUrl is required for video posts" } })
      }

      // A post awaiting or holding approval loses it on a content edit: the approver signed off
      // on specific content, so a change sends it back to drafts unless this same request also
      // sets another status.
      const wasInApproval = existing.status === "pending_approval" || existing.status === "approved"
      const isContentEdit =
        body.promptText !== undefined ||
        body.captionText !== undefined ||
        body.captionHashtags !== undefined ||
        body.creativeUrls !== undefined ||
        body.platforms !== undefined ||
        body.mediaType !== undefined ||
        body.videoUrl !== undefined ||
        body.thumbnailUrl !== undefined

      const updateData: Record<string, unknown> = {}
      if (body.promptText !== undefined)
        updateData.prompt_text = body.promptText
      if (body.captionText !== undefined)
        updateData.caption_text = body.captionText
      if (body.captionHashtags !== undefined)
        updateData.caption_hashtags = body.captionHashtags
      if (body.creativeUrls !== undefined)
        updateData.creative_urls = body.creativeUrls
      if (body.platforms !== undefined) updateData.platforms = body.platforms
      if (body.videoUrl !== undefined) updateData.video_url = body.videoUrl
      if (body.thumbnailUrl !== undefined) updateData.thumbnail_url = body.thumbnailUrl
      // mediaType: 'image' ignores any videoUrl/thumbnailUrl sent in the same request and clears
      // the existing ones; mediaType: 'video' keeps whichever video URL the checks above accepted
      // (this request's videoUrl, or the post's existing one).
      if (body.mediaType === "video") {
        updateData.media_type = "video"
      } else if (body.mediaType === "image") {
        updateData.media_type = "image"
        updateData.video_url = null
        updateData.thumbnail_url = null
      }
      if (body.status !== undefined) updateData.status = body.status
      if (body.scheduled_at !== undefined)
        updateData.scheduled_at = body.scheduled_at
          ? new Date(body.scheduled_at)
          : null

      if (wasInApproval && isContentEdit && body.status === undefined) {
        updateData.status = "draft"
        updateData.approval_decision = null
        updateData.approver_note = null
        updateData.approved_by = null
        updateData.approved_at = null
      }

      // Write only if nobody changed the post's status since we read it (e.g. an approval landed).
      const written = await transitionPost(
        id,
        (p) => p.dealer_id === dealer_id && p.status === existing.status,
        updateData,
      )
      if (!written) {
        return reply.code(409).send({
          error: { code: "POST_CHANGED", message: "This post changed while you were editing it. Reload and try again." },
        })
      }

      const post = await prisma.post.findFirst({ where: { id, dealer_id } })

      // Any open approval link is for the content as it was reviewed; once the post has left
      // pending_approval/approved — by this edit or an explicit status change — it must not
      // still be actionable.
      if (wasInApproval && post && post.status !== "pending_approval" && post.status !== "approved") {
        await spendApprovalLinks(id)
      }

      return { success: true, item: post }
    },
  )

  // PATCH /v1/publisher/posts/:id/reschedule — change scheduled_at for a pending post
  fastify.patch(
    "/posts/:id/reschedule",
    { preHandler: [fastify.authenticate, requirePublishPermission] },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { id } = request.params as { id: string }
      const { scheduled_at } = request.body as { scheduled_at: string }
      if (!scheduled_at) {
        return reply.code(400).send({ error: { code: "INVALID_INPUT", message: "scheduled_at is required" } })
      }
      const post = await prisma.post.findFirst({ where: { id, dealer_id } })
      if (!post) return reply.code(404).send({ error: { code: "NOT_FOUND", message: "Post not found" } })
      if (post.status === "published") {
        return reply.code(400).send({ error: { code: "ALREADY_PUBLISHED", message: "Cannot reschedule a published post" } })
      }
      if (post.status === "publishing") return reply.code(409).send(PUBLISH_IN_PROGRESS)
      if (post.status === "pending_approval") return reply.code(409).send(AWAITING_APPROVAL)
      // Remove any existing delayed BullMQ jobs for this post
      await removeQueuedJobs(id)
      const updated = await prisma.post.update({
        where: { id },
        data: { scheduled_at: new Date(scheduled_at), status: "scheduled" },
      })
      return { success: true, item: updated }
    },
  )

  // GET /v1/publisher/posts/:id/metrics — return stored metrics for a post
  fastify.get(
    "/posts/:id/metrics",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { id } = request.params as { id: string }
      const post = await prisma.post.findFirst({
        where: { id, dealer_id },
        select: { metrics: true },
      })
      if (!post)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Post not found" } })
      return { success: true, metrics: post.metrics ?? {} }
    },
  )

  // POST /v1/publisher/publish  — publish immediately or schedule
  fastify.post(
    "/publish",
    {
      preHandler: [fastify.authenticate, requirePublishPermission, fastify.checkPlanLimit('posts')],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { post_id, platforms, scheduled_at } = request.body as {
        post_id: string
        platforms: string[]
        scheduled_at?: string // ISO string — if present, schedule; otherwise publish now
      }

      if (!post_id || !platforms?.length) {
        return reply.code(400).send({
          error: {
            code: "INVALID_INPUT",
            message: "post_id and platforms are required",
          },
        })
      }

      // Verify the post belongs to this dealer
      const post = await prisma.post.findFirst({
        where: { id: post_id, dealer_id },
      })
      if (!post)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Post not found" } })
      if (post.status === "publishing") return reply.code(409).send(PUBLISH_IN_PROGRESS)
      if (post.status === "pending_approval") return reply.code(409).send(AWAITING_APPROVAL)

      // Facebook and Instagram process video for minutes, longer than a web request may run,
      // so publishing a video now hands it to the every-minute cron (/v1/cron/publish).
      const scheduledAt = scheduled_at ? new Date(scheduled_at) : post?.media_type === "video" ? new Date() : null
      if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
        return reply.code(400).send({
          error: { code: "INVALID_INPUT", message: "scheduled_at must be an ISO date" },
        })
      }

      // Load platform connections for this dealer
      const connections = await prisma.platformConnection.findMany({
        where: { dealer_id, is_connected: true },
      })
      const connMap = new Map(connections.map((c) => [c.platform, c]))
      const skipped = platforms.filter((platform) => !connMap.has(platform))
      const useQueue = isQueueAvailable() && !!publishQueue && skipped.length < platforms.length

      // BullMQ path: one job per connected platform, delayed for scheduled posts
      const enqueue = async (delay: number) => {
        const jobIds: string[] = []
        for (const platform of platforms) {
          const conn = connMap.get(platform)
          if (!conn) continue
          const jobData: PublishJobData = buildPublishData(post, platform, conn)
          const job = await publishQueue!.add(`publish-${platform}-${post_id}`, jobData, {
            delay,
            attempts: 3,
            backoff: { type: "exponential", delay: 60_000 },
          })
          if (job.id) jobIds.push(job.id)
        }
        return jobIds
      }

      if (scheduledAt) {
        await prisma.post.update({
          where: { id: post_id },
          data: { status: "scheduled", platforms, scheduled_at: scheduledAt },
        })
        // Without a queue, the cron endpoint (/v1/cron/publish) publishes it when due.
        const jobIds = useQueue
          ? await enqueue(Math.max(0, scheduledAt.getTime() - Date.now()))
          : []
        return {
          success: true,
          status: "scheduled",
          job_ids: jobIds,
          skipped_platforms: skipped,
          scheduled_at: scheduled_at ?? scheduledAt.toISOString(),
        }
      }

      // Claim the post so a concurrent request or cron run can't publish it twice.
      const claimed = await transitionPost(
        post_id,
        (p) => p.dealer_id === dealer_id && p.status !== "publishing" && p.status !== "pending_approval",
        { status: "publishing", platforms },
      )
      if (!claimed) return reply.code(409).send(PUBLISH_IN_PROGRESS)

      if (useQueue) {
        return {
          success: true,
          status: "publishing",
          job_ids: await enqueue(0),
          skipped_platforms: skipped,
          scheduled_at: null,
        }
      }

      // No Redis — publish inline; publishPost writes the final status.
      const outcome = await publishPost(post, platforms)
      const failed = outcome.results.filter((r) => !r.success)
      const body = {
        success: outcome.status === "published",
        status: outcome.status,
        results: outcome.results,
        failed_platforms: failed.map((r) => r.platform),
        skipped_platforms: skipped,
        job_ids: [] as string[],
        scheduled_at: null,
      }
      if (outcome.status === "failed") {
        const details = failed.map((r) => `${platformLabel(r.platform)}: ${r.error}`).join(" ")
        return reply.code(502).send({
          ...body,
          error: { code: "PUBLISH_FAILED", message: `Could not publish to any platform. ${details}` },
        })
      }
      return body
    },
  )

  // GET /v1/publisher/status/:jobId
  fastify.get(
    "/status/:jobId",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const { jobId } = request.params as { jobId: string }
      if (!isQueueAvailable() || !publishQueue) {
        return reply.code(503).send({ error: { code: "QUEUE_UNAVAILABLE", message: "Queue not available in this environment" } })
      }
      const job = await publishQueue.getJob(jobId)
      if (!job)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Job not found" } })

      const state = await job.getState()
      return {
        success: true,
        job_id: jobId,
        status: state,
        result: job.returnvalue ?? null,
        failed_reason: job.failedReason ?? null,
        attempts_made: job.attemptsMade,
      }
    },
  )

  // GET /v1/publisher/calendar  — posts for calendar view
  fastify.get(
    "/calendar",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, _reply) => {
      const dealer_id = request.user.dealer_id!
      const { from, to } = request.query as { from?: string; to?: string }

      const dateRange =
        from || to
          ? {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            }
          : null

      const posts = await prisma.post.findMany({
        where: {
          dealer_id,
          ...(dateRange
            ? {
                OR: [
                  { scheduled_at: dateRange },
                  { scheduled_at: null, created_at: dateRange },
                ],
              }
            : {}),
        },
        orderBy: [{ scheduled_at: "asc" }, { created_at: "asc" }],
        select: {
          id: true,
          prompt_text: true,
          caption_text: true,
          platforms: true,
          status: true,
          scheduled_at: true,
          published_at: true,
          created_at: true,
          creative_urls: true,
          metrics: true,
        },
      })

      return { success: true, data: posts }
    },
  )

  // DELETE /v1/publisher/posts/:id  — permanently delete a post
  fastify.delete(
    "/posts/:id",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { id } = request.params as { id: string }

      const post = await prisma.post.findFirst({ where: { id, dealer_id } })
      if (!post)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Post not found" } })
      if (post.status === "publishing") return reply.code(409).send(PUBLISH_IN_PROGRESS)

      await removeQueuedJobs(id)
      const deleted = await deletePostIf(
        id,
        (p) => p.dealer_id === dealer_id && p.status !== "publishing",
      )
      if (!deleted) return reply.code(409).send(PUBLISH_IN_PROGRESS)
      return { success: true }
    },
  )

  // DELETE /v1/publisher/:postId  — cancel scheduled post
  fastify.delete(
    "/:postId",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id!
      const { postId } = request.params as { postId: string }

      const post = await prisma.post.findFirst({
        where: { id: postId, dealer_id },
      })
      if (!post)
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Post not found" } })
      if (post.status === "published") {
        return reply.code(400).send({
          error: {
            code: "ALREADY_PUBLISHED",
            message: "Cannot cancel a published post",
          },
        })
      }

      // Remove pending jobs from queue (if BullMQ is available)
      if (isQueueAvailable() && publishQueue) {
        const jobs = await publishQueue.getJobs(["delayed", "waiting"])
        for (const job of jobs) {
          if (job.data.post_id === postId) await job.remove()
        }
      }

      const wasInApproval = post.status === "pending_approval" || post.status === "approved"

      await prisma.post.update({
        where: { id: postId },
        data: { status: "draft", scheduled_at: null },
      })
      if (wasInApproval) await spendApprovalLinks(postId)
      return { success: true }
    },
  )
}
