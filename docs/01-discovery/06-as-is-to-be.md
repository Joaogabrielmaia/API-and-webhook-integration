# 06 — AS-IS e TO-BE

## AS-IS: como a venda chega à cobrança hoje

```mermaid
flowchart TD
    A[Vendedor marca Ganho no CRM] --> B[Mensagem ao financeiro<br/>com dados copiados à mão]
    B --> C{Financeiro lê a mensagem?}
    C -- depois de horas ou dias --> D[Busca cliente no ERP pelo nome]
    D --> E{Achou?}
    E -- não --> F[Cadastra cliente<br/>digitando CNPJ]
    E -- achou variação do nome --> G[Às vezes cadastra outro<br/>duplicidade]
    E -- sim --> H[Cria pedido]
    F --> H
    G --> H
    H --> I[Gera cobrança<br/>digitando valor e vencimento]
    I --> J[Cobrança enviada ao cliente]
    J --> K[Pagamento entra no ERP]
    K -.sem retorno.-> L[(CRM continua só com Ganho)]
    L --> M[Vendedor pergunta ao financeiro<br/>se o cliente pagou]
```

Pontos de perda: P1 a P7 em [02-negocio-aurora.md](02-negocio-aurora.md).

## TO-BE: com a Ponte

```mermaid
flowchart TD
    A[Vendedor marca Ganho no CRM] --> B[CRM envia webhook assinado<br/>HMAC à Ponte]
    B --> C{Assinatura e formato válidos?}
    C -- não --> X[Rejeita: 401 ou 400]
    C -- sim --> D{Evento já visto?<br/>idempotência}
    D -- sim --> Y[Responde 200 e ignora]
    D -- não --> E[Grava evento e enfileira<br/>responde 202]
    E --> F[Worker aplica mapeamento<br/>e validações CNPJ, valor, prazo]
    F --> G{Válido?}
    G -- não --> DLQ[(Fila de falhas<br/>com motivo)]
    G -- sim --> H[Cria ou atualiza cliente no ERP<br/>chave: CNPJ]
    H --> I[Cria pedido e cobrança<br/>chaves idempotentes]
    I --> J[Devolve IDs do ERP ao CRM]
    H -. ERP fora .-> R[Retentativa com backoff]
    R -. esgotou .-> DLQ
    DLQ --> M[Analista reprocessa<br/>pelo painel]
    N[Pagamento registrado no ERP] --> O[ERP envia webhook assinado]
    O --> P[Ponte atualiza status<br/>da cobrança no CRM]
    Q[Reconciliação agendada] --> S[Compara CRM e ERP<br/>aponta divergências no painel]
```

## O que muda para cada pessoa

| Pessoa | Antes | Depois |
|---|---|---|
| Vendedor | Manda mensagem e pergunta se foi pago | Vê IDs do ERP e o status da cobrança no CRM |
| Financeiro | Redigita e confere de memória | Recebe cobrança pronta; confere só as de valor alto; vê falhas e divergências no painel |
| TI | Sem visibilidade | Painel com eventos, tempo de processamento, tentativas e catálogo de erros |
