import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, EVENT_VERSION, apiKeyGuard, fastifyDefaults, installErrorHandling, installLenientJson, sendSignedWebhook, type InvoicePaidEvent } from "@ponte/shared";
import { Prisma, PrismaClient } from "./generated/client";
import { registerUi } from "./ui";

export interface ErpConfig {
  databaseUrl: string;
  apiKey: string;
  /** URL completa do webhook da Ponte, ex.: http://localhost:4000/v1/webhooks/erp */
  ponteWebhookUrl: string;
  webhookSecret: string;
  logLevel?: string;
}

export interface ChaosState {
  mode: "none" | "down" | "slow";
  delayMs: number;
}

const taxIdSchema = z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 dígitos, sem máscara.");
const customerInput = z.object({ taxId: taxIdSchema, name: z.string().trim().min(1), phone: z.string().nullable().optional(), email: z.string().nullable().optional() });
const customerPatch = z.object({ phone: z.string().nullable().optional(), email: z.string().nullable().optional() }).refine((v) => Object.keys(v).length > 0, "Informe ao menos um campo.");
const orderInput = z.object({ customerId: z.string().uuid(), externalRef: z.string().min(1), description: z.string().min(1), totalCents: z.number().int().min(1) });
const invoiceInput = z.object({
  orderId: z.string().uuid(),
  externalRef: z.string().min(1),
  amountCents: z.number().int().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["ABERTA", "EM_CONFERENCIA"]).default("ABERTA"),
});
const chaosInput = z.object({ mode: z.enum(["none", "down", "slow"]), delayMs: z.number().int().min(0).max(60000).optional() });

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

type Customer = Prisma.CustomerGetPayload<object>;
type Order = Prisma.OrderGetPayload<object>;
type Invoice = Prisma.InvoiceGetPayload<object>;

export const serializeCustomer = (c: Customer) => ({ id: c.id, taxId: c.taxId, name: c.name, phone: c.phone, email: c.email, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() });
export const serializeOrder = (o: Order) => ({ id: o.id, customerId: o.customerId, externalRef: o.externalRef, description: o.description, totalCents: o.totalCents, status: o.status, createdAt: o.createdAt.toISOString() });
export const serializeInvoice = (i: Invoice) => ({ id: i.id, orderId: i.orderId, externalRef: i.externalRef, amountCents: i.amountCents, dueDate: i.dueDate, status: i.status, paidAt: iso(i.paidAt), createdAt: i.createdAt.toISOString() });

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export interface ErpApp {
  app: FastifyInstance;
  prisma: PrismaClient;
  chaos: ChaosState;
}

