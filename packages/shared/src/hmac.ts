import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Assinatura: `sha256=` + HMAC_SHA256(segredo, timestamp + "." + corpoBruto). */
export function signPayload(secret: string, timestamp: string, rawBody: string | Buffer): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  return `sha256=${digest}`;
}

export type SignatureCheck = "ok" | "invalid_signature" | "timestamp_out_of_window";

export interface VerifyParams {
  secret: string;
  timestamp: string | undefined;
  signature: string | undefined;
  rawBody: string | Buffer;
  /** Segundos Unix; injetável para teste. */
  nowSeconds?: number;
  toleranceSeconds?: number;
}

export function verifySignature(params: VerifyParams): SignatureCheck {
  const { secret, timestamp, signature, rawBody } = params;
  if (!timestamp || !signature || !/^\d{1,12}$/.test(timestamp)) return "invalid_signature";

  const expected = signPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  const sameLength = a.length === b.length;
  // timingSafeEqual exige tamanhos iguais; compara contra si mesmo quando diferem para manter o custo parecido.
  const equal = timingSafeEqual(a, sameLength ? b : a) && sameLength;
  if (!equal) return "invalid_signature";

  const now = params.nowSeconds ?? Math.floor(Date.now() / 1000);
  const tolerance = params.toleranceSeconds ?? SIGNATURE_TOLERANCE_SECONDS;
  if (Math.abs(now - Number(timestamp)) > tolerance) return "timestamp_out_of_window";
  return "ok";
}

export interface WebhookResult {
  ok: boolean;
  httpStatus: number | null;
  error: string | null;
}

/** Envia um evento assinado. Usado pelo CRM e pelo ERP simples (uma tentativa, sem reenvio). */
export async function sendSignedWebhook(opts: {
  url: string;
  secret: string;
  eventId: string;
  body: unknown;
  timeoutMs?: number;
  nowSeconds?: number;
}): Promise<WebhookResult> {
  const raw = JSON.stringify(opts.body);
  const timestamp = String(opts.nowSeconds ?? Math.floor(Date.now() / 1000));
  try {
    const res = await fetch(opts.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-timestamp": timestamp,
        "x-event-id": opts.eventId,
        "x-signature": signPayload(opts.secret, timestamp, raw),
      },
      body: raw,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
    });
    return { ok: res.ok, httpStatus: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, httpStatus: null, error: err instanceof Error ? err.message : String(err) };
  }
}
