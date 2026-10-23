import { describe, expect, it } from "vitest";
import { AppError } from "@ponte/shared";
import { addDays, brasiliaDate, cnpjDigits, dueDateFromTerm, emailLower, moneyToCents, phoneE164BR, trim, type TransformContext } from "./transforms";

const ctx = (): TransformContext => ({ defaultPaymentTermDays: 30, warnings: [] });
const codeOf = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (err) {
    return err instanceof AppError ? err.code : "other";
  }
  return undefined;
};

describe("moneyToCents (D3)", () => {
  it.each([
    ["12.500,50", 1_250_050],
    ["12500,50", 1_250_050],
    ["12500.50", 1_250_050],
    ["R$ 12.500,50", 1_250_050],
    ["12.500", 1_250_000],
    ["999.999", 99_999_900],
    ["12500", 1_250_000],
    ["0,5", 50],
    ["0,05", 5],
    ["99,9", 9_990],
    ["1.000.000,00", 100_000_000],
  ])("converte %s para %i centavos", (input, cents) => {
    expect(moneyToCents(input)).toBe(cents);
  });

  it.each([[""], ["   "], ["abc"], ["-10,00"], ["0"], ["0,00"], ["12,345"], ["12.5.0"], ["1.000.000,01"], ["1.234.567"], ["12,50,10"], ["99999999999999"]])("rejeita %j com PONTE-VAL-002", (input) => {
    expect(codeOf(() => moneyToCents(input))).toBe("PONTE-VAL-002");
  });

  it("não perde centavos com valores que o ponto flutuante erra", () => {
    // 0.1 + 0.2 e 1.15 * 100 são clássicos de erro em float
    expect(moneyToCents("1,15")).toBe(115);
    expect(moneyToCents("0,29")).toBe(29);
    expect(moneyToCents("4.35")).toBe(435);
  });
});

describe("cnpjDigits (D1)", () => {
  it("remove a máscara de um CNPJ válido", () => {
    expect(cnpjDigits("11.222.333/0001-81")).toBe("11222333000181");
    expect(cnpjDigits("11222333000181")).toBe("11222333000181");
  });
  it.each([["11.222.333/0001-82"], ["123"], [""], ["00000000000000"], ["11.222.333/0001-8X"]])("rejeita %j com PONTE-VAL-001", (input) => {
    expect(codeOf(() => cnpjDigits(input))).toBe("PONTE-VAL-001");
  });
});

describe("phoneE164BR (D2)", () => {
  it.each([
    ["(31) 99876-5432", "5531998765432"],
    ["31 3333-4444", "553133334444"],
    ["+55 31 99876-5432", "5531998765432"],
    ["031 99876-5432", "5531998765432"],
    ["55 99999-9999", "5555999999999"], // DDD 55 (RS), 11 dígitos: recebe o prefixo do país
  ])("normaliza %s", (input, expected) => {
    expect(phoneE164BR(input)).toBe(expected);
  });
  it("omite com aviso quando o formato é impossível", () => {
    const c = ctx();
    expect(phoneE164BR("12345", c)).toBeUndefined();
    expect(c.warnings).toHaveLength(1);
  });
  it("vazio é omitido sem aviso", () => {
    const c = ctx();
    expect(phoneE164BR("  ", c)).toBeUndefined();
    expect(c.warnings).toHaveLength(0);
  });
});

describe("emailLower (D5)", () => {
  it("usa minúsculas e remove espaços", () => {
    expect(emailLower("  Financeiro@Solar.EXAMPLE ")).toBe("financeiro@solar.example");
  });
  it("omite com aviso quando inválido", () => {
    const c = ctx();
    expect(emailLower("sem-arroba", c)).toBeUndefined();
    expect(c.warnings).toHaveLength(1);
  });
});

describe("trim", () => {
  it("devolve undefined para texto vazio", () => {
    expect(trim("   ")).toBeUndefined();
    expect(trim(null)).toBeUndefined();
    expect(trim("  Aurora ")).toBe("Aurora");
  });
});

describe("vencimento (D4)", () => {
  it("soma o prazo à data do ganho", () => {
    expect(dueDateFromTerm("2026-03-10T14:20:00.000Z", 30)).toBe("2026-04-09");
    expect(dueDateFromTerm("2026-03-10T14:20:00.000Z", 0)).toBe("2026-03-10");
    expect(dueDateFromTerm("2026-01-31T12:00:00.000Z", 1)).toBe("2026-02-01");
  });
  it("usa o fuso de Brasília para a data do ganho", () => {
    // 02:30 UTC de 11/03 ainda é 10/03 às 23:30 em Brasília
    expect(brasiliaDate("2026-03-11T02:30:00.000Z")).toBe("2026-03-10");
    expect(dueDateFromTerm("2026-03-11T02:30:00.000Z", 0)).toBe("2026-03-10");
  });
  it("prazo ausente usa o padrão de 30 dias (RN-05)", () => {
    expect(dueDateFromTerm("2026-03-10T14:20:00.000Z", null)).toBe("2026-04-09");
    expect(dueDateFromTerm("2026-03-10T14:20:00.000Z", undefined)).toBe("2026-04-09");
  });
  it.each([[-1], [91], [1.5], ["abc"]])("rejeita prazo %j com PONTE-VAL-003", (term) => {
    expect(codeOf(() => dueDateFromTerm("2026-03-10T14:20:00.000Z", term))).toBe("PONTE-VAL-003");
  });
  it("atravessa a virada de ano", () => {
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });
});
