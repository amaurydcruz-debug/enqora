// Alertas de gastos antes del cierre (etapa 5 de «Modelos libres para integrar»). Idea de PyOD (BSD-2):
// detectar lo atípico con estadística robusta (mediana y desviación absoluta mediana), aquí en TypeScript y
// sin servidores. Las alertas son para el contador: no cambian nada por sí solas. Funciones puras, sin red.

export type GastoAlerta = {
  id: string; fecha: string; period: string; monto: number; iva: number | null; categoria: string; documento: string;
  proveedor: string | null; folio: string | null; descripcion: string; estado: string;
};
export type Alerta = { id: string; tipo: "duplicado" | "atipico" | "sin_documento" | "factura_sin_iva"; texto: string; nivel: "revisar" | "atencion" };

const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export function mediana(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// Umbral robusto: mediana + 3,5 desviaciones robustas (MAD × 1,4826). Con menos de 5 datos no se juzga.
export function umbralAtipico(historial: number[]): number | null {
  if (historial.length < 5) return null;
  const med = mediana(historial);
  const mad = mediana(historial.map((x) => Math.abs(x - med))) * 1.4826;
  return Math.max(med + 3.5 * mad, med * 2);
}

const MONTO_SIN_DOCUMENTO = 50_000;

export function alertasGastos(delMes: GastoAlerta[], historial: GastoAlerta[], categorias: Record<string, string> = {}): Alerta[] {
  const vivos = delMes.filter((g) => g.estado !== "descartado");
  const out: Alerta[] = [];
  // 1) Duplicados: mismo folio y comercio, o mismo monto, fecha y comercio/descripción.
  const vistos = new Map<string, GastoAlerta>();
  for (const g of [...vivos].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))) {
    const claves = [
      g.folio && g.proveedor ? `f:${norm(g.folio)}:${norm(g.proveedor)}` : null,
      `m:${g.monto}:${g.fecha}:${norm(g.proveedor) || norm(g.descripcion)}`,
    ].filter((x): x is string => !!x);
    const previo = claves.map((k) => vistos.get(k)).find(Boolean);
    if (previo) out.push({ id: g.id, tipo: "duplicado", nivel: "atencion", texto: `Posible duplicado de «${previo.descripcion}» del ${previo.fecha} (${fmt(previo.monto)}). Confirma antes de contarlo dos veces.` });
    for (const k of claves) if (!vistos.has(k)) vistos.set(k, g);
  }
  // 2) Atípicos por categoría frente a los meses anteriores de la misma empresa.
  const previos = historial.filter((h) => h.estado !== "descartado" && !delMes.some((g) => g.id === h.id));
  for (const g of vivos) {
    const u = umbralAtipico(previos.filter((h) => h.categoria === g.categoria).map((h) => h.monto));
    if (u !== null && g.monto > u) {
      out.push({ id: g.id, tipo: "atipico", nivel: "revisar", texto: `Monto inusualmente alto para ${categorias[g.categoria] ?? g.categoria}: lo habitual en esta empresa no supera ${fmt(u)}. Revisa el respaldo.` });
    }
  }
  // 3) Monto relevante sin documento (no rebaja impuestos) y facturas sin IVA separado.
  for (const g of vivos) {
    if (g.documento === "sin_documento" && g.monto >= MONTO_SIN_DOCUMENTO) {
      out.push({ id: g.id, tipo: "sin_documento", nivel: "revisar", texto: `Gasto de ${fmt(g.monto)} sin documento: pide boleta o factura al cliente si existe.` });
    }
    if (g.documento === "factura" && !g.iva) {
      out.push({ id: g.id, tipo: "factura_sin_iva", nivel: "revisar", texto: "Factura sin IVA separado: confirma si es exenta o si falta el dato para el crédito fiscal." });
    }
  }
  return out;
}

// Proyección simple del gasto del mes siguiente (escenario, no recomendación): mediana de los últimos 3 meses
// cerrados con registros. Con menos de 3 meses no se proyecta.
export function proyeccionGasto(historial: GastoAlerta[], periodoActual: string): { monto: number; meses: number } | null {
  const porMes = new Map<string, number>();
  for (const h of historial) if (h.estado !== "descartado" && h.period < periodoActual) porMes.set(h.period, (porMes.get(h.period) ?? 0) + h.monto);
  const ultimos = [...porMes.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 3).map(([, v]) => v);
  return ultimos.length >= 3 ? { monto: Math.round(mediana(ultimos)), meses: ultimos.length } : null;
}
