# ADR-007 — Versionamento da API e dos eventos

**Status:** aceita · **Requisitos:** RNF-08

## Contexto
CRM, ERP e Ponte vão evoluir em ritmos diferentes. Uma mudança incompatível em um não pode quebrar os outros sem aviso.

## Alternativas
1. Sem versão. Qualquer mudança é um risco.
2. **Versão no caminho** (`/v1/...`).
3. Versão em cabeçalho (`Accept: application/vnd...`).
4. Versão em parâmetro de consulta.

## Escolha
Versão no caminho para as APIs (`/v1`) e campo `version` no envelope dos eventos (`"version": "1"`).

**Política:**
- Dentro de uma versão maior só entram mudanças **aditivas** (campo novo opcional, endpoint novo, novo valor de enum **documentado como extensível**).
- Quebra de contrato (remover ou renomear campo, mudar tipo, tornar opcional em obrigatório) exige `/v2` em paralelo.
- A versão antiga recebe cabeçalhos `Deprecation` e `Sunset` e é mantida por pelo menos 90 dias.
- A versão do **documento** OpenAPI segue SemVer (`1.0.0` → `1.1.0` para mudança aditiva).
- Evento com `version` desconhecida: `422` com `PONTE-REQ-002`; o produtor decide se reenvia em formato antigo.
- Consumidores devem **ignorar campos desconhecidos** (tolerant reader).

## Motivo
Caminho é o mais visível em logs, testes e documentação e funciona em qualquer cliente HTTP.

## Trade-off
URLs mudam entre versões maiores, e manter duas versões em paralelo tem custo.

## Quando eu mudaria de ideia
Se houvesse muitos clientes externos com necessidades por recurso, eu consideraria versionar por cabeçalho.

## Exemplo real neste repositório
A v1.1 da Ponte acrescenta endpoints de alerta e campos opcionais em respostas, sem quebrar a v1.0 (ver [changelog](../../06-pos-lancamento/CHANGELOG.md)).
