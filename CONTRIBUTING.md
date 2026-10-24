# Contribuindo

O código roda localmente. Este arquivo reúne as instruções de execução.

## Requisitos
- Node.js (testado com a versão 24)
- Docker (PostgreSQL 16 em contêiner)

## Subir o ambiente

```bash
npm install            # instala as dependências e gera os clientes Prisma
npm run setup          # gera o .env local com segredos aleatórios (não versionado)
npm run db:up          # PostgreSQL 16 em contêiner, porta 5452
npm run db:migrate     # cria as tabelas dos três bancos
npm run dev:demo       # sobe CRM, ERP, Ponte e painel
```

| Serviço | Endereço |
|---|---|
| CRM simples | http://localhost:4001/ui |
| ERP simples | http://localhost:4002/ui |
| Painel de integração | http://localhost:4003 |
| API da Ponte | http://localhost:4000 (`/health`, `/v1/webhooks/*`, `/v1/admin/*`) |

## Cenários de demonstração e testes

Os comandos dos cenários (`npm run demo`) e dos testes (`npm test`, `npm run test:e2e`, `npm run test:record`) estão no [guia de operação](docs/06-pos-lancamento/guia-de-operacao.md#cenários-de-demonstração). `test:e2e` regenera os prints e `test:record` regrava os registros de `docs/05-qualidade/resultados/`.
