# Changelog

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Versionamento semântico; a política de contrato está no [ADR-007](../03-arquitetura/adr/ADR-007-versionamento-da-api.md).

## [1.1.0] — 2026-10-23

Origem: [retrospectiva da v1.0](retrospectiva.md), melhoria 1. Decisão: [ADR-012](../03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md). Descrição do PR: [pr-v1.1.md](pr-v1.1.md).

### Adicionado
- **Alerta de fila parada.** `GET /v1/admin/alerts` devolve os alertas vigentes, calculados na hora: `QUEUE_STALLED` (trabalho vencido esperando há `QUEUE_STALL_SECONDS`, padrão 300 s; `critical` a partir de 3×) e `DEAD_LETTERS_PRESENT`.
- **Painel:** banner com os alertas no topo de todas as telas e o cartão "espera mais antiga na fila" na visão geral.
- **`/health`** passa a informar o estado do worker (`running`, `paused`, `lastTickAt`).
- **`/v1/admin/metrics`** passa a informar `oldestPendingAgeSeconds`.
- Variável de ambiente `QUEUE_STALL_SECONDS`.
- Print 16 (alerta de fila parada) e passo correspondente no roteiro E2E.

### Alterado
- Contrato OpenAPI da Ponte: `1.0.0` → `1.1.0`. **Só mudanças aditivas** (endpoint novo, campos opcionais novos); nenhum cliente da v1.0 precisa mudar. Os contratos do CRM e do ERP continuam em `1.0.0`.
- `PONTE_VERSION` é `1.1.0`.

### Testes
- +8 unitários (`alerts.test.ts`: limites, severidade, mensagens) e +8 de integração (`tests/integration/alerts.test.ts`: fila saudável, parada, crítica, alerta que some, backoff futuro que não alerta, lock expirado, fila de falhas (dead-letter), `/health`).
- O teste de contrato passou a exercitar `/v1/admin/alerts` e o campo `worker` de `/health`; a cobertura de operações continua total (44 de 44).
- Gravação completa: 193 testes Vitest passando (23 arquivos) e 10 E2E passando. Ver [resultados](../05-qualidade/README.md).

### Migração
Nenhuma. Sem mudança de banco e sem mudança de comportamento para quem não consulta o alerta.

## [1.0.0] — 2026-10-23

Primeira versão completa (marco, não release publicado: o projeto roda só localmente).

### Adicionado
- **CRM simples** e **ERP simples** criados no repositório para o estudo (sistemas fictícios, não comerciais).
- **Ponte**: webhook `deal.won` com assinatura HMAC; idempotência por chave de evento, por negócio e por `externalRef`; cliente por CNPJ sem duplicar; pedido e cobrança; retorno de IDs ao CRM; regra de conferência a partir de R$ 50.000,00.
- **Mapeamento de campos** configurável e versionado, com transformações de uma lista fechada.
- **Fila em PostgreSQL** (`SKIP LOCKED`), **retentativa com backoff exponencial**, **fila de falhas** com reprocessamento manual, tratamento de evento fora de ordem.
- **Sincronização de volta** (`invoice.paid` → CRM) e **reconciliação** agendada e manual, com cinco tipos de divergência.
- **Painel** (eventos, fila de falhas, divergências, mapeamento, catálogo de erros), **catálogo de 35 códigos de erro** gerado da mesma fonte do código.
- Três contratos OpenAPI com testes de contrato; scripts de demonstração; 14 prints gerados por Playwright (o 15 é a execução dos testes).
- Documentação de discovery, definição, arquitetura (11 ADRs), contratos, qualidade e operação.

### Qualidade (gravação da v1.0.0)
177 testes Vitest passando (21 arquivos) e 9 E2E passando. Teste de falha injetada: ERP derrubado de verdade durante um lote de 20; 20 de 20 processados, nenhuma duplicidade.
