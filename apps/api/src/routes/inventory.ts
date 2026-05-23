import type { FastifyInstance } from "fastify"
import { prisma } from "../db/prisma.js"

function parseIntOrNull(value: unknown) {
  if (typeof value === "number") return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    return Number.isNaN(parsed) ? null : parsed
  }
  return null
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string")
  if (typeof value === "string" && value.trim() !== "") {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      return value
        .split(/[,;]+/)
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }
  return []
}

function parseBoolean(value: unknown) {
  if (typeof value === "boolean") return value
  if (typeof value === "string") return value.toLowerCase() === "true"
  return false
}

function parseCsvText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = (lines[0] ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
  const rows = lines.slice(1).map((line) => {
    const values = line
      .split(",")
      .map((cell) => cell.trim().replace(/^"|"$/g, ""))
    const row: Record<string, string> = {}
    headers.forEach((header, index) => {
      row[header] = values[index] ?? ""
    })
    return row
  })
  return { headers, rows }
}

export default async function inventoryRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', async (request, reply) => {
    try {
      await request.jwtVerify()
    } catch (err) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } })
    }

    const planGateHook = fastify.checkPlanLimit('inventory')
    await planGateHook(request, reply)
  })

  // POST /v1/inventory/batch — Bulk insert inventory items
  fastify.post(
    "/batch",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const { items } = request.body as { items: Array<Record<string, any>> }

      if (!items || !Array.isArray(items)) {
        return reply.code(400).send({
          error: { code: "INVALID_INPUT", message: "items must be an array" },
        })
      }

      try {
        const createdItems = await prisma.$transaction(
          items.map((item) =>
            prisma.inventoryItem.create({
              data: {
                dealer_id,
                make: String(item.make ?? ""),
                model: String(item.model ?? ""),
                variant: item.variant ? String(item.variant) : null,
                year: parseInt(String(item.year ?? ""), 10) || 0,
                price: parseInt(String(item.price ?? ""), 10) || 0,
                condition: String(item.condition ?? "used"),
                color: item.color ? String(item.color) : null,
                fuel_type: item.fuel_type ? String(item.fuel_type) : null,
                transmission: item.transmission ? String(item.transmission) : null,
                mileage_km: item.mileage_km ? (parseInt(String(item.mileage_km), 10) || null) : null,
                stock_count: item.stock_count ? (parseInt(String(item.stock_count), 10) || 1) : 1,
                image_urls: Array.isArray(item.image_urls) ? item.image_urls.map(String) : [],
                status: String(item.status ?? "in_stock"),
                source: String(item.source ?? "csv"),
              },
            })
          )
        )
        return { success: true, count: createdItems.length }
      } catch (err: any) {
        fastify.log.error(err, "Failed to batch insert inventory items")
        return reply.code(500).send({
          error: { code: "TRANSACTION_FAILED", message: "Failed to insert inventory batch", details: err.message },
        })
      }
    }
  )

  fastify.get(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (request) => {
      const dealer_id = request.user.dealer_id as string
      const {
        condition,
        status,
        search,
        page = "1",
        limit = "20",
      } = request.query as Record<string, string>
      const where: Record<string, unknown> = { dealer_id }

      if (condition) where.condition = condition
      if (status) where.status = status
      if (search) {
        where.OR = [
          { make: { contains: search, mode: "insensitive" } },
          { model: { contains: search, mode: "insensitive" } },
          { variant: { contains: search, mode: "insensitive" } },
        ]
      }

      const pageNumber = Math.max(1, parseInt(page, 10) || 1)
      const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20))
      const skip = (pageNumber - 1) * pageSize

      const [items, total] = await Promise.all([
        prisma.inventoryItem.findMany({
          where,
          orderBy: [{ created_at: "desc" }],
          skip,
          take: pageSize,
        }),
        prisma.inventoryItem.count({ where }),
      ])

      return {
        success: true,
        items,
        pagination: { page: pageNumber, limit: pageSize, total },
      }
    },
  )

  fastify.post(
    "/",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const body = request.body as Record<string, unknown>
      const item = await prisma.inventoryItem.create({
        data: {
          dealer_id,
          make: String(body.make ?? ""),
          model: String(body.model ?? ""),
          variant: body.variant ? String(body.variant) : null,
          year: parseInt(String(body.year ?? ""), 10) || 0,
          price: parseInt(String(body.price ?? ""), 10) || 0,
          condition: String(body.condition ?? "used"),
          color: body.color ? String(body.color) : null,
          fuel_type: body.fuel_type ? String(body.fuel_type) : null,
          transmission: body.transmission ? String(body.transmission) : null,
          mileage_km: parseInt(String(body.mileage_km ?? ""), 10) || null,
          stock_count: parseInt(String(body.stock_count ?? ""), 10) || 1,
          image_urls: parseStringArray(body.image_urls),
          status: String(body.status ?? "in_stock"),
          source: String(body.source ?? "manual"),
        },
      })
      return { success: true, item }
    },
  )

  fastify.put(
    "/:id",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const { id } = request.params as { id: string }
      const body = request.body as Record<string, unknown>
      const updateData: Record<string, unknown> = {}
      if (body.make !== undefined) updateData.make = String(body.make)
      if (body.model !== undefined) updateData.model = String(body.model)
      if (body.variant !== undefined)
        updateData.variant = body.variant ? String(body.variant) : null
      if (body.year !== undefined)
        updateData.year = parseInt(String(body.year), 10)
      if (body.price !== undefined)
        updateData.price = parseInt(String(body.price), 10)
      if (body.condition !== undefined)
        updateData.condition = String(body.condition)
      if (body.color !== undefined)
        updateData.color = body.color ? String(body.color) : null
      if (body.fuel_type !== undefined)
        updateData.fuel_type = body.fuel_type ? String(body.fuel_type) : null
      if (body.transmission !== undefined)
        updateData.transmission = body.transmission
          ? String(body.transmission)
          : null
      if (body.mileage_km !== undefined)
        updateData.mileage_km = parseInt(String(body.mileage_km), 10) || null
      if (body.stock_count !== undefined)
        updateData.stock_count = parseInt(String(body.stock_count), 10)
      if (body.image_urls !== undefined)
        updateData.image_urls = parseStringArray(body.image_urls)
      if (body.status !== undefined) updateData.status = String(body.status)
      if (body.source !== undefined) updateData.source = String(body.source)

      const item = await prisma.inventoryItem.updateMany({
        where: { id, dealer_id },
        data: updateData,
      })
      if (item.count === 0) {
        return reply
          .code(404)
          .send({
            error: { code: "NOT_FOUND", message: "Inventory item not found" },
          })
      }
      const updated = await prisma.inventoryItem.findFirst({
        where: { id, dealer_id },
      })
      return { success: true, item: updated }
    },
  )

  fastify.delete(
    "/:id",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const { id } = request.params as { id: string }
      const deleted = await prisma.inventoryItem.deleteMany({
        where: { id, dealer_id },
      })
      if (deleted.count === 0) {
        return reply
          .code(404)
          .send({
            error: { code: "NOT_FOUND", message: "Inventory item not found" },
          })
      }
      return { success: true, message: `Vehicle ${id} deleted` }
    },
  )

  fastify.patch(
    "/:id/status",
    {
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const dealer_id = request.user.dealer_id as string
      const { id } = request.params as { id: string }
      const { status } = request.body as { status: string }
      if (!status) {
        return reply
          .code(400)
          .send({
            error: { code: "INVALID_INPUT", message: "status is required" },
          })
      }
      const updated = await prisma.inventoryItem.updateMany({
        where: { id, dealer_id },
        data: { status },
      })
      if (updated.count === 0) {
        return reply
          .code(404)
          .send({
            error: { code: "NOT_FOUND", message: "Inventory item not found" },
          })
      }
      const item = await prisma.inventoryItem.findFirst({
        where: { id, dealer_id },
      })
      return { success: true, item }
    },
  )

  const importCsv = async (request: any, reply: any) => {
    const dealer_id = request.user.dealer_id as string
    const file = await request.file()
    if (!file) {
      return reply
        .code(400)
        .send({
          error: { code: "INVALID_INPUT", message: "CSV file is required" },
        })
    }

    const buffer = await file.toBuffer()
    const text = buffer.toString("utf8")
    const { rows } = parseCsvText(text)
    const errors: Array<{ row: number; field: string; message: string }> = []

    let successCount = 0
    for (const [rowIndex, row] of rows.entries()) {
      const make = row.make || row["make"]
      const model = row.model || row["model"]
      const year = parseInt(row.year || row["year"] || "", 10)
      const price = parseInt(row.price || row["price"] || "", 10)
      if (!make || !model || Number.isNaN(year) || Number.isNaN(price)) {
        errors.push({
          row: rowIndex + 2,
          field: "make/model/year/price",
          message: "Required inventory fields missing or invalid",
        })
        continue
      }

      try {
        await prisma.inventoryItem.create({
          data: {
            dealer_id,
            make,
            model,
            variant: row.variant || row["variant"] || null,
            year,
            price,
            condition: row.condition || row["condition"] || "used",
            color: row.color || row["color"] || null,
            fuel_type: row.fuel_type || row["fuel_type"] || null,
            transmission: row.transmission || row["transmission"] || null,
            mileage_km:
              parseInt(row.mileage_km || row["mileage_km"] || "", 10) || null,
            stock_count:
              parseInt(row.stock_count || row["stock_count"] || "", 10) || 1,
            image_urls: (row.image_urls || row["image_urls"] || "")
              .split(/[,;]+/)
              .map((v) => v.trim())
              .filter(Boolean),
            status: row.status || row["status"] || "in_stock",
            source: "csv",
          },
        })
        successCount += 1
      } catch (err) {
        fastify.log.error({ err, row }, "Failed to import inventory row")
        errors.push({
          row: rowIndex + 2,
          field: "row",
          message: "Insert failed",
        })
      }
    }

    return {
      success: true,
      result: {
        totalRows: rows.length,
        successCount,
        errorCount: errors.length,
        errors,
      },
    }
  }

  fastify.post(
    "/import",
    {
      preHandler: [fastify.authenticate],
    },
    importCsv,
  )

  fastify.post(
    "/upload",
    {
      preHandler: [fastify.authenticate],
    },
    importCsv,
  )
}