export async function buildErpApp(config: ErpConfig): Promise<ErpApp> {
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const app = Fastify(fastifyDefaults(config.logLevel));
  installErrorHandling(app, { validationCode: "ERP-VAL-001", notFoundCode: "ERP-NOTFOUND-001" });
  installLenientJson(app);
  const chaos: ChaosState = { mode: "none", delayMs: 0 };

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  app.get("/health", async () => ({ status: "ok" }));

  async function emitInvoicePaid(invoice: Invoice, orderId: string): Promise<void> {
    const event: InvoicePaidEvent = {
      id: randomUUID(),
      type: "invoice.paid",
      version: EVENT_VERSION,
      occurredAt: new Date().toISOString(),
      data: { invoiceId: invoice.id, orderId, externalRef: invoice.externalRef, amountCents: invoice.amountCents, paidAt: (invoice.paidAt ?? new Date()).toISOString() },
    };
    const delivery = await prisma.webhookDelivery.create({ data: { eventId: event.id, invoiceId: invoice.id, payload: event as unknown as Prisma.InputJsonValue } });
    await sendDelivery(delivery.id);
  }

  async function sendDelivery(deliveryId: string): Promise<void> {
    const delivery = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    const result = await sendSignedWebhook({ url: config.ponteWebhookUrl, secret: config.webhookSecret, eventId: delivery.eventId, body: delivery.payload });
    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: { status: result.ok ? "DELIVERED" : "FAILED", httpStatus: result.httpStatus, lastError: result.error, attempts: { increment: 1 } },
    });
  }

  async function payInvoice(id: string, paidAt?: string): Promise<Invoice> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new AppError("ERP-NOTFOUND-001", "Cobrança não encontrada.");
    if (invoice.status !== "ABERTA") throw new AppError("ERP-INVOICE-NOT-PAYABLE", `Cobrança está ${invoice.status}; só ABERTA pode ser paga.`);
    const paid = await prisma.invoice.update({ where: { id }, data: { status: "PAGA", paidAt: paidAt ? new Date(paidAt) : new Date() } });
    await emitInvoicePaid(paid, paid.orderId);
    return paid;
  }

  async function releaseInvoice(id: string): Promise<Invoice> {
    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) throw new AppError("ERP-NOTFOUND-001", "Cobrança não encontrada.");
    if (invoice.status !== "EM_CONFERENCIA") throw new AppError("ERP-INVOICE-NOT-RELEASABLE", `Cobrança está ${invoice.status}.`);
    return prisma.invoice.update({ where: { id }, data: { status: "ABERTA" } });
  }

  await app.register(
    async (api) => {
      // Administração (injeção de falha) vem antes do hook de indisponibilidade, para poder religar o ERP.
      api.register(async (admin) => {
        admin.addHook("onRequest", apiKeyGuard("x-api-key", config.apiKey, "ERP-AUTH-001"));
        admin.get("/admin/chaos", async () => chaos);
        admin.post("/admin/chaos", async (req) => {
          const body = chaosInput.parse(req.body);
          chaos.mode = body.mode;
          chaos.delayMs = body.delayMs ?? 0;
          return chaos;
        });
      });

      api.register(async (core) => {
        core.addHook("onRequest", apiKeyGuard("x-api-key", config.apiKey, "ERP-AUTH-001"));
        core.addHook("onRequest", async () => {
          if (chaos.mode === "down") throw new AppError("ERP-UNAVAILABLE", "ERP em manutenção (janela de backup).");
          if (chaos.mode === "slow" && chaos.delayMs > 0) await new Promise((r) => setTimeout(r, chaos.delayMs));
        });

        core.get<{ Querystring: { taxId?: string } }>("/customers", async (req) => {
          const taxId = req.query.taxId;
          const rows = await prisma.customer.findMany({ where: taxId ? { taxId } : {}, orderBy: { createdAt: "asc" } });
          return { data: rows.map(serializeCustomer) };
        });
        core.post("/customers", async (req, reply) => {
          const body = customerInput.parse(req.body);
          try {
            const row = await prisma.customer.create({ data: { taxId: body.taxId, name: body.name, phone: body.phone ?? null, email: body.email ?? null } });
            return reply.status(201).send(serializeCustomer(row));
          } catch (err) {
            if (!isUniqueViolation(err)) throw err;
            const existing = await prisma.customer.findUniqueOrThrow({ where: { taxId: body.taxId } });
            throw new AppError("ERP-CUSTOMER-EXISTS", "Já existe cliente com este CNPJ.", { existingId: existing.id });
          }
        });
        core.get<{ Params: { id: string } }>("/customers/:id", async (req) => {
          const row = await prisma.customer.findUnique({ where: { id: req.params.id } });
          if (!row) throw new AppError("ERP-NOTFOUND-001", "Cliente não encontrado.");
          return serializeCustomer(row);
        });
        core.patch<{ Params: { id: string } }>("/customers/:id", async (req) => {
          const body = customerPatch.parse(req.body);
          const row = await prisma.customer.findUnique({ where: { id: req.params.id } });
          if (!row) throw new AppError("ERP-NOTFOUND-001", "Cliente não encontrado.");
          const updated = await prisma.customer.update({ where: { id: row.id }, data: body });
          return serializeCustomer(updated);
        });

        core.get<{ Querystring: { externalRefPrefix?: string } }>("/orders", async (req) => {
          const prefix = req.query.externalRefPrefix;
          const rows = await prisma.order.findMany({ where: prefix ? { externalRef: { startsWith: prefix } } : {}, orderBy: { createdAt: "asc" } });
          return { data: rows.map(serializeOrder) };
        });
        core.post("/orders", async (req, reply) => {
          const body = orderInput.parse(req.body);
          const replay = async () => {
            const existing = await prisma.order.findUniqueOrThrow({ where: { externalRef: body.externalRef } });
            return reply.status(200).header("idempotent-replay", "true").send(serializeOrder(existing));
          };
          if (await prisma.order.findUnique({ where: { externalRef: body.externalRef } })) return replay();
          const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
          if (!customer) throw new AppError("ERP-NOTFOUND-001", "Cliente não encontrado.");
          try {
            const row = await prisma.order.create({ data: body });
            return reply.status(201).send(serializeOrder(row));
          } catch (err) {
            if (isUniqueViolation(err)) return replay();
            throw err;
          }
        });
        core.get<{ Params: { id: string } }>("/orders/:id", async (req) => {
          const row = await prisma.order.findUnique({ where: { id: req.params.id } });
          if (!row) throw new AppError("ERP-NOTFOUND-001", "Pedido não encontrado.");
          return serializeOrder(row);
        });

        core.get<{ Querystring: { externalRefPrefix?: string } }>("/invoices", async (req) => {
          const prefix = req.query.externalRefPrefix;
          const rows = await prisma.invoice.findMany({ where: prefix ? { externalRef: { startsWith: prefix } } : {}, orderBy: { createdAt: "asc" } });
          return { data: rows.map(serializeInvoice) };
        });
        core.post("/invoices", async (req, reply) => {
          const body = invoiceInput.parse(req.body);
          const replay = async () => {
            const existing = await prisma.invoice.findUniqueOrThrow({ where: { externalRef: body.externalRef } });
            return reply.status(200).header("idempotent-replay", "true").send(serializeInvoice(existing));
          };
          if (await prisma.invoice.findUnique({ where: { externalRef: body.externalRef } })) return replay();
          const order = await prisma.order.findUnique({ where: { id: body.orderId } });
          if (!order) throw new AppError("ERP-NOTFOUND-001", "Pedido não encontrado.");
          try {
            const row = await prisma.invoice.create({ data: body });
            return reply.status(201).send(serializeInvoice(row));
          } catch (err) {
            if (isUniqueViolation(err)) return replay();
            throw err;
          }
        });
        core.get<{ Params: { id: string } }>("/invoices/:id", async (req) => {
          const row = await prisma.invoice.findUnique({ where: { id: req.params.id } });
          if (!row) throw new AppError("ERP-NOTFOUND-001", "Cobrança não encontrada.");
          return serializeInvoice(row);
        });
        core.post<{ Params: { id: string } }>("/invoices/:id/release", async (req) => serializeInvoice(await releaseInvoice(req.params.id)));
        core.post<{ Params: { id: string } }>("/invoices/:id/pay", async (req) => {
          const body = z.object({ paidAt: z.string().datetime().optional() }).parse(req.body ?? {});
          return serializeInvoice(await payInvoice(req.params.id, body.paidAt));
        });

        core.get("/webhook-deliveries", async () => {
          const rows = await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
          return { data: rows.map((d) => ({ id: d.id, eventId: d.eventId, invoiceId: d.invoiceId, status: d.status, httpStatus: d.httpStatus, attempts: d.attempts, lastError: d.lastError, createdAt: d.createdAt.toISOString() })) };
        });
        core.post<{ Params: { id: string } }>("/webhook-deliveries/:id/resend", async (req) => {
          const found = await prisma.webhookDelivery.findUnique({ where: { id: req.params.id } });
          if (!found) throw new AppError("ERP-NOTFOUND-001", "Entrega não encontrada.");
          await sendDelivery(found.id);
          const d = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: found.id } });
          return { id: d.id, eventId: d.eventId, invoiceId: d.invoiceId, status: d.status, httpStatus: d.httpStatus, attempts: d.attempts, lastError: d.lastError, createdAt: d.createdAt.toISOString() };
        });
      });
    },
    { prefix: "/v1" },
  );

  registerUi(app, { prisma, chaos, payInvoice, releaseInvoice });

  return { app, prisma, chaos };
}
