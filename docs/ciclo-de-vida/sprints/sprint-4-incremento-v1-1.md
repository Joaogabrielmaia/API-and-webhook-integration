# Sprint 4 — Incremento v1.1 (alerta de fila parada)

[← Índice das sprints](README.md) · [Planejamento e Scrum](../02-planejamento-e-scrum.md) · Anterior: [Sprint 3](sprint-3.md)

**Janela planejada (cronograma acadêmico):** 2026-10-23. Release `v1.1.0` (tag de 2026-10-23).

## Objetivo
Fechar o risco R-07 (fila parada sem ninguém ver) com a menor mudança possível, vinda da aceitação e da retrospectiva.

## Planejamento
| Item | Origem | Decisão |
|---|---|---|
| Alerta de fila parada e de fila de falhas (dead-letter) com itens esperando | Melhoria 1 da [retrospectiva](../../06-pos-lancamento/retrospectiva.md) | Implementar |
| Evento de liberação de conferência | Melhoria 2 | Roadmap |
| Dois segredos de webhook | Melhoria 3 | Roadmap |

Decisão: [ADR-012](../../03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md): alerta calculado sob demanda, sem notificação ativa.

## Critérios de conclusão
Mudança aditiva (OpenAPI da Ponte `1.0.0` → `1.1.0`), sem migração de banco; testes unitários e de integração do alerta; teste de contrato cobrindo `/v1/admin/alerts`; print do banner.

## Revisão
[PR da v1.1](../../06-pos-lancamento/pr-v1.1.md) e [CHANGELOG](../../06-pos-lancamento/CHANGELOG.md): 8 testes unitários e 8 de integração novos; a cobertura de contrato passou de 43 para 44 operações. Prints [16](../../screenshots/16-painel-alerta-de-fila-parada.png) e [17](../../screenshots/17-painel-alerta-critico.png).

## Retrospectiva
- **Funcionou:** a API de alertas é o que uma notificação futura consumiria.
- **Limite aceito:** continua dependendo de alguém olhar o painel ou consultar a API.
- **Ação:** notificação ativa e janelas de silêncio ficam no [roadmap](../../06-pos-lancamento/roadmap.md).
