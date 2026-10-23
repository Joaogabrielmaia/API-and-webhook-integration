import { AppError, type ErrorCode } from "@ponte/shared";

export type Upstream = "ERP" | "CRM";

const CODES: Record<Upstream, { unavailable: ErrorCode; timeout: ErrorCode; rateLimit: ErrorCode; rejected: ErrorCode }> = {
  ERP: { unavailable: "PONTE-ERP-001", timeout: "PONTE-ERP-003", rateLimit: "PONTE-ERP-004", rejected: "PONTE-ERP-002" },
  CRM: { unavailable: "PONTE-CRM-001", timeout: "PONTE-CRM-001", rateLimit: "PONTE-CRM-001", rejected: "PONTE-CRM-002" },
};

export interface HttpResult<T> {
  status: number;
  replay: boolean;
  body: T;
}

export interface RequestOptions {
  upstream: Upstream;
  baseUrl: string;
  apiKey: string;
  method: "GET" | "POST" | "PUT" | "PATCH";
  path: string;
  body?: unknown;
  timeoutMs: number;
}

/**
 * Classificação de falhas (RN-09):
 *  - rede, timeout, 5xx, 408 e 429 → temporárias (retentáveis)
 *  - demais 4xx → permanentes
 * Quem chama pode inspecionar `error.details.status` (por exemplo, 404 e 409).
 */
export async function request<T>(opts: RequestOptions): Promise<HttpResult<T>> {
  const codes = CODES[opts.upstream];
  let res: Response;
  try {
    res = await fetch(`${opts.baseUrl}${opts.path}`, {
      method: opts.method,
      headers: { "content-type": "application/json", "x-api-key": opts.apiKey },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(opts.timeoutMs),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw new AppError(codes.timeout, `${opts.upstream} não respondeu em ${opts.timeoutMs} ms (${opts.method} ${opts.path}).`, { upstream: opts.upstream, path: opts.path });
    }
    const cause = (err as { cause?: { code?: string } }).cause?.code ?? (err instanceof Error ? err.message : String(err));
    throw new AppError(codes.unavailable, `${opts.upstream} inacessível (${cause}) em ${opts.method} ${opts.path}.`, { upstream: opts.upstream, path: opts.path, cause });
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
  }

  if (res.ok) return { status: res.status, replay: res.headers.get("idempotent-replay") === "true", body: parsed as T };

  const upstreamError = (parsed as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | null)?.error;
  const details = { upstream: opts.upstream, path: opts.path, status: res.status, upstreamCode: upstreamError?.code, upstreamMessage: upstreamError?.message, upstreamDetails: upstreamError?.details };
  if (res.status >= 500) throw new AppError(codes.unavailable, `${opts.upstream} respondeu ${res.status} em ${opts.method} ${opts.path}.`, details);
  if (res.status === 429) throw new AppError(codes.rateLimit, `${opts.upstream} limitou a taxa (429) em ${opts.method} ${opts.path}.`, details);
  if (res.status === 408) throw new AppError(codes.timeout, `${opts.upstream} respondeu 408 em ${opts.method} ${opts.path}.`, details);
  throw new AppError(codes.rejected, `${opts.upstream} rejeitou ${opts.method} ${opts.path} com ${res.status}: ${upstreamError?.message ?? "sem detalhes"}.`, details);
}

/** Verdadeiro se o erro veio de uma resposta HTTP com o status informado. */
export function isHttpStatus(err: unknown, status: number): boolean {
  return err instanceof AppError && err.details?.status === status;
}
