# 07 — Mapa de dados

Os campos abaixo são os dos dois sistemas simples deste repositório (`apps/mock-crm` e `apps/mock-erp`), desenhados para refletir divergências comuns entre sistemas distintos.

## Campos de cada sistema

### CRM (cliente e negócio)

| Campo | Tipo | Exemplo | Observação |
|---|---|---|---|
| `customer.id` | uuid | `3f1c…` | |
| `customer.name` | texto livre | `Condomínio Edifício Solar` | Pode vir com variações |
| `customer.cnpj` | texto com máscara | `11.222.333/0001-81` | Digitado pelo vendedor; pode vir sem máscara ou inválido |
| `customer.phone` | texto livre | `(31) 99876-5432` | |
| `customer.email` | texto | `Financeiro@Solar.example` | Caixa variável |
| `deal.id` | uuid | | |
| `deal.title` | texto | `Contrato de manutenção anual` | |
| `deal.stage` | enum | `GANHO` | LEAD, PROPOSTA, NEGOCIACAO, GANHO, PERDIDO |
| `deal.value` | **texto pt-BR** | `12.500,50` | Campo livre; aceita `R$`, ponto de milhar etc. |
| `deal.paymentTermDays` | inteiro | `30` | 0 a 90 |
| `deal.wonAt` | datetime ISO | `2026-03-10T14:20:00Z` | |
| `deal.version` | inteiro | `3` | Sobe a cada alteração |
| `deal.erpOrderId` / `erpInvoiceId` | texto | | Preenchidos pela Ponte |
| `deal.billingStatus` | enum | `PAGO` | NAO_COBRADO, EM_CONFERENCIA, ABERTA, PAGO |

### ERP (cliente, pedido e cobrança)

| Campo | Tipo | Exemplo | Observação |
|---|---|---|---|
| `customer.id` | uuid | | |
| `customer.taxId` | 14 dígitos | `11222333000181` | **Único**; sem máscara |
| `customer.name` | texto | `CONDOMINIO EDIFICIO SOLAR` | Razão social cadastrada pelo financeiro |
| `customer.phone` | dígitos com país | `5531998765432` | Padrão E.164 sem `+` |
| `customer.email` | texto minúsculo | `financeiro@solar.example` | |
| `order.externalRef` | texto único | `ponte:deal:<id>` | Chave de idempotência |
| `order.totalCents` | inteiro | `1250050` | Centavos |
| `invoice.amountCents` | inteiro | `1250050` | |
| `invoice.dueDate` | data | `2026-04-09` | |
| `invoice.status` | enum | `ABERTA` | EM_CONFERENCIA, ABERTA, PAGA |

## Divergências e regras de conversão

| # | Divergência | Regra de conversão | Falha quando |
|---|---|---|---|
| D1 | CNPJ com máscara no CRM, 14 dígitos no ERP | Remove não dígitos e **valida os dígitos verificadores** | Não tem 14 dígitos ou dígito verificador inválido → erro permanente `PONTE-VAL-001` |
| D2 | Telefone livre no CRM, E.164 no ERP | Remove não dígitos, remove zero de tronco, prefixa `55`; aceita fixo (10 dígitos) e celular (11) | Resultado fora de 12–13 dígitos → telefone é omitido e registrado como aviso (não bloqueia, telefone é opcional) |
| D3 | Valor em texto pt-BR no CRM, centavos inteiros no ERP | Remove `R$` e espaços; `,` é decimal; `.` seguido de exatamente 3 dígitos e sem vírgula é milhar; converte **sem float** | Vazio, ≤ 0 ou > R$ 1.000.000,00 → `PONTE-VAL-002` |
| D4 | Prazo em dias no CRM, data de vencimento no ERP | `dueDate = data(wonAt) + paymentTermDays` | Prazo fora de 0–90 → `PONTE-VAL-003` |
| D5 | E-mail com caixa variável | Minúsculas e trim | Formato inválido → e-mail omitido com aviso |
| D6 | Nome livre no CRM, razão social no ERP | **Não sobrescreve** se o cliente já existe no ERP; usa o nome do CRM só ao criar | Nome vazio → `PONTE-VAL-004` |
| D7 | Identidade: UUID do CRM vs. UUID do ERP | Ponte guarda o vínculo (`CustomerLink`, `DealLink`) | — |
| D8 | CRM não tem status de cobrança | Ponte escreve `billingStatus` a partir da cobrança do ERP | — |

> A parte configurável (campo de origem, campo de destino e transformação) está em [ADR-008](../03-arquitetura/adr/ADR-008-mapeamento-configuravel.md). Os limites de valor e prazo são regras de negócio ([RN-04 e RN-05](../02-definicao/03-regras-de-negocio.md)).
