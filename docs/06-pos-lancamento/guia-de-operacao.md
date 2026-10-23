# Guia de operação

Para quem acompanha a integração no dia a dia (no cenário fictício, a analista financeira e o responsável de TI). Tudo aqui vale para a execução local do estudo; **não existe operação real nem produção**.

## Rotina

| Quando | O que olhar | Onde |
|---|---|---|
| No começo do dia | "Na fila de falhas" e "Divergências abertas" devem estar em zero, ou com motivo conhecido | Painel, **Visão geral** |
| Depois de qualquer indisponibilidade do ERP | "Em retentativa" deve esvaziar sozinho; o que sobrar em "Fila de falhas" precisa de ação | Painel, **Eventos** e **Fila de falhas** |
| Uma vez por semana, ou quando alguém reclamar | Rodar a reconciliação e ler a lista | Painel, **Divergências** |

## O que fazer em cada situação

### Evento na fila de falhas
Abra o evento (ou a tela **Fila de falhas**): o código, a causa e a ação recomendada estão lá. A tabela completa está no [catálogo de erros](../04-contratos-de-api/catalogo-de-erros.md).

| Código | Significa | O que fazer |
|---|---|---|
| `PONTE-VAL-001` a `004` | Dado do negócio inválido (CNPJ, valor, prazo, campo obrigatório) | Corrigir **no CRM**. O evento antigo guarda uma cópia do dado errado; reprocessá-lo falha de novo. Depois de corrigir, mova o negócio para outra etapa e de volta para **Ganho**: isso gera um evento novo, que passa. O evento antigo pode ficar na fila como registro |
| `PONTE-ERP-001`, `003`, `004` com "Tentativas esgotadas" | O ERP ficou fora por mais tempo que a janela de retentativa | Confirmar que o ERP voltou e clicar em **Reprocessar**. Não duplica |
| `PONTE-ERP-002` | O ERP recusou o dado | Ler o detalhe do erro do ERP no evento, corrigir o dado ou o mapeamento, depois reprocessar |
| `PONTE-CRM-002` | O CRM recusou o retorno (negócio apagado ou chave errada) | Verificar o negócio e a chave `CRM_API_KEY` |
| `PONTE-INT-001` | Erro interno inesperado | Guardar o `eventId` e o texto do erro; é um defeito da Ponte |

### Divergência apontada pela reconciliação

| Tipo | Leitura | Decisão |
|---|---|---|
| Ganho sem pedido (`NOT_SYNCED`) | O CRM diz "Ganho", a Ponte não tem pedido | Se o evento está na fila de falhas, trate-o ali. Se a Ponte nunca viu o evento, reenvie a entrega no CRM (**Entregas de webhook → Reenviar**) |
| Status da cobrança diferente (`BILLING_STATUS_MISMATCH`) | Quase sempre pagamento ou liberação de conferência que não chegou ao CRM | Clique em **Copiar status do ERP para o CRM**. O ERP é a fonte de verdade do status |
| Valor diferente (`AMOUNT_MISMATCH`) | O negócio mudou no CRM depois do pedido criado | **Decisão humana**: ou o pedido do ERP está desatualizado, ou o CRM foi alterado por engano. A Ponte não altera pedido existente |
| Pedido ausente no ERP (`ORDER_MISSING_IN_ERP`) | Alguém apagou o pedido no ERP | Decisão humana |
| CRM sem os IDs do ERP (`CRM_LINK_MISSING`) | O pedido existe, mas o retorno ao CRM não aconteceu | Normalmente se resolve sozinho se há retentativa em andamento; senão, verificar o CRM |

Uma divergência corrigida some sozinha (vira "resolvida") na execução seguinte.

### Webhook perdido
O CRM e o ERP enviam **uma vez** e não reenviam. Se a Ponte estava fora:
- Do CRM: **Entregas de webhook → Reenviar** (mesmo id de evento, então não duplica).
- Do ERP: reenviar a entrega pela API (`POST /v1/webhook-deliveries/{id}/resend` no ERP) ou deixar a reconciliação apontar o status diferente.

### Trocar o mapeamento de campos
Pela API: `PUT /v1/admin/mapping` com a lista de regras. A Ponte valida (destinos e transformações da lista fechada, campos obrigatórios cobertos, evento de exemplo mapeável) e só então ativa. A versão anterior continua no histórico (tela **Mapeamento**). **Eventos já recebidos usam a versão ativa no momento em que são processados**, não a do recebimento.

### Trocar um segredo de webhook
Hoje: trocar a variável (`CRM_WEBHOOK_SECRET` ou `ERP_WEBHOOK_SECRET`) no produtor e na Ponte e reiniciar os dois. Entre os dois reinícios, eventos são recusados com `PONTE-AUTH-001` (o CRM guarda a entrega como falha e permite reenvio). Aceitar dois segredos durante a troca está no [roadmap](roadmap.md).

## Variáveis que mudam o comportamento

| Variável | Padrão | Efeito |
|---|---|---|
| `RETRY_MAX_ATTEMPTS` | 12 | Tentativas antes da fila de falhas |
| `RETRY_BASE_MS` / `RETRY_CAP_MS` | 30 s / 30 min | Backoff exponencial entre tentativas (ver [ADR-004](../03-arquitetura/adr/ADR-004-retentativa-com-backoff.md)) |
| `CONFERENCE_THRESHOLD_CENTS` | 5.000.000 | Valor (em centavos) a partir do qual a cobrança nasce em conferência |
| `RECON_INTERVAL_SECONDS` | 900 | Intervalo da reconciliação agendada (0 desliga) |
| `RECON_GRACE_SECONDS` | 120 | Carência para negócios recém-ganhos |
| `WORKER_CONCURRENCY` | 4 | Jobs processados ao mesmo tempo |

## Como investigar um evento
Cada linha de log da Ponte traz `eventId`. No painel, abra o evento: o histórico de tentativas mostra cada erro, a duração e a próxima tentativa. O `requestId` de uma resposta de erro também aparece nos logs.
