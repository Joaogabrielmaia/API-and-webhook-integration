import { AppError, isValidCnpj, onlyDigits } from "@ponte/shared";
import { DEFAULT_TERM_DAYS, MAX_TERM_DAYS, MAX_VALUE_CENTS, MIN_TERM_DAYS } from "../rules";

export interface TransformContext {
  defaultPaymentTermDays: number;
  warnings: string[];
}

export type TransformFn = (values: unknown[], ctx: TransformContext) => string | number | undefined;

const first = (values: unknown[]): unknown => values[0];
const asText = (value: unknown): string => (value === null || value === undefined ? "" : String(value));

export function trim(value: unknown): string | undefined {
  const text = asText(value).trim();
  return text === "" ? undefined : text;
}

/** D1: máscara fora, 14 dígitos e dígito verificador válidos. */
export function cnpjDigits(value: unknown): string {
  const digits = onlyDigits(asText(value));
  if (!isValidCnpj(digits)) {
    throw new AppError("PONTE-VAL-001", `CNPJ inválido: "${asText(value)}" (esperado 14 dígitos com dígito verificador válido).`, { value: asText(value) });
  }
  return digits;
}

/** D2: telefone brasileiro em dígitos com país (55). Valor impossível é omitido com aviso. */
export function phoneE164BR(value: unknown, ctx?: TransformContext): string | undefined {
  const raw = asText(value);
  if (raw.trim() === "") return undefined;
  const digits = onlyDigits(raw).replace(/^0+/, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  ctx?.warnings.push(`Telefone descartado por formato inesperado: "${raw}".`);
  return undefined;
}

/** D5: minúsculas e formato mínimo; inválido é omitido com aviso. */
export function emailLower(value: unknown, ctx?: TransformContext): string | undefined {
  const text = asText(value).trim().toLowerCase();
  if (text === "") return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    ctx?.warnings.push(`E-mail descartado por formato inválido: "${asText(value)}".`);
    return undefined;
  }
  return text;
}

/**
 * D3: texto pt-BR para centavos, sem ponto flutuante.
 * Aceita "12.500,50", "12500,50", "12500.50", "12.500" (milhar), "R$ 12.500,50" e "12500".
 */
export function moneyToCents(value: unknown): number {
  const original = asText(value);
  const invalid = (reason: string) => new AppError("PONTE-VAL-002", `Valor inválido: "${original}" (${reason}).`, { value: original });

  const s = original.replace(/R\$/i, "").replace(/\s+/g, "");
  if (s === "") throw invalid("vazio");
  if (!/^\d[\d.,]*$/.test(s)) throw invalid("caracteres não numéricos");

  let intPart: string;
  let frac = "";
  if (s.includes(",")) {
    const idx = s.lastIndexOf(",");
    intPart = s.slice(0, idx).replace(/\./g, "");
    frac = s.slice(idx + 1);
    if (!/^\d{1,2}$/.test(frac)) throw invalid("centavos devem ter 1 ou 2 dígitos");
  } else if (s.includes(".")) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      intPart = s.replace(/\./g, "");
    } else if (/^\d+\.\d{1,2}$/.test(s)) {
      [intPart, frac] = s.split(".") as [string, string];
    } else {
      throw invalid("formato de separadores ambíguo");
    }
  } else {
    intPart = s;
  }
  if (!/^\d{1,10}$/.test(intPart)) throw invalid("número grande demais ou mal formado");

  const cents = Number(intPart) * 100 + Number(frac.padEnd(2, "0"));
  if (cents <= 0) throw invalid("deve ser maior que zero");
  if (cents > MAX_VALUE_CENTS) throw invalid("acima do limite de R$ 1.000.000,00");
  return cents;
}

/** Data (AAAA-MM-DD) no fuso de Brasília. */
export function brasiliaDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new AppError("PONTE-VAL-004", `Data inválida: "${iso}".`, { value: iso });
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const result = new Date(Date.UTC(y, m - 1, d + days));
  return result.toISOString().slice(0, 10);
}

/** D4: vencimento = data do ganho (fuso de Brasília) + prazo. Prazo ausente usa o padrão (RN-05). */
export function dueDateFromTerm(wonAt: unknown, term: unknown, defaultTerm: number = DEFAULT_TERM_DAYS): string {
  const days = term === null || term === undefined || term === "" ? defaultTerm : Number(term);
  if (!Number.isInteger(days) || days < MIN_TERM_DAYS || days > MAX_TERM_DAYS) {
    throw new AppError("PONTE-VAL-003", `Prazo inválido: ${asText(term)} (esperado inteiro de ${MIN_TERM_DAYS} a ${MAX_TERM_DAYS} dias).`, { value: asText(term) });
  }
  return addDays(brasiliaDate(asText(wonAt)), days);
}

/** Lista fechada de transformações permitidas na configuração (ADR-008). */
export const TRANSFORMS = {
  trim: (v) => trim(first(v)),
  cnpjDigits: (v) => cnpjDigits(first(v)),
  phoneE164BR: (v, ctx) => phoneE164BR(first(v), ctx),
  emailLower: (v, ctx) => emailLower(first(v), ctx),
  moneyToCents: (v) => moneyToCents(first(v)),
  dueDateFromTerm: (v, ctx) => dueDateFromTerm(v[0], v[1], ctx.defaultPaymentTermDays),
} satisfies Record<string, TransformFn>;

export type TransformName = keyof typeof TRANSFORMS;
export const TRANSFORM_NAMES = Object.keys(TRANSFORMS) as TransformName[];
