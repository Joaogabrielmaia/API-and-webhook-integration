# ADR-002 — Fila em banco (PostgreSQL) vs. broker

**Status:** aceita · **Requisitos:** RF-02, RF-08, RNF-02, RNF-03

## Contexto
O ERP some 2 horas por dia ([reunião 3](../../01-discovery/05-reuniao-3-responsavel-de-ti.md)), então o processamento precisa ser assíncrono, durável e retentável. O escopo exclui mensageria externa. Já existe um PostgreSQL no projeto.

## Alternativas
1. **Broker externo** (RabbitMQ, SQS, Redis com BullMQ): throughput alto e recursos de roteamento, mas é uma peça nova para operar. Fora do escopo definido.
2. **pg-boss** (biblioteca de fila sobre PostgreSQL): pronta, madura, mas traz o próprio esquema e a própria política de retentativa. Eu precisaria adaptar a classificação "erro permanente vs. temporário", o estado `DEAD` e a visibilidade no painel ao modelo dela.
3. **Fila própria em PostgreSQL** (tabela `Job` + `SELECT ... FOR UPDATE SKIP LOCKED`).
4. Em memória: perde tudo em um reinício. Descartada.

## Escolha
Opção 3: tabela `Job` na própria Ponte.

## Motivo
- **Atomicidade:** `Event` e `Job` entram na mesma transação. Não existe janela em que o evento foi aceito mas a mensagem não foi enfileirada (o problema clássico de "dual write").
- **Controle total** da retentativa, do estado `DEAD` e do histórico de tentativas, que o painel precisa exibir.
- O padrão `SKIP LOCKED` permite vários workers sem trabalho duplicado.
- Poucas peças: sem nova infraestrutura.

## Trade-off
Eu mantenho o código da fila (claim, bloqueio com prazo, polling). Não tenho agendamento por cron, prioridades ou roteamento prontos. O polling adiciona latência de até o intervalo do ciclo (padrão 250 ms).

## Quando eu mudaria de ideia
- Mais de uma fila, cron e prioridades: **pg-boss**.
- Throughput muito acima do que um PostgreSQL de apoio aguenta, ou vários consumidores com *fan-out*: **broker**.
