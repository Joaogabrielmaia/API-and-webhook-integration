# Fase 4: Contratos de API

### 1. Por que escrever o OpenAPI antes do código?
**R.** Para decidir, antes de ter pressa, o formato de erro (`{ error: { code, message, requestId } }`), os códigos estáveis, a semântica de idempotência (`externalRef` e o cabeçalho `Idempotent-Replay`) e o formato dos eventos. Depois, os testes de contrato chamam os serviços de verdade e validam cada resposta contra o documento. Eles acharam duas inconsistências minhas antes de qualquer consumidor: um corpo vazio que respondia 400 e uma validação que respondia 400 onde o contrato dizia 422.

### 2. Como você versiona a API e os eventos?
**R.** ([ADR-007](../03-arquitetura/adr/ADR-007-versionamento-da-api.md)) Versão no caminho (`/v1`) e campo `version` no envelope do evento. Dentro de uma versão maior só entra mudança aditiva; quebra exige `/v2` em paralelo por pelo menos 90 dias, com `Deprecation` e `Sunset`. Consumidores ignoram campos desconhecidos (leitura tolerante). Um exemplo real do repositório: a v1.1 da Ponte acrescentou um endpoint e campos opcionais e o OpenAPI foi de `1.0.0` para `1.1.0`, sem `/v2` e sem mudar nenhum cliente.

### 3. Como o teste de contrato garante que o contrato não envelhece?
**R.** Duas regras. Cobertura: o teste **falha** se alguma operação do OpenAPI não for exercitada (44 de 44 hoje). E produtor e consumidor: o evento que o CRM realmente emite é validado contra o esquema do CRM **e** contra o esquema que a Ponte espera, o que pega divergência entre as duas pontas. O mesmo vale para o evento do ERP.
