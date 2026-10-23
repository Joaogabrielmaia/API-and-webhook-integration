import { envInt, loadRootEnv } from "@ponte/shared";
import { buildPonteApp } from "./app";
import { configFromEnv } from "./config";

loadRootEnv();

const { app } = await buildPonteApp(configFromEnv());
await app.listen({ port: envInt("PONTE_PORT", 4000), host: "0.0.0.0" });
