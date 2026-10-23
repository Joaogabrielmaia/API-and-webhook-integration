# CLAUDE.md — Ponte

Instruções para quem (ou o quê) for mexer neste repositório.

## O que é
Ponte é um serviço de integração entre um CRM e um ERP. Quando um negócio é marcado como "Ganho" no CRM, a Ponte cria ou atualiza o cliente, cria o pedido e a cobrança no ERP e devolve os identificadores ao CRM. É um projeto de portfólio de João Gabriel Maia da Costa.

## Regras de integridade (não negociáveis)
- O CRM e o ERP deste repositório são sistemas simples criados para o estudo (`apps/mock-crm`, `apps/mock-erp`). Nunca apresentá-los como sistemas reais ou comerciais.
- A "Serviços Aurora", as pessoas e os dados são fictícios. Nada de marcas, pessoas reais ou nomes de CRMs/ERPs comerciais.
- Reuniões, entrevistas e validações são simuladas. Todo registro simulado começa com: `> Simulação: o Claude interpretou o cliente nesta conversa.`
- Nunca escrever que existe cliente real, operação real ou produção.
- Nunca inventar números: tempo economizado, erros evitados, cobertura, saída de teste, desempenho. Ganhos esperados são hipóteses com fórmula e entradas visíveis. Resultados de teste vêm de execução real.
- Sem deploy, sem hospedagem, sem link de demonstração. Tudo roda local.
- Sem segredos no repositório. Segredos vêm de variáveis de ambiente (`npm run setup` gera um `.env` local).

## Convenções
- Docs em português do Brasil, primeira pessoa. Toda decisão: contexto, alternativas, escolha, motivo, trade-off, quando mudar de ideia.
- Código tipado (TypeScript estrito), nomes em inglês, textos de interface em português.
- Diagramas em Mermaid.
- Commits em Conventional Commits, referenciando IDs de rastreabilidade (RF-xx, RN-xx, US-xx, ADR-xxx).

## Mapa técnico
- `apps/mock-crm` (porta 4001), `apps/mock-erp` (4002), `apps/integration` (4000, o produto), `apps/console` (4003, painel).
- `packages/shared`: HMAC, catálogo de erros, CNPJ, schemas de evento.
- `tests/`: Vitest (unit nos apps; integração, contrato e falha injetada aqui). `e2e/`: Playwright (também gera os prints).
- Postgres via `docker compose up -d` (porta 5440).

## Comandos
`npm run setup` · `npm run db:up` · `npm run db:migrate` · `npm run dev` · `npm test` · `npm run test:e2e` · `npm run demo -- <cenário>`
