import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Stack, uniqueCnpj, waitFor } from "../helpers/stack";

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

describe("US-01..US-04: negócio ganho → cliente, pedido e cobrança no ERP → IDs no CRM", () => {
  it("fluxo feliz de ponta a ponta", async () => {
    const cnpj = uniqueCnpj();
    const deal = await stack.createWonDeal({ cnpj, value: "12.500,50", term: 30, name: "Condomínio Edifício Solar", phone: "(31) 99876-5432", email: "Financeiro@Solar.example" });

    const event = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect(event.attempts).toBe(1);
    expect(event.durationMs).not.toBeNull();
    console.log(`[RNF-01] tempo do ganho até PROCESSED em ambiente local: ${event.durationMs} ms`);

    // ERP: cliente com dados convertidos
    const customers = (await stack.erpApi(`/v1/customers?taxId=${cnpj.replace(/\D/g, "")}`)).body.data;
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ taxId: cnpj.replace(/\D/g, ""), name: "Condomínio Edifício Solar", phone: "5531998765432", email: "financeiro@solar.example" });

    // ERP: pedido e cobrança
    const orders = (await stack.erpApi(`/v1/orders?externalRefPrefix=ponte:deal:${deal.id}`)).body.data;
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ totalCents: 1_250_050, externalRef: `ponte:deal:${deal.id}`, customerId: customers[0].id });
    const invoices = (await stack.erpApi(`/v1/invoices?externalRefPrefix=ponte:deal:${deal.id}`)).body.data;
    expect(invoices).toHaveLength(1);
    expect(invoices[0]).toMatchObject({ amountCents: 1_250_050, status: "ABERTA", orderId: orders[0].id });
    const won = new Date((await stack.getDeal(deal.id)).wonAt);
    const expectedDue = new Date(won.getTime() - 3 * 3600_000); // Brasília
    expectedDue.setUTCDate(expectedDue.getUTCDate() + 30);
    expect(invoices[0].dueDate).toBe(expectedDue.toISOString().slice(0, 10));

    // CRM: IDs devolvidos
    const crmDeal = await stack.getDeal(deal.id);
    expect(crmDeal).toMatchObject({ erpCustomerId: customers[0].id, erpOrderId: orders[0].id, erpInvoiceId: invoices[0].id, billingStatus: "ABERTA" });

    // O webhook do CRM foi entregue
    const deliveries = (await stack.crmApi("/v1/webhook-deliveries")).body.data;
    expect(deliveries[0]).toMatchObject({ status: "DELIVERED", httpStatus: 202 });
  });

  it("RN-06: valor a partir de R$ 50.000,00 gera cobrança EM_CONFERENCIA", async () => {
    const deal = await stack.createWonDeal({ value: "50.000,00" });
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const invoice = (await stack.erpApi(`/v1/invoices?externalRefPrefix=ponte:deal:${deal.id}`)).body.data[0];
    expect(invoice.status).toBe("EM_CONFERENCIA");
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("EM_CONFERENCIA");

    const below = await stack.createWonDeal({ value: "49.999,99" });
    await stack.waitForDealEvent(below.id, ["PROCESSED"]);
    expect((await stack.erpApi(`/v1/invoices?externalRefPrefix=ponte:deal:${below.id}`)).body.data[0].status).toBe("ABERTA");
  });

  it("US-02 / RN-02: mesmo CNPJ com nome diferente não duplica o cliente nem altera a razão social; contato é atualizado", async () => {
    const cnpj = uniqueCnpj();
    const first = await stack.createWonDeal({ cnpj, name: "Condomínio Edifício Solar", phone: "(31) 99876-5432", email: "a@solar.example" });
    await stack.waitForDealEvent(first.id, ["PROCESSED"]);

    const second = await stack.createWonDeal({ cnpj, name: "Cond. Ed. Solar", phone: "(31) 3333-4444", email: "novo@solar.example", title: "Segundo contrato" });
    await stack.waitForDealEvent(second.id, ["PROCESSED"]);

    const customers = (await stack.erpApi(`/v1/customers?taxId=${cnpj.replace(/\D/g, "")}`)).body.data;
    expect(customers).toHaveLength(1);
    expect(customers[0].name).toBe("Condomínio Edifício Solar"); // razão social preservada
    expect(customers[0].phone).toBe("553133334444"); // contato atualizado
    expect(customers[0].email).toBe("novo@solar.example");
    expect((await stack.erpApi("/v1/orders")).body.data).toHaveLength(2);
  });

  it("US-02: dois negócios do mesmo CNPJ processados ao mesmo tempo resultam em um único cliente", async () => {
    const cnpj = uniqueCnpj();
    const a = await stack.createDeal({ cnpj, title: "A" });
    const b = await stack.createDeal({ customerId: undefined, cnpj, title: "B" });
    await Promise.all([stack.winDeal(a.id), stack.winDeal(b.id)]);
    await Promise.all([stack.waitForDealEvent(a.id, ["PROCESSED"]), stack.waitForDealEvent(b.id, ["PROCESSED"])]);
    expect((await stack.erpApi("/v1/customers")).body.data).toHaveLength(1);
    expect((await stack.erpApi("/v1/orders")).body.data).toHaveLength(2);
  });

  it("F5: CRM fora no retorno → retentativa refaz só o retorno, sem recriar pedido nem cobrança", async () => {
    const deal = await stack.createDeal({ value: "800,00" });
    stack.ponte.worker.pause();
    await stack.winDeal(deal.id);
    await waitFor(async () => (await stack.getEventForDeal(deal.id)) ?? null);
    await stack.stopCrm();
    stack.ponte.worker.resume();

    const retrying = await stack.waitForDealEvent(deal.id, ["RETRYING"]);
    expect(retrying.lastErrorCode).toBe("PONTE-CRM-001");
    // Pedido e cobrança já existem no ERP neste ponto
    expect((await stack.erpApi("/v1/orders")).body.data).toHaveLength(1);
    expect((await stack.erpApi("/v1/invoices")).body.data).toHaveLength(1);

    await stack.startCrm();
    const done = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    expect(done.attempts).toBeGreaterThanOrEqual(2);
    expect((await stack.erpApi("/v1/orders")).body.data).toHaveLength(1);
    expect((await stack.erpApi("/v1/invoices")).body.data).toHaveLength(1);
    expect((await stack.getDeal(deal.id)).erpOrderId).toBeTruthy();
  });
});
