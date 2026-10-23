import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError, ERROR_CATALOG, apiKeyGuard } from "@ponte/shared";
import type { Attempt, Divergence, Event, MappingConfig, Prisma, PrismaClient, ReconciliationRun } from "../generated/client";
import type { PonteConfig } from "../config";
import { applyMapping, validateMappingRules, type MappingRule } from "../mapping/engine";
import { DEFAULT_MAPPING_RULES } from "../mapping/defaults";
import type { JobQueue } from "../queue/queue";
import type { Reconciler } from "../reconciliation/reconciler";

interface Deps {
  prisma: PrismaClient;
  config: PonteConfig;
  queue: JobQueue;
  reconciler: Reconciler;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function serializeEvent(e: Event) {
  return {
    id: e.id,
    source: e.source,
    type: e.type,
    entityId: e.entityId,
    status: e.status,
    attempts: e.attempts,
    duplicateCount: e.duplicateCount,
    receivedAt: e.receivedAt.toISOString(),
    processedAt: iso(e.processedAt),
    durationMs: e.durationMs,
    lastErrorCode: e.lastErrorCode,
    lastErrorMessage: e.lastErrorMessage,
    ignoreReason: e.ignoreReason,
    nextRunAt: iso(e.nextRunAt),
  };
}

function serializeAttempt(a: Attempt) {
  return { number: a.number, outcome: a.outcome, errorCode: a.errorCode, errorMessage: a.errorMessage, startedAt: a.startedAt.toISOString(), durationMs: a.durationMs, nextRunAt: iso(a.nextRunAt) };
}

export const serializeMapping = (m: MappingConfig) => ({ version: m.version, active: m.active, note: m.note, rules: m.rules, createdAt: m.createdAt.toISOString() });

export const serializeDivergence = (d: Divergence) => ({
  id: d.id,
  key: d.key,
  type: d.type,
  crmDealId: d.crmDealId,
  status: d.status,
  detail: d.detail,
  firstSeenAt: d.firstSeenAt.toISOString(),
  lastSeenAt: d.lastSeenAt.toISOString(),
  resolvedAt: iso(d.resolvedAt),
});

export const serializeRun = (r: ReconciliationRun) => ({
  id: r.id,
  trigger: r.trigger,
  startedAt: r.startedAt.toISOString(),
  finishedAt: iso(r.finishedAt),
  dealsChecked: r.dealsChecked,
  divergencesOpen: r.divergencesOpen,
  divergencesResolved: r.divergencesResolved,
});

/** Garante que existe uma versão ativa do mapeamento (semente v1). */
export async function ensureDefaultMapping(prisma: PrismaClient): Promise<void> {
  // createMany + skipDuplicates: duas instâncias subindo juntas não colidem na versão 1.
  if ((await prisma.mappingConfig.count()) === 0) {
    await prisma.mappingConfig.createMany({ data: [{ version: 1, active: true, rules: DEFAULT_MAPPING_RULES as unknown as Prisma.InputJsonValue, note: "Versão inicial (semente)." }], skipDuplicates: true });
  }
}

export async function loadActiveRules(prisma: PrismaClient): Promise<MappingRule[]> {
  const active = await prisma.mappingConfig.findFirst({ where: { active: true }, orderBy: { version: "desc" } });
  return validateMappingRules(active?.rules ?? DEFAULT_MAPPING_RULES);
}

const EVENT_STATUSES = ["RECEIVED", "PROCESSING", "RETRYING", "PROCESSED", "IGNORED", "DEAD"] as const;

export async function registerAdminRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  const { prisma, config, queue, reconciler } = deps;

