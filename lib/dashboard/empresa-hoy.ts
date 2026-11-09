import { OBLIGACIONES_LABORALES } from "@/lib/cora/normativa-laboral";
import { salesTrancheLabel, SIGNALS, type Signal } from "@/lib/public-data";

// ENQORA Dashboard Engine · v1 «Tu empresa hoy».
// Arma, solo con datos reales y motores verificables, la vista adaptable de cada empresa:
//   · perfil público (nómina del SII): tamaño, trabajadores informados, rubro, región y antigüedad;
//   · señales objetivas del SII, cada una con el servicio que la atiende;
//   · obligaciones laborales, previsionales y de seguridad que aplican según la dotación;
//   · alertas preventivas: qué obligaciones se suman al crecer (calculado con las mismas reglas verificadas).
// Los módulos aparecen solo si hay datos: una empresa sin trabajadores no ve obligaciones laborales.
// Nada de esto es un diagnóstico de cumplimiento: el número de trabajadores del SII es un indicador orientativo.

export type PerfilPublico = {
  estado?: string;
  inicio_actividades?: string | null;
  termino_giro?: string | null;
  perfil?: {
    anio_comercial?: number | null; tramo_ventas?: string | null; trabajadores?: number | null; region?: string | null;
    rubro?: string | null; subrubro?: string | null; actividad_principal?: string | null;
  } | null;
  senales?: Signal[];
};

export type ObligacionVista = { id: string; nombre: string; fundamento: string; acredita: string };
export type EmpresaHoy = {
  perfil: { tamano: string | null; trabajadores: number | null; anio: number | null; rubro: string | null; region: string | null; actividad: string | null; antiguedad: string | null } | null;
  senales: { codigo: string; titulo: string; detalle: string; gravedad: Signal["gravedad"]; servicio: string; asunto: string }[];
  laboral: {
    origen: "sii" | "autoevaluacion" | null;
    dotacion: string; // texto para el cliente
    aplican: ObligacionVista[];
    segun_cantidad: ObligacionVista[]; // aplican según cuántos sean exactamente (rango de la autoevaluación)
  } | null;
  preventivo: { desde: number; nuevas: ObligacionVista[] } | null;
};

// Rangos de la autoevaluación (lib/onboarding.ts, pregunta «trabajadores»).
const RANGOS: Record<string, [number, number]> = { ninguno: [0, 0], "1_5": [1, 5], "6_20": [6, 20], mas_20: [21, 21] };

const vista = (o: (typeof OBLIGACIONES_LABORALES)[number]): ObligacionVista => ({ id: o.id, nombre: o.nombre, fundamento: o.fundamento, acredita: o.acredita });
const aplicanCon = (n: number) => OBLIGACIONES_LABORALES.filter((o) => o.evalua(n) === "potencial");

function antiguedad(inicio?: string | null): string | null {
  if (!inicio) return null;
  const d = new Date(`${inicio}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const meses = Math.max(0, Math.floor((Date.now() - d.getTime()) / (30.44 * 86_400_000)));
  if (meses < 12) return `${meses} ${meses === 1 ? "mes" : "meses"}`;
  const anios = Math.floor(meses / 12);
  return `${anios} ${anios === 1 ? "año" : "años"}`;
}

// Primer tamaño de dotación, por sobre «n», en que se suman obligaciones (hasta 150 trabajadores).
export function proximoUmbral(n: number): { desde: number; nuevas: ObligacionVista[] } | null {
  const actuales = new Set(aplicanCon(n).map((o) => o.id));
  for (let t = n + 1; t <= 150; t++) {
    const nuevas = aplicanCon(t).filter((o) => !actuales.has(o.id));
    if (nuevas.length) return { desde: t, nuevas: nuevas.map(vista) };
  }
  return null;
}

export function empresaHoy(pp: PerfilPublico | null, respuestaTrabajadores?: string): EmpresaHoy {
  const p = pp?.estado === "encontrada" ? pp : null;
  const prof = p?.perfil ?? null;
  const perfil = p
    ? {
        tamano: salesTrancheLabel(prof?.tramo_ventas ?? null), trabajadores: prof?.trabajadores ?? null, anio: prof?.anio_comercial ?? null,
        rubro: prof?.rubro ?? null, region: prof?.region ?? null, actividad: prof?.actividad_principal ?? null,
        antiguedad: p.termino_giro ? null : antiguedad(p.inicio_actividades),
      }
    : null;

  const senales = (p?.senales ?? []).flatMap((s) => {
    const t = SIGNALS[s.codigo];
    return t ? [{ codigo: s.codigo, titulo: t.titulo(s), detalle: t.detalle(s), gravedad: s.gravedad, servicio: t.servicio, asunto: t.asunto }] : [];
  });

  // Dotación: el indicador del SII manda; si no hay, el rango que declaró la empresa en su autoevaluación.
  let laboral: EmpresaHoy["laboral"] = null;
  let preventivo: EmpresaHoy["preventivo"] = null;
  const sii = typeof prof?.trabajadores === "number" ? prof.trabajadores : null;
  const rango = respuestaTrabajadores ? RANGOS[respuestaTrabajadores] : undefined;
  if (sii !== null) {
    laboral = {
      origen: "sii",
      dotacion: `${sii === 0 ? "Sin trabajadores informados" : `${sii} ${sii === 1 ? "trabajador informado" : "trabajadores informados"}`} al SII${prof?.anio_comercial ? ` para ${prof.anio_comercial}` : ""} (indicador orientativo)`,
      aplican: aplicanCon(sii).map(vista), segun_cantidad: [],
    };
    preventivo = proximoUmbral(sii);
  } else if (rango) {
    const [min, max] = rango;
    const base = aplicanCon(min);
    const ids = new Set(base.map((o) => o.id));
    laboral = {
      origen: "autoevaluacion",
      dotacion: min === 0 ? "Sin trabajadores con contrato, según tu autoevaluación" : max > min ? `Entre ${min} y ${max} trabajadores, según tu autoevaluación` : `Más de ${min - 1} trabajadores, según tu autoevaluación`,
      aplican: base.map(vista),
      segun_cantidad: max > min ? aplicanCon(max).filter((o) => !ids.has(o.id)).map(vista) : [],
    };
    preventivo = proximoUmbral(max);
  }
  // Una empresa con término de giro no recibe alertas de crecimiento.
  if (p?.termino_giro) preventivo = null;
  return { perfil, senales, laboral, preventivo };
}
