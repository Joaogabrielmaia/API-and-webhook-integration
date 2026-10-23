# Retrospectiva da v1.0

> Simulação: o Claude interpretou o cliente nesta conversa.

**Participantes:** Marcos Oliveira, Patrícia Souza e Rogério Lima (fictícios) e eu. Base: a [reunião de aceitação](../05-qualidade/reuniao-de-aceitacao.md), os [resultados de teste](../05-qualidade/README.md) e o [registro de problemas](../05-qualidade/bugs-e-aprendizados.md). As falas são simuladas; os fatos citados são do repositório.

## O que manter

| Quem | Fala (simulada) | Fato por trás |
|---|---|---|
| Patrícia | "Poder ver por que um evento falhou e o que fazer." | Catálogo de erros com causa e ação, usado pelo painel |
| Rogério | "Ver a derrubada do ERP funcionando de verdade me convenceu." | 20 de 20 processados, 0 duplicidade ([falha injetada](../05-qualidade/falha-injetada.md)) |
| Marcos | "O vendedor ver os IDs e o status no CRM." | `erpOrderId`, `erpInvoiceId` e `billingStatus` no negócio |

## O que doeu
- **Rogério:** "Se ninguém abrir o painel, uma fila parada passa despercebida." A única forma de saber era entrar no painel e olhar.
- **Patrícia:** "Depois que eu libero uma cobrança, o CRM continua dizendo 'em conferência' até a reconciliação rodar." (RN-12, assumida no escopo.)
- **Rogério:** "Trocar o segredo derruba a integração por alguns minutos."
- **Eu (processo):** perdi tempo com testes que disputavam o mesmo banco e com asserções de tempo que mediam ruído, não comportamento (itens 7, 8, 11 e 12 do registro de problemas).

## As 3 melhorias

| # | Melhoria | Quem pediu | Decisão |
|---|---|---|---|
| 1 | **Alerta de fila parada** (e de fila de falhas com itens esperando) no painel e na API | Rogério | **Implementada na v1.1** |
| 2 | **Evento de liberação de conferência** do ERP, para o CRM não ficar desatualizado | Patrícia | [Roadmap](roadmap.md) |
| 3 | **Aceitar dois segredos** de webhook durante a troca | Rogério | [Roadmap](roadmap.md) |

### Por que a 1 antes das outras (contexto, alternativas, escolha, motivo, trade-off, quando mudar)

**Contexto.** A fila de falhas é visível, mas só para quem olha. Um worker parado, ou um ERP que não responde, deixa eventos esperando sem que ninguém saiba. O comercial pediu "até 5 minutos" ([RNF-01](../02-definicao/01-requisitos.md)).

**Alternativas.**
1. Notificação ativa (e-mail, chat). Resolve melhor, mas exige um canal de saída que o projeto não tem e um segredo a mais para guardar.
2. Alerta no painel e na API, com limite derivado do RNF-01. Barato, usa só o que existe.
3. Só documentar "olhe o painel todo dia". Não muda nada.

**Escolha.** Opção 2, registrada no [ADR-012](../03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md): `GET /v1/admin/alerts` e um banner em todas as telas do painel.

**Motivo.** É a menor mudança que fecha o risco R-07 ("fila parada sem ninguém ver"), e a API de alertas é o que uma notificação futura consumiria.

**Trade-off.** Continua dependendo de alguém olhar o painel ou de algo consultar a API. O limite de 5 minutos é uma regra única; não distingue horários.

**Quando eu mudaria de ideia.** Se a operação não abrisse o painel com regularidade, a opção 1 passaria a ser a prioridade, consumindo a mesma API.

### Por que 2 e 3 ficam para depois
- **2** muda o contrato do ERP (novo evento) e o do CRM (novo valor de status), e depende do ERP simples emitir o evento; o desencontro hoje é detectado pela reconciliação, então o risco é conhecido e visível.
- **3** é pequena, mas o custo atual (minutos de eventos recusados, que o CRM guarda e permite reenviar) é baixo para o volume do cenário.

## Ações
1. Implementar a melhoria 1 em branch, com PR, changelog e `v1.1.0`.
2. Registrar 2 e 3 no roadmap.
3. Manter a regra do projeto: nenhuma melhoria entra sem teste automatizado.
