import Fastify, { type FastifyInstance } from "fastify";
import { fastifyDefaults, installErrorHandling, installLenientJson } from "@ponte/shared";
import { CrmClient } from "./clients/crm-client";
import { ErpClient } from "./clients/erp-client";
import { PONTE_VERSION, type PonteConfig } from "./config";
import { PrismaClient } from "./generated/client";
import type { HandlerContext } from "./handlers";
import { JobQueue } from "./queue/queue";
import { Worker } from "./queue/worker";
import { Reconciler } from "./reconciliation/reconciler";
import { ensureDefaultMapping, loadActiveRules, registerAdminRoutes } from "./routes/admin";
import { registerWebhookRoutes } from "./webhooks/routes";

export interface PonteApp {
  app: FastifyInstance;
  prisma: PrismaClient;
  worker: Worker;
  queue: JobQueue;
  reconciler: Reconciler;
  config: PonteConfig;
}

export async function buildPonteApp(config: PonteConfig): Promise<PonteApp> {
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const app = Fastify(fastifyDefaults(config.logLevel));
  installErrorHandling(app, { validationCode: "PONTE-REQ-001", notFoundCode: "PONTE-ADM-002" });
  installLenientJson(app);

  await ensureDefaultMapping(prisma);

  const erp = new ErpClient({ baseUrl: config.erpUrl, apiKey: config.erpApiKey, timeoutMs: config.httpTimeoutMs });
  const crm = new CrmClient({ baseUrl: config.crmUrl, apiKey: config.crmApiKey, timeoutMs: config.httpTimeoutMs });
  const queue = new JobQueue(prisma, config.worker.lockTimeoutMs);
  const reconciler = new Reconciler({ prisma, crm, erp, graceSeconds: config.recon.graceSeconds });

  const handlerContext: HandlerContext = {
    prisma,
    erp,
    crm,
    config,
    getMappingRules: () => loadActiveRules(prisma),
    log: { info: (obj, msg) => app.log.info(obj, msg), warn: (obj, msg) => app.log.warn(obj, msg) },
  };

  const worker = new Worker({
    prisma,
    queue,
    handlerContext,
    backoff: { baseMs: config.retry.baseMs, capMs: config.retry.capMs, jitterRatio: config.retry.jitterRatio },
    concurrency: config.worker.concurrency,
    pollIntervalMs: config.worker.pollIntervalMs,
    random: config.random,
    log: { info: (obj, msg) => app.log.info(obj, msg), error: (obj, msg) => app.log.error(obj, msg) },
  });

  app.get("/health", async () => ({ status: "ok", version: PONTE_VERSION, worker: worker.state }));
  await registerWebhookRoutes(app, { prisma, config });
  await registerAdminRoutes(app, { prisma, config, queue, reconciler, worker });

  let scheduler: NodeJS.Timeout | undefined;
  app.addHook("onReady", async () => {
    if (config.worker.enabled) worker.start();
    if (config.recon.intervalSeconds > 0) {
      scheduler = setInterval(() => {
        reconciler.run("SCHEDULED").catch((err) => app.log.warn({ err: String(err) }, "reconciliação agendada falhou"));
      }, config.recon.intervalSeconds * 1000);
      scheduler.unref();
    }
  });
  app.addHook("onClose", async () => {
    if (scheduler) clearInterval(scheduler);
    await worker.stop();
    await prisma.$disconnect();
  });

  return { app, prisma, worker, queue, reconciler, config };
}
