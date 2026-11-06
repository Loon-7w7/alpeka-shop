/** Un UPC-A y su forma EAN-13 (con 0 inicial) son el mismo producto: se guarda siempre la de 13 dígitos. */
export function normalizeBarcode(raw: string, type?: string): string {
  const clean = raw.replace(/[\s\u0000-\u001f]/g, '');
  if (!/^\d+$/.test(clean)) return clean.toUpperCase();
  const digits = type && /upc[_-]?e/i.test(type) ? expandUpcE(clean) : clean;
  return digits.length === 12 ? `0${digits}` : digits;
}

export function isValidBarcode(code: string): boolean {
  return /^[0-9A-Z\-._$/+%]{4,48}$/.test(code);
}

/**
 * Formas en que pudo guardarse el mismo código. Un número de 8 dígitos puede ser EAN-8 o UPC-E,
 * y el escáner expande el UPC-E: así lo escaneado y lo tecleado encuentran el mismo producto.
 */
export function barcodeCandidates(raw: string, type?: string): string[] {
  const forms = [normalizeBarcode(raw, type), normalizeBarcode(raw)];
  if (/^\d{8}$/.test(forms[1])) forms.push(normalizeBarcode(raw, 'upc_e'));
  return [...new Set(forms)].filter(isValidBarcode);
}

function checkDigit(first11: string): number {
  let sum = 0;
  for (let i = 0; i < first11.length; i++) sum += Number(first11[i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/**
 * Convierte UPC-E (6, 7 u 8 dígitos) a UPC-A de 12. Cualquier otra longitud, o un UPC-E de 8
 * con dígito de control incorrecto o sistema distinto de 0/1, se regresa igual.
 */
function expandUpcE(value: string): string {
  if (value.length < 6 || value.length > 8) return value;
  const body = value.length === 6 ? value : value.slice(1, 7);
  const system = value.length === 6 ? '0' : value[0];
  if (system !== '0' && system !== '1') return value;
  const [a, b, c, d, e, last] = body;
  let middle: string;
  if (last <= '2') middle = `${a}${b}${last}0000${c}${d}${e}`;
  else if (last === '3') middle = `${a}${b}${c}00000${d}${e}`;
  else if (last === '4') middle = `${a}${b}${c}${d}00000${e}`;
  else middle = `${a}${b}${c}${d}${e}0000${last}`;
  const first11 = system + middle;
  const check = String(checkDigit(first11));
  if (value.length === 8 && value[7] !== check) return value;
  return first11 + check;
}
