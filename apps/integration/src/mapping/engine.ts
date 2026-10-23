import { z } from "zod";
import { AppError } from "@ponte/shared";
import { TRANSFORMS, TRANSFORM_NAMES, type TransformContext, type TransformName } from "./transforms";

/** Destinos permitidos (lista fechada). */
export const ALLOWED_TARGETS = [
  "customer.taxId",
  "customer.name",
  "customer.phone",
  "customer.email",
  "order.description",
  "order.totalCents",
  "invoice.dueDate",
] as const;
export type MappingTarget = (typeof ALLOWED_TARGETS)[number];

/** Sem estes destinos não existe pedido válido. */
export const REQUIRED_TARGETS: MappingTarget[] = ["customer.taxId", "customer.name", "order.description", "order.totalCents", "invoice.dueDate"];

export const mappingRuleSchema = z.object({
  target: z.string(),
  source: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  transform: z.string(),
  required: z.boolean().optional(),
});
export type MappingRule = z.infer<typeof mappingRuleSchema>;

export interface MappedOutput {
  customer: { taxId: string; name: string; phone?: string; email?: string };
  order: { description: string; totalCents: number };
  invoice: { dueDate: string };
}

const outputSchema = z.object({
  customer: z.object({
    taxId: z.string().regex(/^\d{14}$/),
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
  }),
  order: z.object({ description: z.string().min(1), totalCents: z.number().int().positive() }),
  invoice: z.object({ dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
});

/** Valida a configuração: destinos e transformações da lista fechada e cobertura dos destinos obrigatórios. */
export function validateMappingRules(rules: unknown): MappingRule[] {
  const parsed = z.array(mappingRuleSchema).min(1).safeParse(rules);
  if (!parsed.success) {
    throw new AppError("PONTE-MAP-001", "Mapeamento fora do formato esperado.", { issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  const problems: string[] = [];
  for (const rule of parsed.data) {
    if (!(ALLOWED_TARGETS as readonly string[]).includes(rule.target)) problems.push(`Destino não permitido: ${rule.target}`);
    if (!(TRANSFORM_NAMES as string[]).includes(rule.transform)) problems.push(`Transformação não permitida: ${rule.transform}`);
  }
  const covered = new Set(parsed.data.map((r) => r.target));
  for (const target of REQUIRED_TARGETS) {
    if (!covered.has(target)) problems.push(`Destino obrigatório sem regra: ${target}`);
  }
  const duplicates = parsed.data.map((r) => r.target).filter((t, i, all) => all.indexOf(t) !== i);
  for (const dup of new Set(duplicates)) problems.push(`Destino com mais de uma regra: ${dup}`);
  if (problems.length > 0) throw new AppError("PONTE-MAP-001", "Mapeamento inválido.", { problems });
  return parsed.data;
}

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => (acc !== null && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined), source);
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const [group, field] = path.split(".") as [string, string];
  const bucket = (target[group] ??= {}) as Record<string, unknown>;
  bucket[field] = value;
}

const isMissing = (v: unknown): boolean => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

export interface MappingResult {
  output: MappedOutput;
  warnings: string[];
}

/** Aplica as regras ao conteúdo do evento (`data`) e valida o resultado. */
export function applyMapping(rules: MappingRule[], data: unknown, options: { defaultPaymentTermDays: number }): MappingResult {
  const ctx: TransformContext = { defaultPaymentTermDays: options.defaultPaymentTermDays, warnings: [] };
  const out: Record<string, unknown> = {};

  for (const rule of rules) {
    const sources = Array.isArray(rule.source) ? rule.source : [rule.source];
    const values = sources.map((s) => getPath(data, s));
    const required = rule.required ?? true;
    // O primeiro campo de origem é o "principal": se faltar e a regra é obrigatória, é erro de dado.
    if (isMissing(values[0]) && required) {
      throw new AppError("PONTE-VAL-004", `Campo obrigatório ausente na origem: ${sources[0]} (destino ${rule.target}).`, { source: sources[0], target: rule.target });
    }
    if (isMissing(values[0]) && !required) continue;
    const transform = TRANSFORMS[rule.transform as TransformName];
    const result = transform(values, ctx);
    if (result !== undefined) setPath(out, rule.target, result);
  }

  const checked = outputSchema.safeParse(out);
  if (!checked.success) {
    throw new AppError("PONTE-VAL-004", "O resultado do mapeamento não tem todos os campos obrigatórios.", { issues: checked.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
  }
  return { output: checked.data, warnings: ctx.warnings };
}
