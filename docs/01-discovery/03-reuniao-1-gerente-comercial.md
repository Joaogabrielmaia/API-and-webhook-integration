# 03 — Reunião 1: gerente comercial

> Reunião simulada; pessoas e empresa fictícias.

**Participantes:** Marcos Oliveira (gerente comercial da Serviços Aurora, fictício) e eu.
**Objetivo:** entender o que o comercial espera da integração.

## Conversa (resumida)

**Eu:** Marcos, o que acontece depois que o vendedor marca "Ganho"?

**Marcos:** Hoje, nada acontece sozinho. O vendedor manda mensagem pro financeiro. Eu quero que seja **na hora**. Fechou, já tá no ERP. E quero **tudo automático**.

**Eu:** "Tudo" inclui o quê?

**Marcos:** Ah, o cliente, o pedido, a cobrança… e eu quero ver no CRM se o cliente pagou. Meus vendedores vivem perguntando pro financeiro.

**Eu:** E se o CNPJ estiver errado no CRM?

**Marcos:** Isso o vendedor corrige depois. Não pode travar a venda por causa disso. Venda fechada é venda fechada.

**Eu:** E se o ERP estiver fora do ar na hora do fechamento?

**Marcos:** Aí… não sei. Só não pode perder a venda.

**Eu:** Quanto tempo é "na hora"?

**Marcos:** Uns 5 minutos tá ótimo. Meu vendedor não pode esperar o dia seguinte.

## O que eu refinei (pedidos vagos → requisitos)

| Pedido vago | Refinamento que eu propus e o Marcos aceitou |
|---|---|
| "Na hora" | Meta de latência: em condições normais, pedido e cobrança no ERP em até 5 minutos após o "Ganho" (RNF-01). Com o ERP fora, o evento fica guardado e processa quando ele voltar. |
| "Tudo automático" | Cliente, pedido, cobrança e retorno de IDs ao CRM. Cancelamento, nota fiscal e alteração posterior **ficam de fora** do MVP. |
| "Ver se pagou" | Campo "Status da cobrança" no negócio, atualizado quando o ERP registra o pagamento (RF-10). |
| "Não pode perder a venda" | Nenhum evento recebido pode sumir: ou processa, ou fica visível numa fila de falhas (dead-letter) (RNF-02). |
| "Corrige depois" (CNPJ) | **Em aberto**: conflita com a expectativa do financeiro. Ver [reunião 2](04-reuniao-2-analista-financeira.md). |

## Pontos de atenção que ficaram para as outras reuniões
- Tensão: rapidez (comercial) versus conferência (a confirmar com o financeiro).
- Pergunta sem resposta: o que fazer quando o CNPJ é inválido?
