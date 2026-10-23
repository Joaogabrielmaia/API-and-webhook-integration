# Fase 5: Implementação

### 1. O que acontece, passo a passo, quando um negócio é marcado como Ganho?
**R.** O CRM envia `deal.won` assinado com HMAC-SHA256 sobre o corpo bruto e um timestamp. A Ponte confere assinatura (comparação em tempo constante), janela de 5 minutos, formato e versão; grava `Event` e `Job` na mesma transação e responde 202. Um worker pega o job, aplica o mapeamento (CNPJ, telefone, valor e prazo), cria ou atualiza o cliente por CNPJ, cria pedido e cobrança com chaves idempotentes, grava o vínculo e devolve os IDs ao CRM. Cada passo é idempotente, então uma retentativa retoma de onde parou.

### 2. Como você tratou o evento que chega fora de ordem?
**R.** Dois casos, duas regras. Versões do mesmo negócio: o evento carrega a `version` do negócio, e um evento com versão menor que a de outro já aceito é ignorado (`PONTE-SYNC-002`). Pagamento antes do vínculo: o `invoice.paid` que chega antes de a Ponte registrar o vínculo da cobrança é um erro **temporário** (`PONTE-SYNC-001`) e é retentado até o vínculo existir. Testei os dois, inclusive o segundo com o job do negócio deliberadamente atrasado.

### 3. Como a reconciliação funciona e por que ela não corrige tudo sozinha?
**R.** ([ADR-006](../03-arquitetura/adr/ADR-006-reconciliacao.md)) Lê os negócios ganhos do CRM e os pedidos e cobranças do ERP, compara vínculo, valor e status, e registra divergências (cinco tipos) com chave `tipo:negócio`, então rodar de novo não duplica; o que deixou de divergir fecha sozinho. Só o status da cobrança tem correção assistida, porque o ERP é a fonte de verdade desse campo; para valor não é óbvio qual lado está certo. E se o CRM ou o ERP estiverem fora, a execução **falha sem alterar nada**: não dá para afirmar que algo deixou de divergir sem ter visto os dois lados.
