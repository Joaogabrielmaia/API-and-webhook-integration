/**
 * Pilha dedicada ao E2E (Playwright): bancos *_e2e limpos a cada execução, portas 4100 a 4103 e uma política de
 * retentativa curta o bastante para a tela "em retentativa" durar alguns segundos. Não toca nos dados de desenvolvimento.
 */
import { createServer } from "node:http";
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

// Controle só da pilha E2E (porta 4199): permite ao roteiro pausar o worker e "envelhecer" a fila para exibir o alerta da v1.1.
const control = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1:4199");
  if (url.pathname === "/pause") stack.ponte.worker.pause();
  else if (url.pathname === "/resume") stack.ponte.worker.resume();
  else if (url.pathname === "/age") {
    const seconds = Number(url.searchParams.get("seconds") ?? "400");
    await stack.ponte.prisma.job.updateMany({ where: { state: "PENDING" }, data: { runAt: new Date(Date.now() - seconds * 1000) } });
  } else {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, worker: stack.ponte.worker.state }));
});
await new Promise<void>((resolve) => control.listen(4199, "127.0.0.1", resolve));

console.log(`Pilha E2E no ar: CRM ${stack.urls.crm}, ERP ${stack.urls.erp}, Ponte ${stack.urls.ponte}, painel http://127.0.0.1:4103`);
const stop = async () => {
  control.close();
  await consoleApp.close();
  await stack.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
