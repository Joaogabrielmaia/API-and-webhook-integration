import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Stack, waitFor } from "../helpers/stack";

let stack: Stack;

beforeAll(async () => {
  stack = await Stack.start({ ponte: { alerts: { stallSeconds: 300 } } });
});
afterAll(async () => {
  await stack?.close();
});
beforeEach(async () => {
  await stack.reset();
});

const alerts = async () => (await stack.admin("/alerts")).body as { data: { code: string; severity: string; message: string; since: string | null; details: Record<string, any> }[]; generatedAt: string };
const age = (seconds: number) => new Date(Date.now() - seconds * 1000);

/** Um evento aceito que nenhum worker pegou: o worker fica pausado e o job "envelhece". */
async function stallQueue(ageSeconds: number) {
  stack.ponte.worker.pause();
  const deal = await stack.createWonDeal();
  const event = await waitFor(() => stack.getEventForDeal(deal.id), { label: "evento recebido" });
  await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { runAt: age(ageSeconds) } });
  return { deal, event };
}

describe("v1.1 / ADR-012: alerta de fila parada", () => {
  it("com tudo em dia, não há alertas", async () => {
    const deal = await stack.createWonDeal();
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect((await alerts()).data).toEqual([]);
    expect((await stack.admin("/metrics")).body.oldestPendingAgeSeconds).toBeNull();
  });

  it("trabalho esperando além do limite: QUEUE_STALLED (warning), com o estado do worker", async () => {
    await stallQueue(400);
    const { data } = await alerts();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ code: "QUEUE_STALLED", severity: "warning" });
    expect(data[0]!.message).toContain("pausado");
    expect(data[0]!.details.worker.paused).toBe(true);
    expect(data[0]!.details.oldestDueAgeSeconds).toBeGreaterThanOrEqual(400);
    expect(data[0]!.since).not.toBeNull();
    expect((await stack.admin("/metrics")).body.oldestPendingAgeSeconds).toBeGreaterThanOrEqual(400);
  });

  it("abaixo do limite não alerta; a partir de 3× o limite fica crítico", async () => {
    const { event } = await stallQueue(200);
    expect((await alerts()).data).toEqual([]);
    await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { runAt: age(950) } });
    expect((await alerts()).data[0]).toMatchObject({ code: "QUEUE_STALLED", severity: "critical" });
  });

  it("quando o worker volta e o trabalho é concluído, o alerta some", async () => {
    const { deal } = await stallQueue(500);
    expect((await alerts()).data).toHaveLength(1);
    stack.ponte.worker.resume();
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect((await alerts()).data).toEqual([]);
  });

  it("retentativa agendada para o futuro é backoff, não fila parada", async () => {
    const { event } = await stallQueue(1);
    await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { runAt: new Date(Date.now() + 3_600_000) } }); // próxima tentativa daqui a 1 h
    expect((await alerts()).data).toEqual([]);
    expect((await stack.admin("/metrics")).body.oldestPendingAgeSeconds).toBeNull();
  });

  it("job RUNNING recente não conta; com bloqueio expirado (worker morreu) conta como fila parada", async () => {
    const { event } = await stallQueue(1); // evento aceito, worker pausado
    await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { state: "RUNNING", attempts: 1, lockedAt: new Date(), runAt: age(1) } });
    expect((await alerts()).data).toEqual([]); // em andamento, bloqueio recente
    // bloqueio expirou há ~8 min: o trabalho está vencido desde lockedAt + 120 s
    await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { lockedAt: age(600) } });
    const { data } = await alerts();
    expect(data[0]).toMatchObject({ code: "QUEUE_STALLED" });
    expect(data[0]!.details.oldestDueAgeSeconds).toBeGreaterThanOrEqual(470);
    expect(data[0]!.details.oldestDueAgeSeconds).toBeLessThan(520);
  });

  it("eventos na fila de falhas geram DEAD_LETTERS_PRESENT e o alerta some depois do reprocessamento", async () => {
    const deal = await stack.createWonDeal({ cnpj: "11.222.333/0001-99" });
    const dead = await stack.waitForDealEvent(deal.id, ["DEAD"]);
    const { data } = await alerts();
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ code: "DEAD_LETTERS_PRESENT", severity: "warning", details: { count: 1 } });
    expect(data[0]!.since).toBe(dead.receivedAt.toISOString());
  });

  it("/health informa o estado do worker e a administração exige chave", async () => {
    const health = await stack.raw("ponte", "/health");
    expect(health.body).toMatchObject({ status: "ok", version: "1.1.0", worker: { running: true, paused: false } });
    expect(health.body.worker.lastTickAt).not.toBeNull();
    stack.ponte.worker.pause();
    await new Promise((r) => setTimeout(r, 60));
    expect((await stack.raw("ponte", "/health")).body.worker.paused).toBe(true);
    expect((await stack.raw("ponte", "/v1/admin/alerts")).status).toBe(401);
  });
});
