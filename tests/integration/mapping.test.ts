import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_MAPPING_RULES } from "@ponte/integration";
import { Stack } from "../helpers/stack";

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

const putMapping = (rules: unknown, note?: string) => stack.admin("/mapping", { method: "PUT", body: JSON.stringify({ rules, note }) });

describe("US-10 / ADR-008: mapeamento configurável e versionado", () => {
  it("nova versão vale para os próximos eventos e a anterior fica no histórico", async () => {
    const before = await stack.createWonDeal({ title: "Contrato A", name: "Cliente Um" });
    await stack.waitForDealEvent(before.id, ["PROCESSED"]);
    expect((await stack.erpApi("/v1/orders")).body.data[0].description).toBe("Contrato A");

    // v2: a descrição do pedido passa a vir do nome do cliente
    const v2 = DEFAULT_MAPPING_RULES.map((r) => (r.target === "order.description" ? { ...r, source: "customer.name" } : r));
    const res = await putMapping(v2, "Descrição do pedido = nome do cliente");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 2, active: true });

    const after = await stack.createWonDeal({ title: "Contrato B", name: "Cliente Dois" });
    await stack.waitForDealEvent(after.id, ["PROCESSED"]);
    const orders = (await stack.erpApi("/v1/orders")).body.data as { externalRef: string; description: string }[];
    expect(orders.find((o) => o.externalRef === `ponte:deal:${after.id}`)!.description).toBe("Cliente Dois");
    expect(orders.find((o) => o.externalRef === `ponte:deal:${before.id}`)!.description).toBe("Contrato A"); // pedido antigo intacto

    const history = (await stack.admin("/mapping")).body;
    expect(history.active.version).toBe(2);
    expect(history.history.map((h: { version: number }) => h.version)).toEqual([2, 1]);
    expect(history.history[1].active).toBe(false);
  });

  it("mapeamento com transformação fora da lista, destino fora da lista ou sem destino obrigatório é recusado e não altera a versão ativa", async () => {
    const withEval = DEFAULT_MAPPING_RULES.map((r) => (r.target === "order.description" ? { ...r, transform: "eval" } : r));
    const withUnknownTarget = [...DEFAULT_MAPPING_RULES, { target: "customer.senha", source: "customer.name", transform: "trim" }];
    const missingRequired = DEFAULT_MAPPING_RULES.filter((r) => r.target !== "invoice.dueDate");
    for (const rules of [withEval, withUnknownTarget, missingRequired]) {
      const res = await putMapping(rules);
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("PONTE-MAP-001");
    }
    expect((await stack.admin("/mapping")).body.active.version).toBe(1);
  });

  it("mapeamento que passa na validação mas não consegue mapear o evento de exemplo também é recusado", async () => {
    // origem inexistente em campo obrigatório: o evento de exemplo não teria valor
    const broken = DEFAULT_MAPPING_RULES.map((r) => (r.target === "order.totalCents" ? { ...r, source: "deal.campoQueNaoExiste" } : r));
    const res = await putMapping(broken);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("PONTE-MAP-001");
    expect(res.body.error.details.cause).toBe("PONTE-VAL-004");
    expect((await stack.admin("/mapping")).body.active.version).toBe(1);
  });

  it("campo opcional tornado obrigatório na v2: eventos sem telefone passam a ir para a fila de falhas com PONTE-VAL-004", async () => {
    const strict = DEFAULT_MAPPING_RULES.map((r) => (r.target === "customer.phone" ? { ...r, required: true } : r));
    expect((await putMapping(strict)).status).toBe(201);
    const deal = await stack.createWonDeal({ phone: null });
    const dead = await stack.waitForDealEvent(deal.id, ["DEAD"]);
    expect(dead.lastErrorCode).toBe("PONTE-VAL-004");
    expect(dead.lastErrorMessage).toContain("customer.phone");

    // Voltar ao mapeamento anterior (publicando a v1 como nova versão) e reprocessar resolve.
    expect((await putMapping(DEFAULT_MAPPING_RULES, "Reverte para as regras da v1")).status).toBe(201);
    expect((await stack.admin(`/events/${dead.id}/reprocess`, { method: "POST" })).status).toBe(202);
    await stack.waitForDealEvent(deal.id, ["PROCESSED"]);
  });
});
