import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Stack, waitFor } from "../helpers/stack";

let stack: Stack;

beforeAll(async () => {
  stack = await Stack.start();
});
afterAll(async () => {
  await stack?.close();
});
beforeEach(async () => {
  await stack.reset();
});

const orders = async () => (await stack.erpApi("/v1/orders")).body.data as { totalCents: number }[];

describe("US-13 / RN-07: evento fora de ordem", () => {
  it("versão 5 aceita antes de a versão 3 ser processada: a 3 é ignorada com PONTE-SYNC-002 e vale o valor da 5", async () => {
    const deal = await stack.createDeal({ value: "100,00" });
    stack.ponte.worker.pause();
    const v5 = await stack.buildDealWonEvent(deal.id, { version: 5, value: "500,00" });
    const v3 = await stack.buildDealWonEvent(deal.id, { version: 3, value: "300,00" });
    expect((await stack.postWebhook("crm", v5)).status).toBe(202);
    expect((await stack.postWebhook("crm", v3)).status).toBe(202); // chegou depois, mas é mais antigo
    stack.ponte.worker.resume();

    const e5 = await waitFor(async () => (await stack.ponte.prisma.event.findUnique({ where: { idempotencyKey: v5.id } }))?.status === "PROCESSED" && true, { label: "v5 processada" });
    expect(e5).toBe(true);
    const e3 = await waitFor(async () => {
      const e = await stack.ponte.prisma.event.findUnique({ where: { idempotencyKey: v3.id } });
      return e && e.status === "IGNORED" ? e : null;
    });
    expect(e3.ignoreReason).toContain("PONTE-SYNC-002");

    const created = await orders();
    expect(created).toHaveLength(1);
    expect(created[0]!.totalCents).toBe(50_000); // o valor da versão mais nova
  });

  it("evento antigo processado primeiro e o 'Ganho' real chega depois: o novo é ignorado (RN-03) e a reconciliação aponta a diferença de valor", async () => {
    const deal = await stack.createDeal({ value: "200,00" });
    // Um evento antigo (versão 1, R$ 100,00) chega e é processado antes do 'Ganho' real do CRM.
    const old = await stack.buildDealWonEvent(deal.id, { version: 1, value: "100,00" });
    await stack.postWebhook("crm", old);
    await waitFor(async () => (await stack.ponte.prisma.event.findUnique({ where: { idempotencyKey: old.id } }))?.status === "PROCESSED", { label: "evento antigo processado" });

    await stack.winDeal(deal.id); // o CRM envia o seu evento (versão 2, R$ 200,00)
    const current = await waitFor(async () => {
      const e = await stack.ponte.prisma.event.findFirst({ where: { entityId: deal.id, idempotencyKey: { not: old.id } } });
      return e && e.status === "IGNORED" ? e : null;
    });
    expect(current.ignoreReason).toContain("PONTE-SYNC-003");
    expect((await orders())[0]!.totalCents).toBe(10_000);

    // No CRM o negócio vale R$ 200,00; no ERP o pedido vale R$ 100,00. O desvio fica visível para decisão humana.
    const run = await stack.admin("/reconciliation/run", { method: "POST" });
    expect(run.body.divergencesOpen).toBe(1);
    const [divergence] = (await stack.admin("/divergences?status=OPEN")).body.data;
    expect(divergence).toMatchObject({ type: "AMOUNT_MISMATCH", crmDealId: deal.id });
    expect(divergence.detail).toMatchObject({ crmCents: 20_000, erpCents: 10_000 });
  });
});
