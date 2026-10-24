# 02 — Histórias de usuário, critérios de aceite e MoSCoW

Formato dos critérios: Dado / Quando / Então. Cada história aponta para requisitos (RF/RNF) e regras (RN).

| ID | História | MoSCoW | Sprint |
|---|---|---|---|
| US-01 | Receber o negócio ganho com segurança | Must | 1 |
| US-02 | Cliente sem duplicidade | Must | 1 |
| US-03 | Pedido e cobrança no ERP | Must | 1 |
| US-04 | IDs do ERP no CRM | Must | 1 |
| US-05 | Evento repetido é ignorado | Must | 2 |
| US-06 | Retentativa quando o ERP falha | Must | 2 |
| US-07 | Fila de falhas (dead-letter) e reprocessamento | Must | 2 |
| US-08 | Pagamento atualiza o CRM | Should | 3 |
| US-09 | Reconciliação aponta divergências | Must (promovida na reunião 3) | 3 |
| US-10 | Mapeamento de campos configurável | Should | 1 e 3 |
| US-11 | Painel de integração | Must (básico) | 3 |
| US-12 | Catálogo de erros | Should | 3 |
| US-13 | Evento fora de ordem | Should | 2 |

**Won't (neste MVP):** nota fiscal, sistemas reais, multiempresa, mensageria externa, cancelamento/alteração de pedido, evento de liberação de conferência.

---

### US-01 — Receber o negócio ganho com segurança (RF-01, RF-02, RNF-04, RN-01)
Como **vendedor**, quero que a marcação de "Ganho" chegue à Ponte de forma segura, para que a venda entre no fluxo sem eu avisar ninguém.
- **Dado** um webhook com assinatura HMAC válida e timestamp dentro de 5 min, **quando** a Ponte recebe, **então** responde `202` e grava o evento como `RECEIVED` antes de qualquer chamada ao ERP.
- **Dado** assinatura inválida, **então** responde `401` com `PONTE-AUTH-001` e nada é gravado.
- **Dado** timestamp fora da janela, **então** `401` com `PONTE-AUTH-002`.
- **Dado** payload fora do contrato, **então** `400` com `PONTE-REQ-001`.

### US-02 — Cliente sem duplicidade (RF-04, RN-02)
Como **analista financeira**, quero que o cliente seja identificado pelo CNPJ, para não ter cadastro duplicado.
- **Dado** CNPJ inexistente no ERP, **então** o cliente é criado.
- **Dado** CNPJ já existente com outro nome, **então** nenhum cliente novo é criado, telefone e e-mail são atualizados quando diferentes e a razão social permanece.
- **Dado** dois negócios do mesmo CNPJ processados ao mesmo tempo, **então** existe um único cliente no ERP.

### US-03 — Pedido e cobrança no ERP (RF-05, RF-07, RN-04, RN-05, RN-06)
Como **analista financeira**, quero pedido e cobrança prontos e corretos, para não redigitar.
- **Dado** negócio de R$ 12.500,50 e prazo de 30 dias, **então** o pedido tem total de 1.250.050 centavos e a cobrança vence 30 dias após o ganho com status `ABERTA`.
- **Dado** valor ≥ R$ 50.000,00, **então** a cobrança nasce `EM_CONFERENCIA`.
- **Dado** CNPJ inválido, valor inválido ou prazo fora de 0–90, **então** o evento vai à fila de falhas com código e motivo, sem criar nada no ERP.

### US-04 — IDs do ERP no CRM (RF-06)
Como **vendedor**, quero ver no CRM os identificadores do pedido e da cobrança.
- **Dado** processamento concluído, **então** o negócio no CRM mostra `erpOrderId`, `erpInvoiceId` e o status da cobrança.
- **Dado** o CRM indisponível no retorno, **então** o evento é retentado sem recriar pedido nem cobrança.

### US-05 — Evento repetido é ignorado (RF-03, RN-03)
Como **gerente comercial**, quero que um reenvio não gere cobrança dupla.
- **Dado** o mesmo evento (mesmo id) enviado duas vezes, ou 10 vezes em paralelo, **então** existe um evento, um pedido e uma cobrança, e as demais respostas são `200 duplicate`.
- **Dado** novo evento de ganho do mesmo negócio com outro id, **então** é ignorado com `PONTE-SYNC-003`.

### US-06 — Retentativa quando o ERP falha (RF-08, RNF-03, RN-09)
Como **responsável de TI**, quero que falhas temporárias sejam retentadas sozinhas.
- **Dado** o ERP fora, **então** o evento fica `RETRYING`, cada tentativa é registrada, e o intervalo cresce exponencialmente até o teto.
- **Dado** o ERP de volta durante as tentativas, **então** o evento termina `PROCESSED` sem duplicar nada.
- **Dado** erro permanente (4xx), **então** não há retentativa.

### US-07 — Fila de falhas e reprocessamento (RF-09, RN-10)
Como **analista financeira**, quero ver o que ficou parado e por quê, e reprocessar.
- **Dado** esgotadas as tentativas ou erro permanente, **então** o evento fica `DEAD` com código, causa e ação recomendada.
- **Dado** evento `DEAD`, **quando** peço reprocessamento, **então** ele volta à fila com tentativas zeradas e, concluindo, não duplica.
- **Dado** evento que não está `DEAD`, **então** o reprocessamento é recusado (`409`, `PONTE-ADM-001`).

### US-08 — Pagamento atualiza o CRM (RF-10, RN-08)
Como **vendedor**, quero saber no CRM quando o cliente pagou.
- **Dado** cobrança `ABERTA` paga no ERP, **então** o negócio no CRM vai a `PAGO` com a data.
- **Dado** o webhook de pagamento chegando antes do vínculo, **então** o evento é retentado.
- **Dado** o mesmo pagamento repetido, **então** é ignorado.

### US-09 — Reconciliação aponta divergências (RF-12, RN-11)
Como **analista financeira**, quero uma lista do que está diferente entre CRM e ERP.
- **Dado** negócio ganho sem pedido após a carência, **então** divergência `NOT_SYNCED`.
- **Dado** valor diferente, **então** `AMOUNT_MISMATCH` com os dois valores.
- **Dado** cobrança paga no ERP e não no CRM, **então** `BILLING_STATUS_MISMATCH`.
- **Dado** divergência corrigida, **então** ela é marcada como resolvida na próxima execução.

### US-10 — Mapeamento configurável (RF-07)
Como **responsável de TI**, quero ajustar o mapeamento sem mudar código.
- **Dado** uma nova versão de mapeamento válida, **então** ela fica ativa para os próximos eventos e a anterior permanece no histórico.
- **Dado** mapeamento com transformação desconhecida, **então** é recusado (`PONTE-MAP-001`).

### US-11 — Painel de integração (RF-11)
Como **analista**, quero um painel com o estado da integração.
- **Dado** eventos em vários estados, **então** o painel lista eventos, status, tempo de processamento e tentativas, mostra a fila de falhas com botão de reprocessar e as divergências com botão de rodar a reconciliação.

### US-12 — Catálogo de erros (RF-13)
Como **responsável de TI**, quero saber a causa e a ação para cada código de erro.
- **Então** existe uma página/documento com código, status HTTP, retentável, causa e ação, gerado da mesma fonte que o código usa.

### US-13 — Evento fora de ordem (RF-14, RN-07)
Como **analista financeira**, quero que um evento antigo não sobrescreva um mais novo.
- **Dado** `deal.won` versão 5 aceito e depois versão 3 do mesmo negócio, **então** o de versão 3 termina `IGNORED` com `PONTE-SYNC-002`.
