import { loadRootEnv, requireEnv, envInt } from "@ponte/shared";
import { buildErpApp } from "./app";

loadRootEnv();

const port = envInt("ERP_PORT", 4002);
const { app } = await buildErpApp({
  databaseUrl: requireEnv("ERP_DATABASE_URL"),
  apiKey: requireEnv("ERP_API_KEY"),
  ponteWebhookUrl: `${process.env.PONTE_URL ?? "http://localhost:4000"}/v1/webhooks/erp`,
  webhookSecret: requireEnv("ERP_WEBHOOK_SECRET"),
});

await app.listen({ port, host: "0.0.0.0" });
