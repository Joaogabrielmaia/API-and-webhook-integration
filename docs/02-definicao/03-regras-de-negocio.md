# 03 — Regras de negócio

| ID | Regra | Detalhe |
|---|---|---|
| RN-01 | **Quando criar** | Um evento `deal.won` (versão 1) com assinatura válida, CNPJ válido, valor válido e prazo válido cria ou atualiza o cliente e cria pedido e cobrança. |
| RN-02 | **Duplicidade de cliente** | O CNPJ (14 dígitos, sem máscara) identifica o cliente. Se já existe no ERP: atualiza telefone e e-mail quando informados e diferentes; **nunca altera a razão social**. Nome diferente com o mesmo CNPJ não cria outro cliente. |
| RN-03 | **Duplicidade de evento e de negócio** | Mesma chave de idempotência (id do evento) = ignorar, respondendo 200 com `duplicate`. Um negócio gera **no máximo um pedido**: novo `deal.won` do mesmo negócio com outra chave é ignorado (`PONTE-SYNC-003`). Se o valor mudou, a reconciliação aponta a divergência; a Ponte não altera pedido já criado. |
| RN-04 | **Valor** | Maior que zero e até R$ 1.000.000,00. Aceita `12.500,50`, `12500,50`, `12500.50` e `R$ 12.500,50`. Conversão para centavos sem ponto flutuante. |
| RN-05 | **Prazo** | Inteiro de 0 a 90 dias. Vencimento = data do ganho + prazo. Prazo ausente: 30 dias (padrão configurável). |
| RN-06 | **Conferência** | Valor ≥ R$ 50.000,00 gera cobrança com status `EM_CONFERENCIA`; abaixo, `ABERTA`. Só cobrança `ABERTA` pode ser paga. O financeiro libera no ERP. |
| RN-07 | **Evento obsoleto** | Para o mesmo negócio, um evento com `version` menor que a de outro evento aceito do mesmo negócio é ignorado (`PONTE-SYNC-002`). |
| RN-08 | **Pagamento** | `invoice.paid` atualiza `billingStatus=PAGO` e a data de pagamento no CRM. Repetição é ignorada. Se o negócio ainda não foi vinculado, o evento é retentado (`PONTE-SYNC-001`). |
| RN-09 | **Classificação de erro** | Erro **permanente** (validação, 4xx do ERP exceto 408/429) vai direto à fila de falhas (dead-letter), sem retentativa. Erro **temporário** (rede, timeout, 5xx, 408, 429) retenta com backoff até 12 tentativas e então vai à fila de falhas. |
| RN-10 | **Reprocessamento** | Só eventos em `DEAD` podem ser reprocessados. O reprocessamento zera as tentativas e reaproveita as mesmas chaves idempotentes, então não duplica. |
| RN-11 | **Reconciliação** | Negócio em `GANHO` há mais que a carência (120 s) sem vínculo, ou com valor ou status de cobrança diferente do ERP, abre uma divergência. A divergência é fechada automaticamente quando deixa de existir. |
| RN-12 | **Liberação de conferência** | A mudança de `EM_CONFERENCIA` para `ABERTA` acontece no ERP. No MVP ela **não** gera evento; a reconciliação mostra a diferença de status. Evento de liberação está no roadmap. |

## Notas sobre decisões
- **RN-04/RN-05** foram refinadas por mim a partir de pedidos vagos ("valor certinho", "prazo combinado"). Os limites (R$ 1 milhão, 90 dias) são valores razoáveis do cenário fictício, configuráveis por constante.
- **RN-06** nasceu da contradição entre comercial e financeiro ([reunião 2](../01-discovery/04-reuniao-2-analista-financeira.md)).
