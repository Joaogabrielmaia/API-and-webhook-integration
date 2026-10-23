/**
 * Pilha dedicada ao E2E (Playwright): bancos *_e2e limpos a cada execução, portas 4100 a 4103 e uma política de
 * retentativa curta o bastante para a tela "em retentativa" durar alguns segundos. Não toca nos dados de desenvolvimento.
 */
import { buildConsoleApp } from "@ponte/console";
import { prepareDatabases } from "../tests/setup/db";
import { KEYS, Stack } from "../tests/helpers/stack";

process.env.TEST_DB_SUFFIX = "e2e";
await prepareDatabases("e2e");

const stack = await Stack.start({
  ports: { crm: 4101, erp: 4102, ponte: 4100 },
  ponte: { retry: { maxAttempts: 5, baseMs: 800, capMs: 2400, jitterRatio: 0 }, httpTimeoutMs: 3000, logLevel: "warn" },
});
await stack.reset();

const consoleApp = await buildConsoleApp({ ponteUrl: stack.urls.ponte, adminKey: KEYS.admin, logLevel: "warn" });
await consoleApp.listen({ port: 4103, host: "127.0.0.1" });

console.log(`Pilha E2E no ar: CRM ${stack.urls.crm}, ERP ${stack.urls.erp}, Ponte ${stack.urls.ponte}, painel http://127.0.0.1:4103`);
const stop = async () => {
  await consoleApp.close();
  await stack.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
