import { defineConfig } from "@playwright/test";

// Sem pilha de serviços: só renderiza a saída gravada dos testes em imagem.
export default defineConfig({
  testDir: "e2e/print",
  testMatch: /.*\.spec\.ts/,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
});
