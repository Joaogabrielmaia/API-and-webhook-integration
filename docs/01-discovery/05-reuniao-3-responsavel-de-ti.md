# 05 — Reunião 3: responsável de TI

> Reunião simulada; pessoas e empresa fictícias.

**Participantes:** Rogério Lima (responsável de TI, meio período, da Serviços Aurora, fictício) e eu.
**Objetivo:** entender o que os sistemas permitem e quais restrições técnicas existem.

## Conversa (resumida)

**Eu:** Rogério, como o ERP e o CRM expõem dados?

**Rogério:** Os dois têm API REST com chave. O CRM manda webhook quando o negócio muda de etapa. O ERP também manda webhook quando uma cobrança é paga.

**Eu:** O ERP reenvia o webhook se o destino estiver fora?

**Rogério:** Não. Manda uma vez e esquece. Se você estiver fora, perdeu.

**Eu:** E a disponibilidade?

**Rogério:** Aqui está o ponto: o ERP **fica fora do ar das 23h à 1h todo dia** por causa do backup. Nesse período a API devolve erro de indisponibilidade.

**Eu:** Alguma venda é fechada nesse horário?

**Rogério:** Às vezes, porque o vendedor fecha no celular à noite. E tem lote de fechamento de fim de mês que roda perto das 23h.

**Eu:** Posso assumir que o ERP responde dentro de 10 segundos?

**Rogério:** Normalmente sim. Às vezes demora mais com o backup começando.

**Eu:** Segredos de webhook, como vocês cuidam?

**Rogério:** Cada sistema tem um segredo. A gente não quer que ninguém de fora consiga disparar um "ganho" falso.

## A restrição que muda o escopo

> **O ERP fica indisponível 2 horas por dia, e não reenvia webhooks que o destino perdeu.**

Impactos que eu registrei:

1. **Processamento síncrono deixa de ser opção.** Se a Ponte tentasse falar com o ERP dentro da requisição do webhook, o CRM receberia erro e a venda ficaria sem rastro. A Ponte passa a **receber, gravar e responder rápido**, e processa depois (fila). → ADR-002.
2. **A retentativa precisa cobrir mais de 2 horas.** Com backoff exponencial de 30 s a 30 min e 12 tentativas, a soma das esperas é de cerca de 3h (3h01 sem variação aleatória) (cálculo em [ADR-004](../03-arquitetura/adr/ADR-004-retentativa-com-backoff.md)). → RNF-03.
3. **Webhook sem reenvio** significa que eventos podem se perder no caminho. A **reconciliação**, que eu tinha como "bom ter", sobe para o MVP, porque é o que pega um evento perdido. → RF-12, ADR-006.
4. **Assinatura HMAC com timestamp** para impedir "ganho falso" e replay. → ADR-009.
5. **Timeout de chamada ao ERP de 10 s**, tratado como falha retentável.

## Efeito no backlog
- Sobe de "Could" para "Must": reconciliação agendada.
- Desce de prioridade: "tempo real estrito". A meta passa a ser "em até 5 minutos em condições normais" (RNF-01).
