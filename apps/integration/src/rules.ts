/** Regras de negócio (docs/02-definicao/03-regras-de-negocio.md). Ficam no código, não na configuração (ADR-008). */

/** RN-04: até R$ 1.000.000,00, em centavos. */
export const MAX_VALUE_CENTS = 100_000_000;
/** RN-05: prazo de 0 a 90 dias. */
export const MIN_TERM_DAYS = 0;
export const MAX_TERM_DAYS = 90;
export const DEFAULT_TERM_DAYS = 30;

export type InvoiceStatus = "ABERTA" | "EM_CONFERENCIA";

/** RN-06: valor igual ou acima do limite gera cobrança em conferência. */
export function invoiceStatusFor(totalCents: number, thresholdCents: number): InvoiceStatus {
  return totalCents >= thresholdCents ? "EM_CONFERENCIA" : "ABERTA";
}

export type CrmBillingStatus = "NAO_COBRADO" | "EM_CONFERENCIA" | "ABERTA" | "PAGO";

/** Tradução do status da cobrança do ERP para o vocabulário do CRM. */
export function billingStatusFromInvoice(erpStatus: string): CrmBillingStatus {
  switch (erpStatus) {
    case "EM_CONFERENCIA":
      return "EM_CONFERENCIA";
    case "PAGA":
      return "PAGO";
    case "ABERTA":
      return "ABERTA";
    default:
      return "NAO_COBRADO";
  }
}
