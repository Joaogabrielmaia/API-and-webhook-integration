# 04 — Backlog em 3 sprints

Aqui "sprint" é um **marco de entrega**, não uma duração em semanas: o estudo foi executado em sequência por mim, e eu não registro tempo gasto por sprint porque não o medi. Cada sprint termina com uma revisão em `docs/05-qualidade/sprint-N-review.md` com o que foi entregue, o que foi cortado e resultados reais de teste.

## Sprint 1 — Fluxo feliz e fundação
**Meta:** negócio ganho no CRM vira cliente, pedido e cobrança no ERP, e os IDs voltam ao CRM.

| Item | Histórias | Requisitos |
|---|---|---|
| CRM simples: clientes, negócios, etapas, webhook ao marcar Ganho | US-01 | RF-01 |
| ERP simples: clientes, pedidos, cobranças (REST) | US-02, US-03 | RF-04, RF-05 |
| Ponte: webhook com HMAC, gravação e resposta 202 | US-01 | RF-01, RF-02 |
| Ponte: mapeamento, validações e transformações | US-03, US-10 | RF-07 |
| Ponte: cliente por CNPJ, pedido e cobrança, retorno ao CRM | US-02, US-03, US-04 | RF-04, RF-05, RF-06 |
| Contratos OpenAPI e testes de contrato | — | RNF-06, RNF-08 |

## Sprint 2 — Confiabilidade
**Meta:** a integração sobrevive a duplicidade, a ERP fora e a evento fora de ordem.

| Item | Histórias | Requisitos |
|---|---|---|
| Idempotência por chave de evento (inclusive em paralelo) | US-05 | RF-03 |
| Fila de trabalhos em PostgreSQL com `SKIP LOCKED` | US-06 | RF-08, RNF-02 |
| Retentativa com backoff e registro de tentativas | US-06 | RF-08, RNF-03 |
| Fila de falhas e reprocessamento manual | US-07 | RF-09 |
| Evento fora de ordem | US-13 | RF-14 |
| Teste de falha injetada (ERP derrubado durante um lote) | US-06, US-07 | RNF-02, RNF-03 |

## Sprint 3 — Visibilidade e consistência
**Meta:** o financeiro enxerga e controla; os dois lados convergem.

| Item | Histórias | Requisitos |
|---|---|---|
| Sincronização de volta (pagamento → CRM) | US-08 | RF-10 |
| Reconciliação agendada e manual | US-09 | RF-12 |
| Painel de integração (eventos, falhas, divergências, mapeamento) | US-11, US-10 | RF-11 |
| Catálogo de erros gerado da mesma fonte do código | US-12 | RF-13 |
| Scripts de demonstração, prints, E2E | — | RNF-07 |

## Ordem de corte (se o tempo apertar)
v1.1 → guias → E2E → sincronização de volta → painel avançado → retrospectiva. A reconciliação é cortada por último, depois da v1.1. Nunca cortar: o fluxo principal com idempotência, retentativa e fila de falhas, os prints e o README.
