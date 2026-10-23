export interface BackoffPolicy {
  baseMs: number;
  capMs: number;
  /** Fração de variação aleatória (0,2 = ±20%). */
  jitterRatio: number;
}

/**
 * Espera antes da próxima tentativa, depois que a tentativa `attempt` (1, 2, 3...) falhou.
 * espera(n) = min(teto, base × 2^(n−1)) × (1 ± jitter)   (ADR-004)
 * `random` é injetável para os testes (valor em [0, 1)).
 */
export function computeBackoffMs(attempt: number, policy: BackoffPolicy, random: () => number = Math.random): number {
  const n = Math.max(1, Math.floor(attempt));
  const exponential = policy.baseMs * 2 ** (n - 1);
  const capped = Math.min(policy.capMs, exponential);
  const factor = 1 + (random() * 2 - 1) * policy.jitterRatio;
  return Math.max(0, Math.round(capped * factor));
}

/** Soma das esperas sem jitter, para documentar a janela coberta (RNF-03). */
export function totalBackoffMs(maxAttempts: number, policy: Pick<BackoffPolicy, "baseMs" | "capMs">): number {
  let total = 0;
  for (let n = 1; n < maxAttempts; n++) total += computeBackoffMs(n, { ...policy, jitterRatio: 0 });
  return total;
}
