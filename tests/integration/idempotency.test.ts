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

const counts = async () => ({
  customers: (await stack.erpApi("/v1/customers")).body.data.length as number,
  orders: (await stack.erpApi("/v1/orders")).body.data.length as number,
  invoices: (await stack.erpApi("/v1/invoices")).body.data.length as number,
});

describe("US-05 / RF-03: idempotência", () => {
  it("o mesmo evento duas vezes: o segundo é ignorado e o ERP recebe um só pedido e uma só cobrança", async () => {
    const deal = await stack.createDeal();
    stack.ponte.worker.pause();
    const event = await stack.buildDealWonEvent(deal.id, { version: 2 });
    await stack.setStage(deal.id, "GANHO"); // o CRM também envia o seu evento (outro id)
    const first = await stack.postWebhook("crm", event);
    const second = await stack.postWebhook("crm", event);
    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ status: "duplicate", eventId: first.body.eventId });

    const row = await stack.ponte.prisma.event.findUniqueOrThrow({ where: { id: first.body.eventId } });
    expect(row.duplicateCount).toBe(1);
    expect(await stack.ponte.prisma.event.count({ where: { idempotencyKey: event.id } })).toBe(1);

    stack.ponte.worker.resume();
    await waitFor(async () => (await stack.ponte.prisma.event.count({ where: { entityId: deal.id, status: { in: ["PROCESSED", "IGNORED"] } } })) === 2, { label: "dois eventos do negócio concluídos" });
    expect(await counts()).toEqual({ customers: 1, orders: 1, invoices: 1 });
  });

  it("dez disparos simultâneos do mesmo evento: um 202, nove 200 e um único pedido", async () => {
    const deal = await stack.createDeal();
    const event = await stack.buildDealWonEvent(deal.id, { version: 2 });
    const results = await Promise.all(Array.from({ length: 10 }, () => stack.postWebhook("crm", event)));

    expect(results.filter((r) => r.status === 202)).toHaveLength(1);
    expect(results.filter((r) => r.status === 200 && r.body.status === "duplicate")).toHaveLength(9);
    expect(new Set(results.map((r) => r.body.eventId)).size).toBe(1);

    const row = await stack.ponte.prisma.event.findUniqueOrThrow({ where: { idempotencyKey: event.id } });
    expect(row.duplicateCount).toBe(9);
    await waitFor(async () => (await stack.ponte.prisma.event.findUnique({ where: { id: row.id } }))?.status === "PROCESSED", { label: "evento processado" });
    expect(await counts()).toEqual({ customers: 1, orders: 1, invoices: 1 });
    expect((await stack.admin("/metrics")).body.duplicatesIgnored).toBe(9);
  });

  it("reenvio da entrega pelo CRM usa o mesmo id de evento e vira duplicata", async () => {
    const deal = await stack.createWonDeal();
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const delivery = (await stack.crmApi("/v1/webhook-deliveries")).body.data[0];
    const resent = await stack.crmApi(`/v1/webhook-deliveries/${delivery.id}/resend`, { method: "POST" });
    expect(resent.body.status).toBe("DELIVERED");
    expect(resent.body.httpStatus).toBe(200); // a Ponte respondeu "duplicate"
    expect(await stack.ponte.prisma.event.count({ where: { type: "deal.won" } })).toBe(1);
    expect(await counts()).toEqual({ customers: 1, orders: 1, invoices: 1 });
  });

  it("replay de um evento válido dentro da janela de 5 minutos não reprocessa (a assinatura sozinha não impediria)", async () => {
    const deal = await stack.createWonDeal();
    const processed = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const attacker = await stack.postWebhook("crm", processed.payload); // mesmo corpo, nova assinatura válida
    expect(attacker.status).toBe(200);
    expect(attacker.body.status).toBe("duplicate");
    expect(await counts()).toEqual({ customers: 1, orders: 1, invoices: 1 });
  });

  it("RN-03: um novo 'Ganho' do mesmo negócio (outra chave) é ignorado com PONTE-SYNC-003", async () => {
    const deal = await stack.createWonDeal();
    const first = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);

    await stack.setStage(deal.id, "NEGOCIACAO");
    await stack.setStage(deal.id, "GANHO");
    const second = await waitFor(async () => {
      const e = await stack.ponte.prisma.event.findFirst({ where: { entityId: deal.id, id: { not: first.id } } });
      return e && e.status !== "RECEIVED" && e.status !== "PROCESSING" ? e : null;
    });
    expect(second.status).toBe("IGNORED");
    expect(second.ignoreReason).toContain("PONTE-SYNC-003");
    expect(second.entityVersion).toBeGreaterThan(first.entityVersion!);
    expect(await counts()).toEqual({ customers: 1, orders: 1, invoices: 1 });
  });
});
