import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_MAPPING_RULES } from "@ponte/integration";
import { Contract } from "../helpers/contract";
import { Stack, waitFor } from "../helpers/stack";

let stack: Stack;
let ponte: Contract;

beforeAll(async () => {
  stack = await Stack.start();
  await stack.reset();
  ponte = await Contract.load("ponte.openapi.yaml", "Ponte");
});
afterAll(async () => {
  await stack?.close();
});

const dealWon = (over: { id?: string; cnpj?: string; version?: string } = {}) => ({
  id: over.id ?? randomUUID(),
  type: "deal.won",
  version: over.version ?? "1",
  occurredAt: new Date().toISOString(),
  data: {
    deal: { id: randomUUID(), title: "Contrato", value: "100,00", paymentTermDays: 30, wonAt: new Date().toISOString(), version: 1 },
    customer: { id: randomUUID(), name: "Cliente", cnpj: over.cnpj ?? "11.222.333/0001-82", phone: null, email: null },
  },
});

describe("Contrato da Ponte (ponte.openapi.yaml)", () => {
  it("health", async () => {
    ponte.check("/health", "get", await stack.raw("ponte", "/health"));
  });

  it("webhook do CRM: 202, 200 duplicado, 400, 401 (assinatura e janela) e 422 (versão)", async () => {
    // CNPJ inválido de propósito: o evento aceito vai para a fila de falhas e serve aos testes de reprocessamento.
    const event = dealWon();
    const accepted = await stack.postWebhook("crm", event);
    expect(accepted.status).toBe(202);
    ponte.check("/v1/webhooks/crm", "post", accepted);

    const duplicate = await stack.postWebhook("crm", event);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.status).toBe("duplicate");
    expect(duplicate.body.eventId).toBe(accepted.body.eventId);
    ponte.check("/v1/webhooks/crm", "post", duplicate);

    const outsideContract = await stack.postWebhook("crm", { id: randomUUID(), type: "deal.won", version: "1" });
    expect(outsideContract.status).toBe(400);
    expect(outsideContract.body.error.code).toBe("PONTE-REQ-001");
    ponte.check("/v1/webhooks/crm", "post", outsideContract);

    const badSignature = await stack.postWebhook("crm", dealWon(), { secret: "segredo-errado" });
    expect(badSignature.status).toBe(401);
    expect(badSignature.body.error.code).toBe("PONTE-AUTH-001");
    ponte.check("/v1/webhooks/crm", "post", badSignature);

    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const outOfWindow = await stack.postWebhook("crm", dealWon(), { timestamp: old });
    expect(outOfWindow.status).toBe(401);
    expect(outOfWindow.body.error.code).toBe("PONTE-AUTH-002");
    ponte.check("/v1/webhooks/crm", "post", outOfWindow);

    const unsupported = await stack.postWebhook("crm", dealWon({ version: "2" }));
    expect(unsupported.status).toBe(422);
    expect(unsupported.body.error.code).toBe("PONTE-REQ-002");
    ponte.check("/v1/webhooks/crm", "post", unsupported);

    // Nada foi gravado pelas requisições rejeitadas
    expect(await stack.ponte.prisma.event.count()).toBe(1);
  });

  it("webhook do ERP: 202, 200 duplicado, 400, 401 e 422", async () => {
    const event = {
      id: randomUUID(),
      type: "invoice.paid",
      version: "1",
      occurredAt: new Date().toISOString(),
      data: { invoiceId: randomUUID(), orderId: randomUUID(), externalRef: "outro-sistema:1", amountCents: 100, paidAt: new Date().toISOString() },
    };
    const accepted = await stack.postWebhook("erp", event);
    expect(accepted.status).toBe(202);
    ponte.check("/v1/webhooks/erp", "post", accepted);
    const duplicate = await stack.postWebhook("erp", event);
    expect(duplicate.status).toBe(200);
    ponte.check("/v1/webhooks/erp", "post", duplicate);
    const bad = await stack.postWebhook("erp", { ...event, id: randomUUID(), data: {} });
    expect(bad.status).toBe(400);
    ponte.check("/v1/webhooks/erp", "post", bad);
    const unauth = await stack.postWebhook("erp", { ...event, id: randomUUID() }, { signature: "sha256=00" });
    expect(unauth.status).toBe(401);
    ponte.check("/v1/webhooks/erp", "post", unauth);
    const unsupported = await stack.postWebhook("erp", { ...event, id: randomUUID(), version: "9" });
    expect(unsupported.status).toBe(422);
    ponte.check("/v1/webhooks/erp", "post", unsupported);
    // Cobrança que não é da Ponte: ignorada sem retentativa
    await waitFor(async () => (await stack.ponte.prisma.event.findUnique({ where: { id: accepted.body.eventId } }))?.status === "IGNORED", { label: "evento do ERP ignorado" });
  });

  it("administração: eventos, detalhe, reprocessamento, métricas", async () => {
    const unauth = await stack.raw("ponte", "/v1/admin/events");
    expect(unauth.status).toBe(401);
    expect(unauth.body.error.code).toBe("PONTE-ADM-003");
    ponte.check("/v1/admin/events", "get", unauth);

    // Um negócio real, processado até o fim
    const deal = await stack.createWonDeal();
    const processed = await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
    const dead = await stack.ponte.prisma.event.findFirstOrThrow({ where: { type: "deal.won", status: "DEAD" } }).catch(async () => {
      return waitFor(() => stack.ponte.prisma.event.findFirst({ where: { type: "deal.won", status: "DEAD" } }), { label: "evento DEAD" });
    });

    const list = await stack.admin("/events?limit=50");
    expect(list.status).toBe(200);
    ponte.check("/v1/admin/events", "get", list);
    const filtered = await stack.admin("/events?status=DEAD");
    expect(filtered.body.data.every((e: { status: string }) => e.status === "DEAD")).toBe(true);
    ponte.check("/v1/admin/events", "get", filtered);

    const detail = await stack.admin(`/events/${processed.id}`);
    expect(detail.body.attemptLog[0].outcome).toBe("OK");
    ponte.check("/v1/admin/events/{id}", "get", detail);
    const missing = await stack.admin(`/events/${randomUUID()}`);
    expect(missing.status).toBe(404);
    ponte.check("/v1/admin/events/{id}", "get", missing);

    const notDead = await stack.admin(`/events/${processed.id}/reprocess`, { method: "POST" });
    expect(notDead.status).toBe(409);
    expect(notDead.body.error.code).toBe("PONTE-ADM-001");
    ponte.check("/v1/admin/events/{id}/reprocess", "post", notDead);
    const requeued = await stack.admin(`/events/${dead.id}/reprocess`, { method: "POST" });
    expect(requeued.status).toBe(202);
    ponte.check("/v1/admin/events/{id}/reprocess", "post", requeued);
    const reprocessMissing = await stack.admin(`/events/${randomUUID()}/reprocess`, { method: "POST" });
    expect(reprocessMissing.status).toBe(404);
    ponte.check("/v1/admin/events/{id}/reprocess", "post", reprocessMissing);

    const metrics = await stack.admin("/metrics");
    expect(metrics.body.duplicatesIgnored).toBeGreaterThanOrEqual(2);
    ponte.check("/v1/admin/metrics", "get", metrics);
  });

  it("mapeamento: consultar, publicar nova versão (201) e recusar versão inválida (422)", async () => {
    const current = await stack.admin("/mapping");
    expect(current.body.active.version).toBe(1);
    ponte.check("/v1/admin/mapping", "get", current);

    const body = { rules: DEFAULT_MAPPING_RULES, note: "Versão de teste de contrato" };
    const created = await stack.admin("/mapping", { method: "PUT", body: JSON.stringify(body) });
    expect(created.status).toBe(201);
    expect(created.body.version).toBe(2);
    ponte.check("/v1/admin/mapping", "put", created, body);

    const invalid = await stack.admin("/mapping", { method: "PUT", body: JSON.stringify({ rules: [{ target: "customer.taxId", source: "customer.cnpj", transform: "eval" }] }) });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("PONTE-MAP-001");
    ponte.check("/v1/admin/mapping", "put", invalid);

    const after = await stack.admin("/mapping");
    expect(after.body.active.version).toBe(2);
    expect(after.body.history).toHaveLength(2);
  });

  it("reconciliação, divergências e correção assistida", async () => {
    const deal = await stack.createWonDeal({ value: "1.000,00" });
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);

    // Provoca duas divergências: status da cobrança e valor
    await stack.crmApi(`/v1/deals/${deal.id}/billing-status`, { method: "PATCH", body: JSON.stringify({ billingStatus: "NAO_COBRADO" }) });
    const amountDeal = await stack.createWonDeal({ value: "2.000,00" });
    await stack.waitForDealEvent(amountDeal.id, ["PROCESSED"]);
    await stack.crmApi(`/v1/deals/${amountDeal.id}`, { method: "PATCH", body: JSON.stringify({ value: "2.500,00" }) });

    const run = await stack.admin("/reconciliation/run", { method: "POST" });
    expect(run.status).toBe(200);
    expect(run.body.divergencesOpen).toBe(2);
    ponte.check("/v1/admin/reconciliation/run", "post", run);

    const open = await stack.admin("/divergences?status=OPEN");
    ponte.check("/v1/admin/divergences", "get", open);
    const types = open.body.data.map((d: { type: string }) => d.type).sort();
    expect(types).toEqual(["AMOUNT_MISMATCH", "BILLING_STATUS_MISMATCH"]);

    const statusDivergence = open.body.data.find((d: { type: string }) => d.type === "BILLING_STATUS_MISMATCH");
    const resolved = await stack.admin(`/divergences/${statusDivergence.id}/resolve`, { method: "POST" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe("RESOLVED");
    ponte.check("/v1/admin/divergences/{id}/resolve", "post", resolved);
    expect((await stack.getDeal(deal.id)).billingStatus).toBe("ABERTA");

    const amountDivergence = open.body.data.find((d: { type: string }) => d.type === "AMOUNT_MISMATCH");
    const notAssisted = await stack.admin(`/divergences/${amountDivergence.id}/resolve`, { method: "POST" });
    expect(notAssisted.status).toBe(409);
    expect(notAssisted.body.error.code).toBe("PONTE-ADM-004");
    ponte.check("/v1/admin/divergences/{id}/resolve", "post", notAssisted);
    const resolveMissing = await stack.admin(`/divergences/${randomUUID()}/resolve`, { method: "POST" });
    expect(resolveMissing.status).toBe(404);
    ponte.check("/v1/admin/divergences/{id}/resolve", "post", resolveMissing);

    // ERP fora: a reconciliação responde 502 documentado e não altera nada
    stack.erp.chaos.mode = "down";
    const badGateway = await stack.admin("/reconciliation/run", { method: "POST" });
    stack.erp.chaos.mode = "none";
    expect(badGateway.status).toBe(502);
    expect(badGateway.body.error.code).toBe("PONTE-ERP-001");
    ponte.check("/v1/admin/reconciliation/run", "post", badGateway);
  });

  it("catálogo de erros publicado pela API é o mesmo do código", async () => {
    const res = await stack.admin("/errors");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(20);
    ponte.check("/v1/admin/errors", "get", res);
  });

  it("todas as operações do contrato foram exercitadas", () => {
    ponte.assertFullCoverage();
  });
});
