# 05 — Qualidade

Tudo o que está nesta pasta vem de execuções reais. Quando um número aparece, existe um arquivo em [resultados/](resultados/) ou um comando que o reproduz.

## Estratégia de testes

| Camada | Ferramenta | Onde | O que prova |
|---|---|---|---|
| Unitário | Vitest | `apps/**/src/**/*.test.ts`, `packages/**/src/**/*.test.ts` | Funções puras: transformações (CNPJ, telefone, valor, prazo), motor de mapeamento, backoff, HMAC, regras de negócio, catálogo de erros |
| Integração | Vitest + PostgreSQL | `tests/integration` | Os três serviços reais conversando entre si por HTTP, cada um com seu banco: fluxo feliz, idempotência, retentativa, fila de falhas (dead-letter), fora de ordem, pagamento, reconciliação, mapeamento, segurança, fila |
| Contrato | Vitest + OpenAPI | `tests/contract` | Respostas reais de CRM, ERP e Ponte validadas contra os `.openapi.yaml`; eventos emitidos validados contra o esquema do **produtor e do consumidor** |
| Falha injetada | Vitest | `tests/failure` | ERP derrubado **de verdade** (servidor fechado) durante um lote |
| E2E | Playwright | `e2e/` | Telas reais do CRM, do ERP e do painel dirigidas por navegador; também gera os prints |

### Como os testes de integração são feitos
- Os três serviços sobem **dentro do processo do teste**, em portas livres, cada um com o seu banco PostgreSQL (`crm_*`, `erp_*`, `ponte_*`). Não há mocks de HTTP: o que o teste chama é o servidor de verdade.
- Cada projeto (`integration`, `contract`, `failure`, `e2e`) tem **bancos próprios**, então nenhum interfere no outro.
- "ERP fora do ar" é `app.close()` no servidor do ERP: a conexão é recusada. Para a demonstração visual existe também o modo de falha do ERP (`/v1/admin/chaos`).
- Os testes de contrato exigem cobertura total: o teste falha se **alguma operação** do OpenAPI não for exercitada.

## Resultado da execução registrada

Fonte: [resultados/execucao-dos-testes.txt](resultados/execucao-dos-testes.txt) (resumo) e [resultados/execucao-dos-testes-completa.txt](resultados/execucao-dos-testes-completa.txt) (saída bruta). Gerados por `npm run test:record`.

| Camada | Arquivos | Testes | Resultado |
|---|---|---|---|
| Unitário | 9 | 106 | todos passaram |
| Contrato | 3 | 18 | todos passaram; **44 de 44 operações** do OpenAPI exercitadas (CRM 13, ERP 17, Ponte 14) |
| Integração | 10 | 67 | todos passaram |
| Falha injetada | 1 | 2 | todos passaram |
| **Vitest, total** | **23** | **193** | **193 passaram, 0 falharam** (69,7 s no total, projetos em paralelo) |
| E2E (Playwright) | 1 | 10 | 10 passaram (28,3 s) |

Gravação feita na **v1.1.0** (a v1.0.0 tinha 177 testes Vitest e 9 E2E; a v1.1 acrescentou os do alerta de fila parada).

![Execução dos testes](../screenshots/15-execucao-dos-testes.png)

Isto é o resultado de **uma** execução registrada, em uma máquina local. A mesma suíte já falhou antes de ficar estável; ver [bugs-e-aprendizados.md](bugs-e-aprendizados.md).

## Como reproduzir

```bash
npm run setup        # gera o .env local com segredos aleatórios
npm run db:up        # PostgreSQL em contêiner (porta 5452)
npm run db:migrate   # migra os bancos de desenvolvimento
npm test             # Vitest: unitário, integração, contrato e falha injetada (cria e migra os bancos de teste sozinho)
npm run test:e2e     # Playwright (sobe a própria pilha em portas 4100 a 4103 e regenera docs/screenshots)
npm run test:record  # roda tudo e grava a saída em docs/05-qualidade/resultados/
```

## O que os testes cobrem, por requisito

| Requisito | Evidência |
|---|---|
| RF-01 webhook assinado | `webhook-security.test.ts` (13), `hmac.test.ts` (15) |
| RF-03 idempotência | `idempotency.test.ts`: duplicata, 10 disparos simultâneos, reenvio pelo CRM, replay na janela de 5 min |
| RF-04/RN-02 cliente por CNPJ | `happy-path.test.ts`: nome diferente, concorrência |
| RF-05/RN-04..06 pedido e cobrança | `happy-path.test.ts`, `transforms.test.ts`, `rules.test.ts` |
| RF-07 mapeamento | `mapping.test.ts` (unitário e integração) |
| RF-08/RN-09 retentativa | `backoff.test.ts`, `retry-deadletter.test.ts` |
| RF-09/RN-10 fila de falhas | `retry-deadletter.test.ts`, `erp-down-batch.test.ts` |
| RF-10/RN-08 pagamento | `payment-sync.test.ts` |
| RF-12/RN-11 reconciliação | `reconciliation.test.ts` (10) |
| RF-14/RN-07 fora de ordem | `out-of-order.test.ts` |
| RNF-02 durabilidade | `erp-down-batch.test.ts`: recebidos = soma dos estados finais |
| RNF-03 resiliência | `backoff.test.ts` (janela de 3 h 01 min na política padrão), `erp-down-batch.test.ts` |
| RNF-06 contratos | `*.contract.test.ts` |
| ADR-002 fila | `queue.test.ts`: `SKIP LOCKED` nunca entrega o mesmo job a dois workers |
| ADR-012 alerta de fila parada (v1.1) | `alerts.test.ts` (unitário, 8) e `tests/integration/alerts.test.ts` (8) |

## O que eu **não** testei (limites declarados)
- **Carga e desempenho.** Não há teste de carga. O tempo de 122 a 465 ms do ganho até `PROCESSED` (54 ms para o evento de pagamento), visto nas execuções locais, vale para este ambiente e nenhum outro. Não afirmo capacidade.
- **A janela real de 2 horas.** A política padrão (30 s a 30 min, 12 tentativas) é verificada por **cálculo** (`backoff.test.ts`), não por esperar 3 horas. Os testes de comportamento usam esperas de dezenas de milissegundos com a mesma fórmula.
- **Segurança além do HMAC.** Não há teste de canal lateral de tempo, nem pentest. A comparação usa `timingSafeEqual`, mas isso não foi medido.
- **Vários processos da Ponte ao mesmo tempo.** O `SKIP LOCKED` está provado no nível da fila (`queue.test.ts`); não rodei dois processos completos disputando eventos.
- **Usuários reais.** As reuniões foram simuladas, então a aceitação também foi. Ver [reuniao-de-aceitacao.md](reuniao-de-aceitacao.md).
- **Navegadores.** O E2E roda só em Chromium.
