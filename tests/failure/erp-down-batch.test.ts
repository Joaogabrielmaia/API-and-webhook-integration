/**
 * Teste de falha injetada (RF-08, RF-09, RNF-02, RNF-03): derruba o ERP DE VERDADE durante um lote.
 * "Derrubar" aqui é fechar o servidor HTTP do ERP (conexão recusada), não um modo simulado.
 * O resultado medido é gravado em docs/05-qualidade/resultados/ para a documentação citar números reais.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findRepoRoot } from "@ponte/shared";
import { Stack, uniqueCnpj, waitFor } from "../helpers/stack";

const resultsDir = join(findRepoRoot(), "docs", "05-qualidade", "resultados");
// Cada cenário fecha a própria pilha: dois workers vivos no mesmo banco disputariam os mesmos eventos.
let current: Stack | undefined;
afterEach(async () => {
  await current?.close().catch(() => undefined);
  current = undefined;
});

function saveResult(name: string, data: unknown): void {
  mkdirSync(resultsDir, { recursive: true });
  writeFileSync(join(resultsDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

const erp = async (stack: Stack) => ({
  customers: (await stack.erpApi("/v1/customers")).body.data as { taxId: string }[],
  orders: (await stack.erpApi("/v1/orders")).body.data as { externalRef: string }[],
  invoices: (await stack.erpApi("/v1/invoices")).body.data as { externalRef: string }[],
});

describe("Falha injetada: ERP derrubado durante um lote de 20 negócios ganhos", () => {
  it("cenário A: o ERP volta dentro da janela de retentativa; os 20 são processados e nada é duplicado", async () => {
    const stack = await Stack.start({ ponte: { retry: { maxAttempts: 12, baseMs: 100, capMs: 800, jitterRatio: 0.2 }, worker: { concurrency: 4 } } });
    current = stack;
    await stack.reset();

    const TOTAL = 20;
    const startedAt = Date.now();
    // Cada negócio tem um cliente com CNPJ próprio: no fim devem existir 20 clientes, 20 pedidos e 20 cobranças.
    const deals = await Promise.all(Array.from({ length: TOTAL }, (_, i) => stack.createDeal({ cnpj: uniqueCnpj(), title: `Contrato ${i + 1}`, value: `${(i + 1) * 100},00` })));

    // Lote em ondas de 4 "Ganho" por vez. Depois da 2ª onda (8 negócios), derruba o ERP e segue o lote.
    let erpDownAt = 0;
    let erpUpAt = 0;
    for (let i = 0; i < TOTAL; i += 4) {
      if (i === 8) {
        await waitFor(async () => (await stack.ponte.prisma.event.count({ where: { status: "PROCESSED" } })) >= 4, { label: "ao menos 4 já processados antes da queda" });
        await stack.stopErp();
        erpDownAt = Date.now();
      }
      await Promise.all(deals.slice(i, i + 4).map((d) => stack.winDeal(d.id)));
    }

    const processedBeforeOutage = await stack.ponte.prisma.event.count({ where: { status: "PROCESSED" } });
    // Com o ERP fora, há eventos em retentativa com PONTE-ERP-001 (ou PONTE-ERP-003)
    const retrying = await waitFor(async () => {
      const rows = await stack.ponte.prisma.event.findMany({ where: { status: "RETRYING" } });
      return rows.length >= 3 ? rows : null;
    }, { label: "eventos em retentativa durante a queda" });
    expect(retrying.every((e) => ["PONTE-ERP-001", "PONTE-ERP-003"].includes(e.lastErrorCode ?? ""))).toBe(true);
    const retryingDuringOutage = retrying.length;

    // O ERP fica fora por um tempo e volta
    await new Promise((r) => setTimeout(r, 2000));
    await stack.startErp();
    erpUpAt = Date.now();

    await waitFor(async () => (await stack.ponte.prisma.event.count({ where: { status: "PROCESSED" } })) === TOTAL, { timeoutMs: 60_000, label: "todos os 20 processados" });
    const finishedAt = Date.now();

    const events = await stack.ponte.prisma.event.findMany({ where: { type: "deal.won" } });
    const byStatus = events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }), {});
    const needingRetry = events.filter((e) => e.attempts > 1).length;
    const maxAttempts = Math.max(...events.map((e) => e.attempts));

    // RNF-02: nada se perdeu. Recebidos = soma dos estados finais, e todos estão processados.
    expect(events).toHaveLength(TOTAL);
    expect(byStatus).toEqual({ PROCESSED: TOTAL });

    // Sem duplicidade no ERP
    const { customers, orders, invoices } = await erp(stack);
    expect(customers).toHaveLength(TOTAL);
    expect(new Set(customers.map((c) => c.taxId)).size).toBe(TOTAL);
    expect(orders).toHaveLength(TOTAL);
    expect(new Set(orders.map((o) => o.externalRef)).size).toBe(TOTAL);
    expect(invoices).toHaveLength(TOTAL);
    expect(new Set(invoices.map((i) => i.externalRef)).size).toBe(TOTAL);

    // O CRM recebeu os identificadores de todos
    const crmDeals = (await stack.crmApi("/v1/deals?stage=GANHO")).body.data as { erpOrderId: string | null; erpInvoiceId: string | null }[];
    expect(crmDeals).toHaveLength(TOTAL);
    expect(crmDeals.every((d) => d.erpOrderId && d.erpInvoiceId)).toBe(true);

    expect(needingRetry).toBeGreaterThan(0); // a queda realmente afetou o lote

    saveResult("falha-injetada-cenario-a", {
      cenario: "A: ERP derrubado (servidor fechado) durante um lote de 20 negócios e religado depois de ~2 s",
      politicaDeRetentativa: { maxTentativas: 12, baseMs: 100, tetoMs: 800, jitter: 0.2 },
      totalDeNegocios: TOTAL,
      processadosAntesDaQueda: processedBeforeOutage,
      eventosEmRetentativaDuranteAQueda: retryingDuringOutage,
      duracaoDaQuedaMs: erpUpAt - erpDownAt,
      tempoTotalDoLoteMs: finishedAt - startedAt,
      eventosPorStatusFinal: byStatus,
      eventosQuePrecisaramDeRetentativa: needingRetry,
      maiorNumeroDeTentativas: maxAttempts,
      erp: { clientes: customers.length, pedidos: orders.length, cobrancas: invoices.length },
      duplicidades: 0,
      observacao: "Medido em ambiente local, com os três serviços no mesmo processo de teste. Não representa desempenho em produção.",
    });
  });

  it("cenário B: o ERP fica fora além da janela; os 5 eventos vão à fila de falhas e o reprocessamento manual os conclui sem duplicar", async () => {
    const stack = await Stack.start({ ponte: { retry: { maxAttempts: 4, baseMs: 50, capMs: 200, jitterRatio: 0 }, worker: { concurrency: 4 } } });
    current = stack;
    await stack.reset();

    const TOTAL = 5;
    await stack.stopErp();
    const deals = await Promise.all(Array.from({ length: TOTAL }, (_, i) => stack.createDeal({ cnpj: uniqueCnpj(), title: `Contrato B${i + 1}` })));
    await Promise.all(deals.map((d) => stack.winDeal(d.id)));

    await waitFor(async () => (await stack.ponte.prisma.event.count({ where: { status: "DEAD" } })) === TOTAL, { timeoutMs: 30_000, label: "5 eventos na fila de falhas" });
    const dead = await stack.ponte.prisma.event.findMany({ where: { status: "DEAD" } });
    expect(dead.every((e) => e.attempts === 4 && e.lastErrorCode === "PONTE-ERP-001")).toBe(true);

    // RNF-02: recebidos = fila de falhas (nenhum se perdeu em silêncio)
    expect(await stack.ponte.prisma.event.count()).toBe(TOTAL);

    await stack.startErp();
    expect((await erp(stack)).orders).toHaveLength(0);
    for (const e of dead) expect((await stack.admin(`/events/${e.id}/reprocess`, { method: "POST" })).status).toBe(202);
    await waitFor(async () => (await stack.ponte.prisma.event.count({ where: { status: "PROCESSED" } })) === TOTAL, { timeoutMs: 30_000, label: "5 reprocessados" });

    const { customers, orders, invoices } = await erp(stack);
    expect(customers).toHaveLength(TOTAL);
    expect(orders).toHaveLength(TOTAL);
    expect(invoices).toHaveLength(TOTAL);
    const attempts = await stack.ponte.prisma.attempt.count();

    saveResult("falha-injetada-cenario-b", {
      cenario: "B: ERP fora além da janela de retentativa (4 tentativas), fila de falhas e reprocessamento manual",
      politicaDeRetentativa: { maxTentativas: 4, baseMs: 50, tetoMs: 200, jitter: 0 },
      totalDeNegocios: TOTAL,
      eventosNaFilaDeFalhasAntesDoReprocessamento: dead.length,
      codigoDeErro: "PONTE-ERP-001",
      eventosProcessadosAposReprocessamento: TOTAL,
      tentativasRegistradasNoTotal: attempts,
      erp: { clientes: customers.length, pedidos: orders.length, cobrancas: invoices.length },
      duplicidades: 0,
      observacao: "Medido em ambiente local. Não representa desempenho em produção.",
    });
  });
});
