import type { Necesidad, PlanKey } from "@/lib/cora/necesidades";
import type { ServiceOffer } from "@/lib/initial-report";

// CORA · Motor de Soluciones. Agrupa necesidades relacionadas en planes por etapas (no una lista de servicios),
// conecta cada etapa con un servicio real de ENQORA o con una ruta externa oficial, y muestra el costo solo
// con tarifas publicadas. Si no hay necesidades urgentes, lo dice: «hoy no necesitas contratar nada».

export const PLANES: Record<PlanKey, { nombre: string; objetivo: string }> = {
  regularizacion: { nombre: "Plan de regularización tributaria", objetivo: "Dejar tus impuestos en regla y evitar que crezcan multas e intereses." },
  laboral: { nombre: "Plan de cumplimiento laboral y preventivo", objetivo: "Cumplir con tus trabajadores y con la normativa de seguridad vigente." },
  formalizacion: { nombre: "Ruta de formalización y protección", objetivo: "Operar con los permisos, la estructura y la marca que tu negocio necesita." },
  gestion: { nombre: "Plan de orden y gestión", objetivo: "Ordenar finanzas, clientes y sistemas para decidir mejor y crecer." },
  crecimiento: { nombre: "Plan de oportunidades y crecimiento", objetivo: "Aprovechar programas públicos y nuevas fuentes de ventas." },
};

export type Etapa = { orden: number; necesidad: Necesidad };
export type Plan = { key: PlanKey; nombre: string; objetivo: string; etapas: Etapa[]; prioridad: number; costo: string; servicios: ServiceOffer[] };
export type Propuesta = { planes: Plan[]; sinUrgencias: boolean; mensaje: string };

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;

export function construirPropuesta(necesidades: Necesidad[]): Propuesta {
  const grupos = new Map<PlanKey, Necesidad[]>();
  for (const n of necesidades) grupos.set(n.plan, [...(grupos.get(n.plan) ?? []), n]);

  const planes: Plan[] = [...grupos.entries()].map(([key, ns]) => {
    const etapas = ns.sort((a, b) => b.puntaje - a.puntaje).map((n, i) => ({ orden: i + 1, necesidad: n }));
    const servicios: ServiceOffer[] = [];
    for (const n of ns) if (n.servicio && !servicios.some((s) => s.id === n.servicio!.id || (s.codigo && s.codigo === n.servicio!.codigo))) servicios.push(n.servicio);
    const conPrecio = servicios.filter((s) => s.disponible && (s.precio ?? 0) > 0);
    const sinPrecio = servicios.filter((s) => !(s.disponible && (s.precio ?? 0) > 0) && s.precio !== 0);
    const suma = conPrecio.reduce((t, s) => t + (s.precio ?? 0), 0);
    const costo = !servicios.length ? "Sin servicios asociados"
      : conPrecio.length && !sinPrecio.length ? `Desde ${clp(suma)} en total (tarifas publicadas; el beneficio de bienvenida se aplica al contratar)`
        : conPrecio.length ? `Desde ${clp(suma)} en las etapas con tarifa publicada; las demás requieren cotización o están próximas`
          : "Requiere cotización: ENQORA no publica precios que aún no están aprobados";
    return { key, ...PLANES[key], etapas, prioridad: Math.max(...ns.map((n) => n.puntaje)), costo, servicios };
  }).sort((a, b) => b.prioridad - a.prioridad);

  const urgentes = necesidades.filter((n) => n.urgencia >= 2);
  return {
    planes,
    sinUrgencias: urgentes.length === 0,
    mensaje: !necesidades.length
      ? "Con la información disponible, CORA no detecta necesidades: hoy no necesitas contratar nada."
      : urgentes.length === 0
        ? "No detectamos nada urgente. Estas mejoras pueden esperar: atiéndelas cuando te convenga, o hazlo tú mismo con las rutas oficiales indicadas."
        : `Recomendamos empezar por: ${planes[0].nombre}. Puedes hacerlo con ENQORA o, si prefieres, por la ruta oficial indicada en cada etapa.`,
  };
}
