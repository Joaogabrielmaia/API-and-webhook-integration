import { loadRootEnv, requireEnv, envInt } from "@ponte/shared";
import { buildCrmApp } from "./app";

loadRootEnv();

const port = envInt("CRM_PORT", 4001);
const { app } = await buildCrmApp({
  databaseUrl: requireEnv("CRM_DATABASE_URL"),
  apiKey: requireEnv("CRM_API_KEY"),
  ponteWebhookUrl: `${process.env.PONTE_URL ?? "http://localhost:4000"}/v1/webhooks/crm`,
  webhookSecret: requireEnv("CRM_WEBHOOK_SECRET"),
});

await app.listen({ port, host: "0.0.0.0" });
