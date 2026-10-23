import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import { badge, escapeHtml, fastifyDefaults, formatDateTime, renderPage, table, type BadgeKind } from "@ponte/shared";

export interface ConsoleConfig {
  /** Ex.: http://localhost:4000 */
  ponteUrl: string;
  /** A chave de administração fica só no servidor do painel; o navegador nunca a vê. */
  adminKey: string;
  logLevel?: string;
}

interface EventSummary {
  id: string;
  source: string;
  type: string;
  entityId: string | null;
  status: string;
  attempts: number;
  duplicateCount: number;
  receivedAt: string;
  processedAt: string | null;
  durationMs: number | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  ignoreReason: string | null;
  nextRunAt: string | null;
}
interface Attempt { number: number; outcome: string; errorCode: string | null; errorMessage: string | null; startedAt: string; durationMs: number; nextRunAt: string | null }
interface Metrics { countsByStatus: Record<string, number>; duplicatesIgnored: number; avgDurationMs: number | null; maxDurationMs: number | null; openDivergences: number; lastEventAt: string | null; oldestPendingAgeSeconds?: number | null }
interface Alert { code: string; severity: "warning" | "critical"; message: string; since: string | null; details: Record<string, unknown> }
const ALERT_LABEL: Record<string, string> = { QUEUE_STALLED: "Fila parada", DEAD_LETTERS_PRESENT: "Fila de falhas" };
interface MappingRule { target: string; source: string | string[]; transform: string; required?: boolean }
interface MappingVersion { version: number; active: boolean; note: string | null; rules: MappingRule[]; createdAt: string }
interface Divergence { id: string; key: string; type: string; crmDealId: string | null; status: string; detail: Record<string, unknown>; firstSeenAt: string; lastSeenAt: string; resolvedAt: string | null }
interface CatalogEntry { code: string; httpStatus: number | null; retryable: boolean; title: string; cause: string; action: string }

const STATUS_LABEL: Record<string, string> = { RECEIVED: "Recebido", PROCESSING: "Processando", RETRYING: "Em retentativa", PROCESSED: "Processado", IGNORED: "Ignorado", DEAD: "Fila de falhas" };
const STATUS_KIND: Record<string, BadgeKind> = { RECEIVED: "info", PROCESSING: "info", RETRYING: "warn", PROCESSED: "ok", IGNORED: "muted", DEAD: "danger" };
const TYPE_LABEL: Record<string, string> = { "deal.won": "Negócio ganho (CRM)", "invoice.paid": "Cobrança paga (ERP)" };
const DIVERGENCE_LABEL: Record<string, string> = {
  NOT_SYNCED: "Ganho sem pedido",
  AMOUNT_MISMATCH: "Valor diferente",
  BILLING_STATUS_MISMATCH: "Status da cobrança diferente",
  ORDER_MISSING_IN_ERP: "Pedido ausente no ERP",
  CRM_LINK_MISSING: "CRM sem os IDs do ERP",
};
const OUTCOME_LABEL: Record<string, string> = { OK: "Sucesso", RETRYABLE_ERROR: "Falha temporária", PERMANENT_ERROR: "Falha permanente", IGNORED: "Ignorado" };
const TRANSFORM_HELP: Record<string, string> = {
  trim: "Remove espaços das pontas",
  cnpjDigits: "Remove a máscara e valida os dígitos verificadores",
  phoneE164BR: "Telefone brasileiro em dígitos com país (55)",
  emailLower: "Minúsculas e formato mínimo",
  moneyToCents: "Texto em reais para centavos, sem ponto flutuante",
  dueDateFromTerm: "Data do ganho + prazo em dias",
};

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
}

