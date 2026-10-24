# Ponte

Integração CRM→ERP: quando um negócio é ganho, cria ou atualiza o cliente, o pedido e a cobrança, sem duplicar, com retentativa, fila de falhas e reconciliação.

## O problema

Cenário fictício: a Serviços Aurora, empresa de 25 pessoas, usa um CRM (sistema do comercial) e um ERP (sistema do financeiro) separados. A cada venda ganha, o financeiro digita de novo cliente, valor e prazo no ERP.
O ERP fica fora do ar das 23h à 1h e não reenvia o aviso que perdeu. Uma venda fechada nesse horário não pode se perder nem gerar cobrança em dobro.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/01-crm-negocio-ganho.png" alt="CRM com o negócio em Ganho e o bloco Retorno do ERP preenchido com os IDs de cliente, pedido e cobrança"><br><sub>01 · O negócio ganho no CRM e os IDs do ERP de volta</sub></td>
<td width="50%"><img src="docs/screenshots/08-painel-evento-em-retentativa.png" alt="Painel da Ponte com um evento em retentativa e o erro PONTE-ERP-001, ERP respondeu 503"><br><sub>08 · Evento em retentativa com o ERP fora</sub></td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/11-painel-reprocessamento.png" alt="Painel da Ponte com o mesmo evento processado, cinco falhas temporárias e um sucesso"><br><sub>11 · O mesmo evento concluído depois do reprocessamento</sub></td>
<td width="50%"><img src="docs/screenshots/12-painel-divergencias-da-reconciliacao.png" alt="Painel da Ponte com duas divergências abertas: valor diferente e ganho sem pedido"><br><sub>12 · Divergências apontadas pela reconciliação</sub></td>
</tr>
</table>

## Ficha técnica

| Campo | Informação |
|---|---|
| Natureza | Estudo de caso fictício |
| Stack | TypeScript, Node.js, Fastify, PostgreSQL, Prisma, OpenAPI, Vitest, Playwright |
| Testes | 193 Vitest e 10 Playwright passando; registro de 2026-10-23, commit `fcf035d` |

Guia da série e trilhas de leitura: [docs/INDEX.md](docs/INDEX.md) · [galeria com 17 prints](docs/screenshots/README.md) · [glossário](docs/GLOSSARIO.md)

## O que construí

- Implementei a entrada por webhook assinado com HMAC e timestamp; assinatura inválida e replay são recusados ([ADR-009](docs/03-arquitetura/adr/ADR-009-seguranca-do-webhook.md), `tests/integration/webhook-security.test.ts`).
- Modelei a idempotência em três camadas: chave do evento, vínculo único por negócio e `externalRef` único no ERP ([ADR-003](docs/03-arquitetura/adr/ADR-003-idempotencia.md), `tests/integration/idempotency.test.ts`).
- Implementei a retentativa com backoff exponencial e jitter e a fila de falhas (dead-letter) com reprocessamento manual ([ADR-004](docs/03-arquitetura/adr/ADR-004-retentativa-com-backoff.md), [ADR-005](docs/03-arquitetura/adr/ADR-005-fila-de-falhas.md)).
- Construí a reconciliação, que compara CRM e ERP a cada 15 minutos e sob demanda, e aponta divergências sem corrigir em silêncio ([ADR-006](docs/03-arquitetura/adr/ADR-006-reconciliacao.md), `tests/integration/reconciliation.test.ts`).
- Escrevi três contratos OpenAPI e um catálogo de 35 erros, validados por teste de contrato ([docs/04-contratos-de-api](docs/04-contratos-de-api/README.md)).
- Provei o conjunto com um teste de falha injetada: derrubei o ERP no meio de um lote de 20 negócios e conferi 20 processados e 0 duplicidade (`tests/failure/erp-down-batch.test.ts`).

## Competência → prova

