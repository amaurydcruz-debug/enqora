// Agente conciliador (0069). Funciones puras, sin red. PROPONE; nunca aplica: una persona marca y aplica.
//  1) Movimiento ↔ factura: usa las sugerencias de la base (monto exacto + RUT, fecha o folio en la glosa).
//  2) Cargos y abonos reconocibles por su glosa: comisiones, sueldos, impuestos, créditos, traspasos.
//  3) Abonos de ventas con tarjeta (Transbank, Getnet, Klap…) cerca de los días con ventas con tarjeta en el POS.
//  4) Lo que queda sin explicación (sobre un mínimo) se convierte en una pregunta al cliente.

export type Movimiento = { id: string; movement_date: string; description: string; amount: number };
export type Sugerencia = { movement_id: string; document_id: string; score: number; days: number };
export type DiaTarjeta = { fecha: string; tarjetas: number };
export type Propuesta =
  | { movement_id: string; tipo: "documento"; document_id: string; motivo: string; certeza: "alta" | "media" }
  | { movement_id: string; tipo: "categoria"; categoria: string; motivo: string; certeza: "alta" | "media" };
export type PreguntaPropuesta = { movement_id: string; pregunta: string; opciones: string[] };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const REGLAS_CARGO: [RegExp, string, string][] = [
  [/comision|mantencion (de )?cuenta|cargo (por )?servicio|impuesto (de )?timbre|costo (de )?transferencia|cobro plan/, "comision_bancaria", "glosa de comisión o cargo bancario"],
  [/previred|remuneraci|sueldo|liquidacion de sueldo|honorario/, "remuneraciones", "glosa de remuneraciones o imposiciones"],
  [/tgr|tesoreria|servicio de impuestos|\bsii\b|\bf29\b|formulario 29|pago (de )?impuesto|contribuciones/, "impuestos", "glosa de pago de impuestos"],
  [/cuota (credito|prestamo)|pago (credito|prestamo)|dividendo|leasing|avance/, "prestamo", "glosa de cuota de crédito"],
  [/traspaso|a cuenta propia|entre cuentas|cta propia/, "traspaso", "glosa de traspaso entre cuentas"],
];
const REGLAS_ABONO: [RegExp, string, string][] = [
  [/traspaso|desde cuenta propia|entre cuentas|cta propia/, "traspaso", "glosa de traspaso entre cuentas"],
  [/credito (de )?consumo|otorgamiento|desembolso|abono credito|prestamo/, "prestamo", "glosa de crédito recibido"],
];
const TARJETAS = /transbank|getnet|klap|mercado ?pago|sumup|compraquí|compraqui|webpay|redelcom|tuu\b|haulmer/;

export const OPCIONES_CARGO = [
  "Pago a un proveedor", "Gasto del negocio", "Sueldo o honorario", "Impuestos o imposiciones", "Cuota de un crédito",
  "Traspaso a otra cuenta mía", "Retiro personal", "No lo reconozco",
] as const;
export const OPCIONES_ABONO = [
  "Venta a un cliente", "Liquidación de ventas con tarjeta", "Aporte mío o de un socio", "Préstamo recibido",
  "Traspaso desde otra cuenta mía", "Devolución o reembolso", "No lo reconozco",
] as const;
// Categoría de conciliación sugerida para cada respuesta (el contador la confirma o la cambia).
export const CATEGORIA_DE_RESPUESTA: Record<string, string | null> = {
  "Pago a un proveedor": "otro", "Gasto del negocio": "otro", "Sueldo o honorario": "remuneraciones", "Impuestos o imposiciones": "impuestos",
  "Cuota de un crédito": "prestamo", "Traspaso a otra cuenta mía": "traspaso", "Retiro personal": "aporte_retiro", "No lo reconozco": null,
  "Venta a un cliente": "otro", "Liquidación de ventas con tarjeta": "otro", "Aporte mío o de un socio": "aporte_retiro", "Préstamo recibido": "prestamo",
  "Traspaso desde otra cuenta mía": "traspaso", "Devolución o reembolso": "otro",
};

const clp = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}`;
const dias = (a: string, b: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

export function proponer(pendientes: Movimiento[], sugerencias: Sugerencia[], tarjetas: DiaTarjeta[] = []): Propuesta[] {
  const out: Propuesta[] = [];
  const usados = new Set<string>();
  const sugPorMov = new Map(sugerencias.map((s) => [s.movement_id, s]));
  for (const m of pendientes) {
    const s = sugPorMov.get(m.id);
    if (s && s.score >= 2) {
      out.push({ movement_id: m.id, tipo: "documento", document_id: s.document_id, certeza: s.score >= 3 || s.days <= 3 ? "alta" : "media",
        motivo: `mismo monto${s.score >= 3 ? ", RUT en la glosa" : ""}${s.days <= 10 ? `, ${s.days} día(s) de diferencia` : ""}` });
      usados.add(m.id);
      continue;
    }
    const g = sinTildes(m.description);
    const regla = (m.amount < 0 ? REGLAS_CARGO : REGLAS_ABONO).find(([re]) => re.test(g));
    if (regla) {
      out.push({ movement_id: m.id, tipo: "categoria", categoria: regla[1], motivo: regla[2], certeza: "alta" });
      usados.add(m.id);
      continue;
    }
    if (m.amount > 0 && TARJETAS.test(g)) {
      // Las liquidaciones llegan 1 a 3 días hábiles después y descontadas las comisiones: se busca el día con ventas con tarjeta
      // cuyo monto sea igual o hasta 6% mayor que el abono.
      const dia = tarjetas.find((t) => { const d = dias(m.movement_date, t.fecha); return d >= 0 && d <= 5 && t.tarjetas >= m.amount && t.tarjetas <= m.amount * 1.06; });
      out.push({ movement_id: m.id, tipo: "categoria", categoria: "otro", certeza: dia ? "alta" : "media",
        motivo: dia ? `liquidación de ventas con tarjeta del ${fechaCorta(dia.fecha)} (POS: ${clp(dia.tarjetas)})` : "abono de una procesadora de tarjetas" });
      usados.add(m.id);
    }
  }
  return out;
}

// Preguntas para lo que quedó sin explicación (sobre un mínimo para no molestar por montos chicos).
export function preguntasPara(pendientes: Movimiento[], propuestas: Propuesta[], minimo = 20_000): PreguntaPropuesta[] {
  const con = new Set(propuestas.map((p) => p.movement_id));
  return pendientes.filter((m) => !con.has(m.id) && Math.abs(m.amount) >= minimo).slice(0, 40).map((m) => ({
    movement_id: m.id,
    pregunta: `¿Qué fue el ${m.amount < 0 ? "cargo" : "abono"} de ${clp(m.amount)} del ${fechaCorta(m.movement_date)} en tu banco («${m.description.slice(0, 80)}»)?`,
    opciones: [...(m.amount < 0 ? OPCIONES_CARGO : OPCIONES_ABONO)],
  }));
}
