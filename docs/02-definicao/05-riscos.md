# 05 — Riscos

Probabilidade e impacto são julgamentos qualitativos meus (Baixa/Média/Alta), não estimativas medidas.

| ID | Risco | Prob. | Impacto | Mitigação | Rastro |
|---|---|---|---|---|---|
| R-01 | **Duplicidade**: cliente, pedido ou cobrança criados mais de uma vez (reenvio, retentativa, concorrência) | Alta | Alto | Chave de evento única no banco; `externalRef` único no ERP; vínculo `DealLink` único por negócio; criação idempotente em cada passo | RF-03, RN-02, RN-03, ADR-003 |
| R-02 | **Perda de evento**: webhook some no caminho (o ERP não reenvia; o CRM envia uma vez) | Média | Alto | Gravar antes de processar; reconciliação detecta negócio ganho sem vínculo; reenvio manual no CRM | RF-02, RF-12, ADR-001, ADR-006 |
| R-03 | **Divergência silenciosa** entre CRM e ERP (valor, status) | Média | Alto | Reconciliação agendada com lista de divergências e correção assistida | RF-12, RN-11, ADR-006 |
| R-04 | **ERP fora por tempo maior** que a janela de retentativa | Média | Médio | 12 tentativas (~3 h); depois, fila de falhas com reprocessamento; alerta de fila parada na v1.1 | RF-08, RF-09, ADR-004, ADR-005 |
| R-05 | **Webhook forjado ou repetido** (replay) | Baixa | Alto | HMAC-SHA256 com timestamp, janela de 5 min, comparação em tempo constante | RNF-04, ADR-009 |
| R-06 | **Mapeamento errado** após mudança de campo ou de regra | Média | Médio | Mapeamento versionado, validação do esquema, histórico e testes unitários | RF-07, ADR-008 |
| R-07 | **Fila parada sem ninguém ver** (worker caído) | Média | Alto | Tempo de processamento no painel; **alerta de fila parada (v1.1)** | RF-11 |
| R-08 | **Evento fora de ordem** sobrescreve estado mais novo | Baixa | Médio | Versão do negócio no evento; evento obsoleto é ignorado | RF-14, RN-07 |
| R-09 | **Validação só por simulação**: as reuniões foram simuladas, então requisitos podem não refletir uma operação real | Alta | Médio | Declarado como limitação; as notas de conversa real, se existirem, substituem a simulação | [Sobre este caso](../00-sobre-este-caso/README.md) |
| R-10 | **Carga**: o worker em processo único pode ser gargalo | Baixa (volume do cenário é baixo) | Médio | Claim com `SKIP LOCKED` permite mais workers sem mudar o código | ADR-002 |

## Modos de falha
O detalhamento de cada modo de falha (ERP fora, evento duplicado, evento fora de ordem, dado inválido) e a recuperação estão em [03-arquitetura/04-modos-de-falha.md](../03-arquitetura/04-modos-de-falha.md).
