import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Contract } from "../helpers/contract";
import { Stack } from "../helpers/stack";

let stack: Stack;
let erp: Contract;
let ponte: Contract;

beforeAll(async () => {
  stack = await Stack.start({ ponte: { worker: { enabled: false } } });
  await stack.reset();
  erp = await Contract.load("erp.openapi.yaml", "ERP");
  ponte = await Contract.load("ponte.openapi.yaml", "Ponte");
});
afterAll(async () => {
  await stack?.close();
});

const taxId = "11222333000181";

describe("Contrato do ERP simples (erp.openapi.yaml)", () => {
  it("health e autenticação", async () => {
    erp.check("/health", "get", await stack.raw("erp", "/health"));
    const unauth = await stack.raw("erp", "/v1/customers");
    expect(unauth.status).toBe(401);
    erp.check("/v1/customers", "get", unauth);
  });

  it("clientes: criar, duplicar (409), buscar por CNPJ, atualizar contato, 404 e 422", async () => {
    const body = { taxId, name: "CONDOMINIO EDIFICIO SOLAR", phone: "5531998765432", email: "financeiro@solar.example" };
    const created = await stack.erpApi("/v1/customers", { method: "POST", body: JSON.stringify(body) });
    expect(created.status).toBe(201);
    erp.check("/v1/customers", "post", created, body);

    const duplicate = await stack.erpApi("/v1/customers", { method: "POST", body: JSON.stringify(body) });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("ERP-CUSTOMER-EXISTS");
    expect(duplicate.body.error.details.existingId).toBe(created.body.id);
    erp.check("/v1/customers", "post", duplicate);

    const invalid = await stack.erpApi("/v1/customers", { method: "POST", body: JSON.stringify({ taxId: "123", name: "X" }) });
    expect(invalid.status).toBe(422);
    erp.check("/v1/customers", "post", invalid);

    const found = await stack.erpApi(`/v1/customers?taxId=${taxId}`);
    expect(found.body.data).toHaveLength(1);
    erp.check("/v1/customers", "get", found);
    erp.check("/v1/customers/{id}", "get", await stack.erpApi(`/v1/customers/${created.body.id}`));

    const patchBody = { phone: "553133334444" };
    const patched = await stack.erpApi(`/v1/customers/${created.body.id}`, { method: "PATCH", body: JSON.stringify(patchBody) });
    expect(patched.body.phone).toBe("553133334444");
    erp.check("/v1/customers/{id}", "patch", patched, patchBody);

    const missing = await stack.erpApi("/v1/customers/3f1c6f0a-0000-4000-8000-000000000000");
    expect(missing.status).toBe(404);
    erp.check("/v1/customers/{id}", "get", missing);
  });

  it("pedidos e cobranças: criação idempotente por externalRef, conferência, liberação e pagamento", async () => {
    const customer = (await stack.erpApi(`/v1/customers?taxId=${taxId}`)).body.data[0];

    const orderBody = { customerId: customer.id, externalRef: "ponte:deal:contract-1", description: "Contrato de manutenção anual", totalCents: 1_250_050 };
    const order = await stack.erpApi("/v1/orders", { method: "POST", body: JSON.stringify(orderBody) });
    expect(order.status).toBe(201);
    erp.check("/v1/orders", "post", order, orderBody);
    const replay = await stack.erpApi("/v1/orders", { method: "POST", body: JSON.stringify(orderBody) });
    expect(replay.status).toBe(200);
    expect(replay.headers.get("idempotent-replay")).toBe("true");
    expect(replay.body.id).toBe(order.body.id);
    erp.check("/v1/orders", "post", replay, orderBody);
    expect((await stack.erpApi("/v1/orders")).body.data).toHaveLength(1);

    const badOrder = await stack.erpApi("/v1/orders", { method: "POST", body: JSON.stringify({ ...orderBody, externalRef: "ponte:deal:x", customerId: "3f1c6f0a-0000-4000-8000-000000000000" }) });
    expect(badOrder.status).toBe(404);
    erp.check("/v1/orders", "post", badOrder);
    const invalidOrder = await stack.erpApi("/v1/orders", { method: "POST", body: JSON.stringify({ ...orderBody, externalRef: "ponte:deal:y", totalCents: 0 }) });
    expect(invalidOrder.status).toBe(422);
    erp.check("/v1/orders", "post", invalidOrder);

    erp.check("/v1/orders", "get", await stack.erpApi("/v1/orders?externalRefPrefix=ponte:deal:"));
    erp.check("/v1/orders/{id}", "get", await stack.erpApi(`/v1/orders/${order.body.id}`));
    const missingOrder = await stack.erpApi("/v1/orders/3f1c6f0a-0000-4000-8000-000000000000");
    expect(missingOrder.status).toBe(404);
    erp.check("/v1/orders/{id}", "get", missingOrder);

    // Cobrança em conferência: não paga, libera, paga
    const invoiceBody = { orderId: order.body.id, externalRef: "ponte:deal:contract-1:inv", amountCents: 1_250_050, dueDate: "2026-04-09", status: "EM_CONFERENCIA" };
    const invoice = await stack.erpApi("/v1/invoices", { method: "POST", body: JSON.stringify(invoiceBody) });
    expect(invoice.status).toBe(201);
    expect(invoice.body.status).toBe("EM_CONFERENCIA");
    erp.check("/v1/invoices", "post", invoice, invoiceBody);
    const invoiceReplay = await stack.erpApi("/v1/invoices", { method: "POST", body: JSON.stringify(invoiceBody) });
    expect(invoiceReplay.status).toBe(200);
    erp.check("/v1/invoices", "post", invoiceReplay, invoiceBody);
    const noOrder = await stack.erpApi("/v1/invoices", { method: "POST", body: JSON.stringify({ ...invoiceBody, externalRef: "ponte:deal:z:inv", orderId: "3f1c6f0a-0000-4000-8000-000000000000" }) });
    expect(noOrder.status).toBe(404);
    erp.check("/v1/invoices", "post", noOrder);
    const badInvoice = await stack.erpApi("/v1/invoices", { method: "POST", body: JSON.stringify({ ...invoiceBody, externalRef: "ponte:deal:w:inv", dueDate: "09/04/2026" }) });
    expect(badInvoice.status).toBe(422);
    erp.check("/v1/invoices", "post", badInvoice);

    erp.check("/v1/invoices", "get", await stack.erpApi("/v1/invoices?externalRefPrefix=ponte:deal:"));
    erp.check("/v1/invoices/{id}", "get", await stack.erpApi(`/v1/invoices/${invoice.body.id}`));
    const missingInvoice = await stack.erpApi("/v1/invoices/3f1c6f0a-0000-4000-8000-000000000000");
    expect(missingInvoice.status).toBe(404);
    erp.check("/v1/invoices/{id}", "get", missingInvoice);

    const payEarly = await stack.erpApi(`/v1/invoices/${invoice.body.id}/pay`, { method: "POST" });
    expect(payEarly.status).toBe(409);
    expect(payEarly.body.error.code).toBe("ERP-INVOICE-NOT-PAYABLE");
    erp.check("/v1/invoices/{id}/pay", "post", payEarly);

    const released = await stack.erpApi(`/v1/invoices/${invoice.body.id}/release`, { method: "POST" });
    expect(released.status).toBe(200);
    expect(released.body.status).toBe("ABERTA");
    erp.check("/v1/invoices/{id}/release", "post", released);
    const releasedTwice = await stack.erpApi(`/v1/invoices/${invoice.body.id}/release`, { method: "POST" });
    expect(releasedTwice.status).toBe(409);
    erp.check("/v1/invoices/{id}/release", "post", releasedTwice);

    const paid = await stack.erpApi(`/v1/invoices/${invoice.body.id}/pay`, { method: "POST", body: JSON.stringify({ paidAt: "2026-03-20T10:00:00.000Z" }) });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe("PAGA");
    erp.check("/v1/invoices/{id}/pay", "post", paid);
    const missingPay = await stack.erpApi("/v1/invoices/3f1c6f0a-0000-4000-8000-000000000000/pay", { method: "POST" });
    expect(missingPay.status).toBe(404);
    erp.check("/v1/invoices/{id}/pay", "post", missingPay);

    // Webhooks emitidos
    const deliveries = await stack.erpApi("/v1/webhook-deliveries");
    erp.check("/v1/webhook-deliveries", "get", deliveries);
    const delivery = deliveries.body.data[0];
    expect(delivery.invoiceId).toBe(invoice.body.id);
    const resent = await stack.erpApi(`/v1/webhook-deliveries/${delivery.id}/resend`, { method: "POST" });
    expect(resent.status).toBe(200);
    erp.check("/v1/webhook-deliveries/{id}/resend", "post", resent);
    const resendMissing = await stack.erpApi("/v1/webhook-deliveries/3f1c6f0a-0000-4000-8000-000000000000/resend", { method: "POST" });
    expect(resendMissing.status).toBe(404);
    erp.check("/v1/webhook-deliveries/{id}/resend", "post", resendMissing);

    // O evento emitido cumpre o contrato do produtor (ERP) E o do consumidor (Ponte)
    const stored = await stack.erp.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    erp.validateAgainstSchema("InvoicePaidEvent", stored.payload);
    ponte.validateAgainstSchema("InvoicePaidEvent", stored.payload);
  });

  it("modo de falha: 503 documentado quando o ERP está fora, e a administração continua acessível", async () => {
    const down = await stack.erpApi("/v1/admin/chaos", { method: "POST", body: JSON.stringify({ mode: "down" }) });
    expect(down.status).toBe(200);
    erp.check("/v1/admin/chaos", "post", down, { mode: "down" });

    const unavailable = await stack.erpApi("/v1/customers");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body.error.code).toBe("ERP-UNAVAILABLE");
    erp.check("/v1/customers", "get", unavailable);

    erp.check("/v1/admin/chaos", "get", await stack.erpApi("/v1/admin/chaos"));
    const invalid = await stack.erpApi("/v1/admin/chaos", { method: "POST", body: JSON.stringify({ mode: "explodir" }) });
    expect(invalid.status).toBe(422);
    erp.check("/v1/admin/chaos", "post", invalid);

    const back = await stack.erpApi("/v1/admin/chaos", { method: "POST", body: JSON.stringify({ mode: "none" }) });
    expect(back.body.mode).toBe("none");
    expect((await stack.erpApi("/v1/customers")).status).toBe(200);
  });

  it("todas as operações do contrato foram exercitadas", () => {
    erp.assertFullCoverage();
  });
});
