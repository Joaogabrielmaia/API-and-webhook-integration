# Sprint 2: confiabilidade

**Meta:** a integração sobrevive a duplicidade, a ERP fora e a evento fora de ordem.

## Entregue

| Item | Histórias | Evidência |
|---|---|---|
| Idempotência por chave de evento, inclusive em paralelo | US-05 | `idempotency.test.ts` (5): duplicata, 10 disparos simultâneos, reenvio pelo CRM, replay na janela, novo "Ganho" do mesmo negócio |
| Fila em PostgreSQL com `SKIP LOCKED` | US-06 | `queue.test.ts` (5), escrito ao final do projeto |
| Retentativa com backoff e histórico de tentativas | US-06 | `backoff.test.ts` (5), `retry-deadletter.test.ts` (10) |
| Fila de falhas e reprocessamento manual | US-07 | `retry-deadletter.test.ts` |
| Evento fora de ordem | US-13 | `out-of-order.test.ts` (2) |
| Segurança do webhook | US-01 | `webhook-security.test.ts` (13), `hmac.test.ts` (15) |
| Mapeamento versionado | US-10 | `mapping.test.ts` de integração (4) |
| Falha injetada: ERP derrubado durante um lote | US-06, US-07 | [falha-injetada.md](falha-injetada.md) |

## Resultado real ao fim da sprint
- 28 testes novos de integração (idempotência, segurança, retentativa) passaram, mais 6 de fora de ordem e mapeamento.
- **Falha injetada, cenário A:** 20 de 20 processados, 16 com retentativa, 0 duplicidade. **Cenário B:** 5 de 5 na fila de falhas, 5 de 5 reprocessados, 0 duplicidade.
- Backoff por cálculo: a política padrão cobre **3 h 01 min** sem jitter e **2 h 25 min** no pior caso do jitter, acima da janela de 2 h do ERP.

## Problemas e decisões
- Dois testes meus estavam errados e foram corrigidos (itens 8 e 9 de [bugs-e-aprendizados.md](bugs-e-aprendizados.md)): pilhas vivas disputando o mesmo banco, e erro de dado virando 500.
- Decisão registrada: o evento **antigo já processado** vence o novo (RN-03): a Ponte não altera pedido existente. A diferença de valor aparece na reconciliação em vez de ser corrigida em silêncio.
- O teste de "ERP lento" ganhou um achado útil: o ERP termina de criar depois que a Ponte desistiu por timeout, e a retentativa não duplica. É exatamente o caso que justifica o `externalRef` ([ADR-003](../03-arquitetura/adr/ADR-003-idempotencia.md)).

## Cortado
Nada.
