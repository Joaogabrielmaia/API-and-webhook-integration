# 01 — Requisitos

Origem: reuniões simuladas ([1](../01-discovery/03-reuniao-1-gerente-comercial.md), [2](../01-discovery/04-reuniao-2-analista-financeira.md), [3](../01-discovery/05-reuniao-3-responsavel-de-ti.md)). Prioridade MoSCoW em [02-historias-e-moscow.md](02-historias-e-moscow.md).

## Requisitos funcionais

| ID | Requisito | Origem |
|---|---|---|
| RF-01 | Receber o webhook de "negócio ganho" do CRM, autenticado por assinatura HMAC. | Reunião 3 |
| RF-02 | Registrar todo evento aceito e responder rápido (202), sem depender do ERP na requisição. | Reunião 3 |
| RF-03 | Idempotência por chave de evento: o mesmo evento recebido duas vezes é ignorado. | Reunião 1 ("não pode duplicar") e 2 |
| RF-04 | Criar ou atualizar o cliente no ERP, identificado pelo CNPJ, sem duplicar. | Reunião 2 |
| RF-05 | Criar pedido e cobrança no ERP a partir do negócio ganho. | Reunião 1 |
| RF-06 | Devolver ao CRM os identificadores do ERP (cliente, pedido e cobrança). | Reunião 1 |
| RF-07 | Mapeamento de campos configurável e versionado, com validações e transformações (CNPJ, telefone, valor, prazo). | Reunião 2 |
| RF-08 | Retentativa com backoff exponencial para falhas temporárias. | Reunião 3 |
| RF-09 | Fila de falhas (dead-letter) com motivo, para eventos com erro permanente ou que esgotaram as tentativas, com reprocessamento manual. | Reunião 2 |
| RF-10 | Sincronização de volta: cobrança paga no ERP atualiza o status no CRM. | Reuniões 1 e 2 |
| RF-11 | Painel de integração: eventos, status, tempo de processamento, tentativas, falhas, divergências, reprocessamento e mapeamento. | Reuniões 2 e 3 |
| RF-12 | Reconciliação agendada (e manual) que compara CRM e ERP e aponta divergências. | Reuniões 2 e 3 |
| RF-13 | Catálogo de erros documentado, com causa e ação recomendada. | Reunião 2 ("saber o motivo") |
| RF-14 | Tratar evento fora de ordem: evento obsoleto não sobrescreve estado mais novo. | Reunião 3 |

## Requisitos não funcionais

| ID | Requisito | Critério verificável |
|---|---|---|
| RNF-01 | **Latência.** Em condições normais, pedido e cobrança no ERP em até 5 minutos após o "Ganho". | Meta de negócio. O teste de integração mede e registra o tempo real em ambiente local; esse número **não** vale como desempenho em produção. |
| RNF-02 | **Durabilidade.** Nenhum evento que recebeu 2xx se perde: ele termina processado, ignorado com motivo, ou na fila de falhas. | Teste de falha injetada: a contagem de eventos recebidos é igual à soma dos estados finais. |
| RNF-03 | **Resiliência.** Tolerar o ERP fora por pelo menos 2 horas. | Cálculo do backoff (ADR-004) e teste com ERP derrubado. |
| RNF-04 | **Segurança.** Segredos só em variáveis de ambiente; HMAC com janela de 5 min; comparação em tempo constante; rotas administrativas com chave. | Testes de segurança do webhook. |
| RNF-05 | **Observabilidade.** Log estruturado com identificador de correlação; tempo de processamento e tentativas por evento. | Painel e tabela `Attempt`. |
| RNF-06 | **Testabilidade de contrato.** Os três contratos OpenAPI são validados contra respostas reais. | Suíte `tests/contract`. |
| RNF-07 | **Portabilidade local.** Sobe com Docker Compose (PostgreSQL) e `npm`. | README, seção "Como rodar". |
| RNF-08 | **Compatibilidade.** API versionada em `/v1`; mudanças dentro da versão são aditivas. | ADR-007 e testes de contrato. |
| RNF-09 | **Consistência eventual.** CRM e ERP convergem; divergências são detectadas, não escondidas. | Reconciliação. |

## Fora do escopo (MVP)
Nota fiscal, sistemas reais, multiempresa, mensageria externa, cancelamento ou alteração de pedido/cobrança depois de criados.
