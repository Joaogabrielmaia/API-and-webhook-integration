# 03 — Diagramas de sequência

## 1. Fluxo feliz: negócio ganho → cliente, pedido e cobrança → IDs no CRM

```mermaid
sequenceDiagram
    autonumber
    actor V as Vendedor
    participant CRM as CRM simples
    participant P as Ponte (API)
    participant DB as PostgreSQL (Ponte)
    participant W as Worker
    participant ERP as ERP simples

    V->>CRM: marca negócio como Ganho
    CRM->>P: POST /v1/webhooks/crm (deal.won, HMAC)
    P->>P: verifica assinatura, timestamp e formato
    P->>DB: INSERT Event + Job (mesma transação)
    P-->>CRM: 202 Accepted
    W->>DB: claim do job (SKIP LOCKED)
    W->>W: aplica mapeamento e validações
    W->>ERP: GET /customers?taxId=...
    alt cliente não existe
        W->>ERP: POST /customers
    else existe
        W->>ERP: PATCH /customers/:id (só contato)
    end
    W->>ERP: POST /orders (externalRef = ponte:deal:ID)
    W->>ERP: POST /invoices (externalRef = ponte:deal:ID:inv)
    W->>DB: grava DealLink e CustomerLink
    W->>CRM: PUT /deals/:id/erp-link (IDs e status)
    W->>DB: Event = PROCESSED, durationMs
```

## 2. Evento duplicado

```mermaid
sequenceDiagram
    autonumber
    participant CRM as CRM simples
    participant P as Ponte (API)
    participant DB as PostgreSQL
    CRM->>P: POST /v1/webhooks/crm (event id X)
    P->>DB: INSERT Event (idempotencyKey = X)
    P-->>CRM: 202
    CRM->>P: POST /v1/webhooks/crm (mesmo event id X)
    P->>DB: INSERT Event (idempotencyKey = X)
    DB-->>P: violação de unicidade
    P->>DB: UPDATE duplicateCount = duplicateCount + 1
    P-->>CRM: 200 {status: duplicate}
```

## 3. ERP fora: retentativas, fila de falhas (dead-letter) e reprocessamento manual

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker
    participant DB as PostgreSQL
    participant ERP as ERP simples
    actor A as Analista (painel)
    participant P as Ponte (admin)

    W->>DB: claim do job (tentativa 1)
    W->>ERP: GET /customers?taxId=...
    ERP--xW: conexão recusada ou 503
    W->>DB: Attempt(RETRYABLE_ERROR), Event=RETRYING, runAt = agora + backoff(1)
    Note over W,DB: tentativas 2, 3, ... com 30s, 60s, 120s... até o teto de 30 min
    W->>ERP: última tentativa (12ª)
    ERP--xW: falha
    W->>DB: Job=DEAD, Event=DEAD com código e causa
    A->>P: POST /v1/admin/events/:id/reprocess
    P->>DB: valida que está DEAD, zera tentativas, Job=PENDING
    P-->>A: 202
    W->>DB: claim do job
    W->>ERP: GET/POST com as mesmas chaves idempotentes
    ERP-->>W: sucesso
    W->>DB: Event = PROCESSED
```

## 4. Falha no retorno ao CRM (pedido já criado)

```mermaid
sequenceDiagram
    autonumber
    participant W as Worker
    participant ERP as ERP simples
    participant CRM as CRM simples
    participant DB as PostgreSQL
    W->>ERP: cria cliente, pedido e cobrança
    W->>DB: DealLink (erpOrderId, erpInvoiceId, crmNotified=false)
    W->>CRM: PUT /deals/:id/erp-link
    CRM--xW: 503
    W->>DB: Event = RETRYING
    Note over W: na retentativa, o DealLink já tem os IDs
    W->>ERP: POST /orders (mesmo externalRef)
    ERP-->>W: 200 replay (devolve o pedido existente)
    W->>CRM: PUT /deals/:id/erp-link
    CRM-->>W: 200
    W->>DB: crmNotified = true, Event = PROCESSED
```

## 5. Pagamento no ERP → CRM atualizado

```mermaid
sequenceDiagram
    autonumber
    actor F as Financeiro
    participant ERP as ERP simples
    participant P as Ponte (API)
    participant W as Worker
    participant CRM as CRM simples
    F->>ERP: dá baixa na cobrança (POST /invoices/:id/pay)
    ERP->>P: POST /v1/webhooks/erp (invoice.paid, HMAC)
    P-->>ERP: 202
    W->>W: localiza DealLink pela cobrança
    alt vínculo ainda não existe
        W-->>W: erro retentável PONTE-SYNC-001, tenta depois
    else existe
        W->>CRM: PATCH /deals/:id/billing-status (PAGO)
        CRM-->>W: 200
    end
```

## 6. Reconciliação

```mermaid
sequenceDiagram
    autonumber
    participant S as Agendador ou botão do painel
    participant R as Reconciliação
    participant CRM as CRM simples
    participant ERP as ERP simples
    participant DB as PostgreSQL
    S->>R: executar
    R->>CRM: GET /deals?stage=GANHO
    R->>ERP: GET /orders?externalRefPrefix=ponte:deal:
    R->>ERP: GET /invoices?externalRefPrefix=ponte:deal:
    R->>R: compara vínculo, valor e status por negócio
    R->>DB: upsert Divergence (OPEN) para o que difere
    R->>DB: marca RESOLVED o que deixou de diferir
    R->>DB: grava ReconciliationRun com contagens
```
