# Glossário

Os termos abaixo aparecem na capa e nos episódios. Cada definição tem uma linha e um link para onde o termo é usado no projeto.

[← Índice da série](INDEX.md)

| Termo | Em uma linha | Onde aparece |
|---|---|---|
| **CRM** | Sistema do comercial: guarda clientes e negócios e o estágio de cada venda. Aqui, um sistema simples criado no repositório. | [O negócio: Serviços Aurora](01-discovery/02-negocio-aurora.md) |
| **ERP** | Sistema do financeiro: guarda clientes, pedidos e cobranças. Aqui, também um sistema simples criado no repositório. | [Mapa de dados](01-discovery/07-mapa-de-dados.md) |
| **Webhook** | Aviso que um sistema envia a outro, pela rede, quando algo acontece (por exemplo, "negócio ganho"). | [ADR-001](03-arquitetura/adr/ADR-001-eventos-vs-consulta-periodica.md) |
| **Idempotência** | Repetir a mesma operação não cria nada novo: o mesmo evento enviado duas vezes gera um só pedido. | [ADR-003](03-arquitetura/adr/ADR-003-idempotencia.md) |
| **HMAC** | Assinatura calculada com um segredo que só os dois lados conhecem; prova quem enviou a mensagem e que ela não foi alterada. | [ADR-009](03-arquitetura/adr/ADR-009-seguranca-do-webhook.md) |
| **Retentativa** | Nova tentativa automática depois de uma falha temporária, como o ERP fora do ar. | [ADR-004](03-arquitetura/adr/ADR-004-retentativa-com-backoff.md) |
| **Backoff com jitter** | A espera entre tentativas cresce a cada falha e recebe uma variação aleatória de até 20%. | [ADR-004](03-arquitetura/adr/ADR-004-retentativa-com-backoff.md) |
| **Fila de falhas (dead-letter)** | Lugar onde ficam, com motivo e histórico, os eventos que não passaram sozinhos; uma pessoa decide se reprocessa. | [ADR-005](03-arquitetura/adr/ADR-005-fila-de-falhas.md) |
| **Reconciliação** | Comparação periódica entre CRM e ERP que aponta o que está diferente, inclusive evento perdido no caminho. | [ADR-006](03-arquitetura/adr/ADR-006-reconciliacao.md) |
| **OpenAPI** | Formato padrão para descrever uma API: rotas, dados aceitos e respostas. | [Contratos de API](04-contratos-de-api/README.md) |
| **Contrato de API** | O que uma API promete aceitar e devolver; o teste de contrato confere as respostas reais contra essa descrição. | [Contratos de API](04-contratos-de-api/README.md) |
| **ADR** | Registro de uma decisão de arquitetura: contexto, alternativas, escolha, motivo, custo e quando mudar. | [Arquitetura](03-arquitetura/README.md) |
| **Teste E2E** | Teste de ponta a ponta: um navegador dirige as telas reais do CRM, do ERP e do painel. Aqui, feito com Playwright. | [Qualidade](05-qualidade/README.md) |
| **Vitest** | Ferramenta que roda os testes unitários, de integração, de contrato e de falha injetada. | [Qualidade](05-qualidade/README.md) |
| **CNPJ** | Número de 14 dígitos que identifica uma empresa; é a chave usada para não duplicar clientes. | [Regras de negócio](02-definicao/03-regras-de-negocio.md) |
