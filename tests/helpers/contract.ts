import { join } from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { findRepoRoot } from "@ponte/shared";
import type { Json } from "./stack";

const AjvCtor = ((Ajv as unknown as { default?: typeof Ajv }).default ?? Ajv) as typeof Ajv;
const addFormatsFn = ((addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats) as typeof addFormats;

const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** Teste de contrato: valida respostas (e corpos de requisição) reais contra um documento OpenAPI. */
export class Contract {
  readonly covered = new Set<string>();
  private readonly ajv = new AjvCtor({ strict: false, allErrors: true });

  private constructor(
    readonly name: string,
    private readonly api: any,
  ) {
    addFormatsFn(this.ajv);
  }

  static async load(file: string, name: string): Promise<Contract> {
    const path = join(findRepoRoot(), "docs", "04-contratos-de-api", file);
    await SwaggerParser.validate(path); // o documento em si é um OpenAPI 3 válido
    const api = await SwaggerParser.dereference(path);
    return new Contract(name, api);
  }

  operations(): string[] {
    const ops: string[] = [];
    for (const [path, item] of Object.entries<any>(this.api.paths)) {
      for (const method of METHODS) if (item[method]) ops.push(`${method} ${path}`);
    }
    return ops;
  }

  private validate(schema: unknown, value: unknown, where: string): void {
    const validate = this.ajv.compile(schema as object);
    if (!validate(value)) {
      throw new Error(`Contrato ${this.name} violado em ${where}:\n${this.ajv.errorsText(validate.errors, { separator: "\n  " })}\nValor: ${JSON.stringify(value, null, 2).slice(0, 800)}`);
    }
  }

  /** Confere status documentado, corpo e cabeçalhos da resposta. `template` usa a notação do OpenAPI, ex.: /v1/deals/{id}. */
  check(template: string, method: (typeof METHODS)[number], res: Json, requestBody?: unknown): void {
    const op = this.api.paths?.[template]?.[method];
    if (!op) throw new Error(`Operação não documentada: ${method.toUpperCase()} ${template}`);
    this.covered.add(`${method} ${template}`);
    const where = `${method.toUpperCase()} ${template} → ${res.status}`;

    if (requestBody !== undefined) {
      const reqSchema = op.requestBody?.content?.["application/json"]?.schema;
      if (!reqSchema) throw new Error(`${where}: o contrato não documenta corpo de requisição`);
      this.validate(reqSchema, requestBody, `${where} (requisição)`);
    }

    const response = op.responses?.[String(res.status)] ?? op.responses?.default;
    if (!response) throw new Error(`${where}: status não documentado (documentados: ${Object.keys(op.responses).join(", ")})`);

    const schema = response.content?.["application/json"]?.schema;
    if (schema) this.validate(schema, res.body, where);
    else if (res.body !== null && res.body !== undefined) throw new Error(`${where}: o contrato não documenta corpo, mas veio ${JSON.stringify(res.body)}`);

    for (const [header, def] of Object.entries<any>(response.headers ?? {})) {
      const value = res.headers.get(header.toLowerCase());
      if (value === null) throw new Error(`${where}: cabeçalho documentado ausente: ${header}`);
      if (def.schema) this.validate(def.schema, value, `${where} (cabeçalho ${header})`);
    }
  }

  schema(name: string): unknown {
    const schema = this.api.components?.schemas?.[name];
    if (!schema) throw new Error(`Esquema inexistente: ${name}`);
    return schema;
  }

  validateAgainstSchema(name: string, value: unknown): void {
    this.validate(this.schema(name), value, `esquema ${name}`);
  }

  assertFullCoverage(): void {
    const missing = this.operations().filter((op) => !this.covered.has(op));
    if (missing.length > 0) throw new Error(`Operações do contrato ${this.name} sem teste:\n  ${missing.join("\n  ")}`);
  }
}
