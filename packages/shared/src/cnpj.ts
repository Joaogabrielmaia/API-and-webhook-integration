export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function checkDigit(base: string): number {
  let weight = base.length - 7;
  let sum = 0;
  for (const ch of base) {
    sum += Number(ch) * weight--;
    if (weight < 2) weight = 9;
  }
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Valida 14 dígitos e os dois dígitos verificadores. Rejeita sequências repetidas (00000000000000 etc.). */
export function isValidCnpj(input: string): boolean {
  const digits = onlyDigits(input);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const d1 = checkDigit(digits.slice(0, 12));
  const d2 = checkDigit(digits.slice(0, 12) + d1);
  return digits.endsWith(`${d1}${d2}`);
}

export function formatCnpj(digits: string): string {
  const d = onlyDigits(digits).padStart(14, "0");
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

/** Gera um CNPJ válido a partir de 12 dígitos-base (para dados de demonstração e testes). */
export function cnpjFromBase(base12: string): string {
  const base = onlyDigits(base12).padStart(12, "0").slice(0, 12);
  const d1 = checkDigit(base);
  const d2 = checkDigit(base + d1);
  return `${base}${d1}${d2}`;
}
