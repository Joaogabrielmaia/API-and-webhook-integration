import { describe, expect, it } from "vitest";
import { billingStatusFromInvoice, invoiceStatusFor } from "./rules";

describe("RN-06: conferência a partir de R$ 50.000,00", () => {
  const threshold = 5_000_000;
  it("abaixo do limite a cobrança nasce ABERTA", () => {
    expect(invoiceStatusFor(4_999_999, threshold)).toBe("ABERTA");
  });
  it("no limite e acima a cobrança nasce EM_CONFERENCIA", () => {
    expect(invoiceStatusFor(5_000_000, threshold)).toBe("EM_CONFERENCIA");
    expect(invoiceStatusFor(9_999_999, threshold)).toBe("EM_CONFERENCIA");
  });
});

describe("status da cobrança do ERP no vocabulário do CRM", () => {
  it.each([
    ["EM_CONFERENCIA", "EM_CONFERENCIA"],
    ["ABERTA", "ABERTA"],
    ["PAGA", "PAGO"],
    ["QUALQUER_OUTRO", "NAO_COBRADO"],
  ])("%s → %s", (erp, crm) => {
    expect(billingStatusFromInvoice(erp)).toBe(crm);
  });
});
