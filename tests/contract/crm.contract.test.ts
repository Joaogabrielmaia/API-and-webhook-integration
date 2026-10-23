import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Contract } from "../helpers/contract";
import { Stack, uniqueCnpj } from "../helpers/stack";

let stack: Stack;
let crm: Contract;
let ponte: Contract;

beforeAll(async () => {
  stack = await Stack.start({ ponte: { worker: { enabled: false } } });
  await stack.reset();
  crm = await Contract.load("crm.openapi.yaml", "CRM");
  ponte = await Contract.load("ponte.openapi.yaml", "Ponte");
});
afterAll(async () => {
  await stack?.close();
});

describe("Contrato do CRM simples (crm.openapi.yaml)", () => {
  it("o documento é um OpenAPI válido e o health responde conforme o contrato", async () => {
    crm.check("/health", "get", await stack.raw("crm", "/health"));
  });

  it("rotas /v1 exigem X-Api-Key (401 documentado)", async () => {
    const res = await stack.raw("crm", "/v1/customers");
    expect(res.status).toBe(401);
    crm.check("/v1/customers", "get", res);
  });

  it("clientes: criar, listar, buscar, 404 e 400", async () => {
    const body = { name: "Condomínio Edifício Solar", cnpj: uniqueCnpj(), phone: "(31) 99876-5432", email: "Financeiro@Solar.example" };
    const created = await stack.crmApi("/v1/customers", { method: "POST", body: JSON.stringify(body) });
    expect(created.status).toBe(201);
    crm.check("/v1/customers", "post", created, body);

    crm.check("/v1/customers", "get", await stack.crmApi("/v1/customers"));
    crm.check("/v1/customers/{id}", "get", await stack.crmApi(`/v1/customers/${created.body.id}`));

    const missing = await stack.crmApi("/v1/customers/3f1c6f0a-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    crm.check("/v1/customers/{id}", "get", missing);

    const invalid = await stack.crmApi("/v1/customers", { method: "POST", body: JSON.stringify({ name: "" }) });
    expect(invalid.status).toBe(400);
    crm.check("/v1/customers", "post", invalid);
  });

  it("negócios: ciclo completo, evento deal.won e vínculos do ERP", async () => {
    const customer = await stack.createCustomer();
    const dealBody = { title: "Contrato de manutenção anual", customerId: customer.id, value: "12.500,50", paymentTermDays: 30 };
    const created = await stack.crmApi("/v1/deals", { method: "POST", body: JSON.stringify(dealBody) });
    expect(created.status).toBe(201);
    crm.check("/v1/deals", "post", created, dealBody);
    const id = created.body.id as string;

    const badDeal = await stack.crmApi("/v1/deals", { method: "POST", body: JSON.stringify({ title: "x", customerId: "3f1c6f0a-0000-4000-8000-000000000000", value: "1,00" }) });
    expect(badDeal.status).toBe(404);
    crm.check("/v1/deals", "post", badDeal);

    crm.check("/v1/deals", "get", await stack.crmApi("/v1/deals"));
    crm.check("/v1/deals", "get", await stack.crmApi("/v1/deals?stage=GANHO"));
    crm.check("/v1/deals/{id}", "get", await stack.crmApi(`/v1/deals/${id}`));

    const patchBody = { value: "13.000,00" };
    const patched = await stack.crmApi(`/v1/deals/${id}`, { method: "PATCH", body: JSON.stringify(patchBody) });
    expect(patched.status).toBe(200);
    expect(patched.body.version).toBe(2);
    crm.check("/v1/deals/{id}", "patch", patched, patchBody);
    const emptyPatch = await stack.crmApi(`/v1/deals/${id}`, { method: "PATCH", body: JSON.stringify({}) });
    expect(emptyPatch.status).toBe(400);
    crm.check("/v1/deals/{id}", "patch", emptyPatch);

    const stageBody = { stage: "GANHO" };
    const won = await stack.crmApi(`/v1/deals/${id}/stage`, { method: "POST", body: JSON.stringify(stageBody) });
    expect(won.status).toBe(200);
    expect(won.body.stage).toBe("GANHO");
    crm.check("/v1/deals/{id}/stage", "post", won, stageBody);
    const badStage = await stack.crmApi(`/v1/deals/${id}/stage`, { method: "POST", body: JSON.stringify({ stage: "QUALQUER" }) });
    expect(badStage.status).toBe(400);
    crm.check("/v1/deals/{id}/stage", "post", badStage);

    const linkBody = { erpCustomerId: "c-1", erpOrderId: "o-1", erpInvoiceId: "i-1", billingStatus: "ABERTA" };
    const linked = await stack.crmApi(`/v1/deals/${id}/erp-link`, { method: "PUT", body: JSON.stringify(linkBody) });
    expect(linked.status).toBe(200);
    expect(linked.body).toMatchObject(linkBody);
    crm.check("/v1/deals/{id}/erp-link", "put", linked, linkBody);

    const billingBody = { billingStatus: "PAGO", paidAt: "2026-03-20T10:00:00.000Z" };
    const billed = await stack.crmApi(`/v1/deals/${id}/billing-status`, { method: "PATCH", body: JSON.stringify(billingBody) });
    expect(billed.status).toBe(200);
    crm.check("/v1/deals/{id}/billing-status", "patch", billed, billingBody);

    // Entregas de webhook e reenvio
    const deliveries = await stack.crmApi("/v1/webhook-deliveries");
    crm.check("/v1/webhook-deliveries", "get", deliveries);
    const delivery = deliveries.body.data.find((d: { dealId: string }) => d.dealId === id);
    expect(delivery.status).toBe("DELIVERED");
    const resent = await stack.crmApi(`/v1/webhook-deliveries/${delivery.id}/resend`, { method: "POST" });
    expect(resent.status).toBe(200);
    expect(resent.body.attempts).toBe(2);
    crm.check("/v1/webhook-deliveries/{id}/resend", "post", resent);
    const resendMissing = await stack.crmApi("/v1/webhook-deliveries/3f1c6f0a-0000-4000-8000-000000000000/resend", { method: "POST" });
    expect(resendMissing.status).toBe(404);
    crm.check("/v1/webhook-deliveries/{id}/resend", "post", resendMissing);

    // O evento emitido cumpre o contrato do produtor (CRM) E o contrato do consumidor (Ponte).
    const stored = await stack.crm.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    crm.validateAgainstSchema("DealWonEvent", stored.payload);
    ponte.validateAgainstSchema("DealWonEvent", stored.payload);
    // O reenvio mantém o mesmo id de evento, então a Ponte o trata como duplicata.
    expect(await stack.ponte.prisma.event.count({ where: { idempotencyKey: stored.eventId } })).toBe(1);
  });

  it("todas as operações do contrato foram exercitadas", () => {
    crm.assertFullCoverage();
  });
});
