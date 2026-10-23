import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Stack } from "../helpers/stack";

let stack: Stack;

beforeAll(async () => {
  stack = await Stack.start({ ponte: { worker: { enabled: false } } });
});
afterAll(async () => {
  await stack?.close();
});
beforeEach(async () => {
  await stack.reset();
  stack.ponte.worker.pause();
});

async function seedJobs(count: number, runAt = new Date()): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const event = await stack.ponte.prisma.event.create({ data: { source: "CRM", type: "deal.won", idempotencyKey: randomUUID(), payload: {}, entityId: randomUUID() } });
    const job = await stack.ponte.prisma.job.create({ data: { eventId: event.id, maxAttempts: 5, runAt } });
    ids.push(job.id);
  }
  return ids;
}

describe("ADR-002: fila em PostgreSQL com SKIP LOCKED", () => {
  it("claims simultâneos de vários workers nunca entregam o mesmo job a dois deles", async () => {
    const seeded = await seedJobs(60);
    const claims = await Promise.all(Array.from({ length: 6 }, (_, i) => stack.ponte.queue.claim(20, `worker-${i}`)));
    const claimed = claims.flat().map((j) => j.id);

    expect(claimed).toHaveLength(60); // nada ficou para trás
    expect(new Set(claimed).size).toBe(60); // nada foi entregue duas vezes
    expect(new Set(claimed)).toEqual(new Set(seeded));
    expect(claims.flat().every((j) => j.attempts === 1)).toBe(true);
    expect(await stack.ponte.prisma.job.count({ where: { state: "RUNNING" } })).toBe(60);
  });

  it("job agendado para o futuro não é entregue", async () => {
    await seedJobs(3, new Date(Date.now() + 60_000));
    expect(await stack.ponte.queue.claim(10, "w")).toHaveLength(0);
  });

  it("respeita o limite pedido e entrega o mais antigo primeiro", async () => {
    const old = await seedJobs(1, new Date(Date.now() - 60_000));
    await seedJobs(5);
    const first = await stack.ponte.queue.claim(1, "w");
    expect(first.map((j) => j.id)).toEqual(old);
  });

  it("job RUNNING só é retomado depois que o bloqueio expira", async () => {
    const [id] = await seedJobs(1);
    expect(await stack.ponte.queue.claim(1, "morreu")).toHaveLength(1);
    expect(await stack.ponte.queue.claim(1, "outro")).toHaveLength(0); // bloqueio recente
    await stack.ponte.prisma.job.update({ where: { id: id! }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
    const [again] = await stack.ponte.queue.claim(1, "outro");
    expect(again).toMatchObject({ id, attempts: 2 });
  });

  it("agendar retentativa usa o relógio do banco e devolve o job a PENDING", async () => {
    const [id] = await seedJobs(1);
    await stack.ponte.queue.claim(1, "w");
    const before = Date.now();
    const runAt = await stack.ponte.queue.scheduleRetry(id!, 5000);
    expect(runAt.getTime() - before).toBeGreaterThan(4000);
    expect(runAt.getTime() - before).toBeLessThan(6500);
    expect(await stack.ponte.prisma.job.findUniqueOrThrow({ where: { id: id! } })).toMatchObject({ state: "PENDING", lockedAt: null });
    expect(await stack.ponte.queue.claim(1, "w")).toHaveLength(0); // ainda não venceu
  });
});
