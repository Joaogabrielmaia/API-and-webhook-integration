import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest, FastifyServerOptions } from "fastify";
import { ZodError } from "zod";
import { AppError, errorBody, getErrorDefinition, type ErrorCode } from "./errors";

export const fastifyDefaults = (logLevel: string = process.env.LOG_LEVEL ?? "info"): FastifyServerOptions => ({
  logger: logLevel === "silent" ? false : { level: logLevel },
  genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
});

export interface ErrorHandlingOptions {
  validationCode: ErrorCode;
  notFoundCode: ErrorCode;
}

/** Formato único de erro: { error: { code, message, requestId, details? } }. */
export function installErrorHandling(app: FastifyInstance, options: ErrorHandlingOptions): void {
  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send(errorBody(options.notFoundCode, "Rota não encontrada.", request.id));
  });

  app.setErrorHandler((err: unknown, request: FastifyRequest, reply: FastifyReply) => {
    if (err instanceof AppError) {
      return reply.status(err.httpStatus).send(errorBody(err.code, err.message, request.id, err.details));
    }
    const validationStatus = getErrorDefinition(options.validationCode)?.httpStatus ?? 400;
    if (err instanceof ZodError) {
      return reply
        .status(validationStatus)
        .send(errorBody(options.validationCode, "Dados fora do contrato.", request.id, { issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }));
    }
    const fastifyErr = err as { statusCode?: number; message?: string };
    if (fastifyErr.statusCode && fastifyErr.statusCode >= 400 && fastifyErr.statusCode < 500) {
      return reply.status(validationStatus).send(errorBody(options.validationCode, fastifyErr.message ?? "Requisição inválida.", request.id));
    }
    request.log.error({ err }, "erro não tratado");
    return reply.status(500).send(errorBody("PONTE-INT-001", "Erro interno inesperado.", request.id));
  });
}

/** Hook de autenticação por chave em cabeçalho (comparação simples; as chaves são locais e vêm do ambiente). */
export function apiKeyGuard(headerName: string, expected: string, code: ErrorCode, skipPaths: string[] = []) {
  return async (request: FastifyRequest): Promise<void> => {
    const path = request.url.split("?")[0] ?? "";
    if (skipPaths.some((p) => path === p || path.startsWith(`${p}/`))) return;
    if (request.headers[headerName.toLowerCase()] !== expected) throw new AppError(code);
  };
}

/**
 * Aceita corpo vazio com `content-type: application/json` (ex.: POST /pay sem corpo).
 * O parser padrão do Fastify responde 400 nesse caso, o que quebraria clientes simples.
 */
export function installLenientJson(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = String(body);
    if (text.trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch {
      const err = new Error("JSON inválido.") as Error & { statusCode: number };
      err.statusCode = 400;
      done(err, undefined);
    }
  });
}
