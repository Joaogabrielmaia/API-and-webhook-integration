import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badge, escapeHtml, formatDateTime, formatMoneyCents, renderPage, table, type BadgeKind } from "@ponte/shared";
import type { PrismaClient } from "./generated/client";
import type { ChaosState } from "./app";

const INVOICE_KIND: Record<string, BadgeKind> = { EM_CONFERENCIA: "warn", ABERTA: "info", PAGA: "ok" };
const INVOICE_LABEL: Record<string, string> = { EM_CONFERENCIA: "Em conferência", ABERTA: "Aberta", PAGA: "Paga" };

interface UiDeps {
  prisma: PrismaClient;
  chaos: ChaosState;
  payInvoice: (id: string) => Promise<unknown>;
  releaseInvoice: (id: string) => Promise<unknown>;
}

export function registerUi(app: FastifyInstance, deps: UiDeps): void {
  const { prisma, chaos } = deps;

  const page = (title: string, body: string) =>
    renderPage({
      title,
      app: "ERP simples",
      accent: "#047857",
      notice: "Sistema simples criado dentro deste repositório para o estudo da Ponte (cenário fictício: Serviços Aurora).",
      banner: chaos.mode === "down" ? '<div class="banner danger">ERP em manutenção (modo de falha: indisponível). A API responde 503.</div>' : chaos.mode === "slow" ? `<div class="banner warn">ERP lento (modo de falha: ${chaos.delayMs} ms de atraso por requisição).</div>` : "",
      nav: [
        { href: "/ui", label: "Cobranças", active: title === "Cobranças" },
        { href: "/ui/orders", label: "Pedidos", active: title === "Pedidos" },
        { href: "/ui/customers", label: "Clientes", active: title === "Clientes" },
        { href: "/ui/chaos", label: "Injeção de falha", active: title === "Injeção de falha" },
      ],
      body,
    });

  app.get("/ui", async (_req, reply) => {
    const invoices = await prisma.invoice.findMany({ include: { order: { include: { customer: true } } }, orderBy: { createdAt: "desc" } });
    const body = `
      <h1>Cobranças</h1>
      <p class="sub">Cobranças criadas pela Ponte (ou à mão). Cobrança <b>em conferência</b> só vira <b>aberta</b> quando o financeiro libera; só cobrança <b>aberta</b> pode ser paga.</p>
      ${table(
        [
          { header: "Cliente", render: (i) => `<b>${escapeHtml(i.order.customer.name)}</b><div class="muted mono">${escapeHtml(i.order.customer.taxId)}</div>` },
          { header: "Pedido", render: (i) => escapeHtml(i.order.description) },
          { header: "Valor", render: (i) => formatMoneyCents(i.amountCents), align: "right" },
          { header: "Vencimento", render: (i) => escapeHtml(i.dueDate.split("-").reverse().join("/")) },
          { header: "Situação", render: (i) => badge(INVOICE_LABEL[i.status] ?? i.status, INVOICE_KIND[i.status] ?? "muted") },
          {
            header: "Ações",
            render: (i) =>
              i.status === "EM_CONFERENCIA"
                ? `<form class="inline" method="post" action="/ui/invoices/${i.id}/release"><button class="secondary">Liberar</button></form>`
                : i.status === "ABERTA"
                  ? `<form class="inline" method="post" action="/ui/invoices/${i.id}/pay"><button>Dar baixa (pago)</button></form>`
                  : `<span class="muted">${formatDateTime(i.paidAt)}</span>`,
          },
        ],
        invoices,
        "Nenhuma cobrança ainda.",
      )}`;
    return reply.type("text/html").send(page("Cobranças", body));
  });

  app.get("/ui/orders", async (_req, reply) => {
    const orders = await prisma.order.findMany({ include: { customer: true }, orderBy: { createdAt: "desc" } });
    const body = `<h1>Pedidos</h1><p class="sub">A referência externa é a chave de idempotência: o mesmo valor devolve o mesmo pedido.</p>${table(
      [
        { header: "Cliente", render: (o) => escapeHtml(o.customer.name) },
        { header: "Descrição", render: (o) => escapeHtml(o.description) },
        { header: "Total", render: (o) => formatMoneyCents(o.totalCents), align: "right" },
        { header: "Referência externa", render: (o) => `<code>${escapeHtml(o.externalRef)}</code>` },
        { header: "Criado em", render: (o) => formatDateTime(o.createdAt) },
      ],
      orders,
      "Nenhum pedido ainda.",
    )}`;
    return reply.type("text/html").send(page("Pedidos", body));
  });

  app.get("/ui/customers", async (_req, reply) => {
    const customers = await prisma.customer.findMany({ orderBy: { createdAt: "desc" } });
    const body = `<h1>Clientes</h1><p class="sub">O CNPJ (14 dígitos, sem máscara) é único: não há dois clientes com o mesmo CNPJ.</p>${table(
      [
        { header: "Razão social", render: (c) => escapeHtml(c.name) },
        { header: "CNPJ", render: (c) => `<code>${escapeHtml(c.taxId)}</code>` },
        { header: "Telefone", render: (c) => `<code>${escapeHtml(c.phone ?? "—")}</code>` },
        { header: "E-mail", render: (c) => escapeHtml(c.email ?? "—") },
        { header: "Criado em", render: (c) => formatDateTime(c.createdAt) },
      ],
      customers,
      "Nenhum cliente ainda.",
    )}`;
    return reply.type("text/html").send(page("Clientes", body));
  });

  app.get("/ui/chaos", async (_req, reply) => {
    const body = `
      <h1>Injeção de falha</h1>
      <p class="sub">Recurso de demonstração: simula a janela de backup do ERP (23h à 1h) sem derrubar o processo.</p>
      <div class="card">
        <p>Modo atual: <b>${escapeHtml(chaos.mode)}</b></p>
        <div class="row">
          <form class="inline" method="post" action="/ui/chaos"><input type="hidden" name="mode" value="down"><button class="danger">Derrubar ERP</button></form>
          <form class="inline" method="post" action="/ui/chaos"><input type="hidden" name="mode" value="none"><button class="secondary">Restabelecer</button></form>
        </div>
      </div>`;
    return reply.type("text/html").send(page("Injeção de falha", body));
  });

  app.post("/ui/chaos", async (req, reply) => {
    const { mode } = z.object({ mode: z.enum(["none", "down", "slow"]) }).parse(req.body);
    chaos.mode = mode;
    chaos.delayMs = 0;
    return reply.redirect("/ui/chaos", 303);
  });
  app.post<{ Params: { id: string } }>("/ui/invoices/:id/pay", async (req, reply) => {
    await deps.payInvoice(req.params.id);
    return reply.redirect("/ui", 303);
  });
  app.post<{ Params: { id: string } }>("/ui/invoices/:id/release", async (req, reply) => {
    await deps.releaseInvoice(req.params.id);
    return reply.redirect("/ui", 303);
  });
}
