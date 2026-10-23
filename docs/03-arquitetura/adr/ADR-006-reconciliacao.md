# ADR-006 — Reconciliação

**Status:** aceita · **Requisitos:** RF-12, RNF-09 · **Regras:** RN-11

## Contexto
O ERP não reenvia webhook perdido; o CRM envia uma vez. Mesmo com idempotência e retentativa, CRM e ERP podem divergir (evento perdido, edição manual no ERP, liberação de conferência sem evento).

## Alternativas
1. **Nenhuma:** confiar nos eventos. Divergência silenciosa.
2. **Ressincronização total** periódica, sobrescrevendo um lado. Perigosa: pode apagar correções manuais legítimas.
3. **Comparação periódica somente-leitura**, que registra divergências e propõe correção assistida.

## Escolha
Opção 3. A cada 15 minutos (padrão) e sob demanda pelo painel:
1. Lista os negócios `GANHO` no CRM.
2. Lista pedidos e cobranças do ERP com `externalRef` da Ponte.
3. Compara vínculo, valor e status de cobrança.
4. Faz upsert de `Divergence` (chave `tipo:negócio`), e marca como resolvidas as que deixaram de existir.

Tipos: `NOT_SYNCED` (ganho sem pedido após a carência de 120 s), `AMOUNT_MISMATCH`, `BILLING_STATUS_MISMATCH`, `ORDER_MISSING_IN_ERP`, `CRM_LINK_MISSING`.

**Correção assistida:** só `BILLING_STATUS_MISMATCH` tem ação ("copiar status do ERP para o CRM"); as demais exigem decisão humana, porque não é óbvio qual lado está certo.

## Motivo
Detectar sem agir é seguro. A carência evita falso positivo para eventos em voo. O ERP é a fonte de verdade para o status da cobrança, então copiar esse status é seguro; para valor, depende do caso.

## Trade-off
Chamadas extras às duas APIs a cada ciclo e comparação em memória (adequado ao volume do cenário; para volumes grandes eu compararia por janelas de data).

## Quando eu mudaria de ideia
Com volume grande, passaria a comparar apenas o que mudou desde a última execução (cursor por data de alteração) e faria a execução completa uma vez por dia.
