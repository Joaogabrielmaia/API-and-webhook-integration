# Respostas para "fale sobre este projeto"

## Versão de 30 segundos

"Construí, como estudo de caso, um serviço de integração entre um CRM e um ERP. Quando uma venda é ganha, ele cria o cliente, o pedido e a cobrança no ERP e devolve os identificadores ao CRM. O foco foi a engenharia da integração: idempotência, retentativa com backoff, fila de falhas e uma reconciliação que compara os dois lados. O CRM e o ERP são sistemas simples que eu criei no próprio repositório e as reuniões foram simuladas, então eu não falo de cliente real; o que eu mostro são decisões documentadas e testes que rodam de verdade, inclusive um que derruba o ERP no meio de um lote."

## Versão de 2 minutos

"Este é um estudo de caso de integração, e eu começo dizendo o que é cenário: a empresa, a Serviços Aurora, é fictícia; o CRM e o ERP são sistemas simples que eu criei no repositório; as reuniões de discovery foram simuladas com o Claude no papel do cliente. O que é real é o código, os testes e os resultados registrados.

O problema era o retrabalho entre comercial e financeiro: alguém redigitava o fechamento da venda no ERP. Comparei cinco alternativas com uma matriz de decisão e escolhi a integração por API; a segunda colocada foi uma automação visual, e eu explico quando eu mudaria de ideia.

A simulação trouxe duas coisas úteis. Uma contradição: o comercial quer rapidez, o financeiro quer conferência, que eu resolvi com regras explícitas, como cobrança em conferência a partir de R$ 50.000. E uma restrição: o ERP fica fora do ar duas horas por dia e não reenvia webhook. Isso me obrigou a receber e gravar primeiro, processar depois, tratar falha como funcionalidade e incluir uma reconciliação.

Em prática, a Ponte recebe um webhook assinado com HMAC, grava o evento e a fila na mesma transação e responde rápido. Um worker aplica um mapeamento configurável, cria o cliente por CNPJ sem duplicar, cria pedido e cobrança com chaves idempotentes e devolve os IDs ao CRM. Se o ERP falha, ela retenta com backoff exponencial; esgotadas as tentativas, o evento vai para uma fila de falhas visível, com causa e ação, e dá para reprocessar sem duplicar.

Os testes são o que eu mais gosto de mostrar: 193 testes passando, os contratos OpenAPI cobertos em 44 de 44 operações, e um teste de falha injetada que derruba o ERP de verdade no meio de um lote de 20 negócios e termina com 20 de 20 processados e nenhuma duplicidade. Também documentei o que deu errado, inclusive erros meus de teste, e o que eu não testei: carga, e a janela real de duas horas.

Por fim, evoluí o sistema com uma v1.1, um alerta de fila parada, com branch, descrição de PR e changelog. E tem um trecho do README que eu deixei para eu mesmo escrever: como isso se liga ao que eu realmente fiz com CRM e integrações."

## Perguntas que costumam vir depois

| Pergunta | Onde está a resposta |
|---|---|
| "Isso foi para um cliente real?" | Não. [Sobre este caso](../00-sobre-este-caso/README.md) |
| "Por que não usou uma fila pronta?" | [ADR-002](../03-arquitetura/adr/ADR-002-fila-em-banco-vs-broker.md) |
| "O que acontece se o webhook chegar duas vezes?" | [ADR-003](../03-arquitetura/adr/ADR-003-idempotencia.md) e `idempotency.test.ts` |
| "Quanto tempo isso economiza?" | Não medi. Só há uma [hipótese com fórmula](../02-definicao/06-ganhos-como-hipoteses.md) |
| "O que você não testou?" | [Limites da qualidade](../05-qualidade/README.md) |
