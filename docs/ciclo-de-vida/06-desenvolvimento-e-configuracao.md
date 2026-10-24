# 06 — Desenvolvimento e gestão de configuração

Fase F: como o código, os contratos e as versões foram organizados e controlados. Tudo o que está nesta página corresponde ao que existe no repositório; o que não existe está marcado como tal.

[← Índice do ciclo de vida](README.md) · Anterior: [05 Modelo de dados](05-modelo-de-dados.md) · Próxima: [07 Testes e qualidade](07-testes-e-qualidade.md)

## Organização do código

Monorepo com npm workspaces (`apps/*` e `packages/*`).

| Pasta | Papel |
|---|---|
| `apps/integration` | A Ponte: webhooks, mapeamento, fila, worker, reconciliação, API administrativa |
| `apps/mock-crm`, `apps/mock-erp` | Sistemas simples que representam o cenário |
| `apps/console` | Painel de integração |
| `packages/shared` | HMAC, CNPJ, catálogo de erros, esquemas de evento, helpers HTTP |
| `tests/`, `e2e/` | Integração, contrato, falha injetada e roteiro Playwright |
| `scripts/` | Demonstração, gravação de testes, geradores de documentação |
| `docs/` | Documentação e contratos OpenAPI |

A organização modular segue a regra "cada serviço tem seu banco e só conhece os outros pela API" ([ADR-011](../03-arquitetura/adr/ADR-011-execucao-local.md)). Os clientes Prisma gerados não são versionados (`**/src/generated/`) e saem do `postinstall`.

## Branches, pull requests e commits

| Aspecto | Prática observada |
|---|---|
| Branch principal | `main` |
| Branches de trabalho | `feat/stalled-queue-alert` (v1.1.0), `docs/apresentacao`, `docs/readme-venda`, `docs/ciclo-de-vida` |
| Integração | Merge commit: `21e6b8b` (v1.1.0, feito localmente) e PRs [#1](https://github.com/Joaogabrielmaia/API-and-webhook-integration/pull/1) e [#2](https://github.com/Joaogabrielmaia/API-and-webhook-integration/pull/2) no GitHub |
| Convenção de commits | Conventional Commits (`feat`, `fix`, `test`, `docs`, `chore`), com escopo opcional |
| Revisão de código | Não há revisor humano registrado; o único check dos PRs foi o GitGuardian (varredura de segredos) |

Critério de merge adotado: documentação consistente e links sem quebra; para código, os testes passando localmente. Esse critério é do estudo, não de um processo automatizado.

## Versionamento e releases

| Versão | Tag | Data da tag | Natureza | Notas |
|---|---|---|---|---|
| 1.0.0 | `v1.0.0` | 2026-10-23 | Primeira versão completa | [CHANGELOG](../06-pos-lancamento/CHANGELOG.md) |
| 1.1.0 | `v1.1.0` | 2026-10-23 | Aditiva: alerta de fila parada | [CHANGELOG](../06-pos-lancamento/CHANGELOG.md), [PR da v1.1](../06-pos-lancamento/pr-v1.1.md) |

O projeto usa versionamento semântico. As [Releases no GitHub](https://github.com/Joaogabrielmaia/API-and-webhook-integration/releases) foram criadas em 2026-10-24 a partir dessas duas tags, com as notas do CHANGELOG.

## Compatibilidade e contratos

A política está no [ADR-007](../03-arquitetura/adr/ADR-007-versionamento-da-api.md): dentro de uma versão maior só entram mudanças aditivas; quebra exige `/v2` em paralelo, com `Deprecation` e `Sunset` e pelo menos 90 dias; consumidores ignoram campos desconhecidos.

| Contrato | Versão do documento | Operações | Mudança 1.0.0 → 1.1.0 |
|---|---|---|---|
| [CRM](../04-contratos-de-api/crm.openapi.yaml) | 1.0.0 | 13 | nenhuma |
| [ERP](../04-contratos-de-api/erp.openapi.yaml) | 1.0.0 | 17 | nenhuma |
| [Ponte](../04-contratos-de-api/ponte.openapi.yaml) | 1.1.0 | 14 | `GET /v1/admin/alerts` (novo), `worker` em `/health` e `oldestPendingAgeSeconds` em `/metrics` (campos opcionais) |

Total: 44 operações. O número foi conferido contando as operações dos três arquivos; o teste de contrato falha se alguma ficar sem exercício (`assertFullCoverage` em `tests/helpers/contract.ts`). Na v1.0.0 eram 43, e a v1.1.0 acrescentou uma.

## CI/CD e automações

| Recurso | Situação |
|---|---|
| Workflow de CI (`.github/workflows`) | **Não existe.** Nenhuma execução de Actions foi registrada no repositório |
| Deploy | **Não existe.** Execução apenas local |
| Verificação de segredos | GitGuardian rodou nos PRs #1 e #2 |
| Geradores de documentação | `docs:errors` (catálogo de erros) e `docs:failure` (relato da falha injetada), a partir do código e dos JSON de resultado |
| Gravação de testes | `test:record` grava a saída dos testes em `docs/05-qualidade/resultados/` |

## Ambientes, configuração, dependências e segredos

- **Ambientes:** apenas o local. Bancos de desenvolvimento (`crm`, `erp`, `ponte`) e bancos de teste por projeto (`*_test`, `*_e2e`), no mesmo PostgreSQL ([ADR-011](../03-arquitetura/adr/ADR-011-execucao-local.md)). Instruções em [CONTRIBUTING.md](../../CONTRIBUTING.md).
- **Configuração:** variáveis de ambiente; `.env` não é versionado e `.env.example` traz apenas marcadores. O script `setup` gera segredos aleatórios locais.
- **Credencial do banco de desenvolvimento:** o PostgreSQL local descartável usa usuário e senha de desenvolvimento declarados no `docker-compose.yml`; não protege nenhum dado real.
- **Dependências:** versões travadas em `package-lock.json`; não há atualização automatizada nem varredura de vulnerabilidades registrada.

## Histórico de mudanças relevantes

| Mudança | Commit | Impacto |
|---|---|---|
| Estrutura do monorepo | `3e34a50` | Base do projeto |
| Contratos OpenAPI antes do código | `c8838b2` | Os testes de contrato acharam duas inconsistências depois da implementação |
| Núcleo da Ponte | `fa03086` | Fila, worker, reconciliação e API já na primeira entrega |
| Correção do teste de backoff | `893eaa7` | Item 12 do registro de problemas |
| Alerta de fila parada | `3bdf34f`, `fcf035d` | Mudança aditiva, sem migração |
| Máscara de caminho local nos registros de teste | `bcb66e4` | Registro sem dado do ambiente do autor |

## Dívida técnica e refatoração

| Item | Origem | Estratégia |
|---|---|---|
| Histórico não separado por sprint | [retrospectiva final](../06-pos-lancamento/retrospectiva-final.md) | Aceito; a documentação conta a ordem das entregas |
| Reconciliação compara tudo em memória | [ADR-006](../03-arquitetura/adr/ADR-006-reconciliacao.md) | Cursor por data de alteração se o volume crescer |
| Fila própria mantida no repositório | [ADR-002](../03-arquitetura/adr/ADR-002-fila-em-banco-vs-broker.md) | pg-boss se surgirem várias filas, cron ou prioridades |
| Painel sem edição de mapeamento e sem tempo real | [roadmap](../06-pos-lancamento/roadmap.md) | Formulário sobre a API existente |
| Sem workflow de CI | esta página | Pendência registrada em [evolução](09-evolucao-e-roadmap.md) |
