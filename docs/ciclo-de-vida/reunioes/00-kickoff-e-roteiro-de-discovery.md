# Kickoff e roteiro de discovery

> Reunião simulada; pessoas e empresa fictícias.

[← Índice das reuniões](README.md) · [Visão e discovery](../01-visao-e-discovery.md)

**Janela planejada (cronograma acadêmico):** semana de 2026-09-07.
**Participantes (por papel):** consultor de solução e desenvolvedor; gerente comercial, analista financeira e responsável de TI da Serviços Aurora.
**Objetivo:** alinhar o problema, o escopo provisório e o roteiro das três conversas de discovery.

## Pauta
1. O problema como a Aurora o descreve: venda ganha no CRM, digitação no ERP.
2. Quem será ouvido e sobre o quê.
3. O que está dentro e fora do escopo provisório.
4. Como as decisões serão registradas.

## Roteiro de perguntas

| Conversa | Pergunta | Para que serve | Registro |
|---|---|---|---|
| Comercial | Como a venda chega ao financeiro hoje e o que é "na hora"? | Meta de latência e dor do vendedor | [Reunião 1](../../01-discovery/03-reuniao-1-gerente-comercial.md) |
| Comercial | O que acontece se o ERP estiver fora na hora do fechamento? | Primeiro sinal da restrição de disponibilidade | [Reunião 1](../../01-discovery/03-reuniao-1-gerente-comercial.md) |
| Financeiro | O que o financeiro precisa ver para confiar numa cobrança criada sozinha? | Regras de conferência e de erro | [Reunião 2](../../01-discovery/04-reuniao-2-analista-financeira.md) |
| Financeiro | Como o cliente é identificado e o que fazer com duplicidade? | Regra do CNPJ | [Reunião 2](../../01-discovery/04-reuniao-2-analista-financeira.md) |
| TI | Como o ERP e o CRM expõem dados e o ERP reenvia webhook perdido? | Contratos e reconciliação | [Reunião 3](../../01-discovery/05-reuniao-3-responsavel-de-ti.md) |
| TI | Quando o ERP fica fora do ar e quanto tempo responde? | Janela de retentativa e timeout | [Reunião 3](../../01-discovery/05-reuniao-3-responsavel-de-ti.md) |
| TI | Como os segredos de webhook são guardados? | Segurança do webhook | [Reunião 3](../../01-discovery/05-reuniao-3-responsavel-de-ti.md) |

## Decisões
- O escopo provisório é o fluxo ganho → cliente, pedido e cobrança → IDs no CRM, mais o retorno de pagamento.
- Sistemas reais, nota fiscal, multiempresa e mensageria externa ficam fora.
- Cada decisão técnica relevante vira um ADR com alternativas e "quando mudar".

## Ações
| Ação | Responsável | Resultado |
|---|---|---|
| Conduzir as três conversas e registrar as atas | Consultor de solução | [Atas](README.md) |
| Pontuar as alternativas | Consultor de solução | [Matriz de decisão](../../01-discovery/01-brainstorm-e-matriz-de-decisao.md) |
| Desenhar AS-IS e TO-BE e mapear os campos | Consultor de solução | [AS-IS e TO-BE](../../01-discovery/06-as-is-to-be.md), [mapa de dados](../../01-discovery/07-mapa-de-dados.md) |
