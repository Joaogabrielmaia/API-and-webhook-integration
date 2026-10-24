# Minha retrospectiva final

Esta é a minha avaliação do projeto, em primeira pessoa. Ao contrário da [retrospectiva simulada](retrospectiva.md), aqui não há personagem: é o que eu tiro do trabalho.

## O que eu entreguei
Um serviço de integração (a Ponte) que, quando uma venda é ganha em um CRM, cria o cliente, o pedido e a cobrança em um ERP e mantém os dois sincronizados. O CRM e o ERP são sistemas simples que eu mesmo criei para o estudo. O que eu quis mostrar é a **engenharia da integração**: idempotência, retentativa, fila de falhas (dead-letter), reconciliação, contratos de API e observabilidade.

Em números que eu posso defender, todos de execuções registradas: 193 testes Vitest e 10 E2E passando, 44 operações de contrato exercitadas, um teste que derruba o ERP de verdade no meio de um lote de 20 sem perder nem duplicar nada, e 16 prints gerados pelo próprio sistema.

## O que eu faria diferente
1. **Ter montado a pilha de testes antes do primeiro teste de integração.** Gastei tempo com testes que disputavam o mesmo banco e com asserções de tempo que mediam o ruído da máquina, não a política (itens 7, 8, 11 e 12 do [registro de problemas](../05-qualidade/bugs-e-aprendizados.md)). Hoje eu começaria pelo isolamento por projeto e por uma regra: teste de tempo afirma piso e crescimento, nunca teto.
2. **Ter escrito o modelo de `CustomerLink` com mais cuidado.** Coloquei CNPJ único onde a unicidade devia estar no ERP. Peguei na revisão, antes de existir dado, mas a migração `0002` existe porque eu apressei o desenho.
3. **Ter separado as sprints no código, não só nos documentos.** O `app.ts` ligou fila, worker, reconciliação e administração já na primeira sprint, então o histórico do git não conta a história "sprint a sprint" com a mesma clareza que os documentos.

## O que eu mantenho
- **Contrato antes do código.** Escrever os três OpenAPI primeiro me fez decidir códigos de erro e semântica de idempotência antes de ter pressa, e o teste de contrato achou duas inconsistências reais.
- **Gravar antes de processar.** `Event` e `Job` na mesma transação eliminou uma classe inteira de problemas (o "dual write").
- **Três camadas de idempotência**, cada uma cobrindo uma falha diferente. O teste de "ERP lento" mostrou o caso que justifica a terceira: o ERP termina de criar depois que a Ponte desistiu por timeout.
- **Reconciliação que se recusa a concluir** quando só vê um lado.
- **Escrever o que não foi testado.** A seção de limites da [qualidade](../05-qualidade/README.md) me obriga a não prometer o que não medi.

## O que eu aprendi sobre integração (e não sabia dizer antes)
- Em integração, **"exatamente uma vez" não existe; o que existe é "pelo menos uma vez" com idempotência**, e a idempotência precisa estar em mais de um lugar.
- Falhar bem é uma funcionalidade: cada falha precisa de **estado, motivo, ação recomendada e um caminho de volta**.
- O que não dá para garantir por evento garante-se por **comparação periódica**. Eventos e reconciliação não competem; cobrem pontos cegos um do outro.
- Dois relógios diferentes nunca se misturam em uma conta de tempo.

## Limites que eu reconheço
- Tudo isto é um estudo: nenhum cliente, operação ou produção reais; reuniões simuladas; ganhos como hipóteses, não medidas.
- Sem teste de carga e sem a janela real de 2 horas (validada por cálculo).
- O painel não edita o mapeamento e não atualiza sozinho.

## Próximo passo, se isto fosse seguir
O [roadmap](roadmap.md) tem a ordem. Os dois primeiros itens são o evento de liberação de conferência e a troca de segredo sem indisponibilidade; o que eu faria antes de qualquer um deles é validar os requisitos com uma conversa real, no modo sombra descrito em [06-ganhos-como-hipoteses.md](../02-definicao/06-ganhos-como-hipoteses.md).
