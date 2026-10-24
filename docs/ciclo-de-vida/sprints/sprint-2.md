# Sprint 2 — Confiabilidade

[← Índice das sprints](README.md) · [Planejamento e Scrum](../02-planejamento-e-scrum.md) · Anterior: [Sprint 1](sprint-1.md) · Próxima: [Sprint 3](sprint-3.md)

**Janela planejada (cronograma acadêmico):** 2026-10-05 a 2026-10-16.

## Objetivo
A integração sobrevive a duplicidade, a ERP fora e a evento fora de ordem.

## Planejamento
| Item do backlog | Histórias | Requisitos |
|---|---|---|
| Idempotência por chave de evento, inclusive em paralelo | US-05 | RF-03 |
| Fila em PostgreSQL com `SKIP LOCKED` | US-06 | RF-08, RNF-02 |
| Retentativa com backoff e registro de tentativas | US-06 | RF-08, RNF-03 |
| Fila de falhas (dead-letter) e reprocessamento manual | US-07 | RF-09 |
| Evento fora de ordem | US-13 | RF-14 |
| Teste de falha injetada | US-06, US-07 | RNF-02, RNF-03 |

Decisões: [ADR-001](../../03-arquitetura/adr/ADR-001-eventos-vs-consulta-periodica.md), [ADR-003](../../03-arquitetura/adr/ADR-003-idempotencia.md), [ADR-004](../../03-arquitetura/adr/ADR-004-retentativa-com-backoff.md), [ADR-005](../../03-arquitetura/adr/ADR-005-fila-de-falhas.md).

## Critérios de conclusão
Evento repetido não gera nada novo; o ERP derrubado no meio de um lote não perde nem duplica; a janela de retentativa cobre mais de 2 h por cálculo; erro permanente vai direto à fila de falhas.

## Revisão
Registro em [sprint-2-review.md](../../05-qualidade/sprint-2-review.md). Falha injetada, cenário A: 20 de 20 processados, 16 com retentativa, 0 duplicidade; cenário B: 5 de 5 na fila de falhas e 5 de 5 reprocessados ([relato](../../05-qualidade/falha-injetada.md)).

## Retrospectiva
- **Funcionou:** o teste que derruba o ERP de verdade expôs o caso do ERP lento, justificando a terceira camada de idempotência.
- **Não funcionou:** dois testes estavam errados (pilhas vivas no mesmo banco; erro de dado virando 500).
- **Ação:** cada cenário fecha a própria pilha antes do próximo; o status HTTP vem do catálogo de erros (itens 8 e 9).

## Impedimentos
Worker de um teste processando eventos de outro (item 8); `PONTE-VAL-004` sem status HTTP (item 9).
