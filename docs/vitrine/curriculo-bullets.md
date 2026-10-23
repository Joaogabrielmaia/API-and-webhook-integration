# Bullets de currículo (3 opções para escolher)

Todos os números abaixo vêm de execuções registradas neste repositório. Nenhum é resultado de operação real, e nenhum fala de economia de tempo ou redução de erro, porque isso eu não medi.

**Formato recomendado: estudo de caso, com o contexto dito.**

- **Ponte, serviço de integração CRM ↔ ERP (estudo de caso, TypeScript, Node.js, Fastify, PostgreSQL, Prisma):** projetei e implementei webhook assinado por HMAC, idempotência em três camadas, retentativa com backoff exponencial, fila de falhas com reprocessamento e reconciliação entre os dois sistemas; CRM e ERP simples criados no próprio repositório.
- **Qualidade de integração:** 193 testes automatizados (unitário, integração, contrato OpenAPI com 44 de 44 operações cobertas, E2E com Playwright) e um teste de falha injetada que derruba o ERP no meio de um lote de 20 negócios e termina com 20 de 20 processados e zero duplicidade.
- **Documentação de implantação ponta a ponta:** discovery com reuniões simuladas, requisitos e regras rastreáveis, 12 ADRs com trade-offs, diagramas de sequência, catálogo de 35 códigos de erro, guia de operação e uma evolução (v1.1) entregue com branch, descrição de PR e changelog.

> Se couber um qualificador curto no currículo, use: "projeto de portfólio com sistemas simulados". Ele protege o resto.

## Variações por vaga

| Vaga | Ênfase |
|---|---|
| Analista de Implantação | Discovery, regras de negócio, guia de operação, catálogo de erros com "causa e ação" |
| Consultor de Soluções | Matriz de decisão entre cinco alternativas, trade-offs e quando mudar de ideia nos ADRs |
| Consultor / Analista de Automação | Webhooks, idempotência, retentativa, reconciliação, contratos de API |
