import { request } from "./http";

export interface ErpCustomer { id: string; taxId: string; name: string; phone: string | null; email: string | null }
export interface ErpOrder { id: string; customerId: string; externalRef: string; description: string; totalCents: number; status: string }
export interface ErpInvoice { id: string; orderId: string; externalRef: string; amountCents: number; dueDate: string; status: string; paidAt: string | null }

export class ErpClient {
  constructor(private readonly opts: { baseUrl: string; apiKey: string; timeoutMs: number }) {}

  private call<T>(method: "GET" | "POST" | "PATCH", path: string, body?: unknown) {
    return request<T>({ upstream: "ERP", baseUrl: this.opts.baseUrl, apiKey: this.opts.apiKey, timeoutMs: this.opts.timeoutMs, method, path, body });
  }

  async findCustomerByTaxId(taxId: string): Promise<ErpCustomer | null> {
    const res = await this.call<{ data: ErpCustomer[] }>("GET", `/v1/customers?taxId=${encodeURIComponent(taxId)}`);
    return res.body.data[0] ?? null;
  }
  async createCustomer(input: { taxId: string; name: string; phone?: string; email?: string }): Promise<ErpCustomer> {
    return (await this.call<ErpCustomer>("POST", "/v1/customers", input)).body;
  }
  async patchCustomer(id: string, input: { phone?: string; email?: string }): Promise<ErpCustomer> {
    return (await this.call<ErpCustomer>("PATCH", `/v1/customers/${id}`, input)).body;
  }
  async createOrder(input: { customerId: string; externalRef: string; description: string; totalCents: number }): Promise<{ order: ErpOrder; replay: boolean }> {
    const res = await this.call<ErpOrder>("POST", "/v1/orders", input);
    return { order: res.body, replay: res.replay };
  }
  async createInvoice(input: { orderId: string; externalRef: string; amountCents: number; dueDate: string; status: "ABERTA" | "EM_CONFERENCIA" }): Promise<{ invoice: ErpInvoice; replay: boolean }> {
    const res = await this.call<ErpInvoice>("POST", "/v1/invoices", input);
    return { invoice: res.body, replay: res.replay };
  }
  async listOrders(externalRefPrefix: string): Promise<ErpOrder[]> {
    return (await this.call<{ data: ErpOrder[] }>("GET", `/v1/orders?externalRefPrefix=${encodeURIComponent(externalRefPrefix)}`)).body.data;
  }
  async listInvoices(externalRefPrefix: string): Promise<ErpInvoice[]> {
    return (await this.call<{ data: ErpInvoice[] }>("GET", `/v1/invoices?externalRefPrefix=${encodeURIComponent(externalRefPrefix)}`)).body.data;
  }
}
