# ADR-010 — Fastify vs. Next API (e o painel sem framework de front-end)

**Status:** aceita

## Contexto
Preciso de quatro serviços HTTP em TypeScript: CRM simples, ERP simples, Ponte e painel. A Ponte precisa do **corpo bruto** da requisição para validar HMAC e de um worker de longa duração no mesmo processo.

## Alternativas
1. **Next.js (API routes / route handlers).** Bom para produto web com front-end rico; o ciclo de vida serverless-like combina mal com um worker em loop; o acesso ao corpo bruto é possível, mas menos direto.
2. **Express.** Conhecido, mas sem validação por esquema nativa e com tipagem mais frouxa.
3. **Fastify.** Plugins encapsulados, parser de conteúdo customizável (corpo bruto), validação por esquema, logger estruturado (pino) incluso, bom suporte a TypeScript.

## Escolha
**Fastify** nos quatro serviços. O painel é **HTML renderizado no servidor** (Fastify) com um pouco de JavaScript no navegador, sem framework de front-end.

## Motivo
- O corpo bruto para HMAC entra por um parser de conteúdo local à rota (`parseAs: 'buffer'`).
- O worker roda no mesmo processo, iniciado e encerrado junto com o servidor.
- Log estruturado com identificador de correlação sai pronto.
- As telas do painel são tabelas e botões: renderizar no servidor evita etapa de build, mantém os prints reprodutíveis e reduz dependências.

## Trade-off
Sem ecossistema de componentes. As telas são mais artesanais. O painel não tem atualização em tempo real (atualização manual ou recarga).

## Quando eu mudaria de ideia
Se o painel crescesse para interações ricas (filtros em tempo real, edição inline), eu o migraria para Next.js ou outro framework de front-end, mantendo a API administrativa da Ponte como está.