const brl = (cents: unknown): string => (typeof cents === "number" ? (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—");

export function describeDivergence(d: Divergence): string {
  const x = d.detail as Record<string, unknown>;
  switch (d.type) {
    case "AMOUNT_MISMATCH":
      return `CRM: ${brl(x.crmCents)} · ERP: ${brl(x.erpCents)}`;
    case "BILLING_STATUS_MISMATCH":
      return `CRM: ${String(x.crmStatus)} · ERP: ${String(x.erpStatus)}`;
    case "NOT_SYNCED":
      return x.eventStatus ? `Evento na Ponte: ${STATUS_LABEL[String(x.eventStatus)] ?? String(x.eventStatus)}` : "A Ponte nunca recebeu o evento (provável webhook perdido).";
    case "ORDER_MISSING_IN_ERP":
      return `Pedido ${String(x.erpOrderId ?? "").slice(0, 8)}… não existe mais no ERP.`;
    case "CRM_LINK_MISSING":
      return "O pedido existe no ERP, mas o CRM não recebeu os identificadores.";
    default:
      return JSON.stringify(x);
  }
}

class PonteUnavailable extends Error {}

export async function buildConsoleApp(config: ConsoleConfig): Promise<FastifyInstance> {
  const app = Fastify(fastifyDefaults(config.logLevel));
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(body as string)));
  });

  async function ponte<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
    try {
      const res = await fetch(`${config.ponteUrl}/v1/admin${path}`, { ...init, headers: { "x-admin-key": config.adminKey, ...(init.body ? { "content-type": "application/json" } : {}) }, signal: AbortSignal.timeout(15_000) });
      const text = await res.text();
      return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
    } catch (err) {
      throw new PonteUnavailable(err instanceof Error ? err.message : String(err));
    }
  }

  const layout = (active: string, title: string, body: string, banner = "") =>
    renderPage({
      title,
      app: "Painel da Ponte",
      accent: "#4f46e5",
      notice: "Painel de integração do estudo: CRM e ERP são sistemas simples criados neste repositório (cenário fictício: Serviços Aurora).",
      nav: [
        { href: "/", label: "Visão geral", active: active === "home" },
        { href: "/events", label: "Eventos", active: active === "events" },
        { href: "/dead-letters", label: "Fila de falhas", active: active === "dead" },
        { href: "/divergences", label: "Divergências", active: active === "divergences" },
        { href: "/mapping", label: "Mapeamento", active: active === "mapping" },
        { href: "/errors", label: "Catálogo de erros", active: active === "errors" },
      ],
      banner,
      body,
    });

  /** v1.1 (ADR-012): banner com os alertas vigentes em todas as telas. Se a Ponte não responde, simplesmente não mostra. */
  async function alertsBanner(): Promise<string> {
    try {
      const res = await ponte<{ data: Alert[] }>("/alerts");
      if (res.status !== 200) return "";
      return res.body.data
        .map((a) => {
          const link = a.code === "DEAD_LETTERS_PRESENT" ? '<a href="/dead-letters">Ver a fila de falhas →</a>' : '<a href="/events?status=RECEIVED">Ver eventos esperando →</a>';
          return `<div class="banner ${a.severity === "critical" ? "danger" : "warn"}" data-alert="${escapeHtml(a.code)}">⚠ ${escapeHtml(ALERT_LABEL[a.code] ?? a.code)}: ${escapeHtml(a.message)} ${link}</div>`;
        })
        .join("");
    } catch {
      return "";
    }
  }

  const withAlerts = async (active: string, title: string, body: string, banner = ""): Promise<string> => layout(active, title, body, banner + (await alertsBanner()));

  const unavailable = (reply: FastifyReply, err: PonteUnavailable) =>
    reply.status(503).type("text/html").send(layout("", "Indisponível", `<h1>Ponte indisponível</h1><p class="sub">O painel não conseguiu falar com a Ponte (${escapeHtml(err.message)}).</p>`, '<div class="banner danger">Ponte indisponível</div>'));

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof PonteUnavailable) return unavailable(reply, err);
    app.log.error({ err }, "erro no painel");
    return reply.status(500).type("text/html").send(layout("", "Erro", "<h1>Algo deu errado no painel</h1>"));
  });

  const eventsTable = (rows: EventSummary[], empty: string) =>
    table<EventSummary>(
      [
        { header: "Evento", render: (e) => `<a href="/events/${e.id}"><b>${escapeHtml(TYPE_LABEL[e.type] ?? e.type)}</b></a><div class="muted mono">${escapeHtml(e.id.slice(0, 8))}…${e.duplicateCount > 0 ? ` · ${e.duplicateCount} duplicata(s) ignorada(s)` : ""}</div>` },
        { header: "Situação", render: (e) => badge(STATUS_LABEL[e.status] ?? e.status, STATUS_KIND[e.status] ?? "muted") + (e.status === "RETRYING" && e.nextRunAt ? `<div class="muted">próxima tentativa ${escapeHtml(formatDateTime(e.nextRunAt))}</div>` : "") },
        { header: "Tentativas", render: (e) => String(e.attempts), align: "right" },
        { header: "Tempo total", render: (e) => escapeHtml(formatDuration(e.durationMs)), align: "right" },
        { header: "Último erro", render: (e) => (e.lastErrorCode ? `<code>${escapeHtml(e.lastErrorCode)}</code><div class="muted">${escapeHtml((e.lastErrorMessage ?? "").slice(0, 110))}</div>` : e.ignoreReason ? `<span class="muted">${escapeHtml(e.ignoreReason.slice(0, 90))}</span>` : "—") },
        { header: "Recebido em", render: (e) => escapeHtml(formatDateTime(e.receivedAt)) },
      ],
      rows,
      empty,
    );

  app.get("/", async (_req, reply) => {
    const [metrics, recent] = await Promise.all([ponte<Metrics>("/metrics"), ponte<{ data: EventSummary[]; total: number }>("/events?limit=10")]);
    const m = metrics.body;
    const c = m.countsByStatus;
    const total = Object.values(c).reduce((a, b) => a + b, 0);
    const stat = (n: string | number, label: string, kind = "") => `<div class="stat ${kind}"><div class="n">${escapeHtml(n)}</div><div class="l">${escapeHtml(label)}</div></div>`;
    const body = `
      <h1>Visão geral da integração</h1>
      <p class="sub">Eventos recebidos do CRM e do ERP, o que está em andamento, o que falhou e o que está diferente entre os dois lados.</p>
      <div class="grid">
        ${stat(total, "eventos recebidos")}
        ${stat(c.PROCESSED ?? 0, "processados", "ok")}
        ${stat(c.RETRYING ?? 0, "em retentativa", (c.RETRYING ?? 0) > 0 ? "warn" : "")}
        ${stat(c.DEAD ?? 0, "na fila de falhas", (c.DEAD ?? 0) > 0 ? "danger" : "")}
        ${stat(c.IGNORED ?? 0, "ignorados (obsoletos ou já vinculados)")}
        ${stat(m.duplicatesIgnored, "duplicatas descartadas")}
        ${stat(formatDuration(m.avgDurationMs), "tempo médio até concluir")}
        ${stat(m.openDivergences, "divergências abertas", m.openDivergences > 0 ? "warn" : "")}
        ${stat(m.oldestPendingAgeSeconds == null ? "—" : formatDuration(m.oldestPendingAgeSeconds * 1000), "espera mais antiga na fila", (m.oldestPendingAgeSeconds ?? 0) >= 300 ? "danger" : "")}
      </div>
      <p class="muted">O tempo é medido do recebimento do evento até a conclusão, incluindo a espera na fila e as retentativas.</p>
      <h2>Eventos mais recentes</h2>
      ${eventsTable(recent.body.data, "Nenhum evento ainda.")}
      <p><a href="/events">Ver todos os eventos →</a></p>`;
    return reply.type("text/html").send(await withAlerts("home", "Visão geral", body));
  });

  app.get<{ Querystring: { status?: string } }>("/events", async (req, reply) => {
    const status = z.enum(["RECEIVED", "PROCESSING", "RETRYING", "PROCESSED", "IGNORED", "DEAD"]).optional().catch(undefined).parse(req.query.status);
    const res = await ponte<{ data: EventSummary[]; total: number }>(`/events?limit=100${status ? `&status=${status}` : ""}`);
    const filters = [{ key: "", label: "Todos" }, ...Object.entries(STATUS_LABEL).map(([key, label]) => ({ key, label }))];
    const body = `
      <h1>Eventos</h1>
      <p class="sub">${res.body.total} evento(s)${status ? ` com situação “${escapeHtml(STATUS_LABEL[status] ?? status)}”` : ""}.</p>
      <div class="row" style="margin-bottom:14px">${filters.map((f) => `<a class="btn ${f.key === (status ?? "") ? "" : "secondary"}" href="/events${f.key ? `?status=${f.key}` : ""}" style="${f.key === (status ?? "") ? "" : "background:#fff;color:#4f46e5;border:1px solid #4f46e5"}">${escapeHtml(f.label)}</a>`).join("")}</div>
      ${eventsTable(res.body.data, "Nenhum evento com este filtro.")}`;
    return reply.type("text/html").send(await withAlerts("events", "Eventos", body));
  });

  app.get<{ Params: { id: string } }>("/events/:id", async (req, reply) => {
    const res = await ponte<EventSummary & { idempotencyKey: string; entityVersion: number | null; payload: unknown; attemptLog: Attempt[] }>(`/events/${req.params.id}`);
    if (res.status === 404) return reply.status(404).type("text/html").send(layout("events", "Evento", "<h1>Evento não encontrado</h1>"));
    const e = res.body;
    const body = `
      <h1>${escapeHtml(TYPE_LABEL[e.type] ?? e.type)}</h1>
      <p class="sub"><span class="mono">${escapeHtml(e.id)}</span></p>
      <div class="card"><dl>
        <dt>Situação</dt><dd>${badge(STATUS_LABEL[e.status] ?? e.status, STATUS_KIND[e.status] ?? "muted")}</dd>
        <dt>Origem</dt><dd>${escapeHtml(e.source)}</dd>
        <dt>Chave de idempotência</dt><dd><code>${escapeHtml(e.idempotencyKey)}</code></dd>
        <dt>Entidade</dt><dd><code>${escapeHtml(e.entityId ?? "—")}</code>${e.entityVersion ? ` · versão ${e.entityVersion}` : ""}</dd>
        <dt>Recebido em</dt><dd>${escapeHtml(formatDateTime(e.receivedAt))}</dd>
        <dt>Concluído em</dt><dd>${escapeHtml(formatDateTime(e.processedAt))}</dd>
        <dt>Tempo total</dt><dd>${escapeHtml(formatDuration(e.durationMs))}</dd>
        <dt>Duplicatas descartadas</dt><dd>${e.duplicateCount}</dd>
        ${e.ignoreReason ? `<dt>Motivo de ignorar</dt><dd>${escapeHtml(e.ignoreReason)}</dd>` : ""}
      </dl></div>
      <h2>Tentativas</h2>
      ${table<Attempt>(
        [
          { header: "#", render: (a) => String(a.number) },
          { header: "Resultado", render: (a) => badge(OUTCOME_LABEL[a.outcome] ?? a.outcome, a.outcome === "OK" ? "ok" : a.outcome === "RETRYABLE_ERROR" ? "warn" : a.outcome === "IGNORED" ? "muted" : "danger") },
          { header: "Início", render: (a) => escapeHtml(formatDateTime(a.startedAt)) },
          { header: "Duração", render: (a) => escapeHtml(formatDuration(a.durationMs)), align: "right" },
          { header: "Erro", render: (a) => (a.errorCode ? `<code>${escapeHtml(a.errorCode)}</code><div class="muted">${escapeHtml((a.errorMessage ?? "").slice(0, 160))}</div>` : "—") },
          { header: "Próxima tentativa", render: (a) => escapeHtml(formatDateTime(a.nextRunAt)) },
        ],
        e.attemptLog,
        "Nenhuma tentativa ainda.",
      )}
      ${e.status === "DEAD" ? `<form method="post" action="/events/${e.id}/reprocess" style="margin-top:14px"><button>Reprocessar este evento</button></form>` : ""}
      <h2>Conteúdo do evento</h2>
      <pre>${escapeHtml(JSON.stringify(e.payload, null, 2))}</pre>`;
    return reply.type("text/html").send(await withAlerts("events", "Evento", body));
  });

  app.post<{ Params: { id: string } }>("/events/:id/reprocess", async (req, reply) => {
    await ponte(`/events/${req.params.id}/reprocess`, { method: "POST" });
    return reply.redirect("/dead-letters", 303);
  });

  app.get("/dead-letters", async (_req, reply) => {
    const [res, catalog] = await Promise.all([ponte<{ data: EventSummary[]; total: number }>("/events?status=DEAD&limit=100"), ponte<{ data: CatalogEntry[] }>("/errors")]);
    const byCode = new Map(catalog.body.data.map((c) => [c.code, c]));
    const body = `
      <h1>Fila de falhas</h1>
      <p class="sub">Eventos que não passaram sozinhos. Cada um mostra o motivo e a ação recomendada. Reprocessar reaproveita as mesmas chaves, então não duplica nada.</p>
      ${table<EventSummary>(
        [
          { header: "Evento", render: (e) => `<a href="/events/${e.id}"><b>${escapeHtml(TYPE_LABEL[e.type] ?? e.type)}</b></a><div class="muted mono">${escapeHtml(e.id.slice(0, 8))}…</div>` },
          { header: "Erro", render: (e) => `<code>${escapeHtml(e.lastErrorCode ?? "—")}</code><div>${escapeHtml(byCode.get(e.lastErrorCode ?? "")?.title ?? "")}</div>` },
          { header: "Causa", render: (e) => escapeHtml((e.lastErrorMessage ?? "").slice(0, 150)) },
          { header: "Ação recomendada", render: (e) => escapeHtml(byCode.get(e.lastErrorCode ?? "")?.action ?? "—") },
          { header: "Tentativas", render: (e) => String(e.attempts), align: "right" },
          { header: "", render: (e) => `<form class="inline" method="post" action="/events/${e.id}/reprocess"><button>Reprocessar</button></form>` },
        ],
        res.body.data,
        "Nenhum evento na fila de falhas.",
      )}`;
    return reply.type("text/html").send(await withAlerts("dead", "Fila de falhas", body));
  });

  app.get("/divergences", async (_req, reply) => {
    const res = await ponte<{ data: Divergence[] }>("/divergences");
    const open = res.body.data.filter((d) => d.status === "OPEN");
    const resolved = res.body.data.filter((d) => d.status === "RESOLVED");
    const cols = (withAction: boolean) => [
      { header: "Tipo", render: (d: Divergence) => badge(DIVERGENCE_LABEL[d.type] ?? d.type, d.status === "OPEN" ? "warn" : "ok") },
      { header: "Negócio no CRM", render: (d: Divergence) => `<code>${escapeHtml((d.crmDealId ?? "").slice(0, 8))}…</code><div class="muted">${escapeHtml(String(d.detail.title ?? ""))}</div>` },
      { header: "Diferença", render: (d: Divergence) => escapeHtml(describeDivergence(d)) },
      { header: "Vista pela 1ª vez", render: (d: Divergence) => escapeHtml(formatDateTime(d.firstSeenAt)) },
      withAction
        ? { header: "", render: (d: Divergence) => (d.type === "BILLING_STATUS_MISMATCH" ? `<form class="inline" method="post" action="/divergences/${d.id}/resolve"><button class="secondary">Copiar status do ERP para o CRM</button></form>` : '<span class="muted">decisão manual</span>') }
        : { header: "Resolvida em", render: (d: Divergence) => escapeHtml(formatDateTime(d.resolvedAt)) },
    ];
    const body = `
      <h1>Divergências</h1>
      <p class="sub">A reconciliação compara CRM e ERP (agendada e sob demanda) e aponta o que está diferente. Só o status da cobrança tem correção assistida; nos demais casos não é óbvio qual lado está certo.</p>
      <form method="post" action="/reconciliation/run" style="margin-bottom:16px"><button>Executar reconciliação agora</button></form>
      <h2>Abertas (${open.length})</h2>
      ${table(cols(true), open, "Nenhuma divergência aberta.")}
      <h2>Resolvidas (${resolved.length})</h2>
      ${table(cols(false), resolved, "Nenhuma divergência resolvida ainda.")}`;
    return reply.type("text/html").send(await withAlerts("divergences", "Divergências", body));
  });

  app.post("/reconciliation/run", async (_req, reply) => {
    const res = await ponte<{ error?: { code: string; message: string } }>("/reconciliation/run", { method: "POST" });
    if (res.status >= 400) {
      return reply.status(res.status).type("text/html").send(layout("divergences", "Divergências", `<h1>Não foi possível reconciliar</h1><p class="sub"><code>${escapeHtml(res.body.error?.code ?? "")}</code> ${escapeHtml(res.body.error?.message ?? "")}</p><p><a href="/divergences">Voltar</a></p>`, '<div class="banner warn">A reconciliação falhou; nada foi alterado.</div>'));
    }
    return reply.redirect("/divergences", 303);
  });

  app.post<{ Params: { id: string } }>("/divergences/:id/resolve", async (req, reply) => {
    await ponte(`/divergences/${req.params.id}/resolve`, { method: "POST" });
    return reply.redirect("/divergences", 303);
  });

  app.get("/mapping", async (_req, reply) => {
    const res = await ponte<{ active: MappingVersion; history: MappingVersion[] }>("/mapping");
    const { active, history } = res.body;
    const body = `
      <h1>Mapeamento de campos</h1>
      <p class="sub">Versão <b>${active.version}</b> ativa desde ${escapeHtml(formatDateTime(active.createdAt))}${active.note ? ` · ${escapeHtml(active.note)}` : ""}. Cada regra liga um campo do CRM a um campo do ERP por uma transformação de uma lista fechada.</p>
      ${table<MappingRule>(
        [
          { header: "Campo no ERP (destino)", render: (r) => `<code>${escapeHtml(r.target)}</code>` },
          { header: "Campo no CRM (origem)", render: (r) => `<code>${escapeHtml(Array.isArray(r.source) ? r.source.join(" + ") : r.source)}</code>` },
          { header: "Transformação", render: (r) => `<b>${escapeHtml(r.transform)}</b><div class="muted">${escapeHtml(TRANSFORM_HELP[r.transform] ?? "")}</div>` },
          { header: "Obrigatório", render: (r) => ((r.required ?? true) ? badge("sim", "info") : badge("não", "muted")) },
        ],
        active.rules,
      )}
      <h2>Histórico de versões</h2>
      ${table<MappingVersion>(
        [
          { header: "Versão", render: (v) => `v${v.version}` },
          { header: "Situação", render: (v) => (v.active ? badge("ativa", "ok") : badge("anterior", "muted")) },
          { header: "Criada em", render: (v) => escapeHtml(formatDateTime(v.createdAt)) },
          { header: "Observação", render: (v) => escapeHtml(v.note ?? "—") },
        ],
        history,
      )}
      <p class="muted">Publicar uma nova versão é feito pela API administrativa (<code>PUT /v1/admin/mapping</code>); a Ponte valida destinos, transformações e a cobertura dos campos obrigatórios antes de ativar.</p>`;
    return reply.type("text/html").send(await withAlerts("mapping", "Mapeamento", body));
  });

  app.get("/errors", async (_req, reply) => {
    const res = await ponte<{ data: CatalogEntry[] }>("/errors");
    const body = `
      <h1>Catálogo de erros</h1>
      <p class="sub">Cada código tem causa e ação recomendada. É a mesma fonte usada pelo código da Ponte e pela documentação.</p>
      ${table<CatalogEntry>(
        [
          { header: "Código", render: (e) => `<code>${escapeHtml(e.code)}</code>` },
          { header: "Tipo", render: (e) => badge(e.retryable ? "temporário (retenta)" : "permanente", e.retryable ? "warn" : "danger") },
          { header: "HTTP", render: (e) => escapeHtml(e.httpStatus ?? "—") },
          { header: "Quando acontece", render: (e) => `<b>${escapeHtml(e.title)}</b><div class="muted">${escapeHtml(e.cause)}</div>` },
          { header: "O que fazer", render: (e) => escapeHtml(e.action) },
        ],
        res.body.data,
      )}`;
    return reply.type("text/html").send(await withAlerts("errors", "Catálogo de erros", body));
  });

  app.get("/health", async () => ({ status: "ok" }));
  return app;
}
