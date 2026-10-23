import { defineWorkspace } from "vitest/config";

/**
 * Quatro projetos. Os de integração, contrato e falha usam bancos próprios (sufixo diferente)
 * para poderem ser executados em qualquer ordem sem interferir uns nos outros.
 */
export default defineWorkspace([
  {
    test: {
      name: "unit",
      include: ["apps/**/src/**/*.test.ts", "packages/**/src/**/*.test.ts"],
      environment: "node",
    },
  },
  {
    test: {
      name: "integration",
      include: ["tests/integration/**/*.test.ts"],
      globalSetup: ["tests/setup/integration.ts"],
      env: { TEST_DB_SUFFIX: "integration" },
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 90_000,
    },
  },
  {
    test: {
      name: "contract",
      include: ["tests/contract/**/*.test.ts"],
      globalSetup: ["tests/setup/contract.ts"],
      env: { TEST_DB_SUFFIX: "contract" },
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 90_000,
    },
  },
  {
    test: {
      name: "failure",
      include: ["tests/failure/**/*.test.ts"],
      globalSetup: ["tests/setup/failure.ts"],
      env: { TEST_DB_SUFFIX: "failure" },
      pool: "forks",
      poolOptions: { forks: { singleFork: true } },
      fileParallelism: false,
      testTimeout: 120_000,
      hookTimeout: 90_000,
    },
  },
]);
