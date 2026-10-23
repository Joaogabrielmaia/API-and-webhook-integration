import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { findRepoRoot, loadRootEnv, requireEnv } from "@ponte/shared";
import { PrismaClient } from "../../apps/mock-crm/src/generated/client";

export const APPS = [
  { app: "mock-crm", db: "crm", envVar: "CRM_DATABASE_URL" },
  { app: "mock-erp", db: "erp", envVar: "ERP_DATABASE_URL" },
  { app: "integration", db: "ponte", envVar: "PONTE_DATABASE_URL" },
] as const;

/** URL do banco de teste: mesmo servidor do .env, nome `<db>_<sufixo>`. */
export function testDatabaseUrl(envVar: string, db: string, suffix: string): string {
  const url = new URL(requireEnv(envVar));
  url.pathname = `/${db}_${suffix}`;
  return url.toString();
}

/** Cria (se faltar) e migra os três bancos do projeto de teste. Não toca nos bancos de desenvolvimento. */
export async function prepareDatabases(suffix: string): Promise<void> {
  loadRootEnv();
  const adminUrl = new URL(requireEnv("CRM_DATABASE_URL"));
  adminUrl.pathname = "/postgres";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    for (const { db } of APPS) {
      const name = `${db}_${suffix}`;
      const rows = await admin.$queryRawUnsafe<{ exists: boolean }[]>(`SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${name}') AS exists`);
      if (!rows[0]?.exists) await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  const root = findRepoRoot();
  for (const { app, db, envVar } of APPS) {
    execFileSync("npx", ["prisma", "migrate", "deploy", "--schema", join(root, "apps", app, "prisma", "schema.prisma")], {
      cwd: root,
      env: { ...process.env, [envVar]: testDatabaseUrl(envVar, db, suffix) },
      stdio: "pipe",
      shell: process.platform === "win32",
    });
  }
}
