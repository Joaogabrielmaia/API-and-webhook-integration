# Problemas encontrados no caminho (e o que mudei)

Lista real, na ordem em que apareceram. Incluo os que eram erro **meu** (de teste ou de desenho), porque é aí que mais se aprende.

| # | O que aconteceu | Como apareceu | Causa | O que fiz |
|---|---|---|---|---|
| 1 | A porta 5440 do PostgreSQL já estava em uso | `docker compose up` falhou com "port is already allocated" | Outro contêiner local usava essa porta | Mudei para **5452** em compose, `.env.example` e docs |
| 2 | `CustomerLink.taxId` era único | Revisão do desenho: dois clientes do CRM com o **mesmo CNPJ** (a duplicidade que o projeto quer tratar) apontam para um só do ERP | Erro de desenho: a unicidade devia estar no ERP, não no vínculo | Migração `0002_customerlink_taxid_not_unique`. Eu queria resetar o banco; o Prisma **recusou** `migrate reset` sem consentimento explícito e eu não contornei: restaurei a `0001` (conferi o checksum contra o banco) e acrescentei a `0002` |
| 3 | Teste unitário falhou com `1.234.567` | Primeira rodada de unitários | Erro do teste: R$ 1.234.567 passa do limite de R$ 1 milhão, então rejeitar estava certo | Corrigi a expectativa e adicionei o caso aos rejeitados |
| 4 | `POST /pay` sem corpo respondia 400 | Testes de contrato do ERP | O Fastify rejeita corpo vazio com `content-type: application/json` | Parser tolerante nos três serviços; na rota de webhook continua o corpo bruto |
| 5 | Validação do ERP respondia 400, e o contrato dizia 422 | Teste de contrato | O tratador de erro usava 400 fixo para falha de validação | O status passou a vir do catálogo de erros |
| 6 | Duas Pontes subindo juntas colidiam na versão 1 do mapeamento | Arquivos de teste rodando em paralelo | **Corrida real** em `ensureDefaultMapping` (contar e depois criar) | `createMany` com `skipDuplicates` |
| 7 | Arquivos de teste rodavam em paralelo no mesmo banco | A mesma falha acima | `fileParallelism: false` não vale dentro de projeto do workspace do Vitest | `singleFork` por projeto + bancos separados por projeto |
| 8 | Eventos de um teste eram processados pelo worker de **outro** teste | Cenário B da falha injetada ficou 30 s esperando | Duas pilhas vivas no mesmo banco: o worker da primeira pegava os eventos da segunda | Cada cenário fecha a própria pilha antes do próximo |
| 9 | Erro de dado numa rota virava 500 | Teste de mapeamento | `PONTE-VAL-004` não tem status HTTP (é erro de processamento) | `PUT /mapping` traduz para `PONTE-MAP-001` (422) |
| 10 | Reconciliação com ERP fora respondia 500 | Revisão ao escrever o teste | Falha a jusante sem status próprio | Códigos `PONTE-ERP-*` e `PONTE-CRM-*` ganharam 502/504 e entraram no OpenAPI |
| 11 | `payment-sync` falhou só quando a suíte inteira rodava | Rodada completa | **Dois problemas do teste**: lia o evento antes do worker gravar `PROCESSED`; e atrasava um job em 700 ms, quase igual à janela de retentativa do teste | Espero o estado final; atraso de 300 ms e 8 tentativas |
| 12 | Teste do backoff falhou numa gravação final | `test:record` (1 falha em 177) | Eu comparava `nextRunAt` (relógio do Postgres, dentro do Docker) com `startedAt` (relógio do Windows): mediu o **desvio entre relógios** (30 ms onde a política diz 40) | Passei a medir só com o relógio da aplicação (fim de uma tentativa → início da seguinte). |

## Aprendizados que mudaram a forma de trabalhar
- **Dois workers vivos no mesmo banco disputam tudo.** Vale para testes (itens 7 e 8) e vale como aviso para operação: um segundo processo da Ponte consome a fila do primeiro, o que é o desenho, mas exige que ambos falem com os mesmos CRM e ERP.
- **Relógios diferentes não se misturam** (item 12). O código da Ponte usa o relógio do banco de forma consistente (agenda e retoma pelo `now()` do Postgres); o erro estava no teste.
- **Teste de tempo precisa de piso, não de teto.** Um teto mede ruído da máquina; o piso mede a política.
- **O teste de contrato achou duas inconsistências reais** (itens 4 e 5) antes de qualquer cliente achar.
- **Nenhum desses itens foi escondido para a suíte "passar".** As correções estão no histórico, agrupadas por tema; o item 12 está no commit 893eaa7.
