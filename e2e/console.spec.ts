/**
 * E2E (Playwright) contra a pilha real dos quatro serviços (scripts/e2e-stack.ts).
 * Cada passo confere o que a tela mostra e, ao final, grava um print numerado em docs/screenshots/.
 * Os prints são gerados pelo comportamento real do sistema; nada é montado à mão.
 */
import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { KEYS } from "../tests/helpers/keys";

const URL = { crm: "http://127.0.0.1:4101", erp: "http://127.0.0.1:4102", ponte: "http://127.0.0.1:4100", panel: "http://127.0.0.1:4103" };
const SHOTS = "docs/screenshots";
mkdirSync(SHOTS, { recursive: true });

// CNPJs válidos (dígitos verificadores corretos) usados só nesta demonstração.
const CNPJ = { solar: "12.345.678/0001-95", vida: "23.456.789/0001-95", escola: "34.567.890/0001-30", padaria: "45.678.901/0001-75", invalido: "56.789.012/0001-99" };

type Json = any;
async function api(base: "crm" | "erp" | "ponte", path: string, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Json }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (base === "crm") headers["x-api-key"] = KEYS.crmApi;
  if (base === "erp") headers["x-api-key"] = KEYS.erpApi;
  if (base === "ponte") headers["x-admin-key"] = KEYS.admin;
  const res = await fetch(`${URL[base]}${path}`, { method: init.method ?? "GET", headers, body: init.body === undefined ? undefined : JSON.stringify(init.body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function newDeal(name: string, cnpj: string, title: string, value: string) {
  const customer = await api("crm", "/v1/customers", { method: "POST", body: { name, cnpj, phone: "(31) 99876-5432", email: "Financeiro@Cliente.example" } });
  const deal = await api("crm", "/v1/deals", { method: "POST", body: { title, customerId: customer.body.id, value, paymentTermDays: 30 } });
  return deal.body as { id: string };
}

async function waitEvent(dealId: string, statuses: string[], timeoutMs = 30_000): Promise<Json> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const events = (await api("ponte", "/v1/admin/events?limit=200")).body.data as Json[];
    const e = events.find((x) => x.entityId === dealId && x.type === "deal.won");
    if (e && statuses.includes(e.status)) return e;
    if (Date.now() > deadline) throw new Error(`Tempo esgotado: negócio ${dealId} em ${statuses.join("/")} (atual: ${e?.status ?? "sem evento"})`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

const ids: { solar?: string; vida?: string; escola?: string; padaria?: string; invalido?: string; padariaEventId?: string } = {};

test.describe.serial("Roteiro E2E da Ponte, com prints", () => {
  test("CRM: marcar o negócio como Ganho pela tela e ver os IDs do ERP voltarem", async ({ page }) => {
    const solar = await newDeal("Condomínio Edifício Solar", CNPJ.solar, "Contrato de manutenção anual", "12.500,50");
    ids.solar = solar.id;

    await page.goto(`${URL.crm}/ui/deals/${solar.id}`);
    await expect(page.getByRole("heading", { name: "Contrato de manutenção anual" })).toBeVisible();
    await page.getByRole("button", { name: "Marcar como Ganho" }).click();
    await expect(page.locator(".badge", { hasText: "Ganho" }).first()).toBeVisible();

    // A Ponte processa em segundo plano; a tela do CRM passa a mostrar os IDs do ERP.
    await expect(async () => {
      await page.reload();
      await expect(page.getByText("Cobrança aberta")).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await expect(page.locator("dd code").nth(1)).not.toHaveText("—");
    await expect(page.getByText("Entregue")).toBeVisible();
    await shot(page, "01-crm-negocio-ganho");

    // Mais dois negócios ganhos, um deles acima de R$ 50.000 (cobrança em conferência).
    const vida = await newDeal("Clínica Vida Plena", CNPJ.vida, "Manutenção de ar-condicionado", "3.200,00");
    const escola = await newDeal("Escola Pequeno Aprendiz", CNPJ.escola, "Reforma do prédio", "58.000,00");
    ids.vida = vida.id;
    ids.escola = escola.id;
    await api("crm", `/v1/deals/${vida.id}/stage`, { method: "POST", body: { stage: "GANHO" } });
    await api("crm", `/v1/deals/${escola.id}/stage`, { method: "POST", body: { stage: "GANHO" } });
    await waitEvent(vida.id, ["PROCESSED"]);
    await waitEvent(escola.id, ["PROCESSED"]);
  });

  test("ERP: cobranças, pedidos e clientes criados pela Ponte", async ({ page }) => {
    await page.goto(`${URL.erp}/ui`);
    await expect(page.getByRole("heading", { name: "Cobranças" })).toBeVisible();
    await expect(page.getByText("Condomínio Edifício Solar")).toBeVisible();
    await expect(page.getByText("R$ 12.500,50")).toBeVisible();
    await expect(page.locator(".badge", { hasText: "Em conferência" })).toHaveCount(1);
    await shot(page, "02-erp-cobrancas-criadas");

    await page.goto(`${URL.erp}/ui/orders`);
    await expect(page.getByText(`ponte:deal:${ids.solar}`)).toBeVisible();
    await shot(page, "03-erp-pedidos-criados");

    await page.goto(`${URL.erp}/ui/customers`);
    await expect(page.getByText("12345678000195")).toBeVisible();
    await expect(page.getByText("5531998765432").first()).toBeVisible(); // telefone convertido para dígitos com país
    await shot(page, "04-erp-clientes-criados");
  });

  test("Pagamento: dar baixa na cobrança no ERP e ver o CRM atualizado", async ({ page }) => {
    await page.goto(`${URL.erp}/ui`);
    const row = page.locator("tr", { hasText: "Clínica Vida Plena" });
    await row.getByRole("button", { name: "Dar baixa (pago)" }).click();
    await expect(row.locator(".badge", { hasText: "Paga" })).toBeVisible();

    await expect(async () => {
      await page.goto(`${URL.crm}/ui/deals/${ids.vida}`);
      await expect(page.locator(".badge", { hasText: "Pago" })).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await shot(page, "05-crm-cobranca-paga");
  });

  test("Painel: visão geral da integração", async ({ page }) => {
    await page.goto(`${URL.panel}/`);
    await expect(page.getByRole("heading", { name: "Visão geral da integração" })).toBeVisible();
    await expect(page.locator(".stat", { hasText: "processados" }).locator(".n")).toHaveText("4"); // 3 negócios + 1 pagamento
    await shot(page, "06-painel-visao-geral");
  });

  test("ERP fora: evento em retentativa com backoff", async ({ page }) => {
    await page.goto(`${URL.erp}/ui/chaos`);
    await page.getByRole("button", { name: "Derrubar ERP" }).click();
    await expect(page.locator(".banner.danger")).toContainText("ERP em manutenção");
    await shot(page, "07-erp-modo-de-falha");

    const padaria = await newDeal("Padaria Pão Dourado", CNPJ.padaria, "Instalação elétrica", "4.800,00");
    ids.padaria = padaria.id;
    await api("crm", `/v1/deals/${padaria.id}/stage`, { method: "POST", body: { stage: "GANHO" } });
    const retrying = await waitEvent(padaria.id, ["RETRYING"]);
    ids.padariaEventId = retrying.id;

    await page.goto(`${URL.panel}/events?status=RETRYING`);
    await expect(page.locator(".badge", { hasText: "Em retentativa" }).first()).toBeVisible();
    await expect(page.getByText("PONTE-ERP-001").first()).toBeVisible();
    await shot(page, "08-painel-evento-em-retentativa");

    await page.getByRole("link", { name: "Negócio ganho (CRM)" }).first().click();
    await expect(page.getByRole("heading", { name: "Tentativas" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Falha temporária" }).first()).toBeVisible();
    await shot(page, "09-painel-tentativas-e-backoff");
  });

  test("Fila de falhas: erro de dado e esgotamento de tentativas", async ({ page }) => {
    const invalido = await newDeal("Oficina Mecânica Silva", CNPJ.invalido, "Contrato com CNPJ digitado errado", "900,00");
    ids.invalido = invalido.id;
    await api("crm", `/v1/deals/${invalido.id}/stage`, { method: "POST", body: { stage: "GANHO" } });
    await waitEvent(invalido.id, ["DEAD"]);
    await waitEvent(ids.padaria!, ["DEAD"]);

    await page.goto(`${URL.panel}/dead-letters`);
    await expect(page.getByRole("heading", { name: "Fila de falhas" })).toBeVisible();
    await expect(page.getByText("PONTE-VAL-001").first()).toBeVisible();
    await expect(page.getByText("PONTE-ERP-001").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Reprocessar" })).toHaveCount(2);
    await shot(page, "10-painel-fila-de-falhas");
  });

  test("Reprocessamento manual depois que o ERP volta", async ({ page }) => {
    await page.goto(`${URL.erp}/ui/chaos`);
    await page.getByRole("button", { name: "Restabelecer" }).click();
    await expect(page.locator(".banner.danger")).toHaveCount(0);

    await page.goto(`${URL.panel}/dead-letters`);
    const row = page.locator("tr", { hasText: "PONTE-ERP-001" });
    await row.getByRole("button", { name: "Reprocessar" }).click();
    await waitEvent(ids.padaria!, ["PROCESSED"]);

    await page.goto(`${URL.panel}/events/${ids.padariaEventId}`);
    await expect(page.locator(".badge", { hasText: "Processado" }).first()).toBeVisible();
    await expect(page.locator("tr", { hasText: "Sucesso" })).toBeVisible();
    await expect(page.locator("tr", { hasText: "Falha temporária" })).toHaveCount(5);
    await shot(page, "11-painel-reprocessamento");

    // A fila de falhas ficou só com o erro de dado, que precisa de correção no CRM.
    await page.goto(`${URL.panel}/dead-letters`);
    await expect(page.getByRole("button", { name: "Reprocessar" })).toHaveCount(1);
  });

  test("Reconciliação: divergências entre CRM e ERP", async ({ page }) => {
    // O valor é alterado no CRM depois de o pedido já existir no ERP.
    await api("crm", `/v1/deals/${ids.solar}`, { method: "PATCH", body: { value: "13.000,00" } });

    await page.goto(`${URL.panel}/divergences`);
    await page.getByRole("button", { name: "Executar reconciliação agora" }).click();
    await expect(page.getByRole("heading", { name: /Abertas \(2\)/ })).toBeVisible();
    await expect(page.locator(".badge", { hasText: "Valor diferente" })).toBeVisible();
    await expect(page.locator(".badge", { hasText: "Ganho sem pedido" })).toBeVisible();
    await expect(page.getByText("CRM: R$ 13.000,00 · ERP: R$ 12.500,50")).toBeVisible();
    await shot(page, "12-painel-divergencias-da-reconciliacao");
  });

  test("Painel: mapeamento de campos e catálogo de erros", async ({ page }) => {
    await page.goto(`${URL.panel}/mapping`);
    await expect(page.getByRole("heading", { name: "Mapeamento de campos" })).toBeVisible();
    await expect(page.getByText("customer.taxId")).toBeVisible();
    await expect(page.getByText("cnpjDigits")).toBeVisible();
    await shot(page, "13-painel-mapeamento-de-campos");

    await page.goto(`${URL.panel}/errors`);
    await expect(page.getByRole("heading", { name: "Catálogo de erros" })).toBeVisible();
    await expect(page.getByText("PONTE-VAL-001")).toBeVisible();
    await shot(page, "14-painel-catalogo-de-erros");
  });
});
