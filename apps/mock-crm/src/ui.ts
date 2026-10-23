import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badge, escapeHtml, formatDateTime, renderPage, table, type BadgeKind } from "@ponte/shared";
import type { PrismaClient } from "./generated/client";

const STAGE_KIND: Record<string, BadgeKind> = { LEAD: "muted", PROPOSTA: "info", NEGOCIACAO: "warn", GANHO: "ok", PERDIDO: "danger" };
const STAGE_LABEL: Record<string, string> = { LEAD: "Lead", PROPOSTA: "Proposta", NEGOCIACAO: "Negociação", GANHO: "Ganho", PERDIDO: "Perdido" };
const BILLING_KIND: Record<string, BadgeKind> = { NAO_COBRADO: "muted", EM_CONFERENCIA: "warn", ABERTA: "info", PAGO: "ok" };
const BILLING_LABEL: Record<string, string> = { NAO_COBRADO: "Não cobrado", EM_CONFERENCIA: "Em conferência", ABERTA: "Cobrança aberta", PAGO: "Pago" };
const DELIVERY_LABEL: Record<string, string> = { DELIVERED: "Entregue", FAILED: "Falhou" };

interface UiDeps {
  prisma: PrismaClient;
  moveStage: (id: string, stage: "LEAD" | "PROPOSTA" | "NEGOCIACAO" | "GANHO" | "PERDIDO") => Promise<unknown>;
  sendDelivery: (id: string) => Promise<void>;
}

const page = (title: string, body: string) =>
  renderPage({
    title,
    app: "CRM simples",
    accent: "#2563eb",
    notice: "Sistema simples criado dentro deste repositório para o estudo da Ponte (cenário fictício: Serviços Aurora).",
    nav: [
      { href: "/ui", label: "Negócios", active: title === "Negócios" },
      { href: "/ui/customers", label: "Clientes", active: title === "Clientes" },
      { href: "/ui/deliveries", label: "Entregas de webhook", active: title === "Entregas de webhook" },
    ],
    body,
  });

