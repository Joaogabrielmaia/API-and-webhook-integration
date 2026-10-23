import { Prisma, type PrismaClient } from "./generated/client";

export type AlertCode = "QUEUE_STALLED" | "DEAD_LETTERS_PRESENT";
export type AlertSeverity = "warning" | "critical";

export interface Alert {
  code: AlertCode;
  severity: AlertSeverity;
  message: string;
  /** Desde quando a condição existe (ISO), quando se sabe. */
  since: string | null;
  details: Record<string, unknown>;
}

export interface WorkerState {
  running: boolean;
  paused: boolean;
  lastTickAt: string | null;
}

export interface AlertInput {
  now: Date;
  /** Idade, em segundos, do trabalho vencido mais antigo; null se não há trabalho vencido. */
  oldestDueAgeSeconds: number | null;
  deadLetterCount: number;
  oldestDeadAt: Date | null;
  worker: WorkerState;
}

export interface AlertThresholds {
  /** Limite de espera antes de alertar (ADR-012: vem do RNF-01, 5 minutos). */
  stallSeconds: number;
}

/** `critical` a partir de 3× o limite. */
export const CRITICAL_FACTOR = 3;

const minutes = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  return m >= 1 ? `${m} min` : `${Math.round(seconds)} s`;
};

function workerHint(worker: WorkerState): string {
  if (worker.paused) return "O worker está pausado.";
  if (!worker.running) return "O worker não está em execução.";
  return "O worker está ativo; verifique se o ERP ou o CRM estão respondendo.";
}

/**
 * Função pura (ADR-012): decide os alertas a partir do estado. Trabalho em retentativa agendada para o futuro
 * não entra em `oldestDueAgeSeconds`, porque está esperando o backoff, que é o comportamento correto.
 */
export function evaluateAlerts(input: AlertInput, thresholds: AlertThresholds): Alert[] {
  const alerts: Alert[] = [];
  const age = input.oldestDueAgeSeconds;

  if (age !== null && age >= thresholds.stallSeconds) {
    alerts.push({
      code: "QUEUE_STALLED",
      severity: age >= thresholds.stallSeconds * CRITICAL_FACTOR ? "critical" : "warning",
      message: `Há trabalho esperando há ${minutes(age)} sem ser processado (limite: ${minutes(thresholds.stallSeconds)}). ${workerHint(input.worker)}`,
      since: new Date(input.now.getTime() - age * 1000).toISOString(),
      details: { oldestDueAgeSeconds: Math.round(age), limitSeconds: thresholds.stallSeconds, worker: input.worker },
    });
  }

  if (input.deadLetterCount > 0) {
    alerts.push({
      code: "DEAD_LETTERS_PRESENT",
      severity: "warning",
      message: `${input.deadLetterCount} evento(s) na fila de falhas aguardando decisão.`,
      since: input.oldestDeadAt ? input.oldestDeadAt.toISOString() : null,
      details: { count: input.deadLetterCount },
    });
  }
  return alerts;
}

/**
 * Idade, em segundos e pelo relógio do banco, do trabalho vencido mais antigo:
 * job PENDING com `runAt` no passado, ou job RUNNING cujo bloqueio expirou (worker caiu).
 */
export async function oldestDueAgeSeconds(prisma: PrismaClient, lockTimeoutMs: number): Promise<number | null> {
  const rows = await prisma.$queryRaw<{ age: number | null }[]>(Prisma.sql`
    SELECT EXTRACT(EPOCH FROM (now() - MIN(t)))::float8 AS age FROM (
      SELECT "runAt" AS t FROM "Job" WHERE state = 'PENDING' AND "runAt" <= now()
      UNION ALL
      SELECT "lockedAt" + (${lockTimeoutMs}::double precision * interval '1 millisecond') AS t
      FROM "Job" WHERE state = 'RUNNING' AND "lockedAt" < now() - (${lockTimeoutMs}::double precision * interval '1 millisecond')
    ) due
  `);
  const age = rows[0]?.age;
  return age === null || age === undefined ? null : Math.max(0, age);
}

export async function collectAlertInput(prisma: PrismaClient, lockTimeoutMs: number, worker: WorkerState): Promise<AlertInput> {
  const [age, deadLetters] = await Promise.all([
    oldestDueAgeSeconds(prisma, lockTimeoutMs),
    prisma.event.aggregate({ where: { status: "DEAD" }, _count: { _all: true }, _min: { receivedAt: true } }),
  ]);
  return { now: new Date(), oldestDueAgeSeconds: age, deadLetterCount: deadLetters._count._all, oldestDeadAt: deadLetters._min.receivedAt, worker };
}
