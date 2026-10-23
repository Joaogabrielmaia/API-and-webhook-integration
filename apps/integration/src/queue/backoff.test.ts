import { describe, expect, it } from "vitest";
import { computeBackoffMs, totalBackoffMs } from "./backoff";

const prod = { baseMs: 30_000, capMs: 1_800_000, jitterRatio: 0.2 };
const noJitter = { ...prod, jitterRatio: 0 };

describe("computeBackoffMs (ADR-004)", () => {
  it("cresce exponencialmente até o teto: 30s, 60s, 120s, 240s, 480s, 960s, 1800s...", () => {
    const waits = [1, 2, 3, 4, 5, 6, 7, 8, 11].map((n) => computeBackoffMs(n, noJitter));
    expect(waits).toEqual([30_000, 60_000, 120_000, 240_000, 480_000, 960_000, 1_800_000, 1_800_000, 1_800_000]);
  });

  it("o jitter varia ±20% em torno do valor", () => {
    expect(computeBackoffMs(3, prod, () => 0)).toBe(96_000); // -20%
    expect(computeBackoffMs(3, prod, () => 0.5)).toBe(120_000); // centro
    expect(computeBackoffMs(3, prod, () => 0.999999)).toBeLessThanOrEqual(144_000); // +20%
    expect(computeBackoffMs(3, prod, () => 0.999999)).toBeGreaterThan(143_900);
  });

  it("o teto também recebe o jitter, nunca passa de teto × 1,2", () => {
    expect(computeBackoffMs(50, prod, () => 0.999999)).toBeLessThanOrEqual(2_160_000);
  });

  it("tentativa menor que 1 é tratada como 1", () => {
    expect(computeBackoffMs(0, noJitter)).toBe(30_000);
  });

  it("a janela da política padrão (12 tentativas) cobre as 2 h de indisponibilidade do ERP (RNF-03)", () => {
    // 11 esperas: 30+60+120+240+480+960 + 5×1800 = 10.890 s
    expect(totalBackoffMs(12, prod)).toBe(10_890_000);
    const worstCaseWithJitter = totalBackoffMs(12, prod) * 0.8;
    expect(worstCaseWithJitter).toBeGreaterThan(2 * 60 * 60 * 1000); // 2h25 no pior caso
  });
});
