# 02 — Modelo de dados da Ponte

Banco `ponte` (PostgreSQL), modelado em Prisma (`apps/integration/prisma/schema.prisma`). O CRM e o ERP têm bancos próprios (`crm`, `erp`) e não compartilham tabelas com a Ponte.

```mermaid
erDiagram
    Event ||--o| Job : "tem um"
    Event ||--o{ Attempt : "registra"
    Event {
        uuid id PK
        string source "CRM ou ERP"
        string type "deal.won, invoice.paid"
        string idempotencyKey UK "id do evento"
        string entityId "id do negocio ou da cobranca"
        int entityVersion
        json payload
        string status "RECEIVED PROCESSING RETRYING PROCESSED IGNORED DEAD"
        int attempts
        int duplicateCount
        datetime receivedAt
        datetime processedAt
        int durationMs
        string lastErrorCode
        string ignoreReason
    }
    Job {
        uuid id PK
        uuid eventId UK
        string state "PENDING RUNNING DONE DEAD"
        int attempts
        int maxAttempts
        datetime runAt
        datetime lockedAt
        string lockedBy
    }
    Attempt {
        uuid id PK
        uuid eventId FK
        int number
        string outcome "OK RETRYABLE_ERROR PERMANENT_ERROR IGNORED"
        string errorCode
        int durationMs
        datetime nextRunAt
    }
    CustomerLink {
        string crmCustomerId UK
        string erpCustomerId
        string taxId UK
    }
    DealLink {
        string crmDealId UK
        string crmCustomerId
        string erpCustomerId
        string erpOrderId
        string erpInvoiceId
        int amountCents
        int lastVersion
        string invoiceStatus
        boolean crmNotified
        datetime paidAt
    }
    MappingConfig {
        int version UK
        boolean active
        json rules
        string note
    }
    ReconciliationRun ||--o{ Divergence : "encontra"
    ReconciliationRun {
        uuid id PK
        string trigger "SCHEDULED ou MANUAL"
        datetime startedAt
        datetime finishedAt
        int dealsChecked
        int divergencesOpen
    }
    Divergence {
        uuid id PK
        string key UK "tipo:negocio"
        string type
        string crmDealId
        json detail
        string status "OPEN ou RESOLVED"
        datetime firstSeenAt
        datetime lastSeenAt
    }
```

## Restrições que sustentam as garantias

| Garantia | Restrição no banco |
|---|---|
| Evento não é processado duas vezes (RF-03) | `Event.idempotencyKey` único; inserção concorrente cai em violação de unicidade, tratada como duplicata |
| Um negócio, um pedido (RN-03) | `DealLink.crmDealId` único |
| Um cliente por CNPJ (RN-02) | `CustomerLink.taxId` único (e `taxId` único no ERP) |
| Um job por evento | `Job.eventId` único; o reprocessamento reinicia o mesmo job |
| Uma divergência aberta por tipo e negócio | `Divergence.key` único; a reconciliação faz upsert |
| Fila durável e atômica com o evento | `Event` e `Job` são inseridos na **mesma transação** |

## Máquina de estados do evento

```mermaid
stateDiagram-v2
    [*] --> RECEIVED: 202 devolvido
    RECEIVED --> PROCESSING: worker pega o job
    RETRYING --> PROCESSING: runAt vencido
    PROCESSING --> PROCESSED: sucesso
    PROCESSING --> IGNORED: obsoleto ou já vinculado
    PROCESSING --> RETRYING: erro temporário, tentativas restantes
    PROCESSING --> DEAD: erro permanente ou tentativas esgotadas
    DEAD --> RECEIVED: reprocessamento manual
    PROCESSED --> [*]
    IGNORED --> [*]
```
