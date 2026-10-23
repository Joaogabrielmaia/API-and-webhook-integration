import { createServer } from "node:net";
import { randomInt, randomUUID } from "node:crypto";
import { buildCrmApp, type CrmApp, type CrmConfig } from "@ponte/mock-crm";
import { buildErpApp, type ErpApp, type ErpConfig } from "@ponte/mock-erp";
import { buildPonteApp, ensureDefaultMapping, type PonteApp, type PonteConfig } from "@ponte/integration";
import { cnpjFromBase, formatCnpj, loadRootEnv, signPayload } from "@ponte/shared";
import { APPS, testDatabaseUrl } from "../setup/db";
import { KEYS } from "./keys";

export { KEYS };

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

export async function waitFor<T>(fn: () => Promise<T | undefined | false | null>, opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {}): Promise<T> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  let last: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (err) {
      last = err;
    }
    if (Date.now() > deadline) throw new Error(`waitFor expirou${opts.label ? `: ${opts.label}` : ""}${last ? ` (último erro: ${String(last)})` : ""}`);
    await new Promise((r) => setTimeout(r, opts.intervalMs ?? 25));
  }
}

export interface Json {
  status: number;
  body: any;
  headers: Headers;
}

async function call(base: string, path: string, init: RequestInit = {}): Promise<Json> {
  const res = await fetch(`${base}${path}`, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

export interface StackOptions {
  /** Portas fixas (E2E). Sem isso, portas livres são sorteadas. */
  ports?: { crm: number; erp: number; ponte: number };
  ponte?: Partial<Omit<PonteConfig, "retry" | "worker" | "recon">> & {
    retry?: Partial<PonteConfig["retry"]>;
    worker?: Partial<PonteConfig["worker"]>;
    recon?: Partial<PonteConfig["recon"]>;
  };
}

export interface WonDealInput {
  title?: string;
  value?: string;
  term?: number | null;
  cnpj?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  customerId?: string;
}

export function uniqueCnpj(masked = true): string {
  const base = String(randomInt(100_000_000_000, 999_999_999_999));
  const digits = cnpjFromBase(base);
  return masked ? formatCnpj(digits) : digits;
}

export class Stack {
  crm!: CrmApp;
  erp!: ErpApp;
  ponte!: PonteApp;
  urls!: { crm: string; erp: string; ponte: string };
  ports!: { crm: number; erp: number; ponte: number };
  private erpConfig!: ErpConfig;
  private crmConfig!: CrmConfig;
  private ponteConfig!: PonteConfig;

  static async start(options: StackOptions = {}): Promise<Stack> {
    loadRootEnv();
    const suffix = process.env.TEST_DB_SUFFIX ?? "integration";
    const stack = new Stack();
    const [crmPort, erpPort, pontePort] = options.ports ? [options.ports.crm, options.ports.erp, options.ports.ponte] : [await freePort(), await freePort(), await freePort()];
    stack.ports = { crm: crmPort, erp: erpPort, ponte: pontePort };
    stack.urls = { crm: `http://127.0.0.1:${crmPort}`, erp: `http://127.0.0.1:${erpPort}`, ponte: `http://127.0.0.1:${pontePort}` };
    const url = (envVar: string, db: string) => testDatabaseUrl(envVar, db, suffix);

    stack.erpConfig = { databaseUrl: url("ERP_DATABASE_URL", "erp"), apiKey: KEYS.erpApi, ponteWebhookUrl: `${stack.urls.ponte}/v1/webhooks/erp`, webhookSecret: KEYS.erpSecret, logLevel: "silent" };
    stack.crmConfig = { databaseUrl: url("CRM_DATABASE_URL", "crm"), apiKey: KEYS.crmApi, ponteWebhookUrl: `${stack.urls.ponte}/v1/webhooks/crm`, webhookSecret: KEYS.crmSecret, logLevel: "silent" };

    const o = options.ponte ?? {};
    const ponteConfig: PonteConfig = {
      databaseUrl: url("PONTE_DATABASE_URL", "ponte"),
      crmUrl: stack.urls.crm,
      erpUrl: stack.urls.erp,
      crmApiKey: KEYS.crmApi,
      erpApiKey: KEYS.erpApi,
      crmWebhookSecret: KEYS.crmSecret,
      erpWebhookSecret: KEYS.erpSecret,
      adminKey: KEYS.admin,
      conferenceThresholdCents: 5_000_000,
      alerts: { stallSeconds: 300 },
      defaultPaymentTermDays: 30,
      httpTimeoutMs: 2000,
      logLevel: "silent",
      ...o,
      retry: { maxAttempts: 5, baseMs: 40, capMs: 320, jitterRatio: 0, ...o.retry },
      worker: { enabled: true, concurrency: 4, pollIntervalMs: 20, lockTimeoutMs: 120_000, ...o.worker },
      recon: { intervalSeconds: 0, graceSeconds: 0, ...o.recon },
    };

    stack.ponteConfig = ponteConfig;
    stack.erp = await buildErpApp(stack.erpConfig);
    stack.crm = await buildCrmApp(stack.crmConfig);
    stack.ponte = await buildPonteApp(ponteConfig);
    await stack.erp.app.listen({ port: erpPort, host: "127.0.0.1" });
    await stack.crm.app.listen({ port: crmPort, host: "127.0.0.1" });
    await stack.ponte.app.listen({ port: pontePort, host: "127.0.0.1" });
    return stack;
  }

  // ---- chamadas HTTP
  /** Chamada sem cabeçalhos automáticos (para testar autenticação). */
  raw = (base: "crm" | "erp" | "ponte", path: string, init: RequestInit = {}) => call(this.urls[base], path, init);

  crmApi = (path: string, init: RequestInit = {}) =>
    call(this.urls.crm, path, { ...init, headers: { "content-type": "application/json", "x-api-key": KEYS.crmApi, ...(init.headers as Record<string, string> | undefined) } });
  erpApi = (path: string, init: RequestInit = {}) =>
    call(this.urls.erp, path, { ...init, headers: { "content-type": "application/json", "x-api-key": KEYS.erpApi, ...(init.headers as Record<string, string> | undefined) } });
  admin = (path: string, init: RequestInit = {}) =>
    call(this.urls.ponte, `/v1/admin${path}`, { ...init, headers: { "content-type": "application/json", "x-admin-key": KEYS.admin, ...(init.headers as Record<string, string> | undefined) } });

  post = (api: "crm" | "erp" | "admin", path: string, body?: unknown) => this[api === "crm" ? "crmApi" : api === "erp" ? "erpApi" : "admin"](path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

  /** Envia um webhook assinado direto à Ponte (para testar segurança, idempotência e ordem). */
  async postWebhook(
    kind: "crm" | "erp",
    event: unknown,
    overrides: { secret?: string; timestamp?: string; signature?: string; eventIdHeader?: string; rawBody?: string } = {},
  ): Promise<Json> {
    const raw = overrides.rawBody ?? JSON.stringify(event);
    const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
    const secret = overrides.secret ?? (kind === "crm" ? KEYS.crmSecret : KEYS.erpSecret);
    const id = (event as { id?: string } | undefined)?.id ?? randomUUID();
    return call(this.urls.ponte, `/v1/webhooks/${kind}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-event-id": overrides.eventIdHeader ?? id,
        "x-signature": overrides.signature ?? signPayload(secret, timestamp, raw),
      },
      body: raw,
    });
  }

  // ---- dados de cenário
  async createCustomer(input: { name?: string; cnpj?: string; phone?: string | null; email?: string | null } = {}) {
    const res = await this.crmApi("/v1/customers", {
      method: "POST",
      body: JSON.stringify({ name: input.name ?? "Condomínio Edifício Solar", cnpj: input.cnpj ?? uniqueCnpj(), phone: input.phone === undefined ? "(31) 99876-5432" : input.phone, email: input.email === undefined ? "Financeiro@Solar.example" : input.email }),
    });
    if (res.status !== 201) throw new Error(`createCustomer falhou: ${JSON.stringify(res.body)}`);
    return res.body as { id: string; name: string; cnpj: string };
  }

  async createDeal(input: WonDealInput = {}) {
    const customerId = input.customerId ?? (await this.createCustomer(input)).id;
    const res = await this.crmApi("/v1/deals", {
      method: "POST",
      body: JSON.stringify({ title: input.title ?? "Contrato de manutenção anual", customerId, value: input.value ?? "12.500,50", paymentTermDays: input.term === undefined ? 30 : input.term }),
    });
    if (res.status !== 201) throw new Error(`createDeal falhou: ${JSON.stringify(res.body)}`);
    return res.body as { id: string; customerId: string; version: number; stage: string };
  }

  async setStage(dealId: string, stage: string) {
    return this.post("crm", `/v1/deals/${dealId}/stage`, { stage });
  }

  async winDeal(dealId: string) {
    const res = await this.setStage(dealId, "GANHO");
    if (res.status !== 200) throw new Error(`winDeal falhou: ${JSON.stringify(res.body)}`);
    return res.body as { id: string; version: number; wonAt: string };
  }

  async createWonDeal(input: WonDealInput = {}) {
    const deal = await this.createDeal(input);
    const won = await this.winDeal(deal.id);
    return { ...deal, version: won.version };
  }

  // ---- consulta
  async getEventForDeal(dealId: string) {
    return this.ponte.prisma.event.findFirst({ where: { entityId: dealId, type: "deal.won" }, orderBy: { receivedAt: "desc" } });
  }

  async waitForDealEvent(dealId: string, statuses: string[], timeoutMs = 15_000) {
    return waitFor(
      async () => {
        const e = await this.getEventForDeal(dealId);
        return e && statuses.includes(e.status) ? e : null;
      },
      { timeoutMs, label: `evento do negócio ${dealId} em ${statuses.join("/")}` },
    );
  }

  async getDeal(dealId: string) {
    return (await this.crmApi(`/v1/deals/${dealId}`)).body;
  }

  // ---- ERP fora do ar de verdade (fecha o servidor) e volta
  async stopErp(): Promise<void> {
    await this.erp.app.close();
  }
  async startErp(): Promise<void> {
    this.erp = await buildErpApp(this.erpConfig);
    await this.erp.app.listen({ port: this.ports.erp, host: "127.0.0.1" });
  }

  async stopPonte(): Promise<void> {
    await this.ponte.app.close();
  }
  async startPonte(): Promise<void> {
    this.ponte = await buildPonteApp(this.ponteConfig);
    await this.ponte.app.listen({ port: this.ports.ponte, host: '127.0.0.1' });
  }

  /** Monta um evento deal.won válido a partir de um negócio real do CRM, com versão e valor à escolha. */
  async buildDealWonEvent(dealId: string, over: { version?: number; value?: string; eventId?: string } = {}) {
    const deal = await this.getDeal(dealId);
    return {
      id: over.eventId ?? randomUUID(),
      type: 'deal.won',
      version: '1',
      occurredAt: new Date().toISOString(),
      data: {
        deal: { id: deal.id, title: deal.title, value: over.value ?? deal.value, paymentTermDays: deal.paymentTermDays, wonAt: deal.wonAt ?? new Date().toISOString(), version: over.version ?? deal.version },
        customer: { id: deal.customer.id, name: deal.customer.name, cnpj: deal.customer.cnpj, phone: deal.customer.phone, email: deal.customer.email },
      },
    };
  }

  async stopCrm(): Promise<void> {
    await this.crm.app.close();
  }
  async startCrm(): Promise<void> {
    this.crm = await buildCrmApp(this.crmConfig);
    await this.crm.app.listen({ port: this.ports.crm, host: '127.0.0.1' });
  }

  // ---- limpeza entre testes
  async reset(): Promise<void> {
    this.ponte.worker.pause();
    await this.ponte.worker.drain();
    const wipe = async (prisma: { $executeRawUnsafe: (q: string) => Promise<unknown> }, tables: string[]) => {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);
    };
    await wipe(this.ponte.prisma, ["Event", "Job", "Attempt", "CustomerLink", "DealLink", "MappingConfig", "ReconciliationRun", "Divergence"]);
    await wipe(this.crm.prisma, ["WebhookDelivery", "Deal", "Customer"]);
    await wipe(this.erp.prisma, ["WebhookDelivery", "Invoice", "Order", "Customer"]);
    await ensureDefaultMapping(this.ponte.prisma);
    this.erp.chaos.mode = "none";
    this.erp.chaos.delayMs = 0;
    this.ponte.worker.resume();
  }

  async close(): Promise<void> {
    await this.ponte.app.close();
    await this.crm.app.close();
    await this.erp.app.close().catch(() => undefined);
  }
}

export { APPS };
