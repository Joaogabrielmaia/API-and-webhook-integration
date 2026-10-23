# Exemplos de requisição e resposta

Os exemplos usam dados fictícios. Os identificadores são ilustrativos. Os formatos são os mesmos que os testes de contrato validam.

## 1. CRM emite `deal.won` → Ponte

Requisição (`POST /v1/webhooks/crm`):

```http
X-Timestamp: 1767225600
X-Event-Id: 8d3f6f0a-5c1e-4b8e-9c1d-2f4e7a9b0c11
X-Signature: sha256=<hmac>
Content-Type: application/json

{
  "id": "8d3f6f0a-5c1e-4b8e-9c1d-2f4e7a9b0c11",
  "type": "deal.won",
  "version": "1",
  "occurredAt": "2026-03-10T14:20:00.000Z",
  "data": {
    "deal": {
      "id": "b1f0c3a2-0d9e-4e0a-8c55-3a1f6c9d7e22",
      "title": "Contrato de manutenção anual",
      "value": "12.500,50",
      "paymentTermDays": 30,
      "wonAt": "2026-03-10T14:20:00.000Z",
      "version": 3
    },
    "customer": {
      "id": "4a7d9e10-6b21-4c3f-9a8e-0d5c1b2f3a44",
      "name": "Condomínio Edifício Solar",
      "cnpj": "11.222.333/0001-81",
      "phone": "(31) 99876-5432",
      "email": "Financeiro@Solar.example"
    }
  }
}
```

Respostas:

| Situação | Status | Corpo |
|---|---|---|
| Aceito | `202` | `{ "status": "accepted", "eventId": "…" }` |
| Repetido | `200` | `{ "status": "duplicate", "eventId": "…" }` |
| Assinatura inválida | `401` | `{ "error": { "code": "PONTE-AUTH-001", "message": "Assinatura inválida.", "requestId": "…" } }` |
| Corpo fora do contrato | `400` | `{ "error": { "code": "PONTE-REQ-001", … } }` |

## 2. A Ponte aplica o mapeamento e chama o ERP

Resultado do mapeamento para o exemplo acima:

```json
{
  "customer": { "taxId": "11222333000181", "name": "Condomínio Edifício Solar", "phone": "5531998765432", "email": "financeiro@solar.example" },
  "order":    { "description": "Contrato de manutenção anual", "totalCents": 1250050 },
  "invoice":  { "dueDate": "2026-04-09", "status": "ABERTA" }
}
```

Chamadas ao ERP, em ordem:

```http
GET  /v1/customers?taxId=11222333000181                      → 200 { "data": [] }
POST /v1/customers        { "taxId": "11222333000181", "name": "…", "phone": "5531998765432", "email": "…" }  → 201
POST /v1/orders           { "customerId": "…", "externalRef": "ponte:deal:b1f0c3a2-…", "description": "…", "totalCents": 1250050 }  → 201
POST /v1/invoices         { "orderId": "…", "externalRef": "ponte:deal:b1f0c3a2-…:inv", "amountCents": 1250050, "dueDate": "2026-04-09", "status": "ABERTA" }  → 201
```

Repetir `POST /v1/orders` com o mesmo `externalRef` devolve `200` com `Idempotent-Replay: true`.

## 3. A Ponte devolve os IDs ao CRM

```http
PUT /v1/deals/b1f0c3a2-…/erp-link
X-Api-Key: <chave>

{ "erpCustomerId": "…", "erpOrderId": "…", "erpInvoiceId": "…", "billingStatus": "ABERTA" }
```

## 4. ERP emite `invoice.paid` → Ponte

```json
{
  "id": "0e6a2b7c-1f34-4d58-8a09-9b3c5d7e1f66",
  "type": "invoice.paid",
  "version": "1",
  "occurredAt": "2026-03-20T10:00:00.000Z",
  "data": {
    "invoiceId": "…",
    "orderId": "…",
    "externalRef": "ponte:deal:b1f0c3a2-…:inv",
    "amountCents": 1250050,
    "paidAt": "2026-03-20T10:00:00.000Z"
  }
}
```

## 5. Administração

`GET /v1/admin/events?status=DEAD` (cabeçalho `X-Admin-Key`):

```json
{
  "data": [
    {
      "id": "…", "source": "CRM", "type": "deal.won", "entityId": "b1f0c3a2-…",
      "status": "DEAD", "attempts": 1, "duplicateCount": 0,
      "receivedAt": "2026-03-10T14:20:01.000Z", "processedAt": null, "durationMs": null,
      "lastErrorCode": "PONTE-VAL-001",
      "lastErrorMessage": "CNPJ inválido: dígito verificador não confere.",
      "ignoreReason": null, "nextRunAt": null
    }
  ],
  "total": 1
}
```

`POST /v1/admin/events/{id}/reprocess` → `202 { "status": "requeued", "eventId": "…" }`; se o evento não está em `DEAD`: `409 PONTE-ADM-001`.