export function registerUi(app: FastifyInstance, deps: UiDeps): void {
  const { prisma } = deps;

  app.get("/ui", async (_req, reply) => {
    const deals = await prisma.deal.findMany({ include: { customer: true }, orderBy: { createdAt: "desc" } });
    const body = `
      <h1>Negócios</h1>
      <p class="sub">Funil de vendas da Serviços Aurora. Ao marcar <b>Ganho</b>, o CRM envia o webhook <code>deal.won</code> à Ponte.</p>
      ${table(
        [
          { header: "Negócio", render: (d) => `<a href="/ui/deals/${d.id}"><b>${escapeHtml(d.title)}</b></a><div class="muted">${escapeHtml(d.customer.name)}</div>` },
          { header: "Valor", render: (d) => `R$ ${escapeHtml(d.value)}` },
          { header: "Etapa", render: (d) => badge(STAGE_LABEL[d.stage] ?? d.stage, STAGE_KIND[d.stage] ?? "muted") },
          { header: "Cobrança", render: (d) => badge(BILLING_LABEL[d.billingStatus] ?? d.billingStatus, BILLING_KIND[d.billingStatus] ?? "muted") },
          { header: "Pedido no ERP", render: (d) => (d.erpOrderId ? `<code>${escapeHtml(d.erpOrderId.slice(0, 8))}…</code>` : "—") },
          { header: "Versão", render: (d) => `v${d.version}` },
        ],
        deals,
        "Nenhum negócio ainda.",
      )}`;
    return reply.type("text/html").send(page("Negócios", body));
  });

  app.get("/ui/customers", async (_req, reply) => {
    const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
    const body = `<h1>Clientes</h1><p class="sub">Os campos são texto livre, como o vendedor digita.</p>${table(
      [
        { header: "Nome", render: (c) => escapeHtml(c.name) },
        { header: "CNPJ", render: (c) => `<code>${escapeHtml(c.cnpj)}</code>` },
        { header: "Telefone", render: (c) => escapeHtml(c.phone ?? "—") },
        { header: "E-mail", render: (c) => escapeHtml(c.email ?? "—") },
      ],
      customers,
    )}`;
    return reply.type("text/html").send(page("Clientes", body));
  });

  app.get<{ Params: { id: string } }>("/ui/deals/:id", async (req, reply) => {
    const deal = await prisma.deal.findUnique({ where: { id: req.params.id }, include: { customer: true, deliveries: { orderBy: { createdAt: "desc" } } } });
    if (!deal) return reply.status(404).type("text/html").send(page("Negócios", "<h1>Negócio não encontrado</h1>"));
    const stages = ["LEAD", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"] as const;
    const buttons = stages
      .filter((s) => s !== deal.stage)
      .map((s) => `<form class="inline" method="post" action="/ui/deals/${deal.id}/stage"><input type="hidden" name="stage" value="${s}"><button class="${s === "GANHO" ? "" : "secondary"}">${s === "GANHO" ? "Marcar como Ganho" : `Mover para ${escapeHtml(STAGE_LABEL[s] ?? s)}`}</button></form>`)
      .join(" ");
    const body = `
      <h1>${escapeHtml(deal.title)}</h1>
      <p class="sub">${escapeHtml(deal.customer.name)} · CNPJ <code>${escapeHtml(deal.customer.cnpj)}</code></p>
      <div class="card"><div class="row">${badge(STAGE_LABEL[deal.stage] ?? deal.stage, STAGE_KIND[deal.stage] ?? "muted")} ${buttons}</div></div>
      <div class="card"><dl>
        <dt>Valor</dt><dd>R$ ${escapeHtml(deal.value)}</dd>
        <dt>Prazo de pagamento</dt><dd>${deal.paymentTermDays ?? "—"} dias</dd>
        <dt>Versão do negócio</dt><dd>v${deal.version}</dd>
        <dt>Ganho em</dt><dd>${formatDateTime(deal.wonAt)}</dd>
      </dl></div>
      <h2>Retorno do ERP (preenchido pela Ponte)</h2>
      <div class="card"><dl>
        <dt>Status da cobrança</dt><dd>${badge(BILLING_LABEL[deal.billingStatus] ?? deal.billingStatus, BILLING_KIND[deal.billingStatus] ?? "muted")}</dd>
        <dt>ID do cliente no ERP</dt><dd><code>${escapeHtml(deal.erpCustomerId ?? "—")}</code></dd>
        <dt>ID do pedido no ERP</dt><dd><code>${escapeHtml(deal.erpOrderId ?? "—")}</code></dd>
        <dt>ID da cobrança no ERP</dt><dd><code>${escapeHtml(deal.erpInvoiceId ?? "—")}</code></dd>
        <dt>Pago em</dt><dd>${formatDateTime(deal.paidAt)}</dd>
      </dl></div>
      <h2>Webhooks enviados</h2>
      ${table(
        [
          { header: "Evento", render: (d) => `<code>${escapeHtml(d.eventId.slice(0, 8))}…</code>` },
          { header: "Situação", render: (d) => badge(DELIVERY_LABEL[d.status] ?? d.status, d.status === "DELIVERED" ? "ok" : "danger") },
          { header: "HTTP", render: (d) => escapeHtml(d.httpStatus ?? "—") },
          { header: "Tentativas", render: (d) => String(d.attempts) },
          { header: "Quando", render: (d) => formatDateTime(d.createdAt) },
        ],
        deal.deliveries,
        "Nenhum webhook enviado ainda.",
      )}`;
    return reply.type("text/html").send(page("Negócios", body));
  });

  app.post<{ Params: { id: string } }>("/ui/deals/:id/stage", async (req, reply) => {
    const { stage } = z.object({ stage: z.enum(["LEAD", "PROPOSTA", "NEGOCIACAO", "GANHO", "PERDIDO"]) }).parse(req.body);
    await deps.moveStage(req.params.id, stage);
    return reply.redirect(`/ui/deals/${req.params.id}`, 303);
  });

  app.get("/ui/deliveries", async (_req, reply) => {
    const rows = await prisma.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
    const body = `<h1>Entregas de webhook</h1><p class="sub">O CRM envia uma vez; se a Ponte estiver fora, a entrega fica como falha e pode ser reenviada.</p>${table(
      [
        { header: "Evento", render: (d) => `<code>${escapeHtml(d.eventId)}</code>` },
        { header: "Situação", render: (d) => badge(DELIVERY_LABEL[d.status] ?? d.status, d.status === "DELIVERED" ? "ok" : "danger") },
        { header: "HTTP", render: (d) => escapeHtml(d.httpStatus ?? "—") },
        { header: "Erro", render: (d) => escapeHtml(d.lastError ?? "—") },
        { header: "", render: (d) => `<form class="inline" method="post" action="/ui/deliveries/${d.id}/resend"><button class="secondary">Reenviar</button></form>` },
      ],
      rows,
    )}`;
    return reply.type("text/html").send(page("Entregas de webhook", body));
  });

  app.post<{ Params: { id: string } }>("/ui/deliveries/:id/resend", async (req, reply) => {
    await deps.sendDelivery(req.params.id);
    return reply.redirect("/ui/deliveries", 303);
  });
}
