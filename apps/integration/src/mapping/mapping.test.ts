import { describe, expect, it } from "vitest";
import { AppError } from "@ponte/shared";
import { DEFAULT_MAPPING_RULES } from "./defaults";
import { applyMapping, validateMappingRules, type MappingRule } from "./engine";

const data = (over: { deal?: Record<string, unknown>; customer?: Record<string, unknown> } = {}) => ({
  deal: { id: "d1", title: "Contrato de manutenção anual", value: "12.500,50", paymentTermDays: 30, wonAt: "2026-03-10T14:20:00.000Z", version: 3, ...over.deal },
  customer: { id: "c1", name: "Condomínio Edifício Solar", cnpj: "11.222.333/0001-81", phone: "(31) 99876-5432", email: "Financeiro@Solar.example", ...over.customer },
});
const opts = { defaultPaymentTermDays: 30 };
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (err) {
    return err instanceof AppError ? err.code : "other";
  }
  return undefined;
};

describe("applyMapping com o mapeamento padrão (v1)", () => {
  it("converte o evento do exemplo da documentação", () => {
    const { output, warnings } = applyMapping(DEFAULT_MAPPING_RULES, data(), opts);
    expect(output).toEqual({
      customer: { taxId: "11222333000181", name: "Condomínio Edifício Solar", phone: "5531998765432", email: "financeiro@solar.example" },
      order: { description: "Contrato de manutenção anual", totalCents: 1_250_050 },
      invoice: { dueDate: "2026-04-09" },
    });
    expect(warnings).toEqual([]);
  });

  it("telefone e e-mail são opcionais: ausentes não geram erro", () => {
    const { output } = applyMapping(DEFAULT_MAPPING_RULES, data({ customer: { phone: null, email: undefined } }), opts);
    expect(output.customer.phone).toBeUndefined();
    expect(output.customer.email).toBeUndefined();
  });

  it("telefone impossível é omitido com aviso, sem bloquear", () => {
    const { output, warnings } = applyMapping(DEFAULT_MAPPING_RULES, data({ customer: { phone: "123" } }), opts);
    expect(output.customer.phone).toBeUndefined();
    expect(warnings).toHaveLength(1);
  });

  it("CNPJ inválido é erro permanente PONTE-VAL-001", () => {
    expect(codeOf(() => applyMapping(DEFAULT_MAPPING_RULES, data({ customer: { cnpj: "11.222.333/0001-99" } }), opts))).toBe("PONTE-VAL-001");
  });

  it("valor inválido é PONTE-VAL-002 e prazo inválido é PONTE-VAL-003", () => {
    expect(codeOf(() => applyMapping(DEFAULT_MAPPING_RULES, data({ deal: { value: "abc" } }), opts))).toBe("PONTE-VAL-002");
    expect(codeOf(() => applyMapping(DEFAULT_MAPPING_RULES, data({ deal: { paymentTermDays: 120 } }), opts))).toBe("PONTE-VAL-003");
  });

  it("campo obrigatório vazio na origem é PONTE-VAL-004", () => {
    expect(codeOf(() => applyMapping(DEFAULT_MAPPING_RULES, data({ customer: { name: "   " } }), opts))).toBe("PONTE-VAL-004");
  });

  it("prazo ausente usa o padrão", () => {
    const { output } = applyMapping(DEFAULT_MAPPING_RULES, data({ deal: { paymentTermDays: null } }), opts);
    expect(output.invoice.dueDate).toBe("2026-04-09");
  });
});

describe("validateMappingRules (ADR-008)", () => {
  it("aceita o mapeamento padrão", () => {
    expect(validateMappingRules(DEFAULT_MAPPING_RULES)).toHaveLength(DEFAULT_MAPPING_RULES.length);
  });

  it("recusa transformação fora da lista permitida", () => {
    const rules: MappingRule[] = DEFAULT_MAPPING_RULES.map((r) => (r.target === "order.description" ? { ...r, transform: "eval" } : r));
    expect(codeOf(() => validateMappingRules(rules))).toBe("PONTE-MAP-001");
  });

  it("recusa destino fora da lista permitida", () => {
    const rules: MappingRule[] = [...DEFAULT_MAPPING_RULES, { target: "customer.password", source: "customer.name", transform: "trim" }];
    expect(codeOf(() => validateMappingRules(rules))).toBe("PONTE-MAP-001");
  });

  it("recusa mapeamento que não cobre um destino obrigatório", () => {
    const rules = DEFAULT_MAPPING_RULES.filter((r) => r.target !== "order.totalCents");
    expect(codeOf(() => validateMappingRules(rules))).toBe("PONTE-MAP-001");
  });

  it("recusa dois destinos iguais", () => {
    expect(codeOf(() => validateMappingRules([...DEFAULT_MAPPING_RULES, DEFAULT_MAPPING_RULES[0]]))).toBe("PONTE-MAP-001");
  });

  it("aceita trocar a origem de um campo (ex.: valor vindo de outro campo do CRM)", () => {
    const rules = DEFAULT_MAPPING_RULES.map((r) => (r.target === "order.totalCents" ? { ...r, source: "deal.amount" } : r));
    const validated = validateMappingRules(rules);
    const { output } = applyMapping(validated, data({ deal: { amount: "100,00" } }), opts);
    expect(output.order.totalCents).toBe(10_000);
  });
});
