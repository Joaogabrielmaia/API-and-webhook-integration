import { z } from "zod";

export const EVENT_VERSION = "1";

export const dealWonEventSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("deal.won"),
  version: z.string(),
  occurredAt: z.string().datetime(),
  data: z.object({
    deal: z.object({
      id: z.string().uuid(),
      title: z.string(),
      value: z.string(),
      paymentTermDays: z.number().int().nullable().optional(),
      wonAt: z.string().datetime(),
      version: z.number().int().min(1),
    }),
    customer: z.object({
      id: z.string().uuid(),
      name: z.string(),
      cnpj: z.string(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
    }),
  }),
});
export type DealWonEvent = z.infer<typeof dealWonEventSchema>;

export const invoicePaidEventSchema = z.object({
  id: z.string().uuid(),
  type: z.literal("invoice.paid"),
  version: z.string(),
  occurredAt: z.string().datetime(),
  data: z.object({
    invoiceId: z.string().uuid(),
    orderId: z.string().uuid(),
    externalRef: z.string(),
    amountCents: z.number().int(),
    paidAt: z.string().datetime(),
  }),
});
export type InvoicePaidEvent = z.infer<typeof invoicePaidEventSchema>;

/** Prefixos de referência externa usados pela Ponte no ERP. */
export const ORDER_REF_PREFIX = "ponte:deal:";
export const orderRef = (dealId: string): string => `${ORDER_REF_PREFIX}${dealId}`;
export const invoiceRef = (dealId: string): string => `${ORDER_REF_PREFIX}${dealId}:inv`;
export const dealIdFromRef = (ref: string): string | null => {
  if (!ref.startsWith(ORDER_REF_PREFIX)) return null;
  return ref.slice(ORDER_REF_PREFIX.length).replace(/:inv$/, "");
};
