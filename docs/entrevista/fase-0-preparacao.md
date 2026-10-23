# Fase 0: Preparação

### 1. Por que um monorepo, e por que TypeScript estrito?
**R.** O projeto tem quatro serviços (CRM simples, ERP simples, Ponte e painel) que compartilham contratos, HMAC, catálogo de erros e schemas de evento. No monorepo (workspaces do npm) esse código compartilhado vive em `packages/shared` e uma mudança de contrato quebra o build de todos os lados de uma vez. TypeScript estrito me dá o erro na compilação em vez de em uma tarde de depuração; ao longo do projeto o `tsc --noEmit` virou uma checagem rápida antes de rodar teste.
**Trade-off:** acoplamento de versões entre os serviços. Se eles tivessem ciclos de vida independentes, eu separaria em pacotes versionados.

### 2. Por que o Docker Compose sobe só o PostgreSQL?
**R.** Decisão registrada no [ADR-011](../03-arquitetura/adr/ADR-011-execucao-local.md). Os serviços Node rodam com `tsx` (ciclo rápido) e os testes de integração sobem os três serviços dentro do processo do teste, o que me permite derrubar o ERP de verdade fechando o servidor. O Compose cobre o que é chato de reproduzir à mão: um PostgreSQL 16 com bancos pré-criados.
**Trade-off:** quem for rodar precisa de Node e Docker. Eu containerizaria os serviços se outra pessoa precisasse rodar sem instalar Node.

### 3. Como você garantiu que o repositório não vaza segredo nem engana quem lê?
**R.** Segredos vêm de variáveis de ambiente; o `.env.example` só tem marcadores `change-me` e o `npm run setup` gera um `.env` local com valores aleatórios, ignorado pelo git. O serviço se recusa a subir com valor de exemplo. Quanto à honestidade da apresentação: o repositório diz, no README e em `docs/00-sobre-este-caso`, que o CRM e o ERP são sistemas simples criados por mim, que a empresa é fictícia, que as reuniões são simuladas e que não existe cliente nem produção. Cada registro simulado começa com um aviso padrão.