| O que o projeto exercita | Onde está a prova |
|---|---|
| Desenhar integração entre sistemas (webhook assinado, mapeamento, versão) | [ADR-007](docs/03-arquitetura/adr/ADR-007-versionamento-da-api.md), [ADR-008](docs/03-arquitetura/adr/ADR-008-mapeamento-configuravel.md), [ADR-009](docs/03-arquitetura/adr/ADR-009-seguranca-do-webhook.md) e [mapa de dados](docs/01-discovery/07-mapa-de-dados.md) |
| Evitar duplicidade | [ADR-003](docs/03-arquitetura/adr/ADR-003-idempotencia.md) e [falha injetada](docs/05-qualidade/falha-injetada.md) (cenário A: 0 duplicidade) |
| Tratar falha e recuperar | [ADR-004](docs/03-arquitetura/adr/ADR-004-retentativa-com-backoff.md), [ADR-005](docs/03-arquitetura/adr/ADR-005-fila-de-falhas.md) e prints [08](docs/screenshots/08-painel-evento-em-retentativa.png), [10](docs/screenshots/10-painel-fila-de-falhas.png) e [11](docs/screenshots/11-painel-reprocessamento.png) |
| Detectar divergência entre sistemas | [ADR-006](docs/03-arquitetura/adr/ADR-006-reconciliacao.md) e [print 12](docs/screenshots/12-painel-divergencias-da-reconciliacao.png) |
| Documentar contrato de API | [CRM](docs/04-contratos-de-api/crm.openapi.yaml), [ERP](docs/04-contratos-de-api/erp.openapi.yaml) e [Ponte](docs/04-contratos-de-api/ponte.openapi.yaml), [catálogo de 35 erros](docs/04-contratos-de-api/catalogo-de-erros.md) e teste de contrato (44/44 operações) |
| Operar e alertar | [ADR-012](docs/03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md) e prints [16](docs/screenshots/16-painel-alerta-de-fila-parada.png) e [17](docs/screenshots/17-painel-alerta-critico.png) |
| Registrar os próprios erros | [Problemas e aprendizados](docs/05-qualidade/bugs-e-aprendizados.md) (12 itens) |

## Decisão difícil

Webhook, consulta periódica ou os dois. Fonte: [ADR-001](docs/03-arquitetura/adr/ADR-001-eventos-vs-consulta-periodica.md).

| | |
|---|---|
| **Contexto** | O comercial quer "na hora"; o ERP não reenvia webhook perdido ([reunião 1](docs/01-discovery/03-reuniao-1-gerente-comercial.md) e [reunião 3](docs/01-discovery/05-reuniao-3-responsavel-de-ti.md), simuladas). O ERP fica fora das 23h à 1h |
| **Alternativas** | 1. Só webhook. 2. Só consulta periódica. 3. Híbrida: eventos como caminho principal e reconciliação periódica como rede de segurança |
| **Escolha** | A opção 3 |
| **Custo aceito** | Dois mecanismos para manter e explicar; o custo do polling é baixo porque a reconciliação roda a cada 15 minutos (padrão) |
| **Quando mudaria** | Se o CRM não oferecesse webhook, polling incremental como caminho principal; se o ERP garantisse reenvio com confirmação, menos reconciliação |

## Evidências

- **Falha injetada, cenário A:** 20 de 20 negócios processados e 0 duplicidade, com o ERP derrubado no meio do lote ([resultado](docs/05-qualidade/resultados/falha-injetada-cenario-a.json), versionado em 2026-10-23, commit `9d00c1b`).
- **Falha injetada, cenário B:** 5 eventos na fila de falhas e 5 processados depois do reprocessamento ([resultado](docs/05-qualidade/resultados/falha-injetada-cenario-b.json), mesmo commit; [relato](docs/05-qualidade/falha-injetada.md)).
- **Testes:** 193 Vitest e 10 Playwright passando, registro de 2026-10-23, commit `fcf035d` ([saída](docs/05-qualidade/resultados/execucao-dos-testes.txt)).
- **Contrato:** 44 de 44 operações dos três OpenAPI exercitadas, no mesmo registro ([estratégia e resultados](docs/05-qualidade/README.md)).
- **Defeitos:** 12 documentados, inclusive erros meus de teste e de desenho ([registro](docs/05-qualidade/bugs-e-aprendizados.md)).
- **Interface:** 17 prints gerados pelo próprio sistema ([galeria](docs/screenshots/README.md)).

## Limites

- CRM e ERP são sistemas simples criados neste repositório; não são produtos comerciais.
- As reuniões de discovery, a aceitação e a retrospectiva são simuladas; os requisitos podem não refletir uma operação real.
- Não testei carga, a janela real de 2 horas (validada por cálculo) nem usuários reais.
- Não há workflow de CI; os registros de teste vêm de execução local.

## Evolução prevista

- Evento de liberação de conferência do ERP, para o CRM não depender da reconciliação.
- Aceitar dois segredos de webhook durante a troca.
- Notificação ativa dos alertas de fila parada.

Detalhes em [roadmap](docs/06-pos-lancamento/roadmap.md).

## Licença

[MIT](LICENSE). O código roda localmente; as instruções estão em [CONTRIBUTING.md](CONTRIBUTING.md).
