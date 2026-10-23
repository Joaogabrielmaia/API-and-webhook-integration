import { envInt, loadRootEnv, requireEnv } from "@ponte/shared";
import { buildConsoleApp } from "./app";

loadRootEnv();

const app = await buildConsoleApp({ ponteUrl: process.env.PONTE_URL ?? "http://localhost:4000", adminKey: requireEnv("PONTE_ADMIN_KEY") });
await app.listen({ port: envInt("CONSOLE_PORT", 4003), host: "0.0.0.0" });
