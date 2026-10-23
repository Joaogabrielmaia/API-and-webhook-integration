import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Stack, waitFor } from "../helpers/stack";

let stack: Stack;

beforeAll(async () => {
  // 8 tentativas (esperas de 40 a 320 ms, ~1,5 s no total) dão folga ao cenário de pagamento antes do vínculo.
  stack = await Stack.start({ ponte: { retry: { maxAttempts: 8, baseMs: 40, capMs: 320, jitterRatio: 0 } } });
});
afterAll(async () => {
  await stack?.close();
});
beforeEach(async () => {
  await stack.reset();
});

const invoiceOf = async (dealId: string) => (await stack.erpApi(`/v1/invoices?externalRefPrefix=ponte:deal:${dealId}`)).body.data[0] as { id: string; status: string; externalRef: string; orderId: string; amountCents: number };
const paymentEvents = () => stack.ponte.prisma.event.findMany({ where: { type: "invoice.paid" }, orderBy: { receivedAt: "asc" } });

describe("US-08 / RF-10: cobrança paga no ERP atualiza o CRM", () => {
  it("fluxo normal: baixa no ERP → webhook assinado → CRM com status PAGO e data", async () => {
    const deal = await stack.createWonDeal({ value: "1.500,00" });
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const invoice = await invoiceOf(deal.id);
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("ABERTA");

    const paidAt = "2026-03-20T10:00:00.000Z";
    expect((await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST", body: JSON.stringify({ paidAt }) })).status).toBe(200);

    await waitFor(async () => (await stack.getDeal(deal.id)).billingStatus === "PAGO", { label: "CRM atualizado" });
    const crmDeal = await stack.getDeal(deal.id);
    expect(new Date(crmDeal.paidAt).toISOString()).toBe(paidAt);

    const event = await waitFor(async () => {
      const e = (await paymentEvents())[0];
      return e && e.status === "PROCESSED" ? e : null;
    }, { label: "evento de pagamento concluído" });
    expect(event).toMatchObject({ source: "ERP", status: "PROCESSED", entityId: invoice.id });
    const link = await stack.ponte.prisma.dealLink.findUniqueOrThrow({ where: { crmDealId: deal.id } });
    expect(link.invoiceStatus).toBe("PAGA");
    expect(link.paidAt?.toISOString()).toBe(paidAt);
  });

  it("RN-06: cobrança em conferência não pode ser paga; depois de liberada pelo financeiro, o pagamento chega ao CRM", async () => {
    const deal = await stack.createWonDeal({ value: "60.000,00" });
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const invoice = await invoiceOf(deal.id);
    expect(invoice.status).toBe("EM_CONFERENCIA");
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("EM_CONFERENCIA");

    const early = await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST" });
    expect(early.status).toBe(409);
    expect(await paymentEvents()).toHaveLength(0); // nenhum evento foi emitido

    expect((await stack.erpApi(`/v1/invoices/${invoice.id}/release`, { method: "POST" })).status).toBe(200);
    // RN-12: a liberação não gera evento, então o CRM ainda mostra "em conferência" até a reconciliação.
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("EM_CONFERENCIA");

    expect((await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST" })).status).toBe(200);
    await waitFor(async () => (await stack.getDeal(deal.id)).billingStatus === "PAGO", { label: "CRM atualizado" });
  });

  it("webhook de pagamento repetido (mesmo id) é duplicata; outro id para o mesmo pagamento é ignorado com PONTE-SYNC-004", async () => {
    const deal = await stack.createWonDeal();
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const invoice = await invoiceOf(deal.id);
    await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST" });
    await waitFor(async () => (await stack.getDeal(deal.id)).billingStatus === "PAGO");

    const delivery = (await stack.erpApi("/v1/webhook-deliveries")).body.data[0];
    const resent = await stack.erpApi(`/v1/webhook-deliveries/${delivery.id}/resend`, { method: "POST" });
    expect(resent.body.httpStatus).toBe(200); // a Ponte respondeu "duplicate"
    expect(await paymentEvents()).toHaveLength(1);

    const [first] = await paymentEvents();
    const other = { ...(first!.payload as object), id: randomUUID() }; // mesmo pagamento, outra chave de evento
    expect((await stack.postWebhook("erp", other)).status).toBe(202);
    const second = await waitFor(async () => {
      const e = await stack.ponte.prisma.event.findFirst({ where: { idempotencyKey: other.id } });
      return e && e.status === "IGNORED" ? e : null;
    });
    expect(second.ignoreReason).toContain("PONTE-SYNC-004");
  });

  it("cobrança que não foi criada pela Ponte é ignorada com PONTE-SYNC-005", async () => {
    const customer = (await stack.erpApi("/v1/customers", { method: "POST", body: JSON.stringify({ taxId: "11222333000181", name: "Cliente manual" }) })).body;
    const order = (await stack.erpApi("/v1/orders", { method: "POST", body: JSON.stringify({ customerId: customer.id, externalRef: "lancamento-manual-1", description: "Lançado à mão", totalCents: 1000 }) })).body;
    const invoice = (await stack.erpApi("/v1/invoices", { method: "POST", body: JSON.stringify({ orderId: order.id, externalRef: "lancamento-manual-1:inv", amountCents: 1000, dueDate: "2026-04-01" }) })).body;
    await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST" });
    const event = await waitFor(async () => {
      const e = (await paymentEvents())[0];
      return e && e.status === "IGNORED" ? e : null;
    });
    expect(event.ignoreReason).toContain("PONTE-SYNC-005");
  });

  it("F3: pagamento chega antes do vínculo → retentado (PONTE-SYNC-001) até o vínculo existir, e então atualiza o CRM", async () => {
    const deal = await stack.createDeal({ value: "700,00" });
    stack.ponte.worker.pause();
    await stack.winDeal(deal.id); // evento deal.won enfileirado, ainda sem processar

    // O ERP já tem pedido e cobrança com as referências da Ponte (criados por uma tentativa anterior que caiu antes de gravar o vínculo)
    const won = await stack.getDeal(deal.id);
    const customer = (await stack.erpApi("/v1/customers", { method: "POST", body: JSON.stringify({ taxId: won.customer.cnpj.replace(/\D/g, ""), name: won.customer.name }) })).body;
    const order = (await stack.erpApi("/v1/orders", { method: "POST", body: JSON.stringify({ customerId: customer.id, externalRef: `ponte:deal:${deal.id}`, description: won.title, totalCents: 70_000 }) })).body;
    const invoice = (await stack.erpApi("/v1/invoices", { method: "POST", body: JSON.stringify({ orderId: order.id, externalRef: `ponte:deal:${deal.id}:inv`, amountCents: 70_000, dueDate: "2026-04-30", status: "ABERTA" }) })).body;
    await stack.erpApi(`/v1/invoices/${invoice.id}/pay`, { method: "POST" }); // webhook invoice.paid chega antes do vínculo

    // Atrasa o job do negócio para que o pagamento seja tentado primeiro
    await stack.ponte.prisma.job.updateMany({ where: { event: { type: "deal.won" } }, data: { runAt: new Date(Date.now() + 300) } });
    stack.ponte.worker.resume();

    const payment = await waitFor(async () => {
      const e = (await paymentEvents())[0];
      return e && e.status === "PROCESSED" ? e : null;
    }, { label: "pagamento processado depois do vínculo" });
    expect(payment.attempts).toBeGreaterThanOrEqual(2);
    const attempts = await stack.ponte.prisma.attempt.findMany({ where: { eventId: payment.id }, orderBy: { number: "asc" } });
    expect(attempts[0]).toMatchObject({ outcome: "RETRYABLE_ERROR", errorCode: "PONTE-SYNC-001" });
    expect(attempts.at(-1)!.outcome).toBe("OK");

    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("PAGO");
    // Nada foi duplicado: o pedido e a cobrança criados à mão foram reaproveitados pela Ponte (mesmo externalRef)
    expect((await stack.erpApi("/v1/orders")).body.data).toHaveLength(1);
    expect((await stack.erpApi("/v1/invoices")).body.data).toHaveLength(1);
  });
});
