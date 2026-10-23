# Catálogo de erros

> Este arquivo é **gerado** por `npm run docs:errors` a partir de `packages/shared/src/errors.ts`, a mesma fonte usada pelo código, pela API (`GET /v1/admin/errors`) e pelo painel. Não edite à mão.

**Tipo:** *temporário* = a Ponte retenta com backoff (até 12 tentativas na política padrão); *permanente* = vai direto para a fila de falhas. Eventos `IGNORED` (obsoletos ou já vinculados) não são falhas.

## Ponte: recebimento de webhooks e requisições

Erros devolvidos pela API da Ponte. O corpo segue `{ error: { code, message, requestId, details? } }`.

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `PONTE-AUTH-001` | 401 | permanente | **Assinatura inválida.** A assinatura HMAC não confere com o corpo recebido, ou o cabeçalho está ausente ou malformado. Pode ser segredo errado ou corpo alterado no caminho. | Conferir se o produtor usa o mesmo segredo (variável de ambiente) e se assina o corpo bruto, sem reformatar o JSON. |
| `PONTE-AUTH-002` | 401 | permanente | **Timestamp fora da janela.** O X-Timestamp difere do relógio da Ponte por mais de 5 minutos (relógio desalinhado ou tentativa de replay). | Sincronizar o relógio do produtor. Para reenviar um evento antigo, gerar uma nova assinatura com timestamp atual (mesmo id de evento). |
| `PONTE-REQ-001` | 400 | permanente | **Requisição fora do contrato.** Corpo ou cabeçalhos não seguem o OpenAPI (JSON inválido, campo obrigatório ausente, X-Event-Id diferente do id do corpo). | Corrigir o produtor conforme `ponte.openapi.yaml`. Os detalhes do erro listam os campos. |
| `PONTE-REQ-002` | 422 | permanente | **Versão de evento não suportada.** O campo `version` do evento tem um valor que esta versão da Ponte não conhece. | Enviar a versão suportada (`1`) ou atualizar a Ponte. Ver política de versão no ADR-007. |
| `PONTE-ADM-001` | 409 | permanente | **Evento não está na fila de falhas.** O reprocessamento manual só vale para eventos em DEAD. | Conferir o estado do evento. Se está em RETRYING, aguardar a próxima tentativa. |
| `PONTE-ADM-002` | 404 | permanente | **Recurso não encontrado.** O identificador informado não existe. | Conferir o identificador. |
| `PONTE-ADM-003` | 401 | permanente | **Chave de administração inválida.** O cabeçalho X-Admin-Key está ausente ou incorreto. | Usar a chave definida em `PONTE_ADMIN_KEY`. |
| `PONTE-ADM-004` | 409 | permanente | **Divergência sem correção assistida.** Só `BILLING_STATUS_MISMATCH` tem correção automática; nos demais tipos não é óbvio qual lado está certo. | Decidir manualmente qual lado corrigir (CRM ou ERP). |
| `PONTE-MAP-001` | 422 | permanente | **Mapeamento inválido.** A nova versão do mapeamento usa destino ou transformação fora da lista permitida, ou não cobre um campo obrigatório. | Corrigir as regras conforme o ADR-008 e publicar de novo. |

## Ponte: validação de dados (erros permanentes)

Acontecem no processamento do evento, antes de qualquer chamada ao ERP. O evento vai direto para a fila de falhas, sem retentativa.

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `PONTE-VAL-001` | — | permanente | **CNPJ inválido.** O CNPJ do cliente não tem 14 dígitos ou o dígito verificador não confere. | Corrigir o CNPJ no CRM e reenviar o evento (reenvio da entrega no CRM) ou, depois de corrigir, reprocessar o evento pelo painel. |
| `PONTE-VAL-002` | — | permanente | **Valor inválido.** O valor está vazio, não é número, é menor ou igual a zero ou excede R$ 1.000.000,00. | Corrigir o valor do negócio no CRM e reenviar o evento. |
| `PONTE-VAL-003` | — | permanente | **Prazo de pagamento inválido.** O prazo não é um inteiro entre 0 e 90 dias. | Corrigir o prazo no CRM e reenviar o evento. |
| `PONTE-VAL-004` | — | permanente | **Campo obrigatório ausente.** Uma regra obrigatória do mapeamento não encontrou valor na origem (por exemplo, nome do cliente vazio). | Preencher o campo no CRM ou revisar o mapeamento ativo. |

## Ponte: chamadas ao ERP e ao CRM

