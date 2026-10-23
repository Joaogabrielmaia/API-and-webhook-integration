# ADR-001 — Orientação a eventos vs. consulta periódica

**Status:** aceita · **Requisitos:** RF-01, RF-10, RF-12, RNF-01, RNF-09

## Contexto
A Ponte precisa saber quando um negócio foi ganho (CRM) e quando uma cobrança foi paga (ERP). O comercial quer "na hora" ([reunião 1](../../01-discovery/03-reuniao-1-gerente-comercial.md)); o ERP não reenvia webhook perdido ([reunião 3](../../01-discovery/05-reuniao-3-responsavel-de-ti.md)).

## Alternativas
1. **Só webhook (eventos).** Rápido, mas qualquer evento perdido vira divergência silenciosa.
2. **Só consulta periódica (polling).** Robusta contra perda, mas a latência é o intervalo do polling e cada ciclo custa chamadas à API.
3. **Híbrida: eventos como caminho principal + reconciliação periódica como rede de segurança.**

## Escolha
Opção 3.

## Motivo
Os eventos dão a latência que o comercial pediu. A reconciliação ([ADR-006](ADR-006-reconciliacao.md)) cobre exatamente a fraqueza dos eventos: perda. Cada mecanismo cobre o ponto cego do outro.

## Trade-off
Dois mecanismos para manter e explicar. Em compensação, o custo do polling é baixo porque a reconciliação roda a cada 15 minutos (padrão), e não a cada poucos segundos.

## Quando eu mudaria de ideia
- Se o CRM não oferecesse webhook, eu faria polling incremental (por data de alteração) como caminho principal.
- Se o ERP passasse a garantir reenvio com confirmação, eu reduziria a frequência da reconciliação.
