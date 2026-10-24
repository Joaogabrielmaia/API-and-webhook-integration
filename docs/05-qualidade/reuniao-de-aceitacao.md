# Reunião de aceitação (v1.0)

> Reunião simulada; pessoas e empresa fictícias.

**Participantes:** Marcos Oliveira (gerente comercial), Patrícia Souza (analista financeira), Rogério Lima (responsável de TI), todos fictícios, e eu.
**Formato:** eu apresento os cenários rodando de verdade e eles reagem. O que é **real** aqui é o que a Ponte fez e os números de teste citados; as **reações** das pessoas são simuladas.
**Material:** [demo-cenarios.txt](resultados/demo-cenarios.txt) (saída real dos scripts de demonstração), [falha-injetada.md](falha-injetada.md), os [prints](../screenshots/) e a [saída dos testes](resultados/execucao-dos-testes.txt).

## Cenário por cenário

| # | Cenário (executado de verdade) | Resultado real | Reação simulada |
|---|---|---|---|
| 1 | Vendedor marca **Ganho** no CRM ([print 01](../screenshots/01-crm-negocio-ganho.png)) | Cliente, pedido e cobrança no ERP; IDs e status de volta no CRM. Nas execuções locais, do ganho até `PROCESSED` levou de 122 a 465 ms (o evento de pagamento, 54 ms) | **Marcos:** "Era isso. Agora o vendedor não manda mensagem pra ninguém." |
| 2 | Mesmo evento enviado 2 vezes | Duas respostas `200 duplicate`, um único pedido | **Patrícia:** "Esse era meu medo: cobrar duas vezes." |
| 3 | CNPJ com dígito errado | `PONTE-VAL-001`, direto para a fila de falhas (dead-letter), nada criado no ERP ([print 10](../screenshots/10-painel-fila-de-falhas.png)) | **Patrícia:** "Gostei de ver o motivo e o que fazer. Mas o vendedor precisa ser avisado." (ver pendências) |
| 4 | ERP derrubado no meio de um lote de 20 ([falha injetada](falha-injetada.md)) | 20 de 20 processados, 0 duplicidade, 16 precisaram de retentativa | **Rogério:** "Essa é a janela do backup. Se funcionar com o ERP caindo de verdade, serve." |
| 5 | ERP fora além das tentativas | 5 de 5 na fila de falhas, depois 5 de 5 reprocessados à mão | **Rogério:** "E se ninguém olhar a fila?" (ver pendências) |
| 6 | Baixa no ERP ([print 05](../screenshots/05-crm-cobranca-paga.png)) | CRM mostra **Pago** | **Marcos:** "Meus vendedores vão parar de perguntar." |
| 7 | Valor mudou no CRM depois do pedido | Reconciliação: `AMOUNT_MISMATCH` com os dois valores ([print 12](../screenshots/12-painel-divergencias-da-reconciliacao.png)) | **Patrícia:** "É isso que eu queria: descobrir antes do cliente." |
| 8 | Cobrança acima de R$ 50.000 | Nasce `EM_CONFERENCIA` e não pode ser paga até liberar | **Patrícia:** "Certo. Mas depois que eu libero, o CRM continua dizendo 'em conferência'." |

## Critérios de aceite

| Critério (de [02-historias-e-moscow.md](../02-definicao/02-historias-e-moscow.md)) | Situação |
|---|---|
| US-01 a US-07 | Aceitas. Cada uma tem teste automatizado (ver [rastreabilidade](../02-definicao/07-rastreabilidade.md)) |
| US-08 pagamento atualiza o CRM | Aceita |
| US-09 reconciliação | Aceita, **com ressalva**: a liberação de conferência no ERP não gera evento (RN-12), então o CRM só se acerta quando a reconciliação roda |
| US-10 mapeamento | Aceita. Publicar versão nova é só pela API; tela de edição ficou fora |
| US-11 painel | Aceita para o MVP |
| US-12 catálogo de erros | Aceita |
| US-13 fora de ordem | Aceita |

## Pendências e pedidos que saíram da reunião
1. **Fila parada sem ninguém ver** (Rogério): um alerta quando há trabalho esperando além do normal. → vira a **v1.1** ([PR](../06-pos-lancamento/pr-v1.1.md)).
2. **Aviso ao vendedor quando o evento vai para a fila de falhas** (Patrícia, Marcos). → fora do escopo (a Ponte não tem canal de notificação); fica no [roadmap](../06-pos-lancamento/roadmap.md).
3. **Evento de liberação de conferência** (Patrícia): evitar o desencontro de status até a reconciliação. → roadmap.
4. **Rotação de segredo de webhook** (Rogério): trocar o segredo sem derrubar a integração. → roadmap.

## O que esta reunião não prova
Ela foi simulada. Mostra que o produto cumpre o que eu entendi dos requisitos, **não** que uma operação real o aceitaria. A validação de verdade exigiria o modo sombra descrito em [06-ganhos-como-hipoteses.md](../02-definicao/06-ganhos-como-hipoteses.md).
