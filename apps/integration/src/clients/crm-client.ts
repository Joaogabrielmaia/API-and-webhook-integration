import type { CrmBillingStatus } from "../rules";
import { request } from "./http";

export interface CrmDeal {
  id: string;
  title: string;
  customerId: string;
  stage: string;
  value: string;
  wonAt: string | null;
  version: number;
  erpOrderId: string | null;
  erpInvoiceId: string | null;
  billingStatus: string;
  paidAt: string | null;
}

export class CrmClient {
  constructor(private readonly opts: { baseUrl: string; apiKey: string; timeoutMs: number }) {}

  private call<T>(method: "GET" | "PUT" | "PATCH", path: string, body?: unknown) {
    return request<T>({ upstream: "CRM", baseUrl: this.opts.baseUrl, apiKey: this.opts.apiKey, timeoutMs: this.opts.timeoutMs, method, path, body });
  }

  async putErpLink(dealId: string, link: { erpCustomerId: string; erpOrderId: string; erpInvoiceId: string; billingStatus: CrmBillingStatus }): Promise<void> {
    await this.call("PUT", `/v1/deals/${dealId}/erp-link`, link);
  }
  async patchBillingStatus(dealId: string, input: { billingStatus: CrmBillingStatus; paidAt?: string | null }): Promise<void> {
    await this.call("PATCH", `/v1/deals/${dealId}/billing-status`, input);
  }
  async listDeals(stage: string): Promise<CrmDeal[]> {
    return (await this.call<{ data: CrmDeal[] }>("GET", `/v1/deals?stage=${encodeURIComponent(stage)}`)).body.data;
  }
}
