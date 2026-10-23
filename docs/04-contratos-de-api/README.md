# 04 — Contratos de API

Os contratos foram escritos **antes do código** e são validados por testes de contrato (`tests/contract`), que chamam os serviços de verdade e conferem cada resposta contra o esquema do OpenAPI.

| Contrato | Arquivo | O que descreve |
|---|---|---|
| CRM simples | [crm.openapi.yaml](crm.openapi.yaml) | API do CRM e o evento `deal.won` que ele emite |
| ERP simples | [erp.openapi.yaml](erp.openapi.yaml) | API do ERP, idempotência por `externalRef` e o evento `invoice.paid` |
| Ponte | [ponte.openapi.yaml](ponte.openapi.yaml) | Webhooks assinados e API administrativa |
| Erros | [catalogo-de-erros.md](catalogo-de-erros.md) | Códigos, causa e ação recomendada (gerado do código) |
| Exemplos | [exemplos.md](exemplos.md) | Requisições e respostas reais de cada passo |

> O CRM e o ERP são sistemas simples criados neste repositório. Os contratos deles existem para que a Ponte seja desenvolvida e testada contra algo explícito, como seria contra um sistema real.

## Convenções comuns
- **Formato de erro** (todos os serviços): `{ "error": { "code", "message", "requestId", "details?" } }`. O `code` é estável e documentado; a `message` é para humanos e pode mudar.
- **Datas:** ISO 8601 em UTC. **Valores monetários no ERP:** centavos inteiros. No CRM: texto em pt-BR (de propósito, ver [mapa de dados](../01-discovery/07-mapa-de-dados.md)).
- **Autenticação:** CRM e ERP por `X-Api-Key`; webhooks da Ponte por assinatura HMAC; administração da Ponte por `X-Admin-Key`. Todas as chaves e segredos vêm de variáveis de ambiente.
- **Tolerant reader:** consumidores ignoram campos que não conhecem. Enums marcados como "extensíveis" podem ganhar valores em versões menores.

## Política de versão (resumo; decisão completa no [ADR-007](../03-arquitetura/adr/ADR-007-versionamento-da-api.md))

| Mudança | Exemplo | Efeito na versão |
|---|---|---|
| Aditiva | Campo opcional novo, endpoint novo | Menor (`1.0.0` → `1.1.0`), mesmo `/v1` |
| Correção sem efeito no contrato | Descrição, exemplo | Patch (`1.1.0` → `1.1.1`) |
| Quebra | Remover ou renomear campo, mudar tipo | Nova versão maior (`/v2`), `/v1` mantida por ≥ 90 dias com `Deprecation` e `Sunset` |

## Como assinar um webhook (exemplo em Node)

```ts
import { createHmac } from "node:crypto";

const timestamp = Math.floor(Date.now() / 1000).toString();
const body = JSON.stringify(event);
const signature = "sha256=" + createHmac("sha256", process.env.CRM_WEBHOOK_SECRET!)
  .update(`${timestamp}.${body}`)
  .digest("hex");
// Cabeçalhos: X-Timestamp, X-Signature, X-Event-Id (igual a event.id)
```

A implementação de referência está em `packages/shared/src/hmac.ts`.
