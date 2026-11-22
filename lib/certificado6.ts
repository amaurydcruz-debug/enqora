// Certificado N° 6 (sueldos) y resumen anual para cuadrar la DJ 1887. El cálculo lo hace la base de datos
// (private.rem_cert_calcular, 0083) con las liquidaciones aprobadas; aquí solo están los tipos y la presentación.

export type MesCert = {
  mes: number; bruto: number; cotiz: number; base: number; impuesto: number; mayor: number; exenta: number; no_gravada: number; zona: number;
  factor: number | null; base_act: number; impuesto_act: number; mayor_act: number; exenta_act: number; no_gravada_act: number; zona_act: number;
};
export type CalculoCert = {
  anio: number; motor: string; meses: MesCert[]; faltan_factores: number[]; finiquitado: boolean;
  totales: { bruto: number; cotiz: number; base: number; impuesto: number; no_gravada: number; base_act: number; impuesto_act: number; no_gravada_act: number };
};
export type FilaResumen = { trabajador_id: string; rut: string; nombre: string; fecha_baja: string | null; calculo: CalculoCert };

export const MESES_CERT = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Año comercial que se certifica por defecto: hasta abril, el anterior (operación renta); después, el que está en curso.
export function anioPorDefecto(hoy: string): number {
  const y = Number(hoy.slice(0, 4)), m = Number(hoy.slice(5, 7));
  return m <= 4 ? y - 1 : y;
}

// Lee los factores escritos en el formulario de Mando ("1,045"). Devuelve null si alguno no es válido.
export function leerFactores(valores: Record<number, string>): Record<string, number> | null {
  const out: Record<string, number> = {};
  for (const [mes, txt] of Object.entries(valores)) {
    const t = txt.trim();
    if (!t) continue;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n) || n < 0.9 || n > 2) return null;
    out[mes] = Math.round(n * 1000) / 1000;
  }
  return Object.keys(out).length ? out : null;
}
