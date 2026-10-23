// Constantes de teste: não são segredos, existem só dentro da suíte de testes e da pilha E2E.
export const KEYS = {
  crmApi: "test-crm-api-key",
  erpApi: "test-erp-api-key",
  admin: "test-admin-key",
  crmSecret: "test-crm-webhook-secret",
  erpSecret: "test-erp-webhook-secret",
} as const;
