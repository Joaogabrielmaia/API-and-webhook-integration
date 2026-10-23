# 07 — Rastreabilidade

Do problema ao teste. A coluna "Teste" aponta para arquivos que existem neste repositório; os resultados reais estão em [05-qualidade](../05-qualidade/).

| Necessidade | RF/RNF | Regras | História | ADR | Componente | Teste |
|---|---|---|---|---|---|---|
| Evento chega seguro | RF-01, RF-02, RNF-04 | RN-01 | US-01 | ADR-009 | `apps/integration/src/webhooks` | `tests/integration/webhook-security.test.ts` |
| Cliente sem duplicar | RF-04 | RN-02 | US-02 | ADR-003 | `apps/integration/src/handlers/deal-won.ts` | `tests/integration/happy-path.test.ts` |
| Pedido e cobrança certos | RF-05, RF-07 | RN-04, RN-05, RN-06 | US-03, US-10 | ADR-008 | `apps/integration/src/mapping` | `apps/integration/src/mapping/mapping.test.ts`, `packages/shared/src/cnpj.test.ts` |
| IDs no CRM | RF-06 | RN-01 | US-04 | ADR-003 | `apps/integration/src/clients/crm-client.ts` | `tests/integration/happy-path.test.ts` |
| Não duplicar por reenvio | RF-03 | RN-03 | US-05 | ADR-003 | `apps/integration/src/webhooks`, unicidade no banco | `tests/integration/idempotency.test.ts` |
| Sobreviver a ERP fora | RF-08, RNF-03 | RN-09 | US-06 | ADR-002, ADR-004 | `apps/integration/src/queue` | `apps/integration/src/queue/backoff.test.ts`, `tests/integration/queue.test.ts`, `tests/integration/retry-deadletter.test.ts`, `tests/failure/erp-down-batch.test.ts` |
| Ver e reprocessar falhas | RF-09 | RN-09, RN-10 | US-07 | ADR-005 | `apps/integration/src/routes/admin.ts` | `tests/integration/retry-deadletter.test.ts` |
| Saber se pagou | RF-10 | RN-08 | US-08 | ADR-001 | `apps/integration/src/handlers/invoice-paid.ts` | `tests/integration/payment-sync.test.ts` |
| Achar divergências | RF-12, RNF-09 | RN-11 | US-09 | ADR-006 | `apps/integration/src/reconciliation` | `tests/integration/reconciliation.test.ts` |
| Evento antigo não vence | RF-14 | RN-07 | US-13 | ADR-003 | `apps/integration/src/handlers/deal-won.ts` | `tests/integration/out-of-order.test.ts` |
| Fila parada sem ninguém ver (v1.1) | RF-11, RNF-01, RNF-05 | — | — | ADR-012 | `apps/integration/src/alerts.ts`, `apps/console` | `apps/integration/src/alerts.test.ts`, `tests/integration/alerts.test.ts`, `e2e/console.spec.ts` |
| Painel | RF-11, RNF-05 | — | US-11 | ADR-010 | `apps/console` | `e2e/console.spec.ts`, `apps/console/src/app.test.ts` |
| Catálogo de erros | RF-13 | — | US-12 | — | `packages/shared/src/errors.ts` | `packages/shared/src/errors.test.ts`, `scripts/generate-error-catalog.ts` |
| Contratos | RNF-06, RNF-08 | — | — | ADR-007 | `docs/04-contratos-de-api/*.yaml` | `tests/contract/*.contract.test.ts` |
