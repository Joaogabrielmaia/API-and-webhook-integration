# Guia da série

**Uma venda ganha no CRM vira cliente, pedido e cobrança no ERP, sem duplicar, mesmo com o ERP fora do ar.**

O fio condutor é a restrição levantada na [reunião com o responsável de TI](01-discovery/05-reuniao-3-responsavel-de-ti.md): o ERP fica fora do ar das 23h à 1h e não reenvia webhook perdido. Ela muda o escopo, vira arquitetura (ADRs 001 a 006) e é provada no [teste de falha injetada](05-qualidade/falha-injetada.md).

Voltar à [capa](../README.md). Termos técnicos: [glossário](GLOSSARIO.md). Relatório do ciclo de vida, do discovery à evolução: [docs/ciclo-de-vida](ciclo-de-vida/README.md).

## Episódios

| Episódio | O que acontece | Começar por |
|---|---|---|
| [0 — Sobre este caso](00-sobre-este-caso/README.md) | O que é real e o que é cenário | [Real × simulado](00-sobre-este-caso/README.md#real--simulado) |
| [1 — Discovery](01-discovery/README.md) | Cinco alternativas, a empresa fictícia e três reuniões simuladas | [Reunião 3: TI](01-discovery/05-reuniao-3-responsavel-de-ti.md) |
| [2 — Definição](02-definicao/README.md) | 14 RF, 9 RNF, 12 RN, 13 histórias, 17 itens de backlog, 10 riscos | [Rastreabilidade](02-definicao/07-rastreabilidade.md) |
| [3 — Arquitetura](03-arquitetura/README.md) | Visão geral, modelo de dados, 6 diagramas de sequência, 12 ADRs | [ADR-003](03-arquitetura/adr/ADR-003-idempotencia.md) |
| [4 — Contratos de API](04-contratos-de-api/README.md) | 3 OpenAPI, catálogo de 35 erros, 44/44 operações cobertas | [Catálogo de erros](04-contratos-de-api/catalogo-de-erros.md) |
| [5 — Qualidade](05-qualidade/README.md) | Falha injetada, 12 defeitos, aceitação, 193 Vitest e 10 Playwright | [Falha injetada](05-qualidade/falha-injetada.md) |
| [6 — Pós-lançamento](06-pos-lancamento/README.md) | v1.1, guia de operação, roadmap e limitações | [Guia de operação](06-pos-lancamento/guia-de-operacao.md) |

Os registros de teste são de 2026-10-23, commit `fcf035d`; os commits posteriores só tocaram documentação e a máscara de caminho nos registros.

## Trilhas de leitura

### Em 2 minutos
1. [README](../README.md)
2. [Print 01: CRM com o negócio ganho](screenshots/01-crm-negocio-ganho.png)
3. [Print 08: evento em retentativa](screenshots/08-painel-evento-em-retentativa.png)
4. [Falha injetada: ERP derrubado durante um lote](05-qualidade/falha-injetada.md)

### Em 10 minutos
Os quatro itens acima, mais:
1. [Reunião 3: responsável de TI](01-discovery/05-reuniao-3-responsavel-de-ti.md)
2. [ADR-001: eventos vs. consulta periódica](03-arquitetura/adr/ADR-001-eventos-vs-consulta-periodica.md)
3. [ADR-003: idempotência](03-arquitetura/adr/ADR-003-idempotencia.md)
4. [ADR-004: retentativa com backoff](03-arquitetura/adr/ADR-004-retentativa-com-backoff.md)
5. [ADR-006: reconciliação](03-arquitetura/adr/ADR-006-reconciliacao.md)
6. [Problemas e aprendizados](05-qualidade/bugs-e-aprendizados.md)
7. [Print 12: divergências da reconciliação](screenshots/12-painel-divergencias-da-reconciliacao.png)

### Em 30 minutos
Os itens de 10 minutos, mais:
1. [OpenAPI do CRM](04-contratos-de-api/crm.openapi.yaml), [do ERP](04-contratos-de-api/erp.openapi.yaml) e [da Ponte](04-contratos-de-api/ponte.openapi.yaml)
2. [Catálogo de 35 erros](04-contratos-de-api/catalogo-de-erros.md)
3. [Rastreabilidade](02-definicao/07-rastreabilidade.md)
4. [Modos de falha](03-arquitetura/04-modos-de-falha.md)
5. [Diagramas de sequência](03-arquitetura/03-diagramas-de-sequencia.md)
6. [Guia de operação](06-pos-lancamento/guia-de-operacao.md)

## Galeria

17 prints gerados pelo sistema, em ordem de história, com legenda: [galeria](screenshots/README.md).

## Resultados brutos

Saída dos testes, JSON da falha injetada e saída dos cenários, em [05-qualidade/resultados](05-qualidade/resultados/execucao-dos-testes.txt).
