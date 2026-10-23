import { randomUUID } from "node:crypto";
import { AppError } from "@ponte/shared";
import type { PrismaClient } from "../generated/client";
import { HANDLERS, type HandlerContext } from "../handlers";
import type { WorkerState } from "../alerts";
import { computeBackoffMs, type BackoffPolicy } from "./backoff";
import { JobQueue, type ClaimedJob } from "./queue";

export interface WorkerOptions {
  prisma: PrismaClient;
  queue: JobQueue;
  handlerContext: HandlerContext;
  backoff: BackoffPolicy;
  concurrency: number;
  pollIntervalMs: number;
  random?: () => number;
  log: { info: (obj: object, msg?: string) => void; error: (obj: object, msg?: string) => void };
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  // Exceção inesperada: tratada como temporária (a retentativa pode resolver; se não, vai à fila de falhas).
  const message = err instanceof Error ? err.message : String(err);
  return new AppError("PONTE-INT-001", `Erro interno inesperado: ${message}`);
}

export class Worker {
  readonly id = `worker-${randomUUID().slice(0, 8)}`;
  private running = false;
  private paused = false;
  private timer: NodeJS.Timeout | undefined;
  private lastTickAt: Date | null = null;
  private readonly inFlight = new Set<Promise<void>>();

  constructor(private readonly opts: WorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0);
  }

  /** Pausa a retirada de novos jobs (usado em testes e na demonstração do alerta de fila parada). */
  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  get isPaused(): boolean {
    return this.paused;
  }

  /** Estado exposto em /health e nos alertas (ADR-012). */
  get state(): WorkerState {
    return { running: this.running, paused: this.paused, lastTickAt: this.lastTickAt ? this.lastTickAt.toISOString() : null };
  }

  /** Espera os jobs em andamento terminarem (testes). */
  async drain(): Promise<void> {
    await Promise.allSettled([...this.inFlight]);
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    await Promise.allSettled([...this.inFlight]);
  }

  private schedule(ms: number): void {
    this.timer = setTimeout(() => void this.tick(), ms);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    this.lastTickAt = new Date();
    try {
      if (!this.paused) {
        const free = this.opts.concurrency - this.inFlight.size;
        const jobs = await this.opts.queue.claim(free, this.id);
        for (const job of jobs) {
          const p: Promise<void> = this.process(job)
            .catch((err) => this.opts.log.error({ err, jobId: job.id }, "falha ao registrar resultado do job"))
            .finally(() => this.inFlight.delete(p));
          this.inFlight.add(p);
        }
      }
    } catch (err) {
      this.opts.log.error({ err }, "falha no ciclo do worker");
    } finally {
      if (this.running) this.schedule(this.opts.pollIntervalMs);
    }
  }

  async process(job: ClaimedJob): Promise<void> {
    const { prisma, queue } = this.opts;
    const startedAt = new Date();
    const event = await prisma.event.findUniqueOrThrow({ where: { id: job.eventId } });
    const attemptNumber = (await prisma.attempt.count({ where: { eventId: event.id } })) + 1;

    await prisma.event.update({ where: { id: event.id }, data: { status: "PROCESSING", attempts: attemptNumber, nextRunAt: null } });

    // Job preso que foi retomado além do limite de tentativas.
    if (job.attempts > job.maxAttempts) {
      await this.fail(job, event.id, attemptNumber, startedAt, new AppError("PONTE-INT-001", "O job excedeu o limite de tentativas (worker interrompido durante o processamento)."));
      return;
    }

    try {
      const handler = HANDLERS[event.type];
      if (!handler) throw new AppError("PONTE-REQ-002", `Sem tratador para o tipo de evento ${event.type}.`);
      const result = await handler(this.opts.handlerContext, event);
      const finishedAt = new Date();
      const durationMs = finishedAt.getTime() - startedAt.getTime();

      if (result.kind === "ignored") {
        await prisma.attempt.create({ data: { eventId: event.id, number: attemptNumber, outcome: "IGNORED", errorCode: result.code, errorMessage: result.reason, startedAt, durationMs } });
        await prisma.event.update({
          where: { id: event.id },
          data: { status: "IGNORED", ignoreReason: `${result.code}: ${result.reason}`, processedAt: finishedAt, durationMs: finishedAt.getTime() - event.receivedAt.getTime(), lastErrorCode: null, lastErrorMessage: null, nextRunAt: null },
        });
      } else {
        await prisma.attempt.create({ data: { eventId: event.id, number: attemptNumber, outcome: "OK", startedAt, durationMs } });
        await prisma.event.update({
          where: { id: event.id },
          data: { status: "PROCESSED", processedAt: finishedAt, durationMs: finishedAt.getTime() - event.receivedAt.getTime(), lastErrorCode: null, lastErrorMessage: null, nextRunAt: null },
        });
      }
      await queue.complete(job.id);
      this.opts.log.info({ eventId: event.id, type: event.type, outcome: result.kind, attempt: attemptNumber }, "evento concluído");
    } catch (err) {
      await this.fail(job, event.id, attemptNumber, startedAt, toAppError(err));
    }
  }

  private async fail(job: ClaimedJob, eventId: string, attemptNumber: number, startedAt: Date, error: AppError): Promise<void> {
    const { prisma, queue, backoff } = this.opts;
    const durationMs = Date.now() - startedAt.getTime();
    const canRetry = error.retryable && job.attempts < job.maxAttempts;

    if (canRetry) {
      const delayMs = computeBackoffMs(job.attempts, backoff, this.opts.random);
      const nextRunAt = await queue.scheduleRetry(job.id, delayMs);
      await prisma.attempt.create({ data: { eventId, number: attemptNumber, outcome: "RETRYABLE_ERROR", errorCode: error.code, errorMessage: error.message, startedAt, durationMs, nextRunAt } });
      await prisma.event.update({ where: { id: eventId }, data: { status: "RETRYING", lastErrorCode: error.code, lastErrorMessage: error.message, nextRunAt } });
      this.opts.log.info({ eventId, code: error.code, attempt: attemptNumber, retryInMs: delayMs }, "falha temporária; nova tentativa agendada");
      return;
    }

    const exhausted = error.retryable;
    const message = exhausted ? `Tentativas esgotadas (${job.maxAttempts}). Último erro: ${error.message}` : error.message;
    await queue.markDead(job.id);
    await prisma.attempt.create({ data: { eventId, number: attemptNumber, outcome: exhausted ? "RETRYABLE_ERROR" : "PERMANENT_ERROR", errorCode: error.code, errorMessage: message, startedAt, durationMs } });
    await prisma.event.update({ where: { id: eventId }, data: { status: "DEAD", lastErrorCode: error.code, lastErrorMessage: message, nextRunAt: null } });
    this.opts.log.error({ eventId, code: error.code, attempt: attemptNumber, exhausted }, "evento enviado para a fila de falhas");
  }
}
