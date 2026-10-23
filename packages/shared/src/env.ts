import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";

/** Sobe a árvore de diretórios até achar a raiz do monorepo (onde está o .env.example). */
export function findRepoRoot(start: string = dirname(fileURLToPath(import.meta.url))): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".env.example")) && existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("Raiz do repositório não encontrada.");
    dir = parent;
  }
}

/** Carrega o .env da raiz (se existir). Variáveis já definidas no ambiente têm prioridade. */
export function loadRootEnv(): void {
  loadDotenv({ path: join(findRepoRoot(), ".env") });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value === "change-me") {
    throw new Error(`Variável de ambiente ${name} ausente ou com valor de exemplo. Rode "npm run setup" para gerar o .env local.`);
  }
  return value;
}

export function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`Variável ${name} não é numérica: ${raw}`);
  return n;
}
