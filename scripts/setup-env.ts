/**
 * Gera o .env local a partir do .env.example, trocando cada "change-me" por um segredo aleatório.
 * Não sobrescreve um .env existente (use --force para recriar).
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@ponte/shared";

const root = findRepoRoot();
const target = join(root, ".env");

if (existsSync(target) && !process.argv.includes("--force")) {
  console.log(".env já existe; nada a fazer. Use --force para recriar.");
  process.exit(0);
}

const template = readFileSync(join(root, ".env.example"), "utf8");
const out = template
  .split("\n")
  .map((line) => (line.endsWith("=change-me") ? `${line.slice(0, -"change-me".length)}${randomBytes(24).toString("hex")}` : line))
  .join("\n");

writeFileSync(target, out, { encoding: "utf8" });
console.log(".env criado com segredos aleatórios locais (não versionado).");
