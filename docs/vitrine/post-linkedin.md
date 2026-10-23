# Post de LinkedIn

> Rascunho. Releia, ajuste ao seu tom e troque o marcador do link. Não inclui link de hospedagem porque o projeto roda só localmente.

---

Integrar dois sistemas é fácil no fluxo feliz. O difícil é o que acontece quando o ERP cai às 23h.

Montei um estudo de caso para treinar exatamente isso: a Ponte, um serviço que, quando uma venda é ganha em um CRM, cria o cliente, o pedido e a cobrança em um ERP e mantém os dois sincronizados.

Deixo claro o que é cenário: a empresa é fictícia, o CRM e o ERP são sistemas simples que eu criei no próprio repositório, e as reuniões de discovery foram simuladas. Não há cliente real nem produção. O que é real é o código, os testes e os resultados registrados.

O que eu quis mostrar não é o fluxo feliz:

→ Idempotência em três camadas: o mesmo evento 10 vezes em paralelo gerou um único pedido.
→ Retentativa com backoff exponencial e fila de falhas com reprocessamento manual.
→ Reconciliação que acha o que os eventos não pegam (um webhook perdido, um valor que mudou depois).
→ Contratos OpenAPI com teste de contrato, e as 44 operações cobertas.

O teste de que mais gostei: derrubar o ERP de verdade no meio de um lote de 20 negócios. Resultado da execução registrada: 20 de 20 processados, nenhuma duplicidade.

Também registrei o que deu errado no caminho (12 itens, incluindo erros meus de teste). Foi onde mais aprendi.

Tem diagramas, 12 ADRs com trade-off e "quando eu mudaria de ideia", e prints gerados pelo próprio sistema.

Repositório: [link do repositório no GitHub]

#integração #APIs #webhooks #automação #engenharia #portfólio
