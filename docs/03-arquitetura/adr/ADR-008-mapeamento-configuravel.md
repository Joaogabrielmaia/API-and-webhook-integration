# ADR-008 — Mapeamento de campos configurável

**Status:** aceita · **Requisitos:** RF-07 · **Regras:** RN-04, RN-05

## Contexto
CRM e ERP têm campos e formatos diferentes ([mapa de dados](../../01-discovery/07-mapa-de-dados.md)). Eles mudam: um campo novo, um formato novo.

## Alternativas
1. **Fixo no código.** Simples e testável, mas cada ajuste exige uma nova versão do código.
2. **Regras em dados com transformações de uma lista permitida** (esta).
3. **Linguagem de expressões ou JavaScript guardado no banco.** Flexível, mas é execução de código arbitrário vinda de configuração.
4. Ferramenta externa de mapeamento. Dependência nova.

## Escolha
Opção 2. O mapeamento é uma lista de regras:

```json
{ "target": "customer.taxId", "source": "customer.cnpj", "transform": "cnpjDigits", "required": true }
```

- `source` pode ser um caminho ou uma lista de caminhos (por exemplo, `deal.wonAt` e `deal.paymentTermDays` para o vencimento).
- Transformações permitidas (lista fechada): `trim`, `cnpjDigits`, `phoneE164BR`, `emailLower`, `moneyToCents`, `dueDateFromTerm`.
- Destinos permitidos (lista fechada): campos do cliente, do pedido e da cobrança.
- Cada versão é uma linha de `MappingConfig`; só uma está ativa; as antigas ficam no histórico.
- Depois de aplicar as regras, o resultado é validado com Zod. O que a configuração não consegue fazer (e não deve) é inventar um destino ou transformação.

## Motivo
Dá agilidade ao ajuste de campo sem abrir mão de segurança (nada de executar texto vindo do banco) nem de testabilidade (cada transformação tem teste unitário).

## Trade-off
Transformação nova ainda exige código. As regras de **negócio** (limites de valor e prazo, conferência) ficam no código, não na configuração, de propósito: elas são decisões do negócio que merecem revisão e teste, não ajuste de campo.

## Quando eu mudaria de ideia
Se aparecessem muitas transformações específicas por cliente, eu consideraria uma linguagem de expressão restrita e sem efeitos colaterais, executada em sandbox.
