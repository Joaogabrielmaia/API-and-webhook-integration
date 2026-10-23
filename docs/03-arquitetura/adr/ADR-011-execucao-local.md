# ADR-011 — Execução local: Docker Compose só para o PostgreSQL

**Status:** aceita · **Requisitos:** RNF-07

## Contexto
O repositório não será publicado em servidor; tudo roda local e as provas são prints, diagramas e documentos. Preciso de um jeito simples de subir o banco e de testar falhas de verdade (derrubar o ERP).

## Alternativas
1. **Containerizar tudo** (um Dockerfile por serviço, todos no Compose).
2. **Compose só para o PostgreSQL**, serviços Node rodando com `npm`.
3. Instalar PostgreSQL na máquina. Pouco reprodutível.

## Escolha
Opção 2. Um PostgreSQL com três bancos (`crm`, `erp`, `ponte`) e três de teste (`*_test`), criados por um script de inicialização. Porta `5440` para não colidir com outros PostgreSQL locais.

## Motivo
- Ciclo de desenvolvimento rápido (`tsx watch`).
- Os testes de integração sobem os serviços **dentro do processo do teste** e derrubam o ERP de verdade (fechando o servidor), o que dá um teste de falha realista e rápido.
- O Compose cobre o que é difícil de reproduzir à mão (banco versão 16 com bancos pré-criados).

## Trade-off
Quem for rodar precisa de Node e Docker. Não há "um comando sobe tudo em contêiner".

## Quando eu mudaria de ideia
Se outra pessoa precisasse rodar sem instalar Node, eu containerizaria os serviços e manteria os testes no modo atual.