Falhas ao falar com os sistemas. Temporárias são retentadas com backoff; permanentes vão à fila de falhas. A coluna HTTP vale quando o erro é devolvido por uma rota (por exemplo, a reconciliação manual).

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `PONTE-ERP-001` | 502 | temporário | **ERP indisponível.** Conexão recusada ou resposta 5xx do ERP (por exemplo, janela de backup das 23h à 1h). | Nenhuma ação imediata: a Ponte retenta com backoff. Se o evento chegar a DEAD, reprocessar depois que o ERP voltar. |
| `PONTE-ERP-002` | 502 | permanente | **ERP rejeitou a requisição.** O ERP respondeu 4xx (exceto 408 e 429): dado recusado, referência inexistente ou conflito que a Ponte não sabe resolver. | Ler os detalhes do erro do ERP no evento, corrigir o dado de origem ou o mapeamento e reprocessar. |
| `PONTE-ERP-003` | 504 | temporário | **Tempo esgotado no ERP.** O ERP não respondeu dentro de 10 segundos. | Nenhuma ação imediata: a Ponte retenta. Se for recorrente, verificar a carga ou o backup do ERP. |
| `PONTE-ERP-004` | 502 | temporário | **ERP limitou a taxa de chamadas.** O ERP respondeu 429 (limite de requisições). | Nenhuma ação imediata: a Ponte retenta com backoff e jitter. Se recorrente, reduzir a concorrência do worker. |
| `PONTE-CRM-001` | 502 | temporário | **CRM indisponível no retorno.** Conexão recusada, timeout ou 5xx ao devolver os IDs do ERP ou o status da cobrança ao CRM. | Nenhuma ação imediata: pedido e cobrança já existem e ficam vinculados; a retentativa só refaz o retorno. |
| `PONTE-CRM-002` | 502 | permanente | **CRM rejeitou o retorno.** O CRM respondeu 4xx ao retorno (negócio inexistente, chave de API inválida). | Verificar se o negócio ainda existe no CRM e a chave `CRM_API_KEY`; depois reprocessar. |

## Ponte: sincronização e ordem dos eventos

`SYNC-001` é temporário; os demais fazem o evento terminar como `IGNORED`, que não é erro.

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `PONTE-SYNC-001` | — | temporário | **Cobrança ainda não vinculada a um negócio.** O pagamento chegou antes de a Ponte registrar o vínculo da cobrança (evento fora de ordem). | Nenhuma ação: a Ponte retenta até o vínculo existir. Se esgotar, verificar se o evento `deal.won` correspondente está em DEAD. |
| `PONTE-SYNC-002` | — | permanente | **Evento obsoleto ignorado.** Existe outro evento aceito do mesmo negócio com versão maior. | Nenhuma ação: o evento mais novo prevalece. |
| `PONTE-SYNC-003` | — | permanente | **Negócio já vinculado.** O negócio já gerou pedido e cobrança (regra RN-03: um negócio, um pedido). | Nenhuma ação. Se o valor mudou depois do ganho, a reconciliação apontará `AMOUNT_MISMATCH` para decisão humana. |
| `PONTE-SYNC-004` | — | permanente | **Pagamento já registrado.** A cobrança já estava marcada como paga na Ponte. | Nenhuma ação. |
| `PONTE-SYNC-005` | — | permanente | **Cobrança fora do escopo da Ponte.** O pagamento é de uma cobrança cuja referência externa não foi criada pela Ponte. | Nenhuma ação: cobranças lançadas à mão no ERP não são sincronizadas. |

## Ponte: erro interno

Exceção não prevista; tratada como temporária.

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `PONTE-INT-001` | 500 | temporário | **Erro interno inesperado.** Exceção não prevista durante o processamento. | A Ponte retenta. Se persistir até DEAD, abrir o evento no painel, ler o erro e corrigir o código. |

## CRM simples

Sistema simples criado neste repositório.

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `CRM-AUTH-001` | 401 | permanente | **Chave de API inválida.** X-Api-Key ausente ou incorreta. | Usar `CRM_API_KEY`. |
| `CRM-REQ-001` | 400 | permanente | **Requisição inválida.** Corpo fora do contrato do CRM. | Corrigir conforme `crm.openapi.yaml`. |
| `CRM-NOTFOUND-001` | 404 | permanente | **Recurso não encontrado.** Cliente, negócio ou entrega inexistente. | Conferir o identificador. |

## ERP simples

Sistema simples criado neste repositório.

| Código | HTTP | Tipo | Causa | Ação recomendada |
|---|---|---|---|---|
| `ERP-AUTH-001` | 401 | permanente | **Chave de API inválida.** X-Api-Key ausente ou incorreta. | Usar `ERP_API_KEY`. |
| `ERP-VAL-001` | 422 | permanente | **Dados inválidos.** Corpo fora do contrato do ERP (por exemplo, CNPJ sem 14 dígitos). | Corrigir conforme `erp.openapi.yaml`. |
| `ERP-CUSTOMER-EXISTS` | 409 | permanente | **Cliente já existe.** Já há cliente com este CNPJ; o id existente vem em `details.existingId`. | Buscar o cliente por CNPJ e atualizar em vez de criar. |
| `ERP-NOTFOUND-001` | 404 | permanente | **Recurso não encontrado.** Cliente, pedido ou cobrança inexistente. | Conferir o identificador. |
| `ERP-INVOICE-NOT-RELEASABLE` | 409 | permanente | **Cobrança não está em conferência.** Só cobrança EM_CONFERENCIA pode ser liberada. | Conferir o status da cobrança. |
| `ERP-INVOICE-NOT-PAYABLE` | 409 | permanente | **Cobrança não pode ser paga.** Só cobrança ABERTA pode receber pagamento (em conferência ou já paga, não). | Liberar a cobrança em conferência antes de pagar. |
| `ERP-UNAVAILABLE` | 503 | temporário | **ERP indisponível.** O ERP está em manutenção (modo `down` da injeção de falha). | Aguardar o fim da janela. |

