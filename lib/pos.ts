// Ventas del punto de venta (0068): resumen diario a partir de la exportación de cualquier POS, y la forma
// del resumen que envían los conectores (Vania POS primero). Funciones puras, sin red.

export type DiaPOS = {
  fecha: string; n_ventas: number; total: number; neto?: number | null; iva?: number | null; exento?: number | null;
  efectivo: number; debito: number; credito: number; transferencia: number; otros: number;
};
export type MedioPago = "efectivo" | "debito" | "credito" | "transferencia" | "otros";

// Columnas típicas de las exportaciones de POS chilenos (se proponen; la persona puede cambiarlas).
export const CAMPOS_POS: { key: string; label: string; required?: boolean; hints: RegExp[] }[] = [
  { key: "fecha", label: "Fecha de la venta", required: true, hints: [/^fecha/i, /fecha/i, /^d[ií]a$/i] },
  { key: "total", label: "Total de la venta", required: true, hints: [/^total$/i, /monto total/i, /total venta/i, /^monto$/i, /total/i] },
  { key: "medio", label: "Medio de pago", hints: [/medio de pago/i, /forma de pago/i, /m[eé]todo/i, /pago/i] },
  { key: "neto", label: "Neto", hints: [/^neto$/i, /monto neto/i] },
  { key: "iva", label: "IVA", hints: [/^iva$/i, /monto iva/i] },
  { key: "exento", label: "Exento", hints: [/exento/i] },
  { key: "cantidad", label: "N° de ventas (si el archivo ya viene por día)", hints: [/n[°º]? ?(de )?ventas/i, /cantidad de ventas/i, /transacciones/i] },
];

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function medioDePago(v: string | undefined): MedioPago {
  const t = sinTildes(v ?? "");
  if (/efectivo|cash|contado/.test(t)) return "efectivo";
  if (/debito|redcompra|red compra/.test(t)) return "debito";
  if (/credito|visa|master|amex|diners/.test(t)) return "credito";
  if (/transfer|deposito|khipu|mach|tenpo|mercado ?pago/.test(t)) return "transferencia";
  return "otros";
}

type Fila = { fecha: string | null; total: number | null; medio?: string; neto?: number | null; iva?: number | null; exento?: number | null; cantidad?: number | null };

// Agrupa las filas (una por venta, o una por día) en un resumen por fecha y medio de pago.
// Las filas sin fecha o sin total válido se cuentan como descartadas para mostrarlas a la persona.
export function resumirPorDia(filas: Fila[]): { dias: DiaPOS[]; descartadas: number } {
  const porDia = new Map<string, DiaPOS & { _neto: number; _iva: number; _exento: number; _hayNeto: boolean; _hayIva: boolean; _hayExento: boolean }>();
  let descartadas = 0;
  for (const f of filas) {
    if (!f.fecha || f.total == null || !Number.isFinite(f.total) || f.total < 0) { descartadas++; continue; }
    const d = porDia.get(f.fecha) ?? { fecha: f.fecha, n_ventas: 0, total: 0, efectivo: 0, debito: 0, credito: 0, transferencia: 0, otros: 0, _neto: 0, _iva: 0, _exento: 0, _hayNeto: false, _hayIva: false, _hayExento: false };
    const total = Math.round(f.total);
    d.total += total;
    d.n_ventas += f.cantidad != null && f.cantidad > 0 ? Math.round(f.cantidad) : 1;
    d[medioDePago(f.medio)] += total;
    if (f.neto != null) { d._neto += Math.round(f.neto); d._hayNeto = true; }
    if (f.iva != null) { d._iva += Math.round(f.iva); d._hayIva = true; }
    if (f.exento != null) { d._exento += Math.round(f.exento); d._hayExento = true; }
    porDia.set(f.fecha, d);
  }
  const dias = [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => ({
    fecha: d.fecha, n_ventas: d.n_ventas, total: d.total, efectivo: d.efectivo, debito: d.debito, credito: d.credito,
    transferencia: d.transferencia, otros: d.otros, neto: d._hayNeto ? d._neto : null, iva: d._hayIva ? d._iva : null, exento: d._hayExento ? d._exento : null,
  }));
  return { dias, descartadas };
}

// Diferencia POS vs. Registro de Compras y Ventas: cuándo vale la pena revisarla.
export function alertaCruce(posTotal: number, rcv: number): "sin_datos" | "cuadra" | "revisar" | "pos_mayor" {
  if (!posTotal) return "sin_datos";
  const dif = posTotal - rcv;
  const pct = Math.abs(dif) / posTotal;
  if (pct <= 0.02) return "cuadra";
  return dif > 0 ? "pos_mayor" : "revisar";
}
