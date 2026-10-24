# Sprint 1 — Fluxo feliz e fundação

[← Índice das sprints](README.md) · [Planejamento e Scrum](../02-planejamento-e-scrum.md) · Próxima: [Sprint 2](sprint-2.md)

**Janela planejada (cronograma acadêmico):** 2026-09-21 a 2026-10-02.

## Objetivo
Negócio ganho no CRM vira cliente, pedido e cobrança no ERP, e os IDs voltam ao CRM.

## Planejamento
| Item do backlog | Histórias | Requisitos |
|---|---|---|
| CRM simples com webhook ao marcar Ganho | US-01 | RF-01 |
| ERP simples: clientes, pedidos, cobranças | US-02, US-03 | RF-04, RF-05 |
| Ponte: webhook com HMAC, gravação e 202 | US-01 | RF-01, RF-02 |
| Ponte: mapeamento, validações e transformações | US-03, US-10 | RF-07 |
| Ponte: cliente por CNPJ, pedido e cobrança, retorno ao CRM | US-02 a US-04 | RF-04 a RF-06 |
| Contratos OpenAPI e testes de contrato | — | RNF-06, RNF-08 |

Decisões de arquitetura tomadas no planejamento: [ADR-002](../../03-arquitetura/adr/ADR-002-fila-em-banco-vs-broker.md) (fila em PostgreSQL), [ADR-007](../../03-arquitetura/adr/ADR-007-versionamento-da-api.md), [ADR-008](../../03-arquitetura/adr/ADR-008-mapeamento-configuravel.md), [ADR-009](../../03-arquitetura/adr/ADR-009-seguranca-do-webhook.md), [ADR-010](../../03-arquitetura/adr/ADR-010-fastify-vs-next.md) e [ADR-011](../../03-arquitetura/adr/ADR-011-execucao-local.md).

## Critérios de conclusão
O fluxo ganho → cliente, pedido e cobrança → IDs no CRM roda ponta a ponta; os três contratos OpenAPI existem e todas as operações têm teste de contrato; vale a [Definition of Done](../02-planejamento-e-scrum.md#definition-of-done).

## Revisão
Registro em [sprint-1-review.md](../../05-qualidade/sprint-1-review.md): 96 testes unitários, 5 de integração do fluxo feliz e 18 de contrato passaram na época (43 de 43 operações; hoje são 44, com o endpoint de alertas da v1.1). Os contratos foram escritos antes do código, e os testes de contrato acharam duas inconsistências reais.

## Retrospectiva
- **Funcionou:** contrato antes do código.
- **Não saiu como previsto:** fila, worker, reconciliação e API administrativa já nasceram nesta sprint, porque o fluxo feliz precisava rodar fora da requisição.
- **Ação:** isolar bancos por projeto de teste e tratar a unicidade de CNPJ no ERP, não no vínculo (itens 2, 6 e 7 do [registro de problemas](../../05-qualidade/bugs-e-aprendizados.md)).

## Impedimentos
Porta 5440 ocupada (item 1); `CustomerLink.taxId` único por engano (item 2, migração `0002`).
