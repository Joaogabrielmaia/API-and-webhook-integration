import { AppError, ORDER_REF_PREFIX, dealIdFromRef, invoicePaidEventSchema } from "@ponte/shared";
import { isHttpStatus } from "../clients/http";
import type { EventHandler } from "./context";

/** invoice.paid → status da cobrança no CRM (RF-10, RN-08). */
export const handleInvoicePaid: EventHandler = async (ctx, event) => {
  const { prisma, crm } = ctx;
  const parsed = invoicePaidEventSchema.parse(event.payload);
  const { invoiceId, externalRef, paidAt } = parsed.data;

  if (!externalRef.startsWith(ORDER_REF_PREFIX)) {
    return { kind: "ignored", code: "PONTE-SYNC-005", reason: "Cobrança não foi criada pela Ponte (referência externa desconhecida)." };
  }

  const link = await prisma.dealLink.findFirst({ where: { OR: [{ erpInvoiceId: invoiceId }, { crmDealId: dealIdFromRef(externalRef) ?? "" }] } });
  // Evento fora de ordem: o pagamento chegou antes do vínculo. Retenta até o vínculo existir.
  if (!link || !link.erpInvoiceId) {
    throw new AppError("PONTE-SYNC-001", `A cobrança ${invoiceId} ainda não está vinculada a um negócio.`, { invoiceId, externalRef });
  }
  if (link.paidAt) {
    return { kind: "ignored", code: "PONTE-SYNC-004", reason: "A cobrança já estava registrada como paga." };
  }

  try {
    await crm.patchBillingStatus(link.crmDealId, { billingStatus: "PAGO", paidAt });
  } catch (err) {
    if (isHttpStatus(err, 404)) throw new AppError("PONTE-CRM-002", `O negócio ${link.crmDealId} não existe mais no CRM.`, { dealId: link.crmDealId });
    throw err;
  }
  await prisma.dealLink.update({ where: { crmDealId: link.crmDealId }, data: { paidAt: new Date(paidAt), invoiceStatus: "PAGA" } });
  return { kind: "processed" };
};
