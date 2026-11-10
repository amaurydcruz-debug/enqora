// ENQORA Command Center · vista ejecutiva. Función pura para poder probarla.
// Definiciones comunes (las mismas en todos los paneles):
//   · Resuelto: caso con estado «cerrado» (el cierre lo registra el equipo); la resolución real la confirma el
//     cliente en su calificación («¿se resolvió?»), que se informa por separado.
//   · Atrasado: caso abierto con fecha de vencimiento anterior a hoy.
//   · Tiempo de resolución: mediana de días entre la creación y el cierre de los casos cerrados en el período.
//   · Cobrado: cobros pagados en el período. Por cobrar: pendientes o en revisión. Vencido: impagos con vencimiento pasado.
//   · Ahorro: solo el verificado por la supervisión (con fundamento y evidencia).

export type CasoE = { id: string; module: string; status: string; created_at: string; closed_at: string | null; due_date: string | null; responsible_id: string | null };
export type CobroE = { amount: number; status: string; due_date: string; paid_at: string | null };
export type CalificacionE = { case_id: string; resuelto: "si" | "parcial" | "no"; satisfaccion: number; created_at: string };
export type AhorroE = { monto: number; estado: string };

const CERRADOS = ["cerrado", "cancelado"];
const DIA = 86_400_000;

export type Ejecutivo = {
  casos: { abiertos: number; resueltos: number; atrasados: number; sin_responsable: number; mediana_dias: number | null };
  finanzas: { cobrado: number; por_cobrar: number; vencido: number; cobros_vencidos: number };
  experiencia: { calificaciones: number; satisfaccion: number | null; resueltos_segun_cliente: number | null; bajas: number };
  ahorro: { verificado: number; por_verificar: number };
  servicios: { modulo: string; abiertos: number; resueltos: number; atrasados: number; satisfaccion: number | null }[];
};

export function ejecutivo(casos: CasoE[], cobros: CobroE[], calificaciones: CalificacionE[], ahorros: AhorroE[], dias: number, ahora = Date.now()): Ejecutivo {
  const desde = ahora - dias * DIA;
  const hoy = new Date(ahora).toISOString().slice(0, 10);
  const en = (s: string | null) => !!s && new Date(s).getTime() >= desde;
  const abiertos = casos.filter((c) => !CERRADOS.includes(c.status));
  const resueltos = casos.filter((c) => c.status === "cerrado" && en(c.closed_at));
  const atrasado = (c: CasoE) => !CERRADOS.includes(c.status) && !!c.due_date && c.due_date < hoy;
  const duraciones = resueltos.map((c) => (new Date(c.closed_at as string).getTime() - new Date(c.created_at).getTime()) / DIA).sort((a, b) => a - b);
  const mediana = duraciones.length
    ? duraciones.length % 2 ? duraciones[(duraciones.length - 1) / 2] : (duraciones[duraciones.length / 2 - 1] + duraciones[duraciones.length / 2]) / 2
    : null;

  const impago = (c: CobroE) => ["pendiente", "en_revision", "vencido"].includes(c.status);
  const vencidos = cobros.filter((c) => impago(c) && (c.status === "vencido" || c.due_date < hoy));
  const cal = calificaciones.filter((r) => en(r.created_at));
  const promedio = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

  const moduloDe = new Map(casos.map((c) => [c.id, c.module]));
  const modulos = [...new Set(casos.map((c) => c.module))];
  const servicios = modulos.map((m) => ({
    modulo: m,
    abiertos: abiertos.filter((c) => c.module === m).length,
    resueltos: resueltos.filter((c) => c.module === m).length,
    atrasados: casos.filter((c) => c.module === m && atrasado(c)).length,
    satisfaccion: promedio(cal.filter((r) => moduloDe.get(r.case_id) === m).map((r) => r.satisfaccion)),
  })).filter((s) => s.abiertos || s.resueltos).sort((a, b) => b.abiertos + b.resueltos - (a.abiertos + a.resueltos));

  return {
    casos: {
      abiertos: abiertos.length, resueltos: resueltos.length, atrasados: casos.filter(atrasado).length,
      sin_responsable: abiertos.filter((c) => !c.responsible_id).length, mediana_dias: mediana === null ? null : Math.round(mediana * 10) / 10,
    },
    finanzas: {
      cobrado: cobros.filter((c) => c.status === "pagado" && en(c.paid_at)).reduce((s, c) => s + c.amount, 0),
      por_cobrar: cobros.filter((c) => ["pendiente", "en_revision"].includes(c.status) && c.due_date >= hoy).reduce((s, c) => s + c.amount, 0),
      vencido: vencidos.reduce((s, c) => s + c.amount, 0), cobros_vencidos: vencidos.length,
    },
    experiencia: {
      calificaciones: cal.length,
      satisfaccion: promedio(cal.map((r) => r.satisfaccion)),
      resueltos_segun_cliente: cal.length ? cal.filter((r) => r.resuelto === "si").length / cal.length : null,
      bajas: cal.filter((r) => r.satisfaccion <= 2 || r.resuelto === "no").length,
    },
    ahorro: {
      verificado: ahorros.filter((a) => a.estado === "verificado").reduce((s, a) => s + Number(a.monto), 0),
      por_verificar: ahorros.filter((a) => a.estado === "propuesto").length,
    },
    servicios,
  };
}
