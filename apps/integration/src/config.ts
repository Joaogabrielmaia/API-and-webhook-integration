import { envInt, requireEnv } from "@ponte/shared";

export const PONTE_VERSION = "1.1.0";

export interface PonteConfig {
  databaseUrl: string;
  crmUrl: string;
  erpUrl: string;
  crmApiKey: string;
  erpApiKey: string;
  crmWebhookSecret: string;
  erpWebhookSecret: string;
  adminKey: string;
  retry: { maxAttempts: number; baseMs: number; capMs: number; jitterRatio: number };
  /** RN-06: valor a partir do qual a cobrança nasce em conferência. */
  conferenceThresholdCents: number;
  defaultPaymentTermDays: number;
  recon: { intervalSeconds: number; graceSeconds: number };
  worker: { enabled: boolean; concurrency: number; pollIntervalMs: number; lockTimeoutMs: number };
  /** ADR-012: espera máxima de trabalho vencido antes de alertar (padrão 300 s, o limite de 5 minutos do RNF-01). */
  alerts: { stallSeconds: number };
  /** Timeout de chamadas ao CRM e ao ERP (10 s, reunião 3). */
  httpTimeoutMs: number;
  logLevel?: string;
  /** Injetável nos testes. */
  random?: () => number;
}

export function configFromEnv(): PonteConfig {
  return {
    databaseUrl: requireEnv("PONTE_DATABASE_URL"),
    crmUrl: process.env.CRM_URL ?? "http://localhost:4001",
    erpUrl: process.env.ERP_URL ?? "http://localhost:4002",
    crmApiKey: requireEnv("CRM_API_KEY"),
    erpApiKey: requireEnv("ERP_API_KEY"),
    crmWebhookSecret: requireEnv("CRM_WEBHOOK_SECRET"),
    erpWebhookSecret: requireEnv("ERP_WEBHOOK_SECRET"),
    adminKey: requireEnv("PONTE_ADMIN_KEY"),
    retry: {
      maxAttempts: envInt("RETRY_MAX_ATTEMPTS", 12),
      baseMs: envInt("RETRY_BASE_MS", 30_000),
      capMs: envInt("RETRY_CAP_MS", 1_800_000),
      jitterRatio: 0.2,
    },
    conferenceThresholdCents: envInt("CONFERENCE_THRESHOLD_CENTS", 5_000_000),
    defaultPaymentTermDays: 30,
    recon: { intervalSeconds: envInt("RECON_INTERVAL_SECONDS", 900), graceSeconds: envInt("RECON_GRACE_SECONDS", 120) },
    worker: { enabled: true, concurrency: envInt("WORKER_CONCURRENCY", 4), pollIntervalMs: envInt("WORKER_POLL_MS", 250), lockTimeoutMs: 120_000 },
    alerts: { stallSeconds: envInt("QUEUE_STALL_SECONDS", 300) },
    httpTimeoutMs: envInt("HTTP_TIMEOUT_MS", 10_000),
    logLevel: process.env.LOG_LEVEL,
  };
}
