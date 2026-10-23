import { AppError, ORDER_REF_PREFIX } from "@ponte/shared";
import type { CrmClient } from "../clients/crm-client";
import type { ErpClient, ErpInvoice, ErpOrder } from "../clients/erp-client";
import type { Prisma, PrismaClient } from "../generated/client";
import { moneyToCents } from "../mapping/transforms";
import { billingStatusFromInvoice } from "../rules";

export type DivergenceType = "NOT_SYNCED" | "AMOUNT_MISMATCH" | "BILLING_STATUS_MISMATCH" | "ORDER_MISSING_IN_ERP" | "CRM_LINK_MISSING";

interface Found {
  type: DivergenceType;
  crmDealId: string;
  detail: Record<string, unknown>;
}

export interface ReconcilerDeps {
  prisma: PrismaClient;
  crm: CrmClient;
  erp: ErpClient;
  graceSeconds: number;
}

const IN_FLIGHT = ["RECEIVED", "PROCESSING", "RETRYING"];

/**
 * Reconciliação (ADR-006): compara CRM e ERP somente para leitura, registra divergências
 * e fecha as que deixaram de existir. Se qualquer lado estiver fora do ar, a execução falha
 * sem alterar nada (não dá para dizer que algo "deixou de divergir" sem ter visto os dois lados).
 */
export class Reconciler {
  constructor(private readonly deps: ReconcilerDeps) {}

