import { describe, expect, it } from "vitest";
import { AppError, ERROR_CATALOG, getErrorDefinition } from "./errors";

describe("catálogo de erros (RF-13)", () => {
  it("códigos são únicos", () => {
    const codes = ERROR_CATALOG.map((e) => e.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("toda entrada tem causa e ação preenchidas", () => {
    for (const e of ERROR_CATALOG) {
      expect(e.cause.length, e.code).toBeGreaterThan(10);
      expect(e.action.length, e.code).toBeGreaterThan(5);
    }
  });

  it("o prefixo do código combina com o serviço", () => {
    for (const e of ERROR_CATALOG) expect(e.code.startsWith(`${e.service}-`), e.code).toBe(true);
  });

  it("AppError herda status HTTP e retentabilidade do catálogo", () => {
    const permanent = new AppError("PONTE-VAL-001");
    expect(permanent.retryable).toBe(false);
    const temporary = new AppError("PONTE-ERP-001");
    expect(temporary.retryable).toBe(true);
    expect(new AppError("PONTE-AUTH-001").httpStatus).toBe(401);
    expect(getErrorDefinition("PONTE-ERP-003")?.retryable).toBe(true);
  });

  it("falhas de validação de dados são permanentes e falhas de infraestrutura são temporárias (RN-09)", () => {
    for (const code of ["PONTE-VAL-001", "PONTE-VAL-002", "PONTE-VAL-003", "PONTE-VAL-004", "PONTE-ERP-002", "PONTE-CRM-002"]) {
      expect(getErrorDefinition(code)?.retryable, code).toBe(false);
    }
    for (const code of ["PONTE-ERP-001", "PONTE-ERP-003", "PONTE-ERP-004", "PONTE-CRM-001", "PONTE-SYNC-001"]) {
      expect(getErrorDefinition(code)?.retryable, code).toBe(true);
    }
  });
});
