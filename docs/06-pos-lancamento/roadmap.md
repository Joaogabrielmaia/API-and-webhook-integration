# Roadmap e limitações

O roadmap é uma lista de decisões possíveis, não uma promessa. Cada item diz por que e o que muda.

## Próximos passos

| Prioridade | Item | Por quê | O que muda |
|---|---|---|---|
| 1 | **Evento de liberação de conferência** (melhoria 2 da [retrospectiva](retrospectiva.md)) | Hoje o CRM só aprende que a cobrança foi liberada pela reconciliação (RN-12) | Novo evento do ERP (`invoice.released`), novo tratador na Ponte, contrato do ERP `1.1.0`. Aditivo |
| 2 | **Aceitar dois segredos de webhook** (melhoria 3) | Trocar o segredo hoje recusa eventos por alguns minutos | Verificação tenta o segredo novo e o antigo durante a troca ([ADR-009](../03-arquitetura/adr/ADR-009-seguranca-do-webhook.md)) |
| 3 | **Notificação ativa de alertas** | O alerta de fila parada ([ADR-012](../03-arquitetura/adr/ADR-012-alerta-de-fila-parada.md)) depende de alguém olhar | Um consumidor de `GET /v1/admin/alerts` que envia a um canal (e-mail ou chat). Exige um segredo e um destino |
| 4 | **Aviso ao vendedor** quando o evento vai para a fila de falhas | Pedido da aceitação | Escrever no CRM (campo de observação) o motivo da falha. Exige novo campo no CRM |
| 5 | **Edição do mapeamento pelo painel** | Hoje só pela API | Formulário com validação da Ponte; o histórico de versões já existe |
| 6 | **Reconciliação incremental** | Compara tudo a cada ciclo | Cursor por data de alteração e execução completa uma vez ao dia ([ADR-006](../03-arquitetura/adr/ADR-006-reconciliacao.md)) |
| 7 | **Janelas de silêncio** por horário no alerta | Durante o backup do ERP, retentativas são esperadas | Configuração de horários em que `DEAD_LETTERS_PRESENT` é rebaixado |
| 8 | **Métricas e traços** (por exemplo, OpenTelemetry) | Hoje a observabilidade é o painel e o log | Exportar tempo por etapa e contagem por estado |

## Fora do escopo desde o início
Nota fiscal, sistemas reais, multiempresa, mensageria externa, cancelamento ou alteração de pedido e cobrança já criados.

## Limitações conhecidas
- **Não é produção.** Nada foi publicado, não há cliente nem operação reais, e CRM e ERP são sistemas simples criados no repositório.
- **Entrada validada por simulação.** As reuniões foram simuladas; os requisitos podem não refletir uma operação real.
- **Sem teste de carga.** Não afirmo capacidade nem desempenho. Os tempos registrados são de uma máquina local.
- **A janela de 2 horas é validada por cálculo**, não por esperá-la.
- **Pedido existente não é alterado.** Se o valor muda no CRM depois do pedido, a Ponte aponta a diferença e não corrige ([RN-03](../02-definicao/03-regras-de-negocio.md)).
- **Reconciliação em memória.** Adequada ao volume do cenário; precisa de cursor para volumes grandes.
- **Painel sem tempo real** e sem edição.
- **Rotação de segredo** com indisponibilidade curta (item 2 do roadmap).
- **Um processo de worker por padrão.** O desenho permite vários (`SKIP LOCKED`, testado no nível da fila), mas não rodei dois processos completos juntos.
- **Execução só local**, com PostgreSQL em contêiner e serviços Node pelo `npm` ([ADR-011](../03-arquitetura/adr/ADR-011-execucao-local.md)).
