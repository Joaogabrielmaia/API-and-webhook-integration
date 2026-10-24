# Sprint 3 — Visibilidade e consistência

[← Índice das sprints](README.md) · [Planejamento e Scrum](../02-planejamento-e-scrum.md) · Anterior: [Sprint 2](sprint-2.md) · Próxima: [Sprint 4](sprint-4-incremento-v1-1.md)

**Janela planejada (cronograma acadêmico):** 2026-10-19 a 2026-10-23. Release `v1.0.0` (tag de 2026-10-23).

## Objetivo
O financeiro enxerga e controla; os dois lados convergem.

## Planejamento
| Item do backlog | Histórias | Requisitos |
|---|---|---|
| Sincronização de volta (pagamento → CRM) | US-08 | RF-10 |
| Reconciliação agendada e manual | US-09 | RF-12 |
| Painel de integração | US-11, US-10 | RF-11 |
| Catálogo de erros gerado da fonte do código | US-12 | RF-13 |
| Scripts de demonstração, prints e E2E | — | RNF-07 |

Decisão: [ADR-006](../../03-arquitetura/adr/ADR-006-reconciliacao.md). Cortes previstos pela [ordem de corte](../../02-definicao/04-backlog-em-3-sprints.md): edição do mapeamento pelo painel e atualização em tempo real.

## Critérios de conclusão
Cinco tipos de divergência detectados; só o status da cobrança tem correção assistida; painel com eventos, fila de falhas, divergências, mapeamento e catálogo; E2E gera os prints.

## Revisão
Registro em [sprint-3-review.md](../../05-qualidade/sprint-3-review.md) e [reunião de aceitação](../../05-qualidade/reuniao-de-aceitacao.md) (simulada). Gravação da v1.0.0: 177 testes Vitest e 9 E2E passando.

## Retrospectiva
- **Funcionou:** reconciliação que se recusa a concluir quando só vê um lado.
- **Não funcionou:** dois testes de integração instáveis sob carga; em ambos o produto estava certo e o teste, errado (itens 11 e 12).
- **Ação:** testes de tempo afirmam piso, nunca teto; medir só com o relógio da aplicação.

## Cortado
Edição do mapeamento pelo painel (fica na API) e atualização em tempo real.
