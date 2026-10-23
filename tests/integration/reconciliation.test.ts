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

const run = async () => (await stack.admin("/reconciliation/run", { method: "POST" })).body;
const open = async () => (await stack.admin("/divergences?status=OPEN")).body.data as { id: string; type: string; crmDealId: string; detail: Record<string, any> }[];
const processedDeal = async (input = {}) => {
  const deal = await stack.createWonDeal(input);
  await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
  return deal;
};

describe("US-09 / RF-12: reconciliação", () => {
  it("quando tudo está em dia, não há divergências", async () => {
    await processedDeal();
    await processedDeal();
    const result = await run();
    expect(result).toMatchObject({ dealsChecked: 2, divergencesOpen: 0, divergencesResolved: 0 });
    expect(await open()).toHaveLength(0);
  });

  it("F6/F9: evento perdido (Ponte fora quando o CRM enviou) → NOT_SYNCED; reenviar a entrega resolve na execução seguinte", async () => {
    const deal = await stack.createDeal({ value: "900,00" });
    await stack.stopPonte();
    await stack.winDeal(deal.id);
    const delivery = (await stack.crmApi("/v1/webhook-deliveries")).body.data[0];
    expect(delivery.status).toBe("FAILED"); // o CRM sabe que a entrega falhou
    await stack.startPonte();

    const first = await run();
    expect(first.divergencesOpen).toBe(1);
    const [divergence] = await open();
    expect(divergence).toMatchObject({ type: "NOT_SYNCED", crmDealId: deal.id });
    expect(divergence!.detail.eventStatus).toBeNull(); // a Ponte nunca viu o evento

    const resent = await stack.crmApi(`/v1/webhook-deliveries/${delivery.id}/resend`, { method: "POST" });
    expect(resent.body.status).toBe("DELIVERED");
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);

    const second = await run();
    expect(second).toMatchObject({ divergencesOpen: 0, divergencesResolved: 1 });
    expect(await open()).toHaveLength(0);
    const all = (await stack.admin("/divergences")).body.data;
    expect(all[0]).toMatchObject({ type: "NOT_SYNCED", status: "RESOLVED" });
    expect(all[0].resolvedAt).not.toBeNull();
  });

  it("RN-11: carência — negócio ganho há pouco e sem vínculo só vira divergência depois da carência", async () => {
    const deal = await stack.createDeal();
    await stack.stopPonte();
    await stack.winDeal(deal.id); // o evento se perde
    await stack.startPonte();
    expect((await stack.ponte.reconciler.run("MANUAL", { graceSeconds: 3600 })).divergencesOpen).toBe(0);
    expect((await stack.ponte.reconciler.run("MANUAL", { graceSeconds: 0 })).divergencesOpen).toBe(1);
  });

  it("RN-11: enquanto o evento está em voo (RECEIVED ou em retentativa) não é divergência, mesmo sem carência", async () => {
    stack.ponte.worker.pause();
    const deal = await stack.createWonDeal();
    await waitFor(() => stack.getEventForDeal(deal.id));
    expect((await stack.ponte.reconciler.run("MANUAL", { graceSeconds: 0 })).divergencesOpen).toBe(0);
    stack.ponte.worker.resume();
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect((await stack.ponte.reconciler.run("MANUAL", { graceSeconds: 0 })).divergencesOpen).toBe(0);
  });

  it("evento que foi para a fila de falhas aparece como NOT_SYNCED com o estado do evento", async () => {
    const deal = await stack.createWonDeal({ cnpj: "11.222.333/0001-99" });
    await stack.waitForDealEvent(deal.id, ["DEAD"]);
    await run();
    const [divergence] = await open();
    expect(divergence).toMatchObject({ type: "NOT_SYNCED", crmDealId: deal.id });
    expect(divergence!.detail.eventStatus).toBe("DEAD");
  });

  it("F6: pagamento perdido (Ponte fora quando o ERP avisou) → BILLING_STATUS_MISMATCH; correção assistida atualiza o CRM", async () => {
    const deal = await processedDeal({ value: "400,00" });
    const invoice = (await stack.erpApi(`/v1/invoices?externalRefPrefix=ponte:deal:${deal.id}`)).body.data[0];

    await stack.stopPonte();
    await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST", body: JSON.stringify({ paidAt: "2026-03-20T10:00:00.000Z" }) });
    expect((await stack.erpApi("/v1/webhook-deliveries")).body.data[0].status).toBe("FAILED"); // o ERP não reenvia sozinho
    await stack.startPonte();
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("ABERTA"); // o CRM não sabe que foi pago

    expect((await run()).divergencesOpen).toBe(1);
    const [divergence] = await open();
    expect(divergence).toMatchObject({ type: "BILLING_STATUS_MISMATCH", crmDealId: deal.id });
    expect(divergence!.detail).toMatchObject({ crmStatus: "ABERTA", erpStatus: "PAGA", expectedCrmStatus: "PAGO" });

    expect((await stack.admin(`/divergences/${divergence!.id}/resolve`, { method: "POST" })).status).toBe(200);
    const crmDeal = await stack.getDeal(deal.id);
    expect(crmDeal.billingStatus).toBe("PAGO");
    expect(new Date(crmDeal.paidAt).toISOString()).toBe("2026-03-20T10:00:00.000Z");
    expect(await run()).toMatchObject({ divergencesOpen: 0 });
  });

  it("RN-12: liberação de conferência no ERP não gera evento, e a reconciliação mostra a diferença de status", async () => {
    const deal = await processedDeal({ value: "70.000,00" });
    const invoice = (await stack.erpApi(`/v1/invoices?externalRefPrefix=ponte:deal:${deal.id}`)).body.data[0];
    await stack.erpApi(`/v1/invoices/${invoice.id}/release`, { method: "POST" });
    await run();
    const [divergence] = await open();
    expect(divergence).toMatchObject({ type: "BILLING_STATUS_MISMATCH" });
    expect(divergence!.detail).toMatchObject({ crmStatus: "EM_CONFERENCIA", erpStatus: "ABERTA", expectedCrmStatus: "ABERTA" });
  });

  it("AMOUNT_MISMATCH, ORDER_MISSING_IN_ERP e CRM_LINK_MISSING são detectados, e a divergência corrigida é fechada sozinha", async () => {
    const amount = await processedDeal({ value: "1.000,00" });
    const missing = await processedDeal({ value: "2.000,00" });
    const unlinked = await processedDeal({ value: "3.000,00" });

    await stack.crmApi(`/v1/deals/${amount.id}`, { method: "PATCH", body: JSON.stringify({ value: "1.100,00" }) });
    const missingOrderId = (await stack.getDeal(missing.id)).erpOrderId as string;
    await stack.erp.prisma.invoice.deleteMany({ where: { orderId: missingOrderId } });
    await stack.erp.prisma.order.delete({ where: { id: missingOrderId } });
    await stack.crm.prisma.deal.update({ where: { id: unlinked.id }, data: { erpOrderId: null } });

    const first = await run();
    expect(first.divergencesOpen).toBe(3);
    const byType = Object.fromEntries((await open()).map((d) => [d.type, d]));
    expect(Object.keys(byType).sort()).toEqual(["AMOUNT_MISMATCH", "CRM_LINK_MISSING", "ORDER_MISSING_IN_ERP"]);
    expect(byType.AMOUNT_MISMATCH).toMatchObject({ crmDealId: amount.id });
    expect(byType.AMOUNT_MISMATCH!.detail).toMatchObject({ crmCents: 110_000, erpCents: 100_000 });
    expect(byType.ORDER_MISSING_IN_ERP).toMatchObject({ crmDealId: missing.id });
    expect(byType.CRM_LINK_MISSING).toMatchObject({ crmDealId: unlinked.id });

    // Corrige um dos lados e confirma que a divergência é fechada sozinha; a mesma execução não duplica as demais
    await stack.crmApi(`/v1/deals/${amount.id}`, { method: "PATCH", body: JSON.stringify({ value: "1.000,00" }) });
    const second = await run();
    expect(second).toMatchObject({ divergencesOpen: 2, divergencesResolved: 1 });
    expect(await stack.ponte.prisma.divergence.count()).toBe(3); // upsert por chave: nenhuma linha duplicada
  });

  it("ERP fora durante a execução: a reconciliação falha e NÃO fecha divergências existentes (não dá para afirmar o que não se viu)", async () => {
    await processedDeal({ value: "50,00" });
    const deal = await processedDeal({ value: "60,00" });
    await stack.crmApi(`/v1/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ value: "61,00" }) });
    expect((await run()).divergencesOpen).toBe(1);

    stack.erp.chaos.mode = "down";
    const failed = await stack.admin("/reconciliation/run", { method: "POST" });
    expect(failed.status).toBe(502);
    expect(failed.body.error.code).toBe("PONTE-ERP-001");
    stack.erp.chaos.mode = "none";
    expect(await open()).toHaveLength(1); // continua aberta
    expect(await stack.ponte.prisma.reconciliationRun.count()).toBe(1); // a execução que falhou não foi registrada como concluída
  });

  it("a execução agendada usa o mesmo caminho da manual", async () => {
    const deal = await processedDeal({ value: "10,00" });
    await stack.crmApi(`/v1/deals/${deal.id}`, { method: "PATCH", body: JSON.stringify({ value: "11,00" }) });
    const result = await stack.ponte.reconciler.run("SCHEDULED");
    expect(result.trigger).toBe("SCHEDULED");
    expect(result.divergencesOpen).toBe(1);
  });
});
