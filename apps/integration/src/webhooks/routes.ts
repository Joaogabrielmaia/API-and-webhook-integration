import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeAny, z } from "zod";
import { AppError, EVENT_VERSION, dealWonEventSchema, invoicePaidEventSchema, verifySignature } from "@ponte/shared";
import { Prisma, type PrismaClient } from "../generated/client";
import type { PonteConfig } from "../config";

interface Deps {
  prisma: PrismaClient;
  config: PonteConfig;
}

interface SourceSpec<S extends ZodTypeAny> {
  path: string;
  source: "CRM" | "ERP";
  secret: string;
  schema: S;
  entity: (event: z.infer<S>) => { entityId: string; entityVersion: number | null };
}

function isIdempotencyViolation(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  return Array.isArray(target) ? target.includes("idempotencyKey") : String(target ?? "").includes("idempotencyKey");
}

/**
 * Webhooks assinados (ADR-009). Ordem das verificações:
 *  1) assinatura sobre o corpo bruto  2) formato  3) versão do evento  4) idempotência (RF-03).
 * O evento e o job são gravados na mesma transação antes do 202 (RNF-02).
 */
export async function registerWebhookRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { prisma, config } = deps;

  await app.register(
    async (hooks) => {
      // Mantém o corpo bruto: a assinatura é calculada sobre os bytes recebidos, não sobre o JSON reserializado.
      hooks.removeContentTypeParser("application/json");
      hooks.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => done(null, body));

      const handle =
        <S extends ZodTypeAny>(spec: SourceSpec<S>) =>
        async (req: FastifyRequest, reply: import("fastify").FastifyReply) => {
          const raw = req.body;
          if (!Buffer.isBuffer(raw)) throw new AppError("PONTE-REQ-001", "O corpo deve ser JSON (content-type application/json).");

          const check = verifySignature({
            secret: spec.secret,
            timestamp: req.headers["x-timestamp"] as string | undefined,
            signature: req.headers["x-signature"] as string | undefined,
            rawBody: raw,
          });
          if (check === "invalid_signature") throw new AppError("PONTE-AUTH-001", "Assinatura inválida.");
          if (check === "timestamp_out_of_window") throw new AppError("PONTE-AUTH-002", "Timestamp fora da janela de 5 minutos.");

          let json: unknown;
          try {
            json = JSON.parse(raw.toString("utf8"));
          } catch {
            throw new AppError("PONTE-REQ-001", "JSON inválido.");
          }

          const declared = (json as { version?: unknown } | null)?.version;
          if (typeof declared === "string" && declared !== EVENT_VERSION) {
            throw new AppError("PONTE-REQ-002", `Versão de evento não suportada: ${declared} (suportada: ${EVENT_VERSION}).`, { received: declared, supported: EVENT_VERSION });
          }

          const parsed = spec.schema.safeParse(json);
          if (!parsed.success) {
            throw new AppError("PONTE-REQ-001", "Evento fora do contrato.", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
          }
          const event = parsed.data as { id: string; type: string };
          if (req.headers["x-event-id"] !== event.id) throw new AppError("PONTE-REQ-001", "X-Event-Id deve ser igual ao id do evento.");

          const { entityId, entityVersion } = spec.entity(parsed.data);
          try {
            const created = await prisma.$transaction(async (tx) => {
              const row = await tx.event.create({
                data: { source: spec.source, type: event.type, idempotencyKey: event.id, entityId, entityVersion, payload: json as Prisma.InputJsonValue, correlationId: req.id },
              });
              await tx.job.create({ data: { eventId: row.id, maxAttempts: config.retry.maxAttempts } });
              return row;
            });
            return reply.status(202).send({ status: "accepted", eventId: created.id });
          } catch (err) {
            if (!isIdempotencyViolation(err)) throw err;
            const original = await prisma.event.update({ where: { idempotencyKey: event.id }, data: { duplicateCount: { increment: 1 } } });
            req.log.info({ eventId: original.id }, "evento duplicado ignorado");
            return reply.status(200).send({ status: "duplicate", eventId: original.id });
          }
        };

      hooks.post(
        "/webhooks/crm",
        handle({
          path: "/webhooks/crm",
          source: "CRM",
          secret: config.crmWebhookSecret,
          schema: dealWonEventSchema,
          entity: (e) => ({ entityId: e.data.deal.id, entityVersion: e.data.deal.version }),
        }),
      );
      hooks.post(
        "/webhooks/erp",
        handle({
          path: "/webhooks/erp",
          source: "ERP",
          secret: config.erpWebhookSecret,
          schema: invoicePaidEventSchema,
          entity: (e) => ({ entityId: e.data.invoiceId, entityVersion: null }),
        }),
      );
    },
    { prefix: "/v1" },
  );
}
