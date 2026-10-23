/**
 * Gera docs/04-contratos-de-api/catalogo-de-erros.md a partir da mesma fonte que o código usa
 * (packages/shared/src/errors.ts). Rode: npm run docs:errors
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { ERROR_CATALOG, findRepoRoot, type ErrorDefinition } from "@ponte/shared";

const cell = (text: string): string => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

const groups: { service: ErrorDefinition["service"]; title: string; intro: string; filter?: (e: ErrorDefinition) => boolean }[] = [
  { service: "PONTE", title: "Ponte: recebimento de webhooks e requisições", intro: "Erros devolvidos pela API da Ponte. O corpo segue `{ error: { code, message, requestId, details? } }`.", filter: (e) => /PONTE-(AUTH|REQ|ADM|MAP)-/.test(e.code) },
  { service: "PONTE", title: "Ponte: validação de dados (erros permanentes)", intro: "Acontecem no processamento do evento, antes de qualquer chamada ao ERP. O evento vai direto para a fila de falhas, sem retentativa.", filter: (e) => e.code.startsWith("PONTE-VAL-") },
  { service: "PONTE", title: "Ponte: chamadas ao ERP e ao CRM", intro: "Falhas ao falar com os sistemas. Temporárias são retentadas com backoff; permanentes vão à fila de falhas. A coluna HTTP vale quando o erro é devolvido por uma rota (por exemplo, a reconciliação manual).", filter: (e) => /PONTE-(ERP|CRM)-/.test(e.code) },
  { service: "PONTE", title: "Ponte: sincronização e ordem dos eventos", intro: "`SYNC-001` é temporário; os demais fazem o evento terminar como `IGNORED`, que não é erro.", filter: (e) => e.code.startsWith("PONTE-SYNC-") },
  { service: "PONTE", title: "Ponte: erro interno", intro: "Exceção não prevista; tratada como temporária.", filter: (e) => e.code.startsWith("PONTE-INT-") },
  { service: "CRM", title: "CRM simples", intro: "Sistema simples criado neste repositório." },
  { service: "ERP", title: "ERP simples", intro: "Sistema simples criado neste repositório." },
];

const lines: string[] = [
  "# Catálogo de erros",
  "",
  "> Este arquivo é **gerado** por `npm run docs:errors` a partir de `packages/shared/src/errors.ts`, a mesma fonte usada pelo código, pela API (`GET /v1/admin/errors`) e pelo painel. Não edite à mão.",
  "",
  "**Tipo:** *temporário* = a Ponte retenta com backoff (até 12 tentativas na política padrão); *permanente* = vai direto para a fila de falhas. Eventos `IGNORED` (obsoletos ou já vinculados) não são falhas.",
  "",
];

for (const g of groups) {
  const rows = ERROR_CATALOG.filter((e) => e.service === g.service && (g.filter ? g.filter(e) : true));
  if (rows.length === 0) continue;
  lines.push(`## ${g.title}`, "", g.intro, "", "| Código | HTTP | Tipo | Causa | Ação recomendada |", "|---|---|---|---|---|");
  for (const e of rows) {
    lines.push(`| \`${e.code}\` | ${e.httpStatus ?? "—"} | ${e.retryable ? "temporário" : "permanente"} | **${cell(e.title)}.** ${cell(e.cause)} | ${cell(e.action)} |`);
  }
  lines.push("");
}

const target = join(findRepoRoot(), "docs", "04-contratos-de-api", "catalogo-de-erros.md");
writeFileSync(target, `${lines.join("\n")}\n`, "utf8");
console.log(`Catálogo gerado: ${ERROR_CATALOG.length} códigos em ${target}`);
