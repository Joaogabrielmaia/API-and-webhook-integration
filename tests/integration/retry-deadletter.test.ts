import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Stack, waitFor } from "../helpers/stack";

let stack: Stack;

// Política de teste: 5 tentativas; esperas 40, 80, 160, 320 ms (sem jitter), mesma fórmula da política de produção (ADR-004).
beforeAll(async () => {
  stack = await Stack.start({ ponte: { httpTimeoutMs: 500, retry: { maxAttempts: 5, baseMs: 40, capMs: 320, jitterRatio: 0 } } });
});
afterAll(async () => {
  await stack?.close();
});
beforeEach(async () => {
  await stack.reset();
});

const erpOrders = async () => (await stack.erpApi("/v1/orders")).body.data.length as number;

describe("US-06: retentativa com backoff", () => {
  it("ERP fora: tentativas registradas com espera crescente, depois fila de falhas; reprocessar conclui sem duplicar", async () => {
    stack.erp.chaos.mode = "down";
    const deal = await stack.createWonDeal();

    const retrying = await stack.waitForDealEvent(deal.id, ["RETRYING"]);
    expect(retrying.lastErrorCode).toBe("PONTE-ERP-001");
    expect(retrying.nextRunAt).not.toBeNull();

    const dead = await stack.waitForDealEvent(deal.id, ["DEAD"]);
    expect(dead.attempts).toBe(5);
    expect(dead.lastErrorCode).toBe("PONTE-ERP-001");
    expect(dead.lastErrorMessage).toContain("Tentativas esgotadas (5)");
    expect(await stack.ponte.prisma.job.findUniqueOrThrow({ where: { eventId: dead.id } })).toMatchObject({ state: "DEAD", attempts: 5 });

    // Cada tentativa fica registrada, e a espera calculada cresce exponencialmente até o teto (40, 80, 160, 320 ms).
    const attempts = await stack.ponte.prisma.attempt.findMany({ where: { eventId: dead.id }, orderBy: { number: "asc" } });
    expect(attempts.map((a) => a.number)).toEqual([1, 2, 3, 4, 5]);
    expect(attempts.slice(0, 4).every((a) => a.outcome === "RETRYABLE_ERROR" && a.nextRunAt !== null)).toBe(true);
    expect(attempts[4]!.nextRunAt).toBeNull();
    // Mede só com o relógio da aplicação (fim de uma tentativa → início da seguinte). `nextRunAt` vem do relógio do
    // Postgres (outro relógio, dentro do Docker); misturar os dois mede o desvio entre eles, não a política.
    const waits = attempts.slice(0, 4).map((a, i) => attempts[i + 1]!.startedAt.getTime() - (a.startedAt.getTime() + a.durationMs));
    // A política garante o piso (40, 80, 160, 320 ms) e o crescimento; o excesso é só latência do banco, então não há teto.
    const expected = [40, 80, 160, 320];
    waits.forEach((w, i) => expect(w, `espera após a tentativa ${i + 1}`).toBeGreaterThanOrEqual(expected[i]! - 5));
    expect(waits[3]! - waits[0]!).toBeGreaterThan(100);
    expect(waits[2]!).toBeGreaterThan(waits[0]!);

    // O CRM não recebeu nada, e o ERP não tem nada
    expect((await stack.getDeal(deal.id)).erpOrderId).toBeNull();
    stack.erp.chaos.mode = "none";
    expect(await erpOrders()).toBe(0);

    // Reprocessamento manual (RN-10): mesmas chaves idempotentes, nada duplicado
    const res = await stack.admin(`/events/${dead.id}/reprocess`, { method: "POST" });
    expect(res.status).toBe(202);
    const done = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect(done.attempts).toBe(6);
    expect(done.lastErrorCode).toBeNull();
    const all = await stack.ponte.prisma.attempt.findMany({ where: { eventId: dead.id }, orderBy: { number: "asc" } });
    expect(all.map((a) => a.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all[5]!.outcome).toBe("OK");
    expect(await erpOrders()).toBe(1);
    expect((await stack.getDeal(deal.id)).erpOrderId).toBeTruthy();
  });

  it("ERP volta durante as tentativas: o evento termina PROCESSED sem duplicar nada", async () => {
    stack.erp.chaos.mode = "down";
    const deal = await stack.createWonDeal();
    await stack.waitForDealEvent(deal.id, ["RETRYING"]);
    stack.erp.chaos.mode = "none";
    const done = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect(done.attempts).toBeGreaterThanOrEqual(2);
    expect(await erpOrders()).toBe(1);
    expect((await stack.erpApi("/v1/invoices")).body.data).toHaveLength(1);
  });

  it("ERP lento além do timeout é falha temporária (PONTE-ERP-003); o ERP termina de criar depois que a Ponte desistiu, e a retentativa não duplica", async () => {
    stack.erp.chaos.mode = "slow";
    stack.erp.chaos.delayMs = 1200; // maior que o timeout de 500 ms da Ponte
    const deal = await stack.createWonDeal();
    const retrying = await stack.waitForDealEvent(deal.id, ["RETRYING"]);
    expect(retrying.lastErrorCode).toBe("PONTE-ERP-003");

    stack.erp.chaos.mode = "none";
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    // Chamadas abandonadas por timeout podem ter sido concluídas pelo ERP; mesmo assim, só existe um de cada.
    expect((await stack.erpApi("/v1/customers")).body.data).toHaveLength(1);
    expect(await erpOrders()).toBe(1);
    expect((await stack.erpApi("/v1/invoices")).body.data).toHaveLength(1);
  });
});

describe("US-07: fila de falhas e reprocessamento", () => {
  it.each([
    ["CNPJ inválido", { cnpj: "11.222.333/0001-99" }, "PONTE-VAL-001"],
    ["valor inválido", { value: "doze reais" }, "PONTE-VAL-002"],
    ["prazo fora de 0 a 90 dias", { term: 120 }, "PONTE-VAL-003"],
    ["valor acima do limite de R$ 1.000.000,00", { value: "1.000.000,01" }, "PONTE-VAL-002"],
  ])("dado inválido (%s): vai direto para DEAD, sem retentativa e sem tocar no ERP", async (_label, input, code) => {
    const deal = await stack.createWonDeal(input);
    const dead = await stack.waitForDealEvent(deal.id, ["DEAD"]);
    expect(dead.lastErrorCode).toBe(code);
    expect(dead.attempts).toBe(1);
    expect(dead.lastErrorMessage).not.toContain("Tentativas esgotadas"); // erro permanente, não esgotamento
    expect((await stack.erpApi("/v1/customers")).body.data).toHaveLength(0);
    expect(await erpOrders()).toBe(0);
    const detail = (await stack.admin(`/events/${dead.id}`)).body;
    expect(detail.attemptLog).toHaveLength(1);
    expect(detail.attemptLog[0].outcome).toBe("PERMANENT_ERROR");
  });

  it("reprocessar sem corrigir o dado volta a DEAD; corrigir no CRM e marcar Ganho de novo gera um novo evento que passa", async () => {
    const deal = await stack.createWonDeal({ value: "doze reais" });
    const dead = await stack.waitForDealEvent(deal.id, ["DEAD"]);

    expect((await stack.admin(`/events/${dead.id}/reprocess`, { method: "POST" })).status).toBe(202);
    await waitFor(async () => {
      const e = await stack.ponte.prisma.event.findUnique({ where: { id: dead.id } });
      return e?.status === "DEAD" && e.attempts === 2 ? e : null;
    }, { label: "volta a DEAD com 2 tentativas no histórico" });

    await stack.crmApi(`/v1/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ value: "100,00" }) });
    await stack.setStage(deal.id, "NEGOCIACAO");
    await stack.setStage(deal.id, "GANHO");
    const fixed = await waitFor(async () => {
      const e = await stack.ponte.prisma.event.findFirst({ where: { entityId: deal.id, status: "PROCESSED" } });
      return e ?? null;
    }, { label: "novo evento processado" });
    expect(fixed.id).not.toBe(dead.id);
    expect(await erpOrders()).toBe(1);
    // O evento antigo continua visível na fila de falhas até alguém decidir o que fazer com ele
    expect((await stack.ponte.prisma.event.findUniqueOrThrow({ where: { id: dead.id } })).status).toBe("DEAD");
  });

  it("só evento em DEAD pode ser reprocessado (409 PONTE-ADM-001)", async () => {
    const deal = await stack.createWonDeal();
    const processed = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const res = await stack.admin(`/events/${processed.id}/reprocess`, { method: "POST" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("PONTE-ADM-001");
  });
});

describe("F7: worker interrompido no meio de um job", () => {
  it("job RUNNING com bloqueio expirado é retomado; com bloqueio recente não é tocado", async () => {
    const deal = await stack.createDeal();
    stack.ponte.worker.pause();
    await stack.winDeal(deal.id);
    const event = await waitFor(() => stack.getEventForDeal(deal.id), { label: "evento recebido" });

    // Simula um worker que pegou o job e morreu agora há pouco: bloqueio recente.
    await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { state: "RUNNING", attempts: 1, lockedAt: new Date(), lockedBy: "worker-que-morreu" } });
    stack.ponte.worker.resume();
    await new Promise((r) => setTimeout(r, 400));
    expect((await stack.ponte.prisma.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("RECEIVED");

    // O bloqueio expira (mais de 120 s atrás): outro ciclo retoma o job.
    await stack.ponte.prisma.job.update({ where: { eventId: event.id }, data: { lockedAt: new Date(Date.now() - 10 * 60_000) } });
    const done = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect(done.attempts).toBe(1);
    expect(await erpOrders()).toBe(1);
    expect(await stack.ponte.prisma.job.findUniqueOrThrow({ where: { eventId: event.id } })).toMatchObject({ state: "DONE", attempts: 2 });
  });
});
