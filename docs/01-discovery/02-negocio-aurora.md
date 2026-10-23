# 02 — O negócio: Serviços Aurora

> Simulação: o Claude interpretou o cliente nesta conversa.

A Serviços Aurora é uma empresa **fictícia**, criada para este estudo. Ela presta serviços de manutenção e conservação predial para condomínios e pequenas empresas na região metropolitana de Belo Horizonte. Tem 25 pessoas: 4 no comercial, 3 no financeiro, 1 em TI (meio período) e o restante na operação em campo.

Ela usa **um CRM** para o funil de vendas e **um ERP** para pedidos e cobranças. Os dois são sistemas separados, sem integração. (No repositório, ambos são sistemas simples que eu criei: `apps/mock-crm` e `apps/mock-erp`.)

## O caminho de uma venda, do fechamento à cobrança (hoje)

1. O vendedor move o negócio para **Ganho** no CRM.
2. Ele manda uma mensagem ao financeiro (e-mail ou chat) com cliente, CNPJ, valor e prazo, copiando do CRM.
3. A analista financeira procura o cliente no ERP **pelo nome**. Se não acha, cadastra; se acha uma variação do nome, às vezes cadastra outro.
4. Ela cria o pedido e gera a cobrança, digitando valor e vencimento.
5. Ninguém avisa o CRM. Quando o vendedor quer saber se o cliente pagou, pergunta ao financeiro.
6. Quando o pagamento entra no ERP, o CRM continua mostrando o negócio como "Ganho", sem status de cobrança.

## Onde se perde informação

| # | Ponto de perda | Consequência |
|---|---|---|
| P1 | CNPJ copiado à mão (com ou sem máscara, com dígito trocado) | Cliente duplicado ou cobrança com dado errado |
| P2 | Busca de cliente por nome | Duplicidade ("Cond. Ed. Solar" e "Condomínio Edifício Solar") |
| P3 | Valor digitado de novo (vírgula, ponto, "R$") | Valor divergente entre CRM e ERP |
| P4 | Prazo de pagamento não vai na mensagem | Vencimento assumido, não combinado |
| P5 | Repasse depende de alguém ler a mensagem | Cobrança sai com atraso; fechamento de sexta só anda na terça |
| P6 | Sem retorno do ERP para o CRM | Comercial não sabe se foi cobrado nem se foi pago |
| P7 | Ninguém compara os dois lados | Divergências só aparecem quando o cliente reclama |

## Hipótese de ganho (não é medição)
Fórmula: `horas economizadas por mês = vendas por mês × minutos de redigitação por venda × (1 − fração que continua manual) ÷ 60`.

Entradas, todas **ditas na simulação** e portanto estimativas fictícias: 30 vendas por mês; 15 minutos por venda; 10% do trabalho continua manual (exceções e conferência).
Resultado da fórmula com essas entradas: 30 × 15 × 0,9 ÷ 60 = **6,75 horas por mês**. É uma hipótese para discussão; **não foi medida** e não representa nenhuma operação real.
