# ADR-005 — Fila de falhas (dead-letter)

**Status:** aceita · **Requisitos:** RF-09, RNF-02 · **Regras:** RN-09, RN-10

## Contexto
Alguns eventos nunca vão passar sozinhos (CNPJ inválido) e outros esgotam as tentativas (ERP fora por muito tempo). A analista financeira pediu: "não quero que a venda suma, quero saber o motivo" ([reunião 2](../../01-discovery/04-reuniao-2-analista-financeira.md)).

## Alternativas
1. **Descartar após N tentativas** e logar. Viola RNF-02.
2. **Fila separada** (tabela própria) para os mortos.
3. **Estado `DEAD` no mesmo `Event`/`Job`**, com causa, código e histórico de tentativas.
4. **Reprocessar automaticamente** a fila de falhas em intervalos.

## Escolha
Opção 3, com **reprocessamento manual** (sem opção 4).

## Motivo
- Um só lugar para consultar o histórico completo de um evento.
- Reprocessar é só voltar o job para `PENDING` e zerar as tentativas; as chaves idempotentes (ADR-003) garantem que não duplica.
- Reprocessar automaticamente um erro permanente só repetiria o erro. Decisão humana (corrigir dado, ajustar mapeamento) deve vir antes.

## Trade-off
Depende de alguém olhar a fila. Para reduzir esse risco, o painel mostra a contagem de falhas na primeira tela e, na v1.1, existe **alerta de fila parada**.

## Quando eu mudaria de ideia
Se a maioria dos mortos fosse por indisponibilidade prolongada (e não por dado), eu adicionaria um reprocessamento automático **somente** para erros temporários esgotados, com limite diário.
