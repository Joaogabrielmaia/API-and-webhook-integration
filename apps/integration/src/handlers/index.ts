import type { EventHandler } from "./context";
import { handleDealWon } from "./deal-won";
import { handleInvoicePaid } from "./invoice-paid";

export const HANDLERS: Record<string, EventHandler> = {
  "deal.won": handleDealWon,
  "invoice.paid": handleInvoicePaid,
};

export type { HandlerContext, HandlerResult, EventHandler } from "./context";
