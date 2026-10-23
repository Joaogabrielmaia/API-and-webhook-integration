import { describe, expect, it } from "vitest";
import { SIGNATURE_TOLERANCE_SECONDS, signPayload, verifySignature } from "./hmac";

const secret = "segredo-de-teste";
const body = JSON.stringify({ id: "x", type: "deal.won" });
const now = 1_767_225_600;
const ts = String(now);

describe("HMAC do webhook (ADR-009)", () => {
  it("aceita assinatura correta dentro da janela", () => {
    const signature = signPayload(secret, ts, body);
    expect(verifySignature({ secret, timestamp: ts, signature, rawBody: body, nowSeconds: now })).toBe("ok");
  });

  it("a assinatura tem o formato sha256=<hex de 64 caracteres>", () => {
    expect(signPayload(secret, ts, body)).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("rejeita corpo alterado em um byte", () => {
    const signature = signPayload(secret, ts, body);
    expect(verifySignature({ secret, timestamp: ts, signature, rawBody: body.replace("deal.won", "deal.wom"), nowSeconds: now })).toBe("invalid_signature");
  });

  it("rejeita segredo errado", () => {
    const signature = signPayload("outro-segredo", ts, body);
    expect(verifySignature({ secret, timestamp: ts, signature, rawBody: body, nowSeconds: now })).toBe("invalid_signature");
  });

  it("rejeita timestamp diferente do assinado", () => {
    const signature = signPayload(secret, ts, body);
    expect(verifySignature({ secret, timestamp: String(now + 1), signature, rawBody: body, nowSeconds: now })).toBe("invalid_signature");
  });

  it.each([[undefined], [""], ["sha256=abc"], ["lixo"]])("rejeita assinatura ausente ou malformada: %j", (signature) => {
    expect(verifySignature({ secret, timestamp: ts, signature, rawBody: body, nowSeconds: now })).toBe("invalid_signature");
  });

  it.each([[undefined], [""], ["abc"], ["-1"]])("rejeita timestamp ausente ou malformado: %j", (timestamp) => {
    expect(verifySignature({ secret, timestamp, signature: signPayload(secret, ts, body), rawBody: body, nowSeconds: now })).toBe("invalid_signature");
  });

  it("rejeita replay fora da janela de 5 minutos, para o passado e para o futuro", () => {
    const old = String(now - SIGNATURE_TOLERANCE_SECONDS - 1);
    const future = String(now + SIGNATURE_TOLERANCE_SECONDS + 1);
    expect(verifySignature({ secret, timestamp: old, signature: signPayload(secret, old, body), rawBody: body, nowSeconds: now })).toBe("timestamp_out_of_window");
    expect(verifySignature({ secret, timestamp: future, signature: signPayload(secret, future, body), rawBody: body, nowSeconds: now })).toBe("timestamp_out_of_window");
  });

  it("aceita no limite exato da janela", () => {
    const edge = String(now - SIGNATURE_TOLERANCE_SECONDS);
    expect(verifySignature({ secret, timestamp: edge, signature: signPayload(secret, edge, body), rawBody: body, nowSeconds: now })).toBe("ok");
  });
});
