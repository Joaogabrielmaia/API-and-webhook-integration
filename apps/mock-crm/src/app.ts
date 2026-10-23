import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AppError,
  EVENT_VERSION,
  apiKeyGuard,
  fastifyDefaults,
  installErrorHandling,
  installLenientJson,
  sendSignedWebhook,
  type DealWonEvent,
} from "@ponte/shared";
import { Prisma, PrismaClient } from "./generated/client";
import { registerUi } from "./ui";

export interface CrmConfig {
  databaseUrl: string;
  apiKey: string;
  /** URL completa do webhook da Ponte, ex.: http://localhost:4000/v1/webhooks/crm */
  ponteWebhookUrl: string;
  webhookSecret: string;
  logLevel?: string;
}

export const STAGES = ["LEAD", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"] as const;
export const BILLING_STATUSES = ["NAO_COBRADO", "EM_CONFERENCIA", "ABERTA", "PAGO"] as const;

const stageSchema = z.enum(STAGES);
const billingSchema = z.enum(BILLING_STATUSES);

const customerInput = z.object({
  name: z.string().trim().min(1),
  cnpj: z.string().trim().min(1),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
});
const dealInput = z.object({
  title: z.string().trim().min(1),
  customerId: z.string().uuid(),
  value: z.string().trim().min(1),
  paymentTermDays: z.number().int().min(0).max(365).nullable().optional(),
});
const dealPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    value: z.string().trim().min(1).optional(),
    paymentTermDays: z.number().int().min(0).max(365).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.");

type DealWithCustomer = Prisma.DealGetPayload<{ include: { customer: true } }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function serializeCustomer(c: { id: string; name: string; cnpj: string; phone: string | null; email: string | null; createdAt: Date }) {
  return { id: c.id, name: c.name, cnpj: c.cnpj, phone: c.phone, email: c.email, createdAt: c.createdAt.toISOString() };
}

export function serializeDeal(d: DealWithCustomer) {
  return {
    id: d.id,
    title: d.title,
    customerId: d.customerId,
    customer: serializeCustomer(d.customer),
    stage: d.stage,
    value: d.value,
    paymentTermDays: d.paymentTermDays,
    version: d.version,
    wonAt: iso(d.wonAt),
    erpCustomerId: d.erpCustomerId,
    erpOrderId: d.erpOrderId,
    erpInvoiceId: d.erpInvoiceId,
    billingStatus: d.billingStatus,
    paidAt: iso(d.paidAt),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function serializeDelivery(d: { id: string; eventId: string; dealId: string; status: string; httpStatus: number | null; attempts: number; lastError: string | null; createdAt: Date }) {
  return { id: d.id, eventId: d.eventId, dealId: d.dealId, status: d.status, httpStatus: d.httpStatus, attempts: d.attempts, lastError: d.lastError, createdAt: d.createdAt.toISOString() };
}

export interface CrmApp {
  app: FastifyInstance;
  prisma: PrismaClient;
}

export async function buildCrmApp(config: CrmConfig): Promise<CrmApp> {
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const app = Fastify(fastifyDefaults(config.logLevel));
  installErrorHandling(app, { validationCode: "CRM-REQ-001", notFoundCode: "CRM-NOTFOUND-001" });
  installLenientJson(app);
  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  app.get("/health", async () => ({ status: "ok" }));

  async function sendDelivery(deliveryId: string): Promise<void> {
    const delivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const result = await sendSignedWebhook({ url: config.ponteWebhookUrl, secret: config.webhookSecret, eventId: delivery.eventId, body: delivery.payload });
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: result.ok ? "DELIVERED" : "FAILED", httpStatus: result.httpStatus, lastError: result.error, attempts: { increment: 1 } },
    });
  }

  async function emitDealWon(deal: DealWithCustomer): Promise<void> {
    const event: DealWonEvent = {
      id: randomUUID(),
      type: "deal.won",
      version: EVENT_VERSION,
      occurredAt: new Date().toISOString(),
      data: {
        deal: { id: deal.id, title: deal.title, value: deal.value, paymentTermDays: deal.paymentTermDays, wonAt: (deal.wonAt ?? new Date()).toISOString(), version: deal.version },
        customer: { id: deal.customer.id, name: deal.customer.name, cnpj: deal.customer.cnpj, phone: deal.customer.phone, email: deal.customer.email },
      },
    };
    const delivery = await prisma.webhookDelivery.create({ data: { eventId: event.id, dealId: deal.id, payload: event as unknown as Prisma.InputJsonValue } });
    await sendDelivery(delivery.id);
  }

  async function getDealOr404(id: string): Promise<DealWithCustomer> {
    const deal = await prisma.deal.findUnique({ where: { id }, include: { customer: true } });
    if (!deal) throw new AppError("CRM-NOTFOUND-001", "Negócio não encontrado.");
    return deal;
  }

  /** Move a etapa; ao entrar em GANHO emite o webhook (uma tentativa, sem reenvio automático). */
  async function moveStage(id: string, stage: (typeof STAGES)[number]): Promise<DealWithCustomer> {
    const deal = await getDealOr404(id);
    if (deal.stage === stage) return deal;
    const entersWon = stage === "GANHO";
    const updated = await prisma.deal.update({
      where: { id },
      data: { stage, version: { increment: 1 }, wonAt: entersWon ? new Date() : null },
      include: { customer: true },
    });
    if (entersWon) await emitDealWon(updated);
    return updated;
  }

  // ---- API /v1 (protegida por X-Api-Key)
  await app.register(
    async (api) => {
      api.addHook("onRequest", apiKeyGuard("x-api-key", config.apiKey, "CRM-AUTH-001"));

      api.get("/customers", async () => {
        const rows = await prisma.customer.findMany({ orderBy: { createdAt: "asc" } });
        return { data: rows.map(serializeCustomer) };
      });
      api.post("/customers", async (req, reply) => {
        const body = customerInput.parse(req.body);
        const row = await prisma.customer.create({ data: body });
        return reply.status(201).send(serializeCustomer(row));
      });
      api.get<{ Params: { id: string } }>("/customers/:id", async (req) => {
        const row = await prisma.customer.findUnique({ where: { id: req.params.id } });
        if (!row) throw new AppError("CRM-NOTFOUND-001", "Cliente não encontrado.");
        return serializeCustomer(row);
      });

      api.get<{ Querystring: { stage?: string } }>("/deals", async (req) => {
        const stage = req.query.stage ? stageSchema.parse(req.query.stage) : undefined;
        const rows = await prisma.deal.findMany({ where: stage ? { stage } : {}, include: { customer: true }, orderBy: { createdAt: "asc" } });
        return { data: rows.map(serializeDeal) };
      });
      api.post("/deals", async (req, reply) => {
        const body = dealInput.parse(req.body);
        const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
        if (!customer) throw new AppError("CRM-NOTFOUND-001", "Cliente não encontrado.");
        const row = await prisma.deal.create({ data: { title: body.title, customerId: body.customerId, value: body.value, paymentTermDays: body.paymentTermDays ?? null }, include: { customer: true } });
        return reply.status(201).send(serializeDeal(row));
      });
      api.get<{ Params: { id: string } }>("/deals/:id", async (req) => serializeDeal(await getDealOr404(req.params.id)));
      api.patch<{ Params: { id: string } }>("/deals/:id", async (req) => {
        await getDealOr404(req.params.id);
        const body = dealPatch.parse(req.body);
        const row = await prisma.deal.update({ where: { id: req.params.id }, data: { ...body, version: { increment: 1 } }, include: { customer: true } });
        return serializeDeal(row);
      });
      api.post<{ Params: { id: string } }>("/deals/:id/stage", async (req) => {
        const { stage } = z.object({ stage: stageSchema }).parse(req.body);
        return serializeDeal(await moveStage(req.params.id, stage));
      });

      // Metadados de integração: não incrementam `version` (não são edição comercial).
      api.put<{ Params: { id: string } }>("/deals/:id/erp-link", async (req) => {
        await getDealOr404(req.params.id);
        const body = z.object({ erpCustomerId: z.string(), erpOrderId: z.string(), erpInvoiceId: z.string(), billingStatus: billingSchema }).parse(req.body);
        const row = await prisma.deal.update({ where: { id: req.params.id }, data: body, include: { customer: true } });
        return serializeDeal(row);
      });
      api.patch<{ Params: { id: string } }>("/deals/:id/billing-status", async (req) => {
        await getDealOr404(req.params.id);
        const body = z.object({ billingStatus: billingSchema, paidAt: z.string().datetime().nullable().optional() }).parse(req.body);
        const row = await prisma.deal.update({
          where: { id: req.params.id },
          data: { billingStatus: body.billingStatus, paidAt: body.paidAt ? new Date(body.paidAt) : body.billingStatus === "PAGO" ? new Date() : null },
          include: { customer: true },
        });
        return serializeDeal(row);
      });

      api.get("/webhook-deliveries", async () => {
        const rows = await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
        return { data: rows.map(serializeDelivery) };
      });
      api.post<{ Params: { id: string } }>("/webhook-deliveries/:id/resend", async (req) => {
        const found = await prisma.webhookDelivery.findUnique({ where: { id: req.params.id } });
        if (!found) throw new AppError("CRM-NOTFOUND-001", "Entrega não encontrada.");
        await sendDelivery(found.id);
        return serializeDelivery(await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: found.id } }));
      });
    },
    { prefix: "/v1" },
  );

  registerUi(app, { prisma, moveStage, sendDelivery });

  return { app, prisma };
}
