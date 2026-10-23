import { AppError, dealWonEventSchema, invoiceRef, orderRef } from "@ponte/shared";
import { isHttpStatus } from "../clients/http";
import { applyMapping } from "../mapping/engine";
import { billingStatusFromInvoice, invoiceStatusFor } from "../rules";
import type { EventHandler } from "./context";

/**
 * deal.won → cliente (por CNPJ), pedido e cobrança no ERP → IDs devolvidos ao CRM.
 * Cada passo é idempotente (ADR-003): uma retentativa retoma de onde parou sem duplicar nada.
 */
export const handleDealWon: EventHandler = async (ctx, event) => {
  const { prisma, erp, crm, config } = ctx;
  const parsed = dealWonEventSchema.parse(event.payload);
  const { deal, customer } = parsed.data;

  // RN-07: evento obsoleto. Se outro evento aceito do mesmo negócio tem versão maior, o mais novo prevalece.
  const newer = await prisma.event.findFirst({
    where: { type: "deal.won", entityId: deal.id, id: { not: event.id }, entityVersion: { gt: deal.version }, status: { in: ["RECEIVED", "PROCESSING", "RETRYING", "PROCESSED"] } },
    select: { id: true, entityVersion: true },
  });
  if (newer) {
    return { kind: "ignored", code: "PONTE-SYNC-002", reason: `Existe evento mais novo do mesmo negócio (versão ${newer.entityVersion} > ${deal.version}).` };
  }

  // RN-03: um negócio, um pedido.
  const existing = await prisma.dealLink.findUnique({ where: { crmDealId: deal.id } });
  if (existing?.crmNotified && existing.erpInvoiceId) {
    return { kind: "ignored", code: "PONTE-SYNC-003", reason: "O negócio já gerou pedido e cobrança." };
  }

  // Mapeamento e validações (erros permanentes saem daqui, antes de tocar no ERP).
  const rules = await ctx.getMappingRules();
  const { output, warnings } = applyMapping(rules, parsed.data, { defaultPaymentTermDays: config.defaultPaymentTermDays });

  // 1) Cliente identificado pelo CNPJ (RN-02).
  const contact = { ...(output.customer.phone ? { phone: output.customer.phone } : {}), ...(output.customer.email ? { email: output.customer.email } : {}) };
  let erpCustomer = await erp.findCustomerByTaxId(output.customer.taxId);
  if (!erpCustomer) {
    try {
      erpCustomer = await erp.createCustomer({ taxId: output.customer.taxId, name: output.customer.name, ...contact });
    } catch (err) {
      if (!isHttpStatus(err, 409)) throw err;
      // Corrida: outro processamento criou o mesmo CNPJ entre a busca e a criação.
      erpCustomer = await erp.findCustomerByTaxId(output.customer.taxId);
      if (!erpCustomer) throw err;
    }
  }
  // A razão social existente no ERP nunca é sobrescrita; só contato muda, e só se vier diferente.
  const patch = {
    ...(contact.phone && contact.phone !== erpCustomer.phone ? { phone: contact.phone } : {}),
    ...(contact.email && contact.email !== erpCustomer.email ? { email: contact.email } : {}),
  };
  if (Object.keys(patch).length > 0) erpCustomer = await erp.patchCustomer(erpCustomer.id, patch);

  await prisma.customerLink.upsert({
    where: { crmCustomerId: customer.id },
    create: { crmCustomerId: customer.id, erpCustomerId: erpCustomer.id, taxId: output.customer.taxId },
    update: { erpCustomerId: erpCustomer.id, taxId: output.customer.taxId },
  });

  // 2) Pedido (idempotente por externalRef).
  const { order } = await erp.createOrder({ customerId: erpCustomer.id, externalRef: orderRef(deal.id), description: output.order.description, totalCents: output.order.totalCents });
  await prisma.dealLink.upsert({
    where: { crmDealId: deal.id },
    create: { crmDealId: deal.id, crmCustomerId: customer.id, erpCustomerId: erpCustomer.id, erpOrderId: order.id, amountCents: order.totalCents, lastVersion: deal.version },
    update: { erpCustomerId: erpCustomer.id, erpOrderId: order.id, amountCents: order.totalCents, lastVersion: deal.version },
  });

  // 3) Cobrança (idempotente por externalRef); RN-06 define o status inicial.
  const { invoice } = await erp.createInvoice({
    orderId: order.id,
    externalRef: invoiceRef(deal.id),
    amountCents: order.totalCents,
    dueDate: output.invoice.dueDate,
    status: invoiceStatusFor(order.totalCents, config.conferenceThresholdCents),
  });
  await prisma.dealLink.update({ where: { crmDealId: deal.id }, data: { erpInvoiceId: invoice.id, invoiceStatus: invoice.status } });

  // 4) Retorno ao CRM. Falha aqui é retentada sem recriar nada (os passos acima são idempotentes).
  try {
    await crm.putErpLink(deal.id, { erpCustomerId: erpCustomer.id, erpOrderId: order.id, erpInvoiceId: invoice.id, billingStatus: billingStatusFromInvoice(invoice.status) });
  } catch (err) {
    if (isHttpStatus(err, 404)) throw new AppError("PONTE-CRM-002", `O negócio ${deal.id} não existe mais no CRM.`, { dealId: deal.id });
    throw err;
  }
  await prisma.dealLink.update({ where: { crmDealId: deal.id }, data: { crmNotified: true } });

  return { kind: "processed", warnings };
};
