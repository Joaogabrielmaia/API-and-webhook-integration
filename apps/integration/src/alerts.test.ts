import { describe, expect, it } from "vitest";
import { evaluateAlerts, type AlertInput } from "./alerts";

const now = new Date("2026-03-10T15:00:00.000Z");
const worker = { running: true, paused: false, lastTickAt: now.toISOString() };
const base: AlertInput = { now, oldestDueAgeSeconds: null, deadLetterCount: 0, oldestDeadAt: null, worker };
const limits = { stallSeconds: 300 };

describe("evaluateAlerts (ADR-012)", () => {
  it("sem trabalho vencido e sem falhas: nenhum alerta", () => {
    expect(evaluateAlerts(base, limits)).toEqual([]);
  });

  it("espera abaixo do limite não alerta, no limite alerta", () => {
    expect(evaluateAlerts({ ...base, oldestDueAgeSeconds: 299.9 }, limits)).toEqual([]);
    const [alert] = evaluateAlerts({ ...base, oldestDueAgeSeconds: 300 }, limits);
    expect(alert).toMatchObject({ code: "QUEUE_STALLED", severity: "warning" });
  });

  it("vira crítico a partir de 3 vezes o limite", () => {
    expect(evaluateAlerts({ ...base, oldestDueAgeSeconds: 899 }, limits)[0]!.severity).toBe("warning");
    expect(evaluateAlerts({ ...base, oldestDueAgeSeconds: 900 }, limits)[0]!.severity).toBe("critical");
  });

  it("informa desde quando a fila está parada", () => {
    const [alert] = evaluateAlerts({ ...base, oldestDueAgeSeconds: 600 }, limits);
    expect(alert!.since).toBe("2026-03-10T14:50:00.000Z");
    expect(alert!.details).toMatchObject({ oldestDueAgeSeconds: 600, limitSeconds: 300 });
  });

  it("a mensagem diferencia worker pausado, parado e ativo", () => {
    const stalled = (w: typeof worker) => evaluateAlerts({ ...base, oldestDueAgeSeconds: 600, worker: w }, limits)[0]!.message;
    expect(stalled({ ...worker, paused: true })).toContain("pausado");
    expect(stalled({ ...worker, running: false })).toContain("não está em execução");
    expect(stalled(worker)).toContain("ativo");
    expect(stalled(worker)).toContain("10 min");
  });

  it("eventos na fila de falhas geram o alerta DEAD_LETTERS_PRESENT, independente da fila", () => {
    const oldest = new Date("2026-03-09T10:00:00.000Z");
    const alerts = evaluateAlerts({ ...base, deadLetterCount: 3, oldestDeadAt: oldest }, limits);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ code: "DEAD_LETTERS_PRESENT", severity: "warning", since: oldest.toISOString(), details: { count: 3 } });
  });

  it("os dois alertas podem coexistir", () => {
    const codes = evaluateAlerts({ ...base, oldestDueAgeSeconds: 400, deadLetterCount: 1 }, limits).map((a) => a.code);
    expect(codes).toEqual(["QUEUE_STALLED", "DEAD_LETTERS_PRESENT"]);
  });

  it("o limite é configurável", () => {
    expect(evaluateAlerts({ ...base, oldestDueAgeSeconds: 30 }, { stallSeconds: 20 })).toHaveLength(1);
    expect(evaluateAlerts({ ...base, oldestDueAgeSeconds: 30 }, { stallSeconds: 60 })).toHaveLength(0);
  });
});
