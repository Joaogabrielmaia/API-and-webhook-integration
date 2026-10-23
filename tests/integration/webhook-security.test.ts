import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { signPayload } from "@ponte/shared";
import { KEYS, Stack } from "../helpers/stack";

let stack: Stack;

beforeAll(async () => {
  stack = await Stack.start({ ponte: { worker: { enabled: false } } });
});
afterAll(async () => {
  await stack?.close();
});
beforeEach(async () => {
  await stack.reset();
  stack.ponte.worker.pause();
});

const stored = () => stack.ponte.prisma.event.count();

describe("US-01 / ADR-009: segurança do webhook", () => {
  it("evento com assinatura e timestamp válidos é aceito e gravado antes do 202", async () => {
    const deal = await stack.createDeal();
    const event = await stack.buildDealWonEvent(deal.id);
    const res = await stack.postWebhook("crm", event);
    expect(res.status).toBe(202);
    const row = await stack.ponte.prisma.event.findUniqueOrThrow({ where: { id: res.body.eventId } });
    expect(row).toMatchObject({ status: "RECEIVED", source: "CRM", type: "deal.won", entityId: deal.id });
    expect(await stack.ponte.prisma.job.count({ where: { eventId: row.id, state: "PENDING" } })).toBe(1);
  });

  it("assinatura calculada com segredo errado: 401 PONTE-AUTH-001 e nada gravado", async () => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const res = await stack.postWebhook("crm", event, { secret: "segredo-errado" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("PONTE-AUTH-001");
    expect(await stored()).toBe(0);
  });

  it("corpo adulterado depois de assinado: 401", async () => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(KEYS.crmSecret, timestamp, JSON.stringify(event));
    const tampered = JSON.stringify({ ...event, data: { ...event.data, deal: { ...event.data.deal, value: "999.999,00" } } });
    const res = await stack.postWebhook("crm", event, { timestamp, signature, rawBody: tampered });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("PONTE-AUTH-001");
    expect(await stored()).toBe(0);
  });

  it("assinatura reformatando o JSON (espaços) também falha: vale o corpo bruto, não o objeto", async () => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signPayload(KEYS.crmSecret, timestamp, JSON.stringify(event));
    const res = await stack.postWebhook("crm", event, { timestamp, signature, rawBody: JSON.stringify(event, null, 2) });
    expect(res.status).toBe(401);
  });

  it("segredo do ERP não vale no endpoint do CRM e vice-versa", async () => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const res = await stack.postWebhook("crm", event, { secret: KEYS.erpSecret });
    expect(res.status).toBe(401);
  });

  it.each([
    ["muito antigo", -3600],
    ["no limite acima (301 s)", -301],
    ["futuro distante", 3600],
  ])("timestamp %s: 401 PONTE-AUTH-002", async (_label, offset) => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const res = await stack.postWebhook("crm", event, { timestamp: String(Math.floor(Date.now() / 1000) + offset) });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("PONTE-AUTH-002");
    expect(await stored()).toBe(0);
  });

  it("cabeçalhos de assinatura ausentes: 401", async () => {
    const res = await fetch(`${stack.urls.ponte}/v1/webhooks/crm`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    expect(res.status).toBe(401);
  });

  it("X-Event-Id diferente do id do corpo: 400 PONTE-REQ-001", async () => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const res = await stack.postWebhook("crm", event, { eventIdHeader: "3f1c6f0a-0000-4000-8000-000000000000" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PONTE-REQ-001");
  });

  it("corpo que não é JSON, mesmo bem assinado: 400", async () => {
    const res = await stack.postWebhook("crm", { id: "x" }, { rawBody: "isto não é json" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("PONTE-REQ-001");
  });

  it("versão de evento desconhecida: 422 PONTE-REQ-002 e nada gravado", async () => {
    const event = await stack.buildDealWonEvent((await stack.createDeal()).id);
    const res = await stack.postWebhook("crm", { ...event, version: "2" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("PONTE-REQ-002");
    expect(await stored()).toBe(0);
  });

  it("rotas administrativas exigem X-Admin-Key (ausente ou errada: 401 PONTE-ADM-003)", async () => {
    const missing = await stack.raw("ponte", "/v1/admin/events");
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe("PONTE-ADM-003");
    const wrong = await stack.raw("ponte", "/v1/admin/events", { headers: { "x-admin-key": "errada" } });
    expect(wrong.status).toBe(401);
    // a chave de API do ERP ou do CRM não abre a administração
    const crmKey = await stack.raw("ponte", "/v1/admin/events", { headers: { "x-admin-key": KEYS.crmApi } });
    expect(crmKey.status).toBe(401);
    expect((await stack.admin("/events")).status).toBe(200);
  });
});
