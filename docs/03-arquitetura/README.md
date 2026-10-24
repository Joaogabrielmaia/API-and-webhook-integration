# Episódio 3 — Arquitetura

A restrição da reunião com TI (ERP fora das 23h à 1h, sem reenvio de webhook) define o desenho: a Ponte recebe, grava e responde; um worker processa depois. Webhook e reconciliação periódica se complementam ([ADR-001](adr/ADR-001-eventos-vs-consulta-periodica.md)).
Três decisões carregam a garantia de não duplicar: [ADR-003](adr/ADR-003-idempotencia.md) (idempotência em três camadas), [ADR-004](adr/ADR-004-retentativa-com-backoff.md) (retentativa com backoff e jitter) e [ADR-006](adr/ADR-006-reconciliacao.md) (reconciliação). O ADR-004 calcula 12 tentativas em cerca de 3 h 01 min, acima da janela de 2 h do ERP.
Os 6 diagramas de sequência e os 9 modos de falha mostram o que a Ponte faz em cada caso e o que ela não garante.

| Documento | O que contém | Itens |
|---|---|---|
| [01 Visão geral](01-visao-geral.md) | Componentes e princípios | 1 diagrama |
| [02 Modelo de dados](02-modelo-de-dados.md) | Diagrama ER, restrições e máquina de estados | banco `ponte` |
| [03 Diagramas de sequência](03-diagramas-de-sequencia.md) | Fluxo feliz e fluxos de falha | 6 diagramas |
| [04 Modos de falha](04-modos-de-falha.md) | Reação, recuperação e prova de cada falha | F1 a F9 |
| [Pasta de ADRs](adr/ADR-001-eventos-vs-consulta-periodica.md) | Contexto, alternativas, escolha, motivo, trade-off, quando mudar | 12 decisões |

| ADR | Decisão |
|---|---|
| [001](adr/ADR-001-eventos-vs-consulta-periodica.md) | Eventos vs. consulta periódica |
| [002](adr/ADR-002-fila-em-banco-vs-broker.md) | Fila em banco vs. broker |
| [003](adr/ADR-003-idempotencia.md) | Idempotência |
| [004](adr/ADR-004-retentativa-com-backoff.md) | Retentativa com backoff |
| [005](adr/ADR-005-fila-de-falhas.md) | Fila de falhas (dead-letter) |
| [006](adr/ADR-006-reconciliacao.md) | Reconciliação |
| [007](adr/ADR-007-versionamento-da-api.md) | Versionamento da API |
| [008](adr/ADR-008-mapeamento-configuravel.md) | Mapeamento configurável |
| [009](adr/ADR-009-seguranca-do-webhook.md) | Segurança do webhook |
| [010](adr/ADR-010-fastify-vs-next.md) | Fastify vs. Next |
| [011](adr/ADR-011-execucao-local.md) | Execução local |
| [012](adr/ADR-012-alerta-de-fila-parada.md) | Alerta de fila parada (v1.1) |

← [Episódio 2 — Definição](../02-definicao/README.md) · [Índice](../INDEX.md) · [Episódio 4 — Contratos de API](../04-contratos-de-api/README.md) →
