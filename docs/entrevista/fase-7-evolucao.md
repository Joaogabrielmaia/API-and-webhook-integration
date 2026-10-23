# Fase 7: Evolução e retrospectiva

### 1. Que melhoria você escolheu para a v1.1, e por quê?
**R.** O alerta de fila parada. Veio da retrospectiva (simulada), do risco de que ninguém abra o painel e uma fila parada passe despercebida. Considerei três opções: notificação ativa (exige canal de saída e segredo novos), alerta calculado sob demanda e só documentar. Escolhi o alerta sob demanda ([ADR-012](../03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md)): `GET /v1/admin/alerts` e um banner no painel. O limite de 300 s vem do requisito de "até 5 minutos". **Trade-off:** alguém ou algo precisa consultar; se ninguém olhasse o painel, o próximo passo é um consumidor da mesma API que envia a um canal.

### 2. Como você conduziu a mudança com segurança?
**R.** Branch `feat/stalled-queue-alert`, cinco commits, descrição de PR em arquivo e merge explícito. A mudança é **aditiva** (um endpoint e campos opcionais), então o contrato foi de `1.0.0` para `1.1.0` sem `/v2`. Escrevi 8 testes unitários e 8 de integração e estendi o teste de contrato, que cobre as 44 operações; depois gravei a suíte completa: 193 testes passando. Não há migração de banco, então a reversão é reverter o merge.

### 3. O que você faria diferente?
**R.** Três coisas, em ordem de custo que me causaram: montar o isolamento dos testes antes do primeiro teste de integração (perdi tempo com testes que disputavam o banco); desenhar o vínculo de cliente com mais cuidado (a unicidade do CNPJ devia estar no ERP, e isso virou uma migração corretiva); e separar as sprints no código, não só nos documentos.
