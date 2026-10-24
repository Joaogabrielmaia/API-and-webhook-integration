# ADR-012 — Alerta de fila parada (v1.1)

**Status:** aceita · **Origem:** [retrospectiva da v1.0](../../06-pos-lancamento/retrospectiva.md) · **Risco tratado:** R-07 · **Requisitos:** RF-11, RNF-01, RNF-05

## Contexto
A fila de falhas (dead-letter) é visível no painel, mas ninguém é avisado de que algo parou. Um worker que não roda, ou um ERP lento demais, deixa trabalho esperando em silêncio.

## Alternativas
1. **Notificação ativa** (e-mail, chat): exige canal de saída e segredo extra, e o escopo exclui integrações novas.
2. **Alerta calculado sob demanda, exposto pela API e pelo painel.**
3. **Alerta gravado em tabela por um processo de vigilância.** Mais peças para o mesmo efeito, e o alerta poderia ficar desatualizado.

## Escolha
Opção 2: `GET /v1/admin/alerts` calcula os alertas na hora a partir do estado do banco e do worker. O painel mostra um banner em todas as telas.

| Alerta | Quando | Severidade |
|---|---|---|
| `QUEUE_STALLED` | Existe trabalho **vencido** (job `PENDING` com `runAt` passado, ou job `RUNNING` com bloqueio expirado) há pelo menos `QUEUE_STALL_SECONDS` (padrão **300 s**, o limite de 5 minutos do RNF-01) | `warning`; `critical` a partir de 3× o limite |
| `DEAD_LETTERS_PRESENT` | Há eventos na fila de falhas | `warning` |

- Um job em **retentativa agendada para o futuro** não conta: ele está esperando o backoff, que é o comportamento correto.
- O alerta traz o estado do worker (`running`, `paused`, `lastTickAt`) para diferenciar "worker parado" de "worker vivo mas sem conseguir concluir".
- A idade é calculada com o relógio do banco, o mesmo que agenda as retentativas.

## Motivo
É a menor mudança que fecha o R-07 e reusa o que o painel já consulta. O limite não é um número novo: vem do RNF-01.

## Trade-off
Alguém ou algo precisa consultar o alerta. Não há histórico de alertas: ele reflete o **agora**. O limite é único para qualquer horário (inclusive durante a janela de backup do ERP, em que `DEAD_LETTERS_PRESENT` e retentativas são esperadas; `QUEUE_STALLED` só dispara se o trabalho não estiver em backoff).

## Quando eu mudaria de ideia
- Se ninguém olhasse o painel, eu publicaria os alertas em um canal ativo, consumindo esta mesma API.
- Se o ruído durante a janela de backup incomodasse, eu adicionaria janelas de silêncio por horário.

## Compatibilidade ([ADR-007](ADR-007-versionamento-da-api.md))
Mudança **aditiva**: um endpoint novo, um campo opcional em `/v1/admin/metrics` (`oldestPendingAgeSeconds`) e um campo opcional em `/health` (`worker`). O contrato da Ponte vai de `1.0.0` para `1.1.0`, sem `/v2`.
