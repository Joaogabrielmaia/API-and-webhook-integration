import { describe, expect, it } from "vitest";
import { describeDivergence, formatDuration } from "./app";

const base = { id: "1", key: "k", crmDealId: "d", status: "OPEN", firstSeenAt: "", lastSeenAt: "", resolvedAt: null };

describe("painel: formatação", () => {
  it("formata duração em ms e em segundos", () => {
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(219)).toBe("219 ms");
    expect(formatDuration(1500)).toBe("1,5 s");
  });

  it("descreve cada tipo de divergência em português, com os dois lados", () => {
    expect(describeDivergence({ ...base, type: "AMOUNT_MISMATCH", detail: { crmCents: 125000, erpCents: 100000 } })).toContain("R$");
    expect(describeDivergence({ ...base, type: "BILLING_STATUS_MISMATCH", detail: { crmStatus: "ABERTA", erpStatus: "PAGA" } })).toBe("CRM: ABERTA · ERP: PAGA");
    expect(describeDivergence({ ...base, type: "NOT_SYNCED", detail: { eventStatus: null } })).toContain("nunca recebeu");
    expect(describeDivergence({ ...base, type: "NOT_SYNCED", detail: { eventStatus: "DEAD" } })).toContain("Fila de falhas");
  });
});
