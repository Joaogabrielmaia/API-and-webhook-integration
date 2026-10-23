# Índice da documentação

Comece pelo [README da raiz](../README.md), que tem o roteiro de leitura em 7 passos. Este índice lista **todos** os documentos.

> O CRM e o ERP deste repositório são sistemas simples criados para o estudo. A Serviços Aurora e as pessoas são fictícias. Reuniões, aceitação e retrospectiva são simuladas. Não existe cliente, operação ou produção reais.

## 00 · Sobre este caso
- [O que é real e o que é cenário](00-sobre-este-caso/README.md)

## 01 · Discovery
| Documento | O que tem |
|---|---|
| [01 Brainstorm e matriz de decisão](01-discovery/01-brainstorm-e-matriz-de-decisao.md) | Cinco alternativas, critérios, pesos, notas e escolha |
| [02 O negócio: Serviços Aurora](01-discovery/02-negocio-aurora.md) | Caminho da venda e onde se perde informação |
| [03 Reunião 1: gerente comercial](01-discovery/03-reuniao-1-gerente-comercial.md) | Simulada. Pedidos vagos refinados |
| [04 Reunião 2: analista financeira](01-discovery/04-reuniao-2-analista-financeira.md) | Simulada. Contradição com o comercial e como foi resolvida |
| [05 Reunião 3: responsável de TI](01-discovery/05-reuniao-3-responsavel-de-ti.md) | Simulada. A restrição que muda o escopo |
| [06 AS-IS e TO-BE](01-discovery/06-as-is-to-be.md) | Diagramas Mermaid |
| [07 Mapa de dados](01-discovery/07-mapa-de-dados.md) | Campos, divergências e regras de conversão |

## 02 · Definição
| Documento | O que tem |
|---|---|
| [01 Requisitos](02-definicao/01-requisitos.md) | RF-01..14 e RNF-01..09 |
| [02 Histórias e MoSCoW](02-definicao/02-historias-e-moscow.md) | US-01..13 com critérios de aceite |
| [03 Regras de negócio](02-definicao/03-regras-de-negocio.md) | RN-01..12 |
| [04 Backlog em 3 sprints](02-definicao/04-backlog-em-3-sprints.md) | Metas e itens por sprint |
| [05 Riscos](02-definicao/05-riscos.md) | R-01..10 com mitigação |
| [06 Ganhos como hipóteses](02-definicao/06-ganhos-como-hipoteses.md) | Fórmulas e entradas visíveis; nada medido |
| [07 Rastreabilidade](02-definicao/07-rastreabilidade.md) | Necessidade → requisito → regra → história → ADR → componente → teste |

## 03 · Arquitetura
| Documento | O que tem |
|---|---|
| [01 Visão geral](03-arquitetura/01-visao-geral.md) | Componentes e princípios |
| [02 Modelo de dados](03-arquitetura/02-modelo-de-dados.md) | ER, restrições e máquina de estados |
| [03 Diagramas de sequência](03-arquitetura/03-diagramas-de-sequencia.md) | Fluxo feliz e fluxos de falha |
| [04 Modos de falha](03-arquitetura/04-modos-de-falha.md) | Reação, recuperação e prova de cada um |

**ADRs** (contexto, alternativas, escolha, motivo, trade-off, quando mudar):
[001 Eventos vs. consulta periódica](03-arquitetura/adr/ADR-001-eventos-vs-consulta-periodica.md) ·
[002 Fila em banco vs. broker](03-arquitetura/adr/ADR-002-fila-em-banco-vs-broker.md) ·
[003 Idempotência](03-arquitetura/adr/ADR-003-idempotencia.md) ·
[004 Retentativa com backoff](03-arquitetura/adr/ADR-004-retentativa-com-backoff.md) ·
[005 Fila de falhas](03-arquitetura/adr/ADR-005-fila-de-falhas.md) ·
[006 Reconciliação](03-arquitetura/adr/ADR-006-reconciliacao.md) ·
[007 Versionamento da API](03-arquitetura/adr/ADR-007-versionamento-da-api.md) ·
[008 Mapeamento configurável](03-arquitetura/adr/ADR-008-mapeamento-configuravel.md) ·
[009 Segurança do webhook](03-arquitetura/adr/ADR-009-seguranca-do-webhook.md) ·
[010 Fastify vs. Next](03-arquitetura/adr/ADR-010-fastify-vs-next.md) ·
[011 Execução local](03-arquitetura/adr/ADR-011-execucao-local.md) ·
[012 Alerta de fila parada (v1.1)](03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md)

## 04 · Contratos de API
| Documento | O que tem |
|---|---|
| [Índice e política de versão](04-contratos-de-api/README.md) | Convenções comuns |
| [CRM (OpenAPI)](04-contratos-de-api/crm.openapi.yaml) · [ERP (OpenAPI)](04-contratos-de-api/erp.openapi.yaml) · [Ponte (OpenAPI 1.1.0)](04-contratos-de-api/ponte.openapi.yaml) | Contratos validados por teste |
| [Exemplos](04-contratos-de-api/exemplos.md) | Requisições e respostas |
| [Catálogo de erros](04-contratos-de-api/catalogo-de-erros.md) | 35 códigos; gerado do código |

## 05 · Qualidade
| Documento | O que tem |
|---|---|
| [Estratégia e resultados](05-qualidade/README.md) | Camadas, execução registrada, limites |
| [Falha injetada](05-qualidade/falha-injetada.md) | ERP derrubado durante um lote |
| [Reunião de aceitação](05-qualidade/reuniao-de-aceitacao.md) | Simulada, com resultados reais |
| [Problemas e aprendizados](05-qualidade/bugs-e-aprendizados.md) | 12 itens, inclusive erros meus |
| [Sprint 1](05-qualidade/sprint-1-review.md) · [Sprint 2](05-qualidade/sprint-2-review.md) · [Sprint 3](05-qualidade/sprint-3-review.md) | Revisões |
| [Resultados brutos](05-qualidade/resultados) | Saída dos testes, JSON da falha injetada, saída dos cenários |

## 06 · Pós-lançamento
| Documento | O que tem |
|---|---|
| [Retrospectiva (simulada)](06-pos-lancamento/retrospectiva.md) | 3 melhorias |
| [PR da v1.1](06-pos-lancamento/pr-v1.1.md) · [Changelog](06-pos-lancamento/CHANGELOG.md) | v1.1.0 |
| [Roadmap e limitações](06-pos-lancamento/roadmap.md) | Próximos passos |
| [Guia de operação](06-pos-lancamento/guia-de-operacao.md) | Rotina, alertas e o que fazer em cada situação |
| [Minha retrospectiva final](06-pos-lancamento/retrospectiva-final.md) | O que eu faria diferente |

## Entrevista e vitrine
- [Perguntas por fase](entrevista/README.md) (3 por fase, fases 0 a 9)
- [Bullets de currículo](vitrine/curriculo-bullets.md) · [Post de LinkedIn](vitrine/post-linkedin.md) · [Respostas de 30 s e 2 min](vitrine/respostas.md)

## Prints
16 prints numerados em [screenshots](screenshots), gerados pelo Playwright a partir do sistema rodando (o 15 renderiza a saída real dos testes).
