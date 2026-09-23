import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/prisma.js';
import type { Lead } from '../generated/client/index.js';

function mapLead(l: Lead) {
  return {
    id: l.id,
    dealerId: l.dealer_id,
    customerName: l.customer_name ?? undefined,
    customerPhone: l.customer_phone ?? undefined,
    sourcePlatform: l.source_platform ?? undefined,
    sourceType: l.source_type ?? undefined,
    sourcePostId: l.source_post_id ?? undefined,
    sourceCampaignId: l.source_campaign_id ?? undefined,
    sourceMessageId: l.source_message_id ?? undefined,
    vehicleInterest: l.vehicle_interest ?? undefined,
    notes: l.notes ?? undefined,
    createdAt: new Date(l.created_at).toISOString(),
  };
}

export default async function leadsRoutes(fastify: FastifyInstance) {
  // GET /v1/leads — list leads
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { sourcePlatform, dateFrom, dateTo, page = '1', pageSize = '30' } = request.query as Record<string, string>;

    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return reply.code(400).send({ error: 'dateFrom and dateTo must be valid dates' });
    }

    const where: Record<string, unknown> = { dealer_id };
    if (sourcePlatform) where['source_platform'] = sourcePlatform;
    if (from || to) {
      where['created_at'] = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {}),
      };
    }

    const pageNumber = Math.max(1, parseInt(page, 10) || 1);
    const pageSizeNumber = Math.max(1, Math.min(100, parseInt(pageSize, 10) || 30));
    const skip = (pageNumber - 1) * pageSizeNumber;
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({ where, orderBy: { created_at: 'desc' }, skip, take: pageSizeNumber }),
      prisma.lead.count({ where }),
    ]);

    return { items: leads.map(mapLead), total };
  });

  // GET /v1/leads/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const lead = await prisma.lead.findFirst({ where: { id, dealer_id } });
    if (!lead) return reply.code(404).send({ error: 'Not found' });
    return { item: mapLead(lead) };
  });

  // POST /v1/leads — create lead
  fastify.post('/', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const body = request.body as {
      customerName: string;
      customerPhone?: string;
      sourcePlatform?: string;
      sourceType?: string;
      sourcePostId?: string;
      sourceCampaignId?: string;
      sourceMessageId?: string;
      vehicleInterest?: string;
      notes?: string;
    };

    if (!body.customerName) return reply.code(400).send({ error: 'customerName is required' });

    const lead = await prisma.lead.create({
      data: {
        dealer_id,
        customer_name: body.customerName,
        ...(body.customerPhone !== undefined ? { customer_phone: body.customerPhone } : {}),
        ...(body.sourcePlatform !== undefined ? { source_platform: body.sourcePlatform } : {}),
        source_type: body.sourceType ?? 'inbox',
        ...(body.sourcePostId !== undefined ? { source_post_id: body.sourcePostId } : {}),
        ...(body.sourceCampaignId !== undefined ? { source_campaign_id: body.sourceCampaignId } : {}),
        ...(body.sourceMessageId !== undefined ? { source_message_id: body.sourceMessageId } : {}),
        ...(body.vehicleInterest !== undefined ? { vehicle_interest: body.vehicleInterest } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    return reply.code(201).send({ item: mapLead(lead) });
  });

  // PATCH /v1/leads/:id — update lead
  fastify.patch('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const body = request.body as {
      customerName?: string;
      customerPhone?: string;
      vehicleInterest?: string;
      notes?: string;
    };

    const result = await prisma.lead.updateMany({
      where: { id, dealer_id },
      data: {
        ...(body.customerName !== undefined ? { customer_name: body.customerName } : {}),
        ...(body.customerPhone !== undefined ? { customer_phone: body.customerPhone } : {}),
        ...(body.vehicleInterest !== undefined ? { vehicle_interest: body.vehicleInterest } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    if (result.count === 0) return reply.code(404).send({ error: 'Not found' });
    const updated = await prisma.lead.findFirst({ where: { id, dealer_id } });
    return { item: mapLead(updated!) };
  });

  // DELETE /v1/leads/:id
  fastify.delete('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const dealer_id = (request.user as { dealer_id: string | null }).dealer_id as string;
    const { id } = request.params as { id: string };
    const result = await prisma.lead.deleteMany({ where: { id, dealer_id } });
    if (result.count === 0) return reply.code(404).send({ error: 'Not found' });
    return { success: true };
  });
}
