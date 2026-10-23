# 04 — Modos de falha e recuperação

| # | Modo de falha | Como a Ponte reage | Estado final | Como recupera | Prova |
|---|---|---|---|---|---|
| F1 | **ERP fora** (recusa conexão, 503, timeout de 10 s) | Classifica como temporário (`PONTE-ERP-001/003`), registra a tentativa, agenda a próxima com backoff | `RETRYING`; se esgotar 12 tentativas, `DEAD` | Volta sozinho quando o ERP volta; se `DEAD`, reprocessamento manual | `tests/failure/erp-down-batch.test.ts`, `tests/integration/retry-deadletter.test.ts` |
| F2 | **Evento duplicado** (reenvio do CRM, retry de rede, disparo concorrente) | Unicidade da chave no banco; resposta `200 duplicate`; incrementa `duplicateCount` | O original segue seu curso | Nada a fazer | `tests/integration/idempotency.test.ts` |
| F3 | **Evento fora de ordem** (versão 3 chega depois da 5; ou pagamento chega antes do vínculo) | Versão menor é ignorada (`PONTE-SYNC-002`); pagamento sem vínculo é retentado (`PONTE-SYNC-001`) | `IGNORED` ou `PROCESSED` após retentativa | Automática | `tests/integration/out-of-order.test.ts`, `tests/integration/payment-sync.test.ts` |
| F4 | **Dado inválido** (CNPJ, valor, prazo) | Erro permanente, sem retentativa | `DEAD` com código e causa | Corrigir o dado no CRM e reenviar o evento, ou reprocessar após ajustar o mapeamento | `tests/integration/retry-deadletter.test.ts` |
| F5 | **CRM fora no retorno** | Temporário (`PONTE-CRM-001`); pedido e cobrança já existem e ficam vinculados | `RETRYING` → `PROCESSED` | Retentativa reaproveita os IDs; ERP responde "replay" | `tests/integration/happy-path.test.ts` (cenário de retorno) |
| F6 | **Webhook perdido** (ERP não reenvia; Ponte estava fora) | Não há como a Ponte saber | Divergência | **Reconciliação** abre `NOT_SYNCED` ou `BILLING_STATUS_MISMATCH` | `tests/integration/reconciliation.test.ts` |
| F7 | **Worker cai no meio de um job** | O job fica `RUNNING` com `lockedAt`; após o prazo de bloqueio outro ciclo o retoma | Sem perda | Retomada automática; passos são idempotentes | `tests/integration/retry-deadletter.test.ts` (recuperação de job preso) |
| F8 | **Assinatura inválida ou replay fora da janela** | Rejeita com 401, nada é gravado | — | — | `tests/integration/webhook-security.test.ts` |
| F9 | **Ponte fora quando o CRM envia** | O CRM registra a entrega como falha e permite reenvio manual | Evento não entra | Reenvio no CRM ou reconciliação | `tests/integration/reconciliation.test.ts` |

## O que a Ponte **não** garante
- **Entrega exatamente uma vez** de ponta a ponta: o que existe é *pelo-menos-uma-vez + idempotência*, que na prática produz o mesmo efeito para estes passos.
- **Atomicidade entre ERP e CRM**: não existe transação distribuída. A convergência é eventual, com reconciliação como rede de segurança.
- **Alterações posteriores** em pedido ou cobrança já criados (fora do escopo).
