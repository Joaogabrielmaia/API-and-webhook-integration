# PR: alerta de fila parada (v1.1.0)

> Texto da descrição do PR da v1.1.0: branch `feat/stalled-queue-alert` → `main`, integrada no commit de merge `21e6b8b`.

**Branch:** `feat/stalled-queue-alert` → `main` · **Versão:** `1.0.0` → `1.1.0` (aditiva)

## Resumo
Adiciona alertas operacionais calculados na hora: **fila parada** e **fila de falhas (dead-letter) com itens esperando**. A Ponte os expõe em `GET /v1/admin/alerts` e o painel mostra um banner em todas as telas.

## Por que
Na [reunião de aceitação](../05-qualidade/reuniao-de-aceitacao.md) e na [retrospectiva](retrospectiva.md), o responsável de TI (simulado) apontou o risco R-07: se ninguém abrir o painel, uma fila parada passa despercebida. O comercial pediu "até 5 minutos" (RNF-01); o limite do alerta vem desse número.

## O que muda

| Área | Mudança |
|---|---|
| API | `GET /v1/admin/alerts` (novo). `GET /v1/admin/metrics` ganha `oldestPendingAgeSeconds`. `GET /health` ganha `worker` |
| Regra | `QUEUE_STALLED`: trabalho **vencido** esperando ≥ `QUEUE_STALL_SECONDS` (padrão 300 s), `critical` a partir de 3×. `DEAD_LETTERS_PRESENT`: há eventos em `DEAD`. Retentativa agendada para o futuro **não** conta |
| Painel | Banner por alerta em todas as telas; cartão "espera mais antiga na fila" |
| Configuração | `QUEUE_STALL_SECONDS` (padrão 300) |
| Documentação | [ADR-012](../03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md), OpenAPI da Ponte `1.1.0`, guia de operação, [changelog](CHANGELOG.md), print 16 |

## Compatibilidade
**Aditiva**: endpoint novo e campos opcionais. Nenhum cliente da `1.0.0` precisa mudar (os contratos usam leitura tolerante). Sem mudança de banco, sem migração.

## Como testar

```bash
npm test                 # 193 testes Vitest (inclui 8 unitários e 8 de integração dos alertas)
npm run test:e2e         # 10 testes E2E; o 10º gera o print 16
npm run dev:demo         # em um terminal
# no painel (http://localhost:4003), pause o worker e espere; ou veja o teste de integração
```

Roteiro manual: derrubar o worker (ou usar o teste `alerts.test.ts`), deixar um evento esperando por mais de 5 minutos e abrir o painel.

## Resultado dos testes (execução real, na branch)
Registro em [resultados/execucao-dos-testes.txt](../05-qualidade/resultados/execucao-dos-testes.txt):

- Vitest: **23 arquivos, 193 testes, todos passaram** (69,7 s)
- Playwright: **10 passaram** (28,3 s)
- Contrato: **44 de 44 operações** do OpenAPI exercitadas

![Alerta de fila parada](../screenshots/16-painel-alerta-de-fila-parada.png)

## Decisões e trade-offs (resumo; completo no ADR)
- **Escolhi** calcular o alerta sob demanda em vez de gravar estado ou notificar ativamente. **Motivo:** menor mudança que fecha o R-07 e que uma notificação futura reaproveita.
- **Trade-off:** alguém ou algo precisa consultar o alerta; não há histórico de alertas.
- **Mudaria de ideia** se a operação não olhasse o painel: o próximo passo é um consumidor de `/alerts` que envia a um canal (item 3 do [roadmap](roadmap.md)).

## Riscos
| Risco | Mitigação |
|---|---|
| Ruído durante a janela de backup do ERP | `QUEUE_STALLED` só considera trabalho **vencido**; retentativa em backoff não conta. `DEAD_LETTERS_PRESENT` é esperado nessa janela e documentado no guia |
| Relógios diferentes entre aplicação e banco | A idade é calculada **no banco** (`now()`), o mesmo relógio que agenda as retentativas |
| Alerta consulta o banco a cada abertura de tela | Duas consultas agregadas leves; adequado ao volume do cenário |

## Reversão
Reverter o merge. Nada persiste: não há tabela nem coluna novas.

## Checklist
- [x] Testes unitários, de integração, de contrato e E2E
- [x] OpenAPI atualizado (`1.1.0`) e validado por teste de contrato
- [x] ADR registrada
- [x] Changelog e guia de operação atualizados
- [x] Sem segredo novo no repositório
- [x] Compatível com a versão anterior
