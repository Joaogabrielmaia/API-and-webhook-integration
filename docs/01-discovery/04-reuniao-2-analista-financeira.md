# 04 — Reunião 2: analista financeira

> Reunião simulada; pessoas e empresa fictícias.

**Participantes:** Patrícia Souza (analista financeira da Serviços Aurora, fictícia) e eu.
**Objetivo:** entender o que o financeiro precisa para confiar numa cobrança criada automaticamente.

## Conversa (resumida)

**Eu:** Patrícia, o Marcos quer que tudo seja criado na hora. O que você acha?

**Patrícia:** Eu entendo, mas cobrança errada é pior que cobrança atrasada. Se sair com CNPJ errado ou valor errado, eu que tenho que explicar pro cliente. Eu **quero conferir** antes.

**Eu:** Conferir tudo, toda venda?

**Patrícia:** Não, seria o mesmo trabalho de hoje. Mas venda grande eu confiro. E quero **saber o motivo** quando algo não passar. Não adianta aparecer "erro".

**Eu:** O que é "venda grande"?

**Patrícia:** Acima de 50 mil reais.

**Eu:** E o CNPJ inválido? O Marcos disse que o vendedor corrige depois.

**Patrícia:** Sem CNPJ válido eu não crio cliente. Senão vira bagunça no cadastro. Mas também não quero que a venda suma: quero uma lista do que ficou parado e por quê.

**Eu:** E duplicidade de cliente?

**Patrícia:** O CNPJ é a chave. Mesmo CNPJ é o mesmo cliente, mesmo que o nome venha diferente. E **não sobrescrever a razão social** que eu já cadastrei no ERP.

**Eu:** Você quer ser avisada de divergências entre CRM e ERP?

**Patrícia:** Quero ver uma lista. Não quero mais descobrir quando o cliente reclama.

**Eu:** Pagamento: quem avisa o CRM?

**Patrícia:** Quando eu dou baixa no ERP, o CRM tem que saber. Não vou lançar duas vezes.

## Contradições com a reunião 1

| Tema | Comercial (Marcos) | Financeiro (Patrícia) |
|---|---|---|
| Velocidade | Na hora, sem travar | Conferir antes |
| CNPJ inválido | Corrige depois, não trava a venda | Sem CNPJ válido não cria cliente |
| Controle | Não perder a venda | Não criar nada errado |

## Como eu resolvi a contradição (decisão de escopo)

**Contexto.** Os dois estão certos dentro do papel de cada um.
**Alternativas.** (1) Tudo automático, sem conferência. (2) Tudo parado até o financeiro aprovar. (3) Automático para o caso comum, com regras explícitas de quando conferir e uma fila de falhas (dead-letter) visível.
**Escolha.** Opção 3.
**Motivo.** Preserva a rapidez no caso comum e dá ao financeiro o controle nos casos de risco.
**Trade-off.** Mais regras para explicar e manter; o financeiro ainda confere as cobranças grandes.
**Quando eu mudaria.** Se a taxa de eventos na fila de falhas ficar alta, eu revisaria as validações antes de relaxar a regra.

Regras que saíram daqui:
- Valor ≥ R$ 50.000,00 gera cobrança com status **EM_CONFERENCIA** (só o financeiro libera) (RN-06).
- CNPJ inválido **não** cria cliente: o evento vai para a fila de falhas com motivo claro, e a venda continua registrada no CRM (RN-01, RN-09).
- Cliente é identificado pelo CNPJ; razão social existente no ERP não é sobrescrita (RN-02).
- Divergências entre CRM e ERP aparecem numa lista (reconciliação) (RF-12).
