/**
 * Catálogo de erros: fonte única usada pelo código, pela API administrativa,
 * pelo painel e pelo gerador de documentação (scripts/generate-error-catalog.ts).
 */

export interface ErrorDefinition {
  code: string;
  service: "PONTE" | "CRM" | "ERP";
  httpStatus: number | null;
  /** Se verdadeiro, o worker da Ponte retenta com backoff. */
  retryable: boolean;
  title: string;
  cause: string;
  action: string;
}

const def = (d: ErrorDefinition): ErrorDefinition => d;

export const ERROR_CATALOG = [
  // ---- Ponte: borda (webhooks)
  def({ code: "PONTE-AUTH-001", service: "PONTE", httpStatus: 401, retryable: false, title: "Assinatura inválida", cause: "A assinatura HMAC não confere com o corpo recebido, ou o cabeçalho está ausente ou malformado. Pode ser segredo errado ou corpo alterado no caminho.", action: "Conferir se o produtor usa o mesmo segredo (variável de ambiente) e se assina o corpo bruto, sem reformatar o JSON." }),
  def({ code: "PONTE-AUTH-002", service: "PONTE", httpStatus: 401, retryable: false, title: "Timestamp fora da janela", cause: "O X-Timestamp difere do relógio da Ponte por mais de 5 minutos (relógio desalinhado ou tentativa de replay).", action: "Sincronizar o relógio do produtor. Para reenviar um evento antigo, gerar uma nova assinatura com timestamp atual (mesmo id de evento)." }),
  def({ code: "PONTE-REQ-001", service: "PONTE", httpStatus: 400, retryable: false, title: "Requisição fora do contrato", cause: "Corpo ou cabeçalhos não seguem o OpenAPI (JSON inválido, campo obrigatório ausente, X-Event-Id diferente do id do corpo).", action: "Corrigir o produtor conforme `ponte.openapi.yaml`. Os detalhes do erro listam os campos." }),
  def({ code: "PONTE-REQ-002", service: "PONTE", httpStatus: 422, retryable: false, title: "Versão de evento não suportada", cause: "O campo `version` do evento tem um valor que esta versão da Ponte não conhece.", action: "Enviar a versão suportada (`1`) ou atualizar a Ponte. Ver política de versão no ADR-007." }),

  // ---- Ponte: validação de dados (permanentes)
  def({ code: "PONTE-VAL-001", service: "PONTE", httpStatus: null, retryable: false, title: "CNPJ inválido", cause: "O CNPJ do cliente não tem 14 dígitos ou o dígito verificador não confere.", action: "Corrigir o CNPJ no CRM e reenviar o evento (reenvio da entrega no CRM) ou, depois de corrigir, reprocessar o evento pelo painel." }),
  def({ code: "PONTE-VAL-002", service: "PONTE", httpStatus: null, retryable: false, title: "Valor inválido", cause: "O valor está vazio, não é número, é menor ou igual a zero ou excede R$ 1.000.000,00.", action: "Corrigir o valor do negócio no CRM e reenviar o evento." }),
  def({ code: "PONTE-VAL-003", service: "PONTE", httpStatus: null, retryable: false, title: "Prazo de pagamento inválido", cause: "O prazo não é um inteiro entre 0 e 90 dias.", action: "Corrigir o prazo no CRM e reenviar o evento." }),
  def({ code: "PONTE-VAL-004", service: "PONTE", httpStatus: null, retryable: false, title: "Campo obrigatório ausente", cause: "Uma regra obrigatória do mapeamento não encontrou valor na origem (por exemplo, nome do cliente vazio).", action: "Preencher o campo no CRM ou revisar o mapeamento ativo." }),

  // ---- Ponte: ERP (chamadas de saída)
  def({ code: "PONTE-ERP-001", service: "PONTE", httpStatus: null, retryable: true, title: "ERP indisponível", cause: "Conexão recusada ou resposta 5xx do ERP (por exemplo, janela de backup das 23h à 1h).", action: "Nenhuma ação imediata: a Ponte retenta com backoff. Se o evento chegar a DEAD, reprocessar depois que o ERP voltar." }),
  def({ code: "PONTE-ERP-002", service: "PONTE", httpStatus: null, retryable: false, title: "ERP rejeitou a requisição", cause: "O ERP respondeu 4xx (exceto 408 e 429): dado recusado, referência inexistente ou conflito que a Ponte não sabe resolver.", action: "Ler os detalhes do erro do ERP no evento, corrigir o dado de origem ou o mapeamento e reprocessar." }),
  def({ code: "PONTE-ERP-003", service: "PONTE", httpStatus: null, retryable: true, title: "Tempo esgotado no ERP", cause: "O ERP não respondeu dentro de 10 segundos.", action: "Nenhuma ação imediata: a Ponte retenta. Se for recorrente, verificar a carga ou o backup do ERP." }),
  def({ code: "PONTE-ERP-004", service: "PONTE", httpStatus: null, retryable: true, title: "ERP limitou a taxa de chamadas", cause: "O ERP respondeu 429 (limite de requisições).", action: "Nenhuma ação imediata: a Ponte retenta com backoff e jitter. Se recorrente, reduzir a concorrência do worker." }),

  // ---- Ponte: CRM (retorno)
  def({ code: "PONTE-CRM-001", service: "PONTE", httpStatus: null, retryable: true, title: "CRM indisponível no retorno", cause: "Conexão recusada, timeout ou 5xx ao devolver os IDs do ERP ou o status da cobrança ao CRM.", action: "Nenhuma ação imediata: pedido e cobrança já existem e ficam vinculados; a retentativa só refaz o retorno." }),
  def({ code: "PONTE-CRM-002", service: "PONTE", httpStatus: null, retryable: false, title: "CRM rejeitou o retorno", cause: "O CRM respondeu 4xx ao retorno (negócio inexistente, chave de API inválida).", action: "Verificar se o negócio ainda existe no CRM e a chave `CRM_API_KEY`; depois reprocessar." }),

  // ---- Ponte: sincronização
  def({ code: "PONTE-SYNC-001", service: "PONTE", httpStatus: null, retryable: true, title: "Cobrança ainda não vinculada a um negócio", cause: "O pagamento chegou antes de a Ponte registrar o vínculo da cobrança (evento fora de ordem).", action: "Nenhuma ação: a Ponte retenta até o vínculo existir. Se esgotar, verificar se o evento `deal.won` correspondente está em DEAD." }),
  def({ code: "PONTE-SYNC-002", service: "PONTE", httpStatus: null, retryable: false, title: "Evento obsoleto ignorado", cause: "Existe outro evento aceito do mesmo negócio com versão maior.", action: "Nenhuma ação: o evento mais novo prevalece." }),
  def({ code: "PONTE-SYNC-003", service: "PONTE", httpStatus: null, retryable: false, title: "Negócio já vinculado", cause: "O negócio já gerou pedido e cobrança (regra RN-03: um negócio, um pedido).", action: "Nenhuma ação. Se o valor mudou depois do ganho, a reconciliação apontará `AMOUNT_MISMATCH` para decisão humana." }),
  def({ code: "PONTE-SYNC-004", service: "PONTE", httpStatus: null, retryable: false, title: "Pagamento já registrado", cause: "A cobrança já estava marcada como paga na Ponte.", action: "Nenhuma ação." }),

  def({ code: "PONTE-SYNC-005", service: "PONTE", httpStatus: null, retryable: false, title: "Cobrança fora do escopo da Ponte", cause: "O pagamento é de uma cobrança cuja referência externa não foi criada pela Ponte.", action: "Nenhuma ação: cobranças lançadas à mão no ERP não são sincronizadas." }),

  // ---- Ponte: administração e mapeamento
  def({ code: "PONTE-ADM-001", service: "PONTE", httpStatus: 409, retryable: false, title: "Evento não está na fila de falhas", cause: "O reprocessamento manual só vale para eventos em DEAD.", action: "Conferir o estado do evento. Se está em RETRYING, aguardar a próxima tentativa." }),
  def({ code: "PONTE-ADM-002", service: "PONTE", httpStatus: 404, retryable: false, title: "Recurso não encontrado", cause: "O identificador informado não existe.", action: "Conferir o identificador." }),
  def({ code: "PONTE-ADM-003", service: "PONTE", httpStatus: 401, retryable: false, title: "Chave de administração inválida", cause: "O cabeçalho X-Admin-Key está ausente ou incorreto.", action: "Usar a chave definida em `PONTE_ADMIN_KEY`." }),
  def({ code: "PONTE-ADM-004", service: "PONTE", httpStatus: 409, retryable: false, title: "Divergência sem correção assistida", cause: "Só `BILLING_STATUS_MISMATCH` tem correção automática; nos demais tipos não é óbvio qual lado está certo.", action: "Decidir manualmente qual lado corrigir (CRM ou ERP)." }),
  def({ code: "PONTE-MAP-001", service: "PONTE", httpStatus: 422, retryable: false, title: "Mapeamento inválido", cause: "A nova versão do mapeamento usa destino ou transformação fora da lista permitida, ou não cobre um campo obrigatório.", action: "Corrigir as regras conforme o ADR-008 e publicar de novo." }),
  def({ code: "PONTE-INT-001", service: "PONTE", httpStatus: 500, retryable: true, title: "Erro interno inesperado", cause: "Exceção não prevista durante o processamento.", action: "A Ponte retenta. Se persistir até DEAD, abrir o evento no painel, ler o erro e corrigir o código." }),

  // ---- CRM simples
  def({ code: "CRM-AUTH-001", service: "CRM", httpStatus: 401, retryable: false, title: "Chave de API inválida", cause: "X-Api-Key ausente ou incorreta.", action: "Usar `CRM_API_KEY`." }),
  def({ code: "CRM-REQ-001", service: "CRM", httpStatus: 400, retryable: false, title: "Requisição inválida", cause: "Corpo fora do contrato do CRM.", action: "Corrigir conforme `crm.openapi.yaml`." }),
  def({ code: "CRM-NOTFOUND-001", service: "CRM", httpStatus: 404, retryable: false, title: "Recurso não encontrado", cause: "Cliente, negócio ou entrega inexistente.", action: "Conferir o identificador." }),

  // ---- ERP simples
  def({ code: "ERP-AUTH-001", service: "ERP", httpStatus: 401, retryable: false, title: "Chave de API inválida", cause: "X-Api-Key ausente ou incorreta.", action: "Usar `ERP_API_KEY`." }),
  def({ code: "ERP-VAL-001", service: "ERP", httpStatus: 422, retryable: false, title: "Dados inválidos", cause: "Corpo fora do contrato do ERP (por exemplo, CNPJ sem 14 dígitos).", action: "Corrigir conforme `erp.openapi.yaml`." }),
  def({ code: "ERP-CUSTOMER-EXISTS", service: "ERP", httpStatus: 409, retryable: false, title: "Cliente já existe", cause: "Já há cliente com este CNPJ; o id existente vem em `details.existingId`.", action: "Buscar o cliente por CNPJ e atualizar em vez de criar." }),
  def({ code: "ERP-NOTFOUND-001", service: "ERP", httpStatus: 404, retryable: false, title: "Recurso não encontrado", cause: "Cliente, pedido ou cobrança inexistente.", action: "Conferir o identificador." }),
  def({ code: "ERP-INVOICE-NOT-RELEASABLE", service: "ERP", httpStatus: 409, retryable: false, title: "Cobrança não está em conferência", cause: "Só cobrança EM_CONFERENCIA pode ser liberada.", action: "Conferir o status da cobrança." }),
  def({ code: "ERP-INVOICE-NOT-PAYABLE", service: "ERP", httpStatus: 409, retryable: false, title: "Cobrança não pode ser paga", cause: "Só cobrança ABERTA pode receber pagamento (em conferência ou já paga, não).", action: "Liberar a cobrança em conferência antes de pagar." }),
  def({ code: "ERP-UNAVAILABLE", service: "ERP", httpStatus: 503, retryable: true, title: "ERP indisponível", cause: "O ERP está em manutenção (modo `down` da injeção de falha).", action: "Aguardar o fim da janela." }),
] as const satisfies readonly ErrorDefinition[];

export type ErrorCode = (typeof ERROR_CATALOG)[number]["code"];

const byCode = new Map<string, ErrorDefinition>(ERROR_CATALOG.map((e) => [e.code, e]));

export function getErrorDefinition(code: string): ErrorDefinition | undefined {
  return byCode.get(code);
}

/** Erro de aplicação com código do catálogo. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    const definition = byCode.get(code);
    super(message ?? definition?.title ?? code);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = definition?.httpStatus ?? 500;
    this.retryable = definition?.retryable ?? false;
    this.details = details;
  }
}

export interface ErrorBody {
  error: { code: string; message: string; requestId: string; details?: Record<string, unknown> };
}

export function errorBody(code: string, message: string, requestId: string, details?: Record<string, unknown>): ErrorBody {
  return { error: { code, message, requestId, ...(details ? { details } : {}) } };
}