  await app.register(
    async (admin) => {
      admin.addHook("onRequest", apiKeyGuard("x-admin-key", config.adminKey, "PONTE-ADM-003"));

      admin.get<{ Querystring: { status?: string; limit?: string; offset?: string } }>("/events", async (req) => {
        const q = z
          .object({ status: z.enum(EVENT_STATUSES).optional(), limit: z.coerce.number().int().min(1).max(200).default(50), offset: z.coerce.number().int().min(0).default(0) })
          .parse(req.query);
        const where = q.status ? { status: q.status } : {};
        const [rows, total] = await Promise.all([prisma.event.findMany({ where, orderBy: { receivedAt: "desc" }, take: q.limit, skip: q.offset }), prisma.event.count({ where })]);
        return { data: rows.map(serializeEvent), total };
      });

      admin.get<{ Params: { id: string } }>("/events/:id", async (req) => {
        const e = await prisma.event.findUnique({ where: { id: req.params.id }, include: { attemptLog: { orderBy: { number: "asc" } } } });
        if (!e) throw new AppError("PONTE-ADM-002", "Evento não encontrado.");
        return { ...serializeEvent(e), idempotencyKey: e.idempotencyKey, entityVersion: e.entityVersion, payload: e.payload, attemptLog: e.attemptLog.map(serializeAttempt) };
      });

      admin.post<{ Params: { id: string } }>("/events/:id/reprocess", async (req, reply) => {
        const e = await prisma.event.findUnique({ where: { id: req.params.id }, include: { job: true } });
        if (!e) throw new AppError("PONTE-ADM-002", "Evento não encontrado.");
        if (e.status !== "DEAD" || !e.job) throw new AppError("PONTE-ADM-001", `O evento está ${e.status}; só eventos em DEAD podem ser reprocessados.`, { status: e.status });
        await prisma.event.update({ where: { id: e.id }, data: { status: "RECEIVED", lastErrorCode: null, lastErrorMessage: null, nextRunAt: null } });
        await queue.requeue(e.job.id);
        return reply.status(202).send({ status: "requeued", eventId: e.id });
      });

      admin.get("/metrics", async () => {
        const [byStatus, dupAgg, durAgg, openDivergences, last] = await Promise.all([
          prisma.event.groupBy({ by: ["status"], _count: { _all: true } }),
          prisma.event.aggregate({ _sum: { duplicateCount: true } }),
          prisma.event.aggregate({ where: { status: "PROCESSED", durationMs: { not: null } }, _avg: { durationMs: true }, _max: { durationMs: true } }),
          prisma.divergence.count({ where: { status: "OPEN" } }),
          prisma.event.aggregate({ _max: { receivedAt: true } }),
        ]);
        const countsByStatus: Record<string, number> = Object.fromEntries(EVENT_STATUSES.map((s) => [s, 0]));
        for (const row of byStatus) countsByStatus[row.status] = row._count._all;
        return {
          countsByStatus,
          duplicatesIgnored: dupAgg._sum.duplicateCount ?? 0,
          avgDurationMs: durAgg._avg.durationMs === null ? null : Math.round(durAgg._avg.durationMs),
          maxDurationMs: durAgg._max.durationMs,
          openDivergences,
          lastEventAt: iso(last._max.receivedAt),
        };
      });

      admin.get("/mapping", async () => {
        const all = await prisma.mappingConfig.findMany({ orderBy: { version: "desc" } });
        const active = all.find((m) => m.active) ?? all[0];
        if (!active) throw new AppError("PONTE-MAP-001", "Nenhum mapeamento cadastrado.");
        return { active: serializeMapping(active), history: all.map(serializeMapping) };
      });

      admin.put("/mapping", async (req, reply) => {
        const body = z.object({ rules: z.unknown(), note: z.string().optional() }).parse(req.body);
        const rules = validateMappingRules(body.rules);
        // Prova de fumaça: a nova versão precisa conseguir mapear um evento de exemplo válido.
        try {
          applyMapping(rules, SAMPLE_DATA, { defaultPaymentTermDays: config.defaultPaymentTermDays });
        } catch (err) {
          if (!(err instanceof AppError)) throw err;
          throw new AppError("PONTE-MAP-001", `O mapeamento não consegue mapear o evento de exemplo: ${err.message}`, { cause: err.code });
        }
        const created = await prisma.$transaction(async (tx) => {
          const max = await tx.mappingConfig.aggregate({ _max: { version: true } });
          await tx.mappingConfig.updateMany({ where: { active: true }, data: { active: false } });
          return tx.mappingConfig.create({ data: { version: (max._max.version ?? 0) + 1, active: true, rules: rules as unknown as Prisma.InputJsonValue, note: body.note ?? null } });
        });
        return reply.status(201).send(serializeMapping(created));
      });

      admin.post("/reconciliation/run", async () => serializeRun(await reconciler.run("MANUAL")));

      admin.get<{ Querystring: { status?: string } }>("/divergences", async (req) => {
        const { status } = z.object({ status: z.enum(["OPEN", "RESOLVED"]).optional() }).parse(req.query);
        const rows = await prisma.divergence.findMany({ where: status ? { status } : {}, orderBy: { lastSeenAt: "desc" } });
        return { data: rows.map(serializeDivergence) };
      });
      admin.post<{ Params: { id: string } }>("/divergences/:id/resolve", async (req) => serializeDivergence(await reconciler.resolve(req.params.id)));

      admin.get("/errors", async () => ({
        data: ERROR_CATALOG.map((e) => ({ code: e.code, httpStatus: e.httpStatus, retryable: e.retryable, title: e.title, cause: e.cause, action: e.action })),
      }));
    },
    { prefix: "/v1/admin" },
  );
}

/** Evento de exemplo usado só para validar uma nova versão de mapeamento. */
const SAMPLE_DATA = {
  deal: { id: "00000000-0000-4000-8000-000000000001", title: "Exemplo", value: "1.000,00", paymentTermDays: 30, wonAt: "2026-01-15T12:00:00.000Z", version: 1 },
  customer: { id: "00000000-0000-4000-8000-000000000002", name: "Cliente Exemplo", cnpj: "11.222.333/0001-81", phone: "(31) 99999-0000", email: "exemplo@exemplo.example" },
};
