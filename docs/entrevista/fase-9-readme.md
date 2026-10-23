# Fase 9: README

### 1. Como você organizou o README para quem só vai olhar o GitHub?
**R.** O repositório não está hospedado em lugar nenhum, então quem abre o GitHub precisa entender tudo lendo. O README abre com título, uma linha e três prints; em seguida cinco linhas de resumo, o aviso do que é real e do que é cenário, um mapa do repositório, um roteiro de leitura em sete passos com links relativos (discovery, requisitos, decisões, sequências, contratos, qualidade e evolução) e o antes e depois da venda em diagramas. O resto é consulta: tour das telas com print, decisões e trade-offs, falhas e recuperação, como rodar e limites.

### 2. Por que há um trecho deixado em branco no README?
**R.** A seção "ligação com minha experiência real com CRM e integrações" é minha. Eu não deixei um texto gerado ali porque seria inventar experiência. É a parte que conecta este estudo ao que eu realmente fiz, e só eu posso escrever.

### 3. Como o leitor sabe que os prints e números são reais?
**R.** Os prints são gerados pelo Playwright dirigindo as telas reais, a partir de uma pilha que sobe sozinha com bancos limpos; o print da execução dos testes é renderizado a partir da saída gravada por `npm run test:record`. Os arquivos brutos estão em `docs/05-qualidade/resultados/`. Quem quiser conferir roda os comandos do README.
