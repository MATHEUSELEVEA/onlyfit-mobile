/** Espelha o helper de CPF do v1: apenas dígitos, máximo 11. */
export function normalizeCpf(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '').slice(0, 11);
}

/** Valida CPF pelos dígitos verificadores (idêntico ao v1). */
export function isValidCpf(value: string | null | undefined): boolean {
  const digits = normalizeCpf(value);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  const calcCheck = (base: string, factor: number) => {
    let total = 0;
    for (const char of base) {
      total += Number(char) * factor;
      factor -= 1;
    }
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const first = calcCheck(digits.slice(0, 9), 10);
  const second = calcCheck(digits.slice(0, 10), 11);
  return first === Number(digits[9]) && second === Number(digits[10]);
}

/** Formata `00000000000` como `000.000.000-00` (só quando tem 11 dígitos). */
export function formatCpf(value: string): string {
  return value.length === 11
    ? value.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
    : value;
}
