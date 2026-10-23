/**
 * Mantém docs/05-qualidade/falha-injetada.md igual ao JSON gravado pelo teste (tests/failure/erp-down-batch.test.ts).
 * Os números variam a cada execução; o documento nunca deve citar valores que não estejam no arquivo.
 * Rode depois de `npm run test:failure`: npm run docs:failure
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { findRepoRoot } from "@ponte/shared";

const root = findRepoRoot();
const dir = join(root, "docs", "05-qualidade");
const a = JSON.parse(readFileSync(join(dir, "resultados", "falha-injetada-cenario-a.json"), "utf8"));
const b = JSON.parse(readFileSync(join(dir, "resultados", "falha-injetada-cenario-b.json"), "utf8"));
const n = (v: number): string => v.toLocaleString("pt-BR");

const file = join(dir, "falha-injetada.md");
let doc = readFileSync(file, "utf8");
const set = (label: string, value: string): void => {
  const re = new RegExp(`(\\| ${label.replace(/[()]/g, "\\$&")} \\| )[^|]*( \\|)`);
  if (!re.test(doc)) throw new Error(`Linha não encontrada no documento: ${label}`);
  doc = doc.replace(re, `$1${value}$2`);
};

set("Eventos já processados quando o ERP caiu", String(a.processadosAntesDaQueda));
set("Eventos em retentativa durante a queda", String(a.eventosEmRetentativaDuranteAQueda));
set("Duração da queda", `${n(a.duracaoDaQuedaMs)} ms`);
set("Tempo do lote inteiro", `${n(a.tempoTotalDoLoteMs)} ms`);
set("Estado final dos 20 eventos", `${a.eventosPorStatusFinal.PROCESSED} \`PROCESSED\``);
set("Eventos que precisaram de mais de uma tentativa", String(a.eventosQuePrecisaramDeRetentativa));
set("Maior número de tentativas de um evento", String(a.maiorNumeroDeTentativas));
set("ERP: clientes, pedidos, cobranças", `${a.erp.clientes}, ${a.erp.pedidos}, ${a.erp.cobrancas}`);
set("Tentativas registradas no total", `${b.tentativasRegistradasNoTotal} (5 × 4 que falharam + 5 de sucesso)`);
writeFileSync(file, doc, "utf8");
console.log("falha-injetada.md sincronizado com os JSON gravados.");
console.log(`A: retentativa ${a.eventosEmRetentativaDuranteAQueda}, queda ${a.duracaoDaQuedaMs} ms, lote ${a.tempoTotalDoLoteMs} ms, ${a.eventosQuePrecisaramDeRetentativa} com retentativa; B: ${b.tentativasRegistradasNoTotal} tentativas.`);
