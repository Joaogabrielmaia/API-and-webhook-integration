import type { Event, PrismaClient } from "../generated/client";
import type { CrmClient } from "../clients/crm-client";
import type { ErpClient } from "../clients/erp-client";
import type { PonteConfig } from "../config";
import type { MappingRule } from "../mapping/engine";

export interface HandlerContext {
  prisma: PrismaClient;
  erp: ErpClient;
  crm: CrmClient;
  config: PonteConfig;
  getMappingRules: () => Promise<MappingRule[]>;
  log: { info: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void };
}

export type HandlerResult =
  | { kind: "processed"; warnings?: string[] }
  | { kind: "ignored"; code: "PONTE-SYNC-002" | "PONTE-SYNC-003" | "PONTE-SYNC-004" | "PONTE-SYNC-005"; reason: string };

export type EventHandler = (ctx: HandlerContext, event: Event) => Promise<HandlerResult>;
