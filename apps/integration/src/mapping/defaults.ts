import type { MappingRule } from "./engine";

/** Mapeamento da versão 1 (semente). Ver docs/01-discovery/07-mapa-de-dados.md. */
export const DEFAULT_MAPPING_RULES: MappingRule[] = [
  { target: "customer.taxId", source: "customer.cnpj", transform: "cnpjDigits", required: true },
  { target: "customer.name", source: "customer.name", transform: "trim", required: true },
  { target: "customer.phone", source: "customer.phone", transform: "phoneE164BR", required: false },
  { target: "customer.email", source: "customer.email", transform: "emailLower", required: false },
  { target: "order.description", source: "deal.title", transform: "trim", required: true },
  { target: "order.totalCents", source: "deal.value", transform: "moneyToCents", required: true },
  { target: "invoice.dueDate", source: ["deal.wonAt", "deal.paymentTermDays"], transform: "dueDateFromTerm", required: true },
];
