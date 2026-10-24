# 06 — Ganhos esperados (hipóteses, não medições)

> Reunião simulada; pessoas e empresa fictícias.

Nenhum número abaixo foi medido. Todos vêm de **estimativas dadas na simulação** e de fórmulas que eu deixo visíveis para que qualquer pessoa troque as entradas.

## H1 — Tempo de redigitação evitado
`horas/mês = vendas/mês × min/venda × (1 − fração manual) ÷ 60`

| Entrada | Valor (estimativa simulada) |
|---|---|
| vendas/mês | 30 |
| min/venda | 15 |
| fração que continua manual | 0,10 |

Resultado da fórmula: **6,75 h/mês**. Muda se as entradas mudarem.

## H2 — Cobranças criadas com dado divergente evitadas
`divergências evitadas/mês = vendas/mês × taxa de erro de digitação atual`

A taxa de erro atual **não é conhecida**: ninguém mediu. Por isso a hipótese é "a taxa cai a perto de zero para os campos mapeados (CNPJ, valor, prazo), porque o dado deixa de ser redigitado". Para validar, seria preciso medir a taxa atual por amostragem antes da implantação e depois da implantação.

## H3 — Latência entre ganho e cobrança
Hipótese: de "horas ou dias" (fila de mensagens) para "minutos" (meta de 5 min, RNF-01). O que eu **consigo** medir neste repositório é o tempo em ambiente local; isso não prova a latência em operação.

## Como validar de verdade
1. Medir 2–4 semanas de base: vendas, tempo por repasse, erros achados na conferência.
2. Rodar a Ponte em paralelo (modo sombra) e comparar.
3. Só então trocar as entradas desta página por dados reais.
