# Teste de falha injetada: derrubar o ERP durante um lote

Arquivo do teste: [`tests/failure/erp-down-batch.test.ts`](../../tests/failure/erp-down-batch.test.ts). Resultados brutos, gravados pelo próprio teste: [cenário A](resultados/falha-injetada-cenario-a.json) e [cenário B](resultados/falha-injetada-cenario-b.json).

## O que "derrubar" significa aqui
O teste **fecha o servidor HTTP do ERP** no meio do lote (`stopErp()`), então as chamadas da Ponte recebem conexão recusada, como em uma queda real. Depois sobe um novo servidor na mesma porta, com o mesmo banco (`startErp()`). Nada é simulado dentro da Ponte.

## Cenário A: o ERP volta dentro da janela de retentativa

**Montagem.** 20 negócios, cada um com cliente e CNPJ próprios. "Ganho" em ondas de 4 por vez. Depois que 4 eventos já estavam processados, o ERP é derrubado e o lote continua. Ele volta cerca de 2 segundos depois. Política de retentativa do teste: até 12 tentativas, espera base de 100 ms, teto de 800 ms, jitter de 20% (mesma fórmula do [ADR-004](../03-arquitetura/adr/ADR-004-retentativa-com-backoff.md), em escala reduzida).

**Resultado medido (execução registrada em `resultados/falha-injetada-cenario-a.json`):**

| Medida | Valor |
|---|---|
| Negócios no lote | 20 |
| Eventos já processados quando o ERP caiu | 4 |
| Eventos em retentativa durante a queda | 8 |
| Duração da queda | 2.232 ms |
| Tempo do lote inteiro | 3.780 ms |
| Estado final dos 20 eventos | 20 `PROCESSED` |
| Eventos que precisaram de mais de uma tentativa | 16 |
| Maior número de tentativas de um evento | 6 |
| ERP: clientes, pedidos, cobranças | 20, 20, 20 |
| Duplicidades (`externalRef` ou CNPJ repetido) | 0 |

O teste afirma, além do estado final: CNPJ único em todos os clientes, `externalRef` único em todos os pedidos e cobranças, e `erpOrderId` e `erpInvoiceId` preenchidos nos 20 negócios do CRM.

**Leitura.** Dezesseis dos 20 eventos foram afetados pela queda e todos terminaram corretamente, sem intervenção. Isso confirma, para este cenário, RNF-02 (nenhum evento aceito se perde) e a ausência de duplicidade com eventos interrompidos no meio, inclusive aqueles em que o cliente já tinha sido criado e o pedido não.

## Cenário B: o ERP fica fora além da janela

**Montagem.** ERP derrubado **antes** do lote. 5 negócios ganhos. Política: 4 tentativas, base 50 ms, teto 200 ms, sem jitter. O ERP só volta depois de todos esgotarem as tentativas.

**Resultado medido:**

| Medida | Valor |
|---|---|
| Eventos na fila de falhas antes do reprocessamento | 5 de 5, todos com `PONTE-ERP-001` e 4 tentativas |
| Eventos recebidos | 5 (nenhum se perdeu em silêncio) |
| Eventos `PROCESSED` depois do reprocessamento manual | 5 |
| Tentativas registradas no total | 25 (5 × 4 que falharam + 5 de sucesso) |
| ERP: clientes, pedidos, cobranças | 5, 5, 5 |
| Duplicidades | 0 |

**Leitura.** Esgotar as tentativas não perde o evento: ele fica visível na fila de falhas, com código e histórico, e o reprocessamento manual o conclui reaproveitando as mesmas chaves.

## Limites deste teste
- Mede **comportamento e correção**, não desempenho. Os tempos acima são de uma máquina local, com os três serviços no mesmo processo; não representam produção.
- A política usada é uma versão reduzida da política padrão. A janela real (≈ 3 h) está validada só por cálculo.
- Não derruba o PostgreSQL nem a própria Ponte no meio de um evento. Para a Ponte, o caso do worker interrompido está coberto em escala menor em `retry-deadletter.test.ts` (job preso com bloqueio expirado).

## Os números variam de uma rodada para outra
Este teste rodou várias vezes durante o desenvolvimento. Em três gravações que anotei, o número de eventos em retentativa foi 8, 10 e 8; a duração da queda, de 2.210 a 2.486 ms; e o lote inteiro, de 3.704 a 4.490 ms. A tabela acima reflete a última gravação e é mantida igual ao JSON por `npm run docs:failure`. O que **não** varia, e é o que o teste afirma, é o resultado final: 20 de 20 processados, 20 clientes, 20 pedidos, 20 cobranças e nenhuma duplicidade.
