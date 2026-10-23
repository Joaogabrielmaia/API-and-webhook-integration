/**
 * Scripts de demonstração: cada cenário dispara o fluxo de verdade contra os serviços rodando localmente.
 *
 *   npm run dev:demo            (em um terminal: sobe tudo com retentativa de demonstração)
 *   npm run demo -- <cenário>   (em outro)
 *
 * Cenários: feliz | duplicado | invalido | erp-fora | reprocessar | pagamento | reconciliacao | todos
 */
import { cnpjFromBase, formatCnpj, loadRootEnv, requireEnv } from "@ponte/shared";

loadRootEnv();

const url = {
  crm: process.env.CRM_URL ?? "http://localhost:4001",
  erp: process.env.ERP_URL ?? "http://localhost:4002",
  ponte: process.env.PONTE_URL ?? "http://localhost:4000",
};
const key = { crm: requireEnv("CRM_API_KEY"), erp: requireEnv("ERP_API_KEY"), admin: requireEnv("PONTE_ADMIN_KEY") };

type Json = any;
async function api(base: "crm" | "erp" | "ponte", path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (base === "crm") headers["x-api-key"] = key.crm;
  if (base === "erp") headers["x-api-key"] = key.erp;
  if (base === "ponte") headers["x-admin-key"] = key.admin;
  const res = await fetch(`${url[base]}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const title = (text: string) => console.log(`\n\x1b[1m▶ ${text}\x1b[0m`);
const say = (text: string) => console.log(`  ${text}`);

async function ensureUp(): Promise<void> {
  for (const [name, base] of Object.entries(url)) {
    try {
      const res = await fetch(`${base}/health`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      console.error(`\nO serviço "${name}" não responde em ${base}.\nSuba tudo com: npm run db:up && npm run db:migrate && npm run dev:demo\n`);
      process.exit(1);
    }
  }
}

let counter = 0;
const uniqueCnpj = () => formatCnpj(cnpjFromBase(String(Date.now() % 1_000_000_000).padStart(9, "0") + String(100 + (counter++ % 900))));

const PEOPLE = ["Condomínio Edifício Solar", "Clínica Vida Plena", "Escola Pequeno Aprendiz", "Padaria Pão Dourado", "Condomínio Residencial das Flores", "Oficina Mecânica Silva", "Academia Corpo em Movimento"];
let nameIndex = 0;

async function newDeal(opts: { value?: string; cnpj?: string; title?: string; term?: number } = {}) {
  const customer = await api("crm", "/v1/customers", { method: "POST", body: { name: PEOPLE[nameIndex++ % PEOPLE.length], cnpj: opts.cnpj ?? uniqueCnpj(), phone: "(31) 99876-5432", email: "Financeiro@Cliente.example" } });
  const deal = await api("crm", "/v1/deals", { method: "POST", body: { title: opts.title ?? "Contrato de manutenção anual", customerId: customer.body.id, value: opts.value ?? "12.500,50", paymentTermDays: opts.term ?? 30 } });
  return deal.body as { id: string; value: string };
}
const win = async (dealId: string) => api("crm", `/v1/deals/${dealId}/stage`, { method: "POST", body: { stage: "GANHO" } });

async function eventOf(dealId: string, types = ["deal.won"]): Promise<Json | undefined> {
  const res = await api("ponte", "/v1/admin/events?limit=200");
  return res.body.data.find((e: Json) => e.entityId === dealId && types.includes(e.type));
}
async function waitStatus(dealId: string, statuses: string[], timeoutMs = 60_000): Promise<Json> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const e = await eventOf(dealId);
    if (e && statuses.includes(e.status)) return e;
    if (Date.now() > deadline) throw new Error(`Tempo esgotado esperando ${statuses.join("/")} (atual: ${e?.status ?? "sem evento"})`);
    await sleep(300);
  }
}
async function showErp(dealId: string) {
  const orders = (await api("erp", `/v1/orders?externalRefPrefix=ponte:deal:${dealId}`)).body.data;
  const invoices = (await api("erp", `/v1/invoices?externalRefPrefix=ponte:deal:${dealId}`)).body.data;
  say(`ERP: ${orders.length} pedido(s), ${invoices.length} cobrança(s)${invoices[0] ? ` (${brl(invoices[0].amountCents)}, vence ${invoices[0].dueDate}, ${invoices[0].status})` : ""}`);
  return { orders, invoices };
}
async function showCrm(dealId: string) {
  const d = (await api("crm", `/v1/deals/${dealId}`)).body;
  say(`CRM: status da cobrança = ${d.billingStatus}; pedido = ${d.erpOrderId ?? "—"}; cobrança = ${d.erpInvoiceId ?? "—"}`);
  return d;
}
async function chaos(mode: "none" | "down") {
  await api("erp", "/v1/admin/chaos", { method: "POST", body: { mode } });
  say(mode === "down" ? "ERP derrubado (modo de falha: indisponível)." : "ERP restabelecido.");
}

const scenarios: Record<string, () => Promise<void>> = {
  async feliz() {
    title("Fluxo feliz: negócio ganho → cliente, pedido e cobrança no ERP → IDs no CRM");
    const deal = await newDeal();
    say(`Negócio criado no CRM (${deal.id.slice(0, 8)}…), valor ${deal.value}. Marcando como Ganho...`);
    await win(deal.id);
    const e = await waitStatus(deal.id, ["PROCESSED", "DEAD"]);
    say(`Evento ${e.status} em ${e.durationMs} ms, ${e.attempts} tentativa(s).`);
    await showErp(deal.id);
    await showCrm(deal.id);
  },

  async duplicado() {
    title("Mesmo evento duas vezes: o segundo é ignorado");
    const deal = await newDeal({ title: "Contrato duplicado?" });
    await win(deal.id);
    await waitStatus(deal.id, ["PROCESSED"]);
    const deliveries = (await api("crm", "/v1/webhook-deliveries")).body.data;
    const delivery = deliveries.find((d: Json) => d.dealId === deal.id);
    for (let i = 1; i <= 2; i++) {
      const r = await api("crm", `/v1/webhook-deliveries/${delivery.id}/resend`, { method: "POST" });
      say(`Reenvio ${i} da mesma entrega: a Ponte respondeu HTTP ${r.body.httpStatus} (200 = duplicata ignorada).`);
    }
    const e = await eventOf(deal.id);
    say(`Duplicatas descartadas para este evento: ${e.duplicateCount}.`);
    await showErp(deal.id);
  },

  async invalido() {
    title("Dado inválido (CNPJ com dígito verificador errado): vai direto para a fila de falhas, sem retentativa");
    const deal = await newDeal({ cnpj: "11.222.333/0001-99", title: "Contrato com CNPJ errado" });
    await win(deal.id);
    const e = await waitStatus(deal.id, ["DEAD"]);
    say(`Evento ${e.status} com ${e.attempts} tentativa: ${e.lastErrorCode} — ${e.lastErrorMessage}`);
    say("Nada foi criado no ERP. Veja o painel: http://localhost:4003/dead-letters");
  },

  async "erp-fora"() {
    title("ERP fora: retentativas com backoff e, esgotadas, fila de falhas");
    await chaos("down");
    const deal = await newDeal({ title: "Contrato durante o backup do ERP" });
    await win(deal.id);
    let last = "";
    for (;;) {
      const e = await eventOf(deal.id);
      const line = `${e?.status ?? "—"} · tentativas: ${e?.attempts ?? 0}${e?.nextRunAt ? ` · próxima em ${new Date(e.nextRunAt).toLocaleTimeString("pt-BR")}` : ""}${e?.lastErrorCode ? ` · ${e.lastErrorCode}` : ""}`;
      if (line !== last) {
        say(line);
        last = line;
      }
      if (e?.status === "DEAD" || e?.status === "PROCESSED") break;
      await sleep(250);
    }
    await chaos("none");
    say("Evento na fila de falhas. Rode `npm run demo -- reprocessar` ou use o botão no painel.");
  },

  async reprocessar() {
    title("Reprocessamento manual: do ERP fora até o evento concluído, sem duplicar");
    await chaos("down");
    const deal = await newDeal({ title: "Contrato para reprocessar" });
    await win(deal.id);
    const dead = await waitStatus(deal.id, ["DEAD"]);
    say(`Evento ${dead.status} após ${dead.attempts} tentativas (${dead.lastErrorCode}).`);
    await chaos("none");
    const r = await api("ponte", `/v1/admin/events/${dead.id}/reprocess`, { method: "POST" });
    say(`Reprocessamento pedido: HTTP ${r.status} ${JSON.stringify(r.body)}`);
    const done = await waitStatus(deal.id, ["PROCESSED"]);
    say(`Evento ${done.status} (tentativa nº ${done.attempts} no histórico).`);
    const { orders } = await showErp(deal.id);
    say(orders.length === 1 ? "Exatamente um pedido: nada duplicado." : "ATENÇÃO: contagem de pedidos inesperada.");
    await showCrm(deal.id);
  },

  async pagamento() {
    title("Pagamento no ERP atualiza o CRM");
    const deal = await newDeal({ value: "3.200,00", title: "Contrato com pagamento" });
    await win(deal.id);
    await waitStatus(deal.id, ["PROCESSED"]);
    const { invoices } = await showErp(deal.id);
    await showCrm(deal.id);
    const paid = await api("erp", `/v1/invoices/${invoices[0].id}/pay`, { method: "POST" });
    say(`Baixa feita no ERP: HTTP ${paid.status}. O ERP enviou o webhook invoice.paid.`);
    for (let i = 0; i < 100; i++) {
      if ((await api("crm", `/v1/deals/${deal.id}`)).body.billingStatus === "PAGO") break;
      await sleep(200);
    }
    await showCrm(deal.id);
  },

  async reconciliacao() {
    title("Reconciliação: divergência entre CRM e ERP");
    const deal = await newDeal({ value: "1.000,00", title: "Contrato que vai divergir" });
    await win(deal.id);
    await waitStatus(deal.id, ["PROCESSED"]);
    say("Alterando o valor do negócio no CRM depois do pedido já ter sido criado (R$ 1.000,00 → R$ 1.250,00).");
    await api("crm", `/v1/deals/${deal.id}`, { method: "PATCH", body: { value: "1.250,00" } });
    const run = await api("ponte", "/v1/admin/reconciliation/run", { method: "POST" });
    say(`Reconciliação: ${run.body.dealsChecked} negócio(s) ganho(s) verificado(s), ${run.body.divergencesOpen} divergência(s) aberta(s).`);
    const open = (await api("ponte", "/v1/admin/divergences?status=OPEN")).body.data.filter((d: Json) => d.crmDealId === deal.id);
    for (const d of open) say(`${d.type}: CRM ${brl(d.detail.crmCents)} × ERP ${brl(d.detail.erpCents)}`);
    say("Veja no painel: http://localhost:4003/divergences");
  },
};

const name = process.argv[2];
if (!name || (name !== "todos" && !scenarios[name])) {
  console.log(`Uso: npm run demo -- <cenário>\nCenários: ${Object.keys(scenarios).join(" | ")} | todos`);
  process.exit(name ? 1 : 0);
}
await ensureUp();
if (name === "todos") for (const run of Object.values(scenarios)) await run();
else await scenarios[name]!();
console.log("");
