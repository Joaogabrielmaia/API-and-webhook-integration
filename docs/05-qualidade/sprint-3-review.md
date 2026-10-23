# Sprint 3: visibilidade e consistência

**Meta:** o financeiro enxerga e controla; os dois lados convergem.

## Entregue

| Item | Histórias | Evidência |
|---|---|---|
| Sincronização de volta (pagamento → CRM) | US-08 | `payment-sync.test.ts` (5): normal, conferência, duplicata, cobrança de fora, pagamento antes do vínculo |
| Reconciliação agendada e manual | US-09 | `reconciliation.test.ts` (10): cinco tipos de divergência, carência, evento em voo, ERP fora durante a execução |
| Painel de integração | US-11, US-10 | `apps/console`; 9 testes E2E; prints 06 a 14 |
| Catálogo de erros gerado da fonte do código | US-12 | [catalogo-de-erros.md](../04-contratos-de-api/catalogo-de-erros.md) (35 códigos) |
| Scripts de demonstração | — | `npm run demo -- <cenário>`; saída real em [demo-cenarios.txt](resultados/demo-cenarios.txt) |
| Prints e E2E | — | 15 prints em [../screenshots](../screenshots/) |

## Resultado real ao fim da sprint
- Vitest: **177 testes, 21 arquivos, todos passando** (gravação final). E2E: **9 passaram**.
- Cenários de demonstração rodando contra os quatro serviços reais (processos separados, não em teste): ver [demo-cenarios.txt](resultados/demo-cenarios.txt).

## Problemas e decisões
- Dois testes de integração meus eram instáveis **sob carga** (itens 11 e 12 de [bugs-e-aprendizados.md](bugs-e-aprendizados.md)). Nos dois casos o produto estava certo e o teste, errado.
- Decisão: a reconciliação **não registra uma execução** (nem fecha divergências) quando CRM ou ERP estão fora. Não dá para afirmar que algo deixou de divergir sem ter visto os dois lados.
- Decisão: só `BILLING_STATUS_MISMATCH` tem correção assistida; as demais exigem decisão humana ([ADR-006](../03-arquitetura/adr/ADR-006-reconciliacao.md)).
- Limitação assumida: publicar nova versão de mapeamento é só pela API; o painel mostra e não edita.

## Cortado
- **Edição do mapeamento pelo painel** (painel avançado): fica na API.
- **Atualização em tempo real do painel**: recarregar a página.
