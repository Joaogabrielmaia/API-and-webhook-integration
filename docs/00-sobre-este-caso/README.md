# Episódio 0 — Sobre este caso

O que é real e o que é cenário: código, testes e resultados são reais e rodam localmente; a empresa, as pessoas, os dados e as reuniões são fictícios ou simulados.

| Documento | O que contém | Itens |
|---|---|---|
| [Sobre este caso](#sobre-este-caso) | Cenário da Serviços Aurora e tabela "Real × simulado" | 5 linhas |
| [Glossário](../GLOSSARIO.md) | Termos usados no projeto | 15 termos |

← [Índice](../INDEX.md) · [Episódio 1 — Discovery](../01-discovery/README.md) →

---

# Sobre este caso

A Serviços Aurora é uma empresa fictícia de 25 pessoas que presta serviços de manutenção e conservação. Ela usa um CRM e um ERP separados, e o financeiro redigita à mão os dados de cada venda fechada. A Ponte existe para ligar os dois. O caminho da venda está em [O negócio: Serviços Aurora](../01-discovery/02-negocio-aurora.md).

## Real × simulado

| Item | Situação |
|---|---|
| Código da Ponte, testes, contratos e diagramas | Real; roda localmente |
| Resultados de teste registrados em `docs/05-qualidade/resultados/` | Real; saída bruta de execuções locais, com data e commit |
| CRM e ERP | Sistemas simples criados neste repositório (`apps/mock-crm`, `apps/mock-erp`); não são produtos comerciais |
| Serviços Aurora, pessoas, clientes e dados | Fictícios |
| Reuniões de discovery, aceitação e retrospectiva | Simuladas; cada ata abre com a marca de simulação |

Os ganhos esperados são hipóteses com fórmula, não medições: [ganhos como hipóteses](../02-definicao/06-ganhos-como-hipoteses.md). Não há cliente, operação nem hospedagem.

## Como ler

O [guia da série](../INDEX.md) lista os seis episódios e três trilhas de leitura (2, 10 e 30 minutos). Os termos técnicos estão no [glossário](../GLOSSARIO.md).
