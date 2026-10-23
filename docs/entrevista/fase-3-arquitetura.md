# Fase 3: Arquitetura e decisões

### 1. Por que uma fila própria em PostgreSQL em vez de um broker ou do pg-boss?
**R.** ([ADR-002](../03-arquitetura/adr/ADR-002-fila-em-banco-vs-broker.md)) Três motivos. Atomicidade: `Event` e `Job` entram na **mesma transação**, então não existe janela em que o evento foi aceito mas não enfileirado. Controle: eu precisava de retentativa que distinga erro permanente de temporário, de um estado `DEAD` com histórico e de visibilidade no painel. E poucas peças, sem infraestrutura nova. O claim usa `FOR UPDATE SKIP LOCKED`, e eu provei em teste que vários workers nunca recebem o mesmo job.
**Trade-off:** eu mantenho o código da fila e não tenho cron nem prioridades prontos. **Quando mudaria:** várias filas, cron ou prioridades pedem pg-boss; throughput muito alto pede broker.

### 2. Como funciona a idempotência, e por que em três camadas?
**R.** ([ADR-003](../03-arquitetura/adr/ADR-003-idempotencia.md)) Cada camada cobre uma falha diferente. Entrada: o id do evento é único no banco e cobre reenvio e disparo concorrente (testei 10 em paralelo: um aceito, nove duplicatas). Negócio: `DealLink` único cobre um segundo "Ganho" do mesmo negócio com outro id. Destino: `externalRef` único no ERP cobre o caso em que o worker caiu depois de criar o pedido e antes de registrar o vínculo. O teste de "ERP lento" mostrou isso na prática: o ERP terminou de criar depois que a Ponte desistiu por timeout, e a retentativa não duplicou.

### 3. Como você definiu a política de retentativa?
**R.** ([ADR-004](../03-arquitetura/adr/ADR-004-retentativa-com-backoff.md)) Backoff exponencial com teto e jitter: `min(teto, base × 2^(n−1)) × (1 ± 20%)`, base 30 s, teto 30 min, 12 tentativas. A soma é 10.890 s, cerca de 3 h 01 min; no pior caso do jitter são 2 h 25 min, ainda acima da janela de 2 h do ERP. Erros permanentes (dado inválido, 4xx) não retentam. O jitter evita que muitos eventos acordem juntos e derrubem o ERP de novo quando ele volta.
**Limite honesto:** a janela da política padrão eu validei por **cálculo**; os testes usam a mesma fórmula com esperas de milissegundos.
