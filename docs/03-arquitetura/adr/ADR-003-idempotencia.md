# ADR-003 — Idempotência

**Status:** aceita · **Requisitos:** RF-03, RF-04, RF-05, RF-14 · **Regras:** RN-02, RN-03, RN-07

## Contexto
Webhooks são entregues pelo menos uma vez; a fila retenta; o usuário pode reenviar. Duplicar um pedido ou uma cobrança é o pior erro possível aqui ([R-01](../../02-definicao/05-riscos.md)).

## Alternativas
1. **Só deduplicar o evento** (chave única no banco). Não protege contra falha no meio do processamento: o pedido pode ter sido criado e o worker cair antes de registrar.
2. **Só deduplicar no destino** (ERP recusa duplicata). Protege a criação, mas a Ponte ainda recebe e processa repetido.
3. **Camadas**: deduplicar na entrada, no vínculo e no destino.

## Escolha
Três camadas, cada uma cobrindo uma falha diferente:

| Camada | Mecanismo | Cobre |
|---|---|---|
| Entrada | `Event.idempotencyKey` único (id do evento do produtor) | Reenvio e disparo concorrente do mesmo evento |
| Negócio | `DealLink.crmDealId` único | Outro evento de ganho do mesmo negócio (chave diferente) |
| Destino | `externalRef` único no ERP (`ponte:deal:<id>`, `ponte:deal:<id>:inv`); o ERP devolve o registro existente com `Idempotent-Replay: true` | Queda do worker depois de criar e antes de gravar o vínculo |

Cliente: identificado pelo CNPJ, com unicidade no ERP e no `CustomerLink`; em corrida, o 409 do ERP leva a uma nova consulta.

**Fora de ordem (RN-07):** o evento carrega `version` do negócio. Um evento com versão menor que a de outro evento aceito do mesmo negócio é ignorado.

## Motivo
Cada camada sozinha deixa uma falha descoberta. Juntas, o efeito de qualquer passo repetido é nulo.

## Trade-off
Mais colunas e restrições, e o ERP precisa oferecer um campo de referência externa única. Em sistemas reais que não têm esse campo, eu usaria uma tabela de correlação do lado da Ponte e uma consulta antes de criar, aceitando uma janela de corrida pequena.

## Quando eu mudaria de ideia
Se o produtor não oferecesse um id de evento estável, eu derivaria a chave de `dealId + version`.
