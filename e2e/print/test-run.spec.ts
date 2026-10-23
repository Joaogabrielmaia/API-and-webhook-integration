/**
 * Renderiza a saída REAL da execução dos testes (docs/05-qualidade/resultados/execucao-dos-testes.txt)
 * como imagem, para o print "execução dos testes". Rode antes: npm run test:record
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

const file = "docs/05-qualidade/resultados/execucao-dos-testes.txt";

test("print da execução dos testes", async ({ page }) => {
  expect(existsSync(file), "rode `npm run test:record` antes").toBe(true);
  const text = readFileSync(file, "utf8").replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const colored = text
    .split("\n")
    .map((line) => {
      if (/^\s*(✓)/.test(line)) return `<span class="ok">${line}</span>`;
      if (/(❯|×|✘)/.test(line)) return `<span class="bad">${line}</span>`;
      if (/^\$ /.test(line)) return `<span class="cmd">${line}</span>`;
      if (/Test Files|Tests |passed/.test(line)) return `<span class="sum">${line}</span>`;
      return line;
    })
    .join("\n");
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#0f172a;padding:28px;font:13px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#cbd5e1}
    .bar{color:#64748b;margin-bottom:14px;font-size:12px}
    pre{margin:0;white-space:pre-wrap}
    .ok{color:#4ade80}.bad{color:#f87171}.cmd{color:#fbbf24;font-weight:700}.sum{color:#e2e8f0;font-weight:700}
  </style></head><body><div class="bar">Saída real gravada por scripts/record-test-run.ts — ${file}</div><pre>${colored}</pre></body></html>`);
  await page.setViewportSize({ width: 1180, height: 400 });
  await page.screenshot({ path: "docs/screenshots/15-execucao-dos-testes.png", fullPage: true });
});
