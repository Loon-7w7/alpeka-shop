const MAX_CENTS = 999_999_999;

/**
 * Lee un precio escrito por una persona sin usar decimales flotantes. Regresa null si no es válido.
 * Una coma seguida de 1 o 2 dígitos al final es decimal ("28,50"); si no, separa miles ("1,250").
 * Acepta ".50" y "5." como 0.50 y 5.00.
 */
export function parsePriceToCents(input: string): number | null {
  let text = input.replace(/[\s$]/g, '');
  if (text.includes(',') && !text.includes('.') && /,\d{1,2}$/.test(text)) text = text.replace(',', '.');
  text = text.replace(/,/g, '');
  if (!/^(\d+\.?\d{0,2}|\.\d{1,2})$/.test(text)) return null;
  const [whole = '', decimals = ''] = text.split('.');
  const cents = Number(whole || '0') * 100 + Number(decimals.padEnd(2, '0'));
  return cents > 0 && cents <= MAX_CENTS ? cents : null;
}

export function formatCents(cents: number): string {
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${whole}.${String(cents % 100).padStart(2, '0')}`;
}

export function centsToInput(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function isValidCents(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) > 0 && (value as number) <= MAX_CENTS;
}