  async run(trigger: "SCHEDULED" | "MANUAL", options: { graceSeconds?: number } = {}) {
    const { prisma, crm, erp } = this.deps;
    const graceSeconds = options.graceSeconds ?? this.deps.graceSeconds;
    const startedAt = new Date();

    const [deals, orders, invoices] = await Promise.all([crm.listDeals("GANHO"), erp.listOrders(ORDER_REF_PREFIX), erp.listInvoices(ORDER_REF_PREFIX)]);
    const links = new Map((await prisma.dealLink.findMany()).map((l) => [l.crmDealId, l]));
    const ordersById = new Map<string, ErpOrder>(orders.map((o) => [o.id, o]));
    const invoicesById = new Map<string, ErpInvoice>(invoices.map((i) => [i.id, i]));
    const inFlightDealIds = new Set(
      (await prisma.event.findMany({ where: { type: "deal.won", status: { in: IN_FLIGHT } }, select: { entityId: true } })).map((e) => e.entityId).filter((id): id is string => Boolean(id)),
    );
    const eventStatusByDeal = new Map<string, string>();
    for (const e of await prisma.event.findMany({ where: { type: "deal.won" }, select: { entityId: true, status: true }, orderBy: { receivedAt: "asc" } })) {
      if (e.entityId) eventStatusByDeal.set(e.entityId, e.status);
    }

    const found: Found[] = [];
    const graceCutoff = Date.now() - graceSeconds * 1000;

    for (const deal of deals) {
      if (inFlightDealIds.has(deal.id)) continue; // ainda em processamento: não é divergência
      const link = links.get(deal.id);

      if (!link) {
        const wonAt = deal.wonAt ? new Date(deal.wonAt).getTime() : 0;
        if (wonAt > graceCutoff) continue; // carência para eventos em voo (RN-11)
        found.push({ type: "NOT_SYNCED", crmDealId: deal.id, detail: { title: deal.title, wonAt: deal.wonAt, eventStatus: eventStatusByDeal.get(deal.id) ?? null, hint: "O CRM tem o negócio como Ganho, mas a Ponte não tem pedido vinculado." } });
        continue;
      }

      if (!deal.erpOrderId) {
        found.push({ type: "CRM_LINK_MISSING", crmDealId: deal.id, detail: { title: deal.title, erpOrderId: link.erpOrderId, erpInvoiceId: link.erpInvoiceId, hint: "O pedido existe no ERP, mas o CRM não recebeu os identificadores." } });
      }

      const order = link.erpOrderId ? ordersById.get(link.erpOrderId) : undefined;
      if (link.erpOrderId && !order) {
        found.push({ type: "ORDER_MISSING_IN_ERP", crmDealId: deal.id, detail: { title: deal.title, erpOrderId: link.erpOrderId } });
      }
      if (order) {
        let crmCents: number | null = null;
        try {
          crmCents = moneyToCents(deal.value);
        } catch {
          crmCents = null; // valor ilegível no CRM: a validação do evento já trata; aqui não há como comparar
        }
        if (crmCents !== null && crmCents !== order.totalCents) {
          found.push({ type: "AMOUNT_MISMATCH", crmDealId: deal.id, detail: { title: deal.title, crmCents, erpCents: order.totalCents, crmValue: deal.value } });
        }
      }

      const invoice = link.erpInvoiceId ? invoicesById.get(link.erpInvoiceId) : undefined;
      if (invoice) {
        const expected = billingStatusFromInvoice(invoice.status);
        if (deal.billingStatus !== expected) {
          found.push({ type: "BILLING_STATUS_MISMATCH", crmDealId: deal.id, detail: { title: deal.title, crmStatus: deal.billingStatus, erpStatus: invoice.status, expectedCrmStatus: expected, invoiceId: invoice.id, paidAt: invoice.paidAt } });
        }
      }
    }

    // Persistência: upsert do que foi encontrado; fecha o que não foi visto nesta execução.
    const run = await prisma.reconciliationRun.create({ data: { trigger, startedAt } });
    const seenKeys = new Set<string>();
    const now = new Date();
    for (const f of found) {
      const key = `${f.type}:${f.crmDealId}`;
      seenKeys.add(key);
      await prisma.divergence.upsert({
        where: { key },
        create: { key, type: f.type, crmDealId: f.crmDealId, detail: f.detail as Prisma.InputJsonValue, status: "OPEN", lastSeenAt: now, lastRunId: run.id },
        update: { detail: f.detail as Prisma.InputJsonValue, status: "OPEN", resolvedAt: null, lastSeenAt: now, lastRunId: run.id },
      });
    }
    const stillOpen = await prisma.divergence.findMany({ where: { status: "OPEN" }, select: { id: true, key: true } });
    const toResolve = stillOpen.filter((d) => !seenKeys.has(d.key));
    if (toResolve.length > 0) {
      await prisma.divergence.updateMany({ where: { id: { in: toResolve.map((d) => d.id) } }, data: { status: "RESOLVED", resolvedAt: now, lastRunId: run.id } });
    }

    return prisma.reconciliationRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), dealsChecked: deals.length, divergencesOpen: found.length, divergencesResolved: toResolve.length },
    });
  }

  /** Correção assistida: só BILLING_STATUS_MISMATCH (ADR-006). O ERP é a fonte de verdade do status da cobrança. */
  async resolve(divergenceId: string) {
    const { prisma, crm } = this.deps;
    const divergence = await prisma.divergence.findUnique({ where: { id: divergenceId } });
    if (!divergence) throw new AppError("PONTE-ADM-002", "Divergência não encontrada.");
    if (divergence.type !== "BILLING_STATUS_MISMATCH" || !divergence.crmDealId) {
      throw new AppError("PONTE-ADM-004", `A divergência ${divergence.type} não tem correção assistida.`);
    }
    const detail = divergence.detail as { expectedCrmStatus: "NAO_COBRADO" | "EM_CONFERENCIA" | "ABERTA" | "PAGO"; paidAt?: string | null };
    await crm.patchBillingStatus(divergence.crmDealId, { billingStatus: detail.expectedCrmStatus, paidAt: detail.paidAt ?? null });
    if (detail.expectedCrmStatus === "PAGO") {
      await prisma.dealLink.updateMany({ where: { crmDealId: divergence.crmDealId }, data: { paidAt: detail.paidAt ? new Date(detail.paidAt) : new Date(), invoiceStatus: "PAGA" } });
    }
    return prisma.divergence.update({ where: { id: divergence.id }, data: { status: "RESOLVED", resolvedAt: new Date() } });
  }
}
