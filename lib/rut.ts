// RUT chileno: limpieza, validación (módulo 11) y formato.
// La base de datos repite esta validación: la del navegador es solo para ayudar al usuario.

export function cleanRut(value: string): string {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

// "76.086.428-5" → "76086428-5" (formato que se guarda en la base de datos)
export function normalizeRut(value: string): string | null {
  const v = cleanRut(value);
  if (v.length < 8 || v.length > 9) return null;
  const body = v.slice(0, -1).replace(/^0+/, "");
  const dv = v.slice(-1);
  if (!/^\d+$/.test(body)) return null;
  return `${body}-${dv}`;
}

export function isValidRut(value: string): boolean {
  const rut = normalizeRut(value);
  if (!rut || !/^[1-9]\d{6,7}-[\dK]$/.test(rut)) return false;
  const [body, dv] = rut.split("-");
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const r = 11 - (sum % 11);
  const expected = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return dv === expected;
}

// "76086428-5" → "76.086.428-5"
export function formatRut(value: string): string {
  const v = cleanRut(value);
  if (v.length < 2) return v;
  const body = v.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${body}-${v.slice(-1)}`;
}
