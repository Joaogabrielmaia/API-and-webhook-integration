# Fase 2: Definição

### 1. Como você resolveu a contradição entre comercial e financeiro?
**R.** As duas posições estavam certas dentro do papel de cada um. Em vez de escolher um lado, defini quando o automático vale e quando a conferência entra: tudo é criado automaticamente, mas valor a partir de R$ 50.000,00 gera cobrança em `EM_CONFERENCIA` (só o financeiro libera), CNPJ inválido **não** cria cliente e vai para uma fila de falhas visível, e o que divergir aparece numa lista de reconciliação. Preserva a rapidez no caso comum e dá controle nos casos de risco.
**Trade-off:** mais regras para explicar e manter. **Quando mudaria:** se a fila de falhas enchesse, eu revisaria as validações antes de relaxar a conferência.

### 2. O que é duplicidade neste sistema?
**R.** Há três tipos, com regras separadas. Cliente: o CNPJ (14 dígitos) é a chave; nome diferente com o mesmo CNPJ não cria outro cliente e **nunca** altera a razão social já cadastrada, só o contato. Evento: mesma chave de idempotência é ignorada. Negócio: um negócio gera no máximo um pedido, então um novo "Ganho" do mesmo negócio é ignorado. Se o valor mudou depois, a Ponte **não** altera o pedido existente; a reconciliação mostra a diferença para decisão humana.

### 3. Como você trata ganhos esperados sem ter medido nada?
**R.** Como hipótese com fórmula e entradas visíveis, nunca como resultado. Exemplo: horas por mês = vendas × minutos por venda × (1 − fração manual) ÷ 60. Com as estimativas da simulação (30, 15 e 10%) dá 6,75 h/mês, e eu escrevo que isso **não foi medido**. Para validar de verdade, eu mediria uma base de 2 a 4 semanas e rodaria a Ponte em modo sombra.
