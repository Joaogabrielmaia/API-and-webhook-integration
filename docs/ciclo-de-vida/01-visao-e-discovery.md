# 01 — Visão e discovery

Fase A do ciclo de vida: o problema, as pessoas envolvidas e as restrições que moldaram o escopo.

[← Índice do ciclo de vida](README.md) · Próxima: [02 Planejamento e Scrum](02-planejamento-e-scrum.md) · Documentos de origem: [Episódio 1](../01-discovery/README.md)

## Visão do produto

> Uma venda ganha no CRM vira cliente, pedido e cobrança no ERP, sem duplicar, mesmo com o ERP fora do ar.

A Ponte é um serviço de integração que recebe o evento "negócio ganho" do CRM, cria ou atualiza o cliente, o pedido e a cobrança no ERP, devolve os identificadores ao CRM e atualiza o CRM quando a cobrança é paga. O CRM e o ERP são sistemas simples criados no próprio repositório (`apps/mock-crm`, `apps/mock-erp`) para representar o cenário.

## Contexto de negócio

A Serviços Aurora, empresa fictícia de 25 pessoas, presta manutenção e conservação predial. O comercial usa um CRM; o financeiro usa um ERP; os dois não se falam. Hoje o vendedor avisa o financeiro por mensagem, e o financeiro digita de novo cliente, valor e prazo. O caminho completo está em [O negócio: Serviços Aurora](../01-discovery/02-negocio-aurora.md) e nos diagramas de [AS-IS e TO-BE](../01-discovery/06-as-is-to-be.md).

| Dor identificada | Efeito | Onde está registrada |
|---|---|---|
| Redigitação de cliente, valor e prazo | Tempo do financeiro e erro de digitação | [O negócio](../01-discovery/02-negocio-aurora.md) |
| Cliente cadastrado duas vezes com variação de nome | Cobrança e histórico duplicados | [Reunião 2](../01-discovery/04-reuniao-2-analista-financeira.md) |
| O CRM não sabe que a cobrança foi paga | Vendedor sem retorno | [Reunião 1](../01-discovery/03-reuniao-1-gerente-comercial.md) |
| ERP fora do ar das 23h à 1h, sem reenvio de webhook | Venda fechada à noite pode se perder | [Reunião 3](../01-discovery/05-reuniao-3-responsavel-de-ti.md) |

## Partes interessadas

| Papel | Interesse | Registro |
|---|---|---|
| Gerente comercial | Venda ganha no CRM chega ao ERP em até 5 minutos (RNF-01) | [Reunião 1](../01-discovery/03-reuniao-1-gerente-comercial.md) |
| Analista financeira | Conferir antes de cobrar e saber o motivo de cada falha (RN-06, RF-13) | [Reunião 2](../01-discovery/04-reuniao-2-analista-financeira.md) |
| Responsável de TI (meio período) | Segurança do webhook, janela de backup, manutenção simples | [Reunião 3](../01-discovery/05-reuniao-3-responsavel-de-ti.md) |
| Vendedor | Ver no CRM os IDs e o status da cobrança | US-04, [histórias](../02-definicao/02-historias-e-moscow.md) |
| Consultor de solução e desenvolvedor | Definir, decidir, construir e provar | todo o repositório |

A distribuição de responsabilidades por atividade está na matriz RACI de [Planejamento e Scrum](02-planejamento-e-scrum.md#matriz-raci).

## Perguntas de discovery

As reuniões seguiram um roteiro de perguntas, registrado em [reuniões](reunioes/00-kickoff-e-roteiro-de-discovery.md): como a venda chega ao financeiro hoje, o que é "na hora", o que o financeiro precisa para confiar numa cobrança automática, como os sistemas expõem dados e quando o ERP fica fora do ar.

## Alternativas avaliadas e escolha

A [matriz de decisão](../01-discovery/01-brainstorm-e-matriz-de-decisao.md) pontuou cinco alternativas com seis critérios ponderados:

| Alternativa | Total (de 110) |
|---|---|
| **A. Integração por API** | **95** |
| C. Automação visual | 75 |
| D. Troca de sistema | 72 |
| E. Rotina melhorada | 64 |
| B. Planilha | 53 |

Escolha: A. Custo reconhecido no documento: é a mais cara de construir e exige quem saiba manter código. Condições para mudar de ideia estão no mesmo documento.

## Escopo e fora de escopo

| Dentro | Fora (MVP) |
|---|---|
| Webhook assinado do CRM e do ERP | Nota fiscal |
| Cliente por CNPJ, pedido e cobrança no ERP | Sistemas reais |
| Retorno de IDs e do status de pagamento ao CRM | Multiempresa |
| Retentativa, fila de falhas (dead-letter), reconciliação | Mensageria externa |
| Painel de integração e catálogo de erros | Cancelamento ou alteração de pedido e cobrança já criados |

## Restrições

| Tipo | Restrição | Consequência |
|---|---|---|
| Operacional | ERP indisponível das 23h à 1h; não reenvia webhook perdido | Processamento assíncrono (ADR-002), retentativa de mais de 2 h (ADR-004), reconciliação obrigatória (ADR-006) |
| Técnica | CRM e ERP têm API REST com chave e webhook assinado | Contratos OpenAPI e HMAC (ADR-007, ADR-009) |
| Organizacional | TI de meio período | Execução local simples e poucas peças (ADR-002, ADR-011) |
| Financeira | Empresa de 25 pessoas | Sem broker nem serviço pago; PostgreSQL já existente |
| De conhecimento | Reuniões simuladas | Requisitos podem não refletir uma operação real (R-09) |

## Premissas, dependências e riscos iniciais

- **Premissa:** o evento do CRM carrega um id estável e a versão do negócio; sem isso a idempotência dependeria de outra chave ([ADR-003](../03-arquitetura/adr/ADR-003-idempotencia.md)).
- **Dependência:** o ERP aceitar uma referência externa única por pedido e cobrança.
- **Riscos iniciais:** duplicidade (R-01), perda de evento (R-02), divergência silenciosa (R-03) e ERP fora por mais tempo que a janela de retentativa (R-04); lista completa de 10 riscos em [riscos](../02-definicao/05-riscos.md).

## Critérios de sucesso

| Critério | Tipo | Referência |
|---|---|---|
| Pedido e cobrança no ERP em até 5 minutos em condições normais | Meta de negócio | RNF-01 |
| Nenhum evento aceito se perde | Verificável por teste | RNF-02, [falha injetada](../05-qualidade/falha-injetada.md) |
| Nenhuma duplicidade com o ERP derrubado no meio de um lote | Verificável por teste | cenário A: 20 de 20, 0 duplicidade |
| Ganhos de tempo e de erro | Hipóteses, nunca medidas | [Ganhos como hipóteses](../02-definicao/06-ganhos-como-hipoteses.md) |
