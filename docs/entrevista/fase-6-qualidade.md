# Fase 6: Qualidade

### 1. Como você testou o que acontece quando o ERP cai?
**R.** Derrubando de verdade. O teste fecha o servidor HTTP do ERP no meio de um lote de 20 negócios (conexão recusada) e o religa depois de cerca de 2 segundos. Na gravação que registrei, os 20 terminaram `PROCESSED`, 16 precisaram de retentativa e o ERP ficou com 20 clientes, 20 pedidos e 20 cobranças, sem duplicidade. Num segundo cenário o ERP fica fora além das tentativas: os 5 eventos vão para a fila de falhas, nenhum se perde, e o reprocessamento manual os conclui sem duplicar. Os tempos variam entre rodadas; o resultado final não.

### 2. Qual foi o bug de teste mais instrutivo?
**R.** Uma asserção de espera do backoff que falhou uma vez sob carga. Eu comparava `nextRunAt`, vindo do relógio do PostgreSQL dentro do Docker, com `startedAt`, do relógio do Windows: medi o desvio entre os relógios (30 ms onde a política dizia 40). O código da Ponte usa o relógio do banco de forma consistente; o erro era do teste. Passei a medir só com o relógio da aplicação e a afirmar **piso e crescimento**, nunca teto. Cinco rodadas seguidas passaram. Está no [registro de problemas](../05-qualidade/bugs-e-aprendizados.md), junto com os outros 11.

### 3. O que você **não** testou?
**R.** Carga e desempenho; a janela real de 2 horas (validada por cálculo da política); canais laterais de tempo e pentest do HMAC; dois processos completos da Ponte disputando eventos (o `SKIP LOCKED` está provado no nível da fila); e usuários reais, porque as reuniões foram simuladas. Esses limites estão escritos na [documentação de qualidade](../05-qualidade/README.md), porque prometer o que não medi seria o pior defeito deste tipo de projeto.
