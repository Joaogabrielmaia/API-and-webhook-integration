/**
 * Sobe os quatro serviços com a política de retentativa de DEMONSTRAÇÃO (esperas de segundos, não de minutos),
 * para que os cenários `erp-fora` e `reprocessar` terminem em poucos segundos.
 * A política padrão do estudo (30 s a 30 min, 12 tentativas) está em .env.example e no ADR-004.
 */
import { spawn } from "node:child_process";
import { findRepoRoot } from "@ponte/shared";

const child = spawn("npm", ["run", "dev"], {
  cwd: findRepoRoot(),
  stdio: "inherit",
  shell: true,
  env: { ...process.env, RETRY_BASE_MS: "500", RETRY_CAP_MS: "4000", RETRY_MAX_ATTEMPTS: "5", RECON_GRACE_SECONDS: "1", RECON_INTERVAL_SECONDS: "0" },
});
child.on("exit", (code) => process.exit(code ?? 0));
