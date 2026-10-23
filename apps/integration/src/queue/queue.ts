import { Prisma, type PrismaClient } from "../generated/client";

export interface ClaimedJob {
  id: string;
  eventId: string;
  attempts: number;
  maxAttempts: number;
}

/**
 * Fila em PostgreSQL (ADR-002). Um job por evento.
 * O claim usa `FOR UPDATE SKIP LOCKED`: vários workers não pegam o mesmo job.
 * Um job `RUNNING` cujo bloqueio expirou (worker caiu) é retomado.
 */
export class JobQueue {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly lockTimeoutMs: number,
  ) {}

  async claim(limit: number, workerId: string): Promise<ClaimedJob[]> {
    if (limit <= 0) return [];
    return this.prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
      UPDATE "Job"
      SET state = 'RUNNING', "lockedAt" = now(), "lockedBy" = ${workerId}, attempts = attempts + 1, "updatedAt" = now()
      WHERE id IN (
        SELECT id FROM "Job"
        WHERE (state = 'PENDING' AND "runAt" <= now())
           OR (state = 'RUNNING' AND "lockedAt" < now() - (${this.lockTimeoutMs}::double precision * interval '1 millisecond'))
        ORDER BY "runAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING id, "eventId", attempts, "maxAttempts"
    `);
  }

  async complete(jobId: string): Promise<void> {
    await this.prisma.job.update({ where: { id: jobId }, data: { state: "DONE", lockedAt: null, lockedBy: null } });
  }

  /** Agenda nova tentativa; devolve a data calculada pelo relógio do banco. */
  async scheduleRetry(jobId: string, delayMs: number): Promise<Date> {
    const rows = await this.prisma.$queryRaw<{ runAt: Date }[]>(Prisma.sql`
      UPDATE "Job"
      SET state = 'PENDING', "runAt" = now() + (${delayMs}::double precision * interval '1 millisecond'), "lockedAt" = NULL, "lockedBy" = NULL, "updatedAt" = now()
      WHERE id = ${jobId}
      RETURNING "runAt"
    `);
    return rows[0]!.runAt;
  }

  async markDead(jobId: string): Promise<void> {
    await this.prisma.job.update({ where: { id: jobId }, data: { state: "DEAD", lockedAt: null, lockedBy: null } });
  }

  /** Reprocessamento manual (RN-10): volta para PENDING com as tentativas zeradas. */
  async requeue(jobId: string): Promise<void> {
    await this.prisma.job.update({ where: { id: jobId }, data: { state: "PENDING", attempts: 0, runAt: new Date(), lockedAt: null, lockedBy: null } });
  }
}
