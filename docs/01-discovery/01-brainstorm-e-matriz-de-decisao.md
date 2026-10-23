# 01 — Brainstorm de soluções e matriz de decisão

## Contexto
A Serviços Aurora (empresa fictícia, ver [02-negocio-aurora.md](02-negocio-aurora.md)) usa um CRM e um ERP separados. Quando o comercial fecha uma venda, alguém do financeiro redigita cliente, valor e prazo no ERP e gera a cobrança. O problema que eu quero resolver é o **retrabalho entre comercial e financeiro** e a informação que se perde nesse caminho.

## As 5 formas que considerei

| # | Alternativa | Como funcionaria |
|---|---|---|
| A | **Integração por API** | Um serviço recebe o evento "negócio ganho" do CRM e cria cliente, pedido e cobrança no ERP via API. |
| B | **Planilha compartilhada** | O comercial preenche uma planilha única de fechamentos; o financeiro lê dela. |
| C | **Ferramenta de automação visual** | Fluxo no-code ligando o gatilho do CRM às ações do ERP. |
| D | **Troca de sistema** | Substituir CRM e ERP por uma suíte única. |
| E | **Rotina manual melhorada** | Checklist, padronização de campos e horário fixo de repasse. |

## Critérios e pesos
Os pesos são julgamento meu, de 1 a 5, a partir do problema descrito.

| Critério | Peso | Por quê |
|---|---|---|
| C1 Elimina redigitação | 5 | É a dor principal. |
| C2 Rastreabilidade e tratamento de falhas | 5 | Sem isso o financeiro não confia e volta a conferir tudo à mão. |
| C3 Esforço e custo de implantação (maior nota = mais barato) | 3 | Empresa de 25 pessoas. |
| C4 Tolera indisponibilidade do ERP | 4 | Restrição que surgiu na reunião com TI ([reunião 3](05-reuniao-3-responsavel-de-ti.md)). |
| C5 Manutenção por equipe pequena | 3 | Há uma pessoa de TI em meio período. |
| C6 Valor como estudo de engenharia | 2 | Admito: este é um projeto de portfólio. Mostro abaixo que o resultado não depende deste critério. |

## Notas (1 a 5): julgamento qualitativo, não medição

| Alternativa | C1 | C2 | C3 | C4 | C5 | C6 | Total (de 110) | Sem C6 (de 100) |
|---|---|---|---|---|---|---|---|---|
| **A. API** | 5 | 5 | 2 | 5 | 3 | 5 | **95** | **85** |
| B. Planilha | 2 | 1 | 5 | 3 | 3 | 1 | 53 | 51 |
| C. Automação visual | 4 | 3 | 4 | 3 | 4 | 2 | 75 | 71 |
| D. Troca de sistema | 5 | 4 | 1 | 4 | 2 | 1 | 72 | 70 |
| E. Rotina melhorada | 1 | 2 | 5 | 5 | 4 | 1 | 64 | 62 |

Total = soma de (nota × peso). Exemplo da A: 5×5 + 5×5 + 2×3 + 5×4 + 3×3 + 5×2 = 95.

## Escolha: A, integração por API
**Motivo.** É a única que combina eliminação total da redigitação com controle fino de falhas (retentativa, fila de falhas, reconciliação). Ganha também sem o critério C6, então a escolha não é só vaidade de portfólio.

**Trade-off.** É a mais cara de construir (nota 2 em C3) e exige alguém que saiba manter código.

**Quando eu mudaria de ideia.**
- Se a Aurora não tivesse ninguém capaz de manter código e o volume fosse baixo, eu escolheria **C** (a segunda colocada, 75): entrega boa parte do valor com muito menos esforço, ao custo de menos controle sobre idempotência e reprocessamento.
- Se os dois sistemas já estivessem perto do fim de vida, **D** passaria a valer a conversa.
- **E** é o que eu recomendaria como ponte de curto prazo enquanto a integração não existe.

> Nota de honestidade: as notas acima são opinião fundamentada, não resultado de teste. Alguém com outra experiência poderia pontuar diferente; por isso deixei os pesos e as notas visíveis.
