# Fase 1: Descoberta

### 1. Como você escolheu entre as alternativas para eliminar o retrabalho?
**R.** Comparei cinco: integração por API, planilha compartilhada, automação visual, troca de sistema e rotina manual melhorada, com seis critérios ponderados (redigitação, rastreabilidade e falhas, custo, tolerância à indisponibilidade do ERP, manutenção, valor como estudo). A API ganhou com 95 de 110 pontos e, sem o critério de portfólio, com 85 de 100, então a escolha não depende dele. A segunda foi a automação visual, com 75 (71 sem o critério de portfólio).
**Trade-off:** a API é a mais cara de construir. **Quando mudaria:** sem ninguém capaz de manter código e com volume baixo, eu escolheria a automação visual. As notas são julgamento meu, e eu deixei pesos e notas visíveis para quem discordar.

### 2. Como funcionou o discovery sem cliente real?
**R.** Simulei: o Claude interpretou o gerente comercial, a analista financeira e o responsável de TI, todos fictícios, e cada registro começa com o aviso de simulação. O que eu extraí foi o que a simulação foi desenhada para provocar: uma contradição (o comercial quer rapidez, o financeiro quer conferência), pedidos vagos que eu refinei ("na hora" virou "até 5 minutos") e uma restrição que muda o escopo. O limite é claro: isso **não valida** o produto com usuário de verdade. Se eu tivesse anotações de uma conversa real e autorizada, elas substituiriam a simulação.

### 3. Qual foi a restrição que mais mudou o projeto?
**R.** "O ERP fica fora do ar das 23h à 1h e não reenvia webhook perdido." Isso derrubou o processamento síncrono (a Ponte recebe, grava e responde; processa depois), definiu a janela da retentativa (12 tentativas, cerca de 3 h) e subiu a reconciliação de "bom ter" para obrigatória, porque é o que pega o evento perdido.
