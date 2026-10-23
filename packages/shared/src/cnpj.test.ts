import { describe, expect, it } from "vitest";
import { cnpjFromBase, formatCnpj, isValidCnpj, onlyDigits } from "./cnpj";

describe("CNPJ", () => {
  it("valida CNPJs com dígitos verificadores corretos, com ou sem máscara", () => {
    expect(isValidCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCnpj("11222333000181")).toBe(true);
    expect(isValidCnpj("45.723.174/0001-10")).toBe(true);
  });

  it("rejeita dígito verificador errado, tamanho errado e sequências repetidas", () => {
    expect(isValidCnpj("11.222.333/0001-80")).toBe(false);
    expect(isValidCnpj("11222333000")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
    for (let d = 0; d <= 9; d++) expect(isValidCnpj(String(d).repeat(14))).toBe(false);
  });

  it("gera CNPJ válido a partir de 12 dígitos-base e formata", () => {
    const cnpj = cnpjFromBase("112223330001");
    expect(cnpj).toBe("11222333000181");
    expect(formatCnpj(cnpj)).toBe("11.222.333/0001-81");
    for (let i = 1; i <= 50; i++) expect(isValidCnpj(cnpjFromBase(String(i * 7919)))).toBe(true);
  });

  it("onlyDigits remove tudo que não é dígito", () => {
    expect(onlyDigits("11.222.333/0001-81")).toBe("11222333000181");
  });
});
