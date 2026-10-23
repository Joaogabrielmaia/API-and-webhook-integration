/**
 * Executa a suíte de verdade (Vitest e Playwright) e grava a saída bruta em docs/05-qualidade/resultados/.
 * O print "execução dos testes" é renderizado a partir desse arquivo (npm run test:print).
 * Nada aqui é digitado à mão: se um teste falhar, a falha fica registrada.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@ponte/shared";

const root = findRepoRoot();
const out = join(root, "docs", "05-qualidade", "resultados");
mkdirSync(out, { recursive: true });

const noise = /FSTDEP|DEP0190|--trace-|^\[WebServer\] \{"level"/;
const clean = (text: string): string =>
  text
    .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
    .split(/\r?\n/)
    .filter((line) => !noise.test(line))
    .join("\n");

function run(label: string, command: string, args: string[]): { label: string; command: string; code: number; output: string; seconds: number } {
  const started = Date.now();
  const res = spawnSync(command, args, { cwd: root, encoding: "utf8", shell: true, maxBuffer: 128 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
  return { label, command: [command, ...args].join(" "), code: res.status ?? 1, output: clean(`${res.stdout ?? ""}${res.stderr ?? ""}`), seconds: Math.round((Date.now() - started) / 100) / 10 };
}

const startedAt = new Date().toISOString();
const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).stdout.trim();
const runs = [run("Vitest (unitário, integração, contrato e falha injetada)", "npx", ["vitest", "run"]), run("Playwright (E2E e prints)", "npx", ["playwright", "test"])];

const header = [`Execução registrada em ${startedAt}`, `Commit: ${git || "(sem commit)"}`, `Node ${process.version} · ${process.platform}`, ""];
const full = [...header];
for (const r of runs) full.push(`$ ${r.command}`, `(${r.label}; código de saída ${r.code}; ${r.seconds} s)`, r.output.trim(), "");
writeFileSync(join(out, "execucao-dos-testes-completa.txt"), `${full.join("\n")}\n`, "utf8");

// Versão para o print: só as linhas de arquivo e de resumo (as linhas de teste lentos ficam no arquivo completo).
const keep = (line: string): boolean => /^\s?(✓|❯|×|✘)\s/.test(line) || /^\s*(Test Files|Tests|Duration|Start at)\s/.test(line) || /^\s+\d+ passed|^\s+\d+ failed/.test(line) || /^\s*✓\s+\d+\s+e2e/.test(line) || /^\s*✘/.test(line);
const view = [...header];
for (const r of runs) {
  view.push(`$ ${r.command}`);
  view.push(...r.output.split("\n").filter((l) => keep(l) && !/^\s{3,}[✓×]/.test(l)));
  view.push(`(código de saída ${r.code}; ${r.seconds} s)`, "");
}
writeFileSync(join(out, "execucao-dos-testes.txt"), `${view.join("\n")}\n`, "utf8");

console.log(view.join("\n"));
process.exit(runs.every((r) => r.code === 0) ? 0 : 1);
