# Sprint 1: fluxo feliz e fundação

> Sprint como marco de entrega, sem duração registrada (ver [backlog](../02-definicao/04-backlog-em-3-sprints.md)).

**Meta:** negócio ganho no CRM vira cliente, pedido e cobrança no ERP, e os IDs voltam ao CRM.

## Entregue

| Item | Histórias | Evidência |
|---|---|---|
| CRM simples: clientes, negócios, etapas, webhook `deal.won` assinado | US-01 | `apps/mock-crm`; `crm.contract.test.ts` |
| ERP simples: clientes, pedidos, cobranças, idempotência por `externalRef`, webhook `invoice.paid`, modo de falha | US-02, US-03 | `apps/mock-erp`; `erp.contract.test.ts` |
| Ponte: webhook com HMAC, gravação e 202 | US-01 | `webhook-security.test.ts` (escrito na sprint 2) |
| Ponte: mapeamento, validações e transformações | US-03, US-10 | `transforms.test.ts` (48), `mapping.test.ts` (13) |
| Ponte: cliente por CNPJ, pedido, cobrança, retorno ao CRM | US-02..US-04 | `happy-path.test.ts` (5) |
| Três contratos OpenAPI e testes de contrato | RNF-06, RNF-08 | 18 testes, 100% das operações |

## Resultado real ao fim da sprint
Unitário **96 passaram**; integração do fluxo feliz **5 passaram**; contrato **18 passaram** (43 de 43 operações). Tempo do ganho até `PROCESSED` na primeira execução do fluxo feliz: 219 ms, em ambiente local.

## O que não ficou como o plano previa
- **A fila, o worker, a reconciliação e a API administrativa já nasceram nesta sprint**, porque o fluxo feliz precisava rodar fora da requisição ([ADR-002](../03-arquitetura/adr/ADR-002-fila-em-banco-vs-broker.md)) e o `app.ts` os conecta. O **comportamento** deles só foi testado e revisado nas sprints 2 e 3.
- Os contratos foram escritos **antes** do código, como planejado. Mesmo assim os testes de contrato acharam duas inconsistências (itens 4 e 5 de [bugs-e-aprendizados.md](bugs-e-aprendizados.md)).

## Problemas e decisões
Itens 1 a 7 de [bugs-e-aprendizados.md](bugs-e-aprendizados.md): conflito de porta, desenho errado de `CustomerLink`, corrida no mapeamento padrão, testes rodando em paralelo no mesmo banco.

## Cortado
Nada foi cortado nesta sprint.
