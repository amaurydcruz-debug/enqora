// Pendientes laborales de la empresa (Empresa al día). Función pura sobre los datos reales de Remuneraciones y de los
// documentos laborales: no reemplaza la revisión de una persona; ordena lo que conviene resolver primero.
import { habilesDespues } from "@/lib/finiquito";
import { pactoCubreMes } from "@/lib/plantilla-contrato";
import { saldoVacaciones, type RegistroVacacion } from "@/lib/vacaciones";

export type Nivel = "urgente" | "importante" | "aviso";
export type Pendiente = { clave: string; nivel: Nivel; titulo: string; detalle: string; href: string };

export type DatosPendientes = {
  hoy: string;
  trabajadores: { id: string; nombre: string; activo: boolean; fecha_ingreso: string; fecha_baja: string | null }[];
  contratos: { trabajador_id: string; tipo: string; estado: string; datos: Record<string, unknown> }[];
  documentos: { tipo: string; estado: string }[];
  liquidaciones: { trabajador_id: string; periodo: string; estado: string; horas_extra: number }[];
  finiquitos: { trabajador_id: string; estado: string }[];
  vacaciones: RegistroVacacion[];
  certificados: { trabajador_id: string; anio: number; estado: string }[];
  festivos: ReadonlySet<string>;
};

const fecha = (s: string) => s.split("-").reverse().join("-");
const mesPrevio = (p: string) => { const y = Number(p.slice(0, 4)), m = Number(p.slice(5, 7)); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const masDias = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ORDEN: Record<Nivel, number> = { urgente: 0, importante: 1, aviso: 2 };
const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;
const nombres = (xs: string[]) => xs.length <= 3 ? xs.join(", ") : `${xs.slice(0, 3).join(", ")} y ${xs.length - 3} más`;

export function pendientesLaborales(d: DatosPendientes): Pendiente[] {
  const out: Pendiente[] = [];
  const activos = d.trabajadores.filter((t) => t.activo);
  const aprobado = (tid: string, tipo: string) => d.contratos.some((c) => c.trabajador_id === tid && c.tipo === tipo && c.estado === "aprobado");
  const docAprobado = (tipo: string) => d.documentos.some((x) => x.tipo === tipo && x.estado === "aprobado");

  // 1. Finiquitos: plazo de 10 días hábiles desde la separación (art. 177).
  for (const t of d.trabajadores.filter((x) => !x.activo && x.fecha_baja)) {
    if (d.finiquitos.some((f) => f.trabajador_id === t.id && f.estado === "aprobado")) continue;
    if (t.fecha_baja! < masDias(d.hoy, -120)) continue; // bajas antiguas: fuera del alcance de este aviso
    const limite = habilesDespues(t.fecha_baja!, 10, d.festivos);
    const vencido = limite < d.hoy;
    out.push({ clave: `fin-${t.id}`, nivel: vencido ? "importante" : "urgente", href: `/remuneraciones#t-${t.id}`,
      titulo: `Finiquito de ${t.nombre}`,
      detalle: vencido ? `El plazo para pagarlo venció el ${fecha(limite)} (referencial). Prepáralo cuanto antes.` : `Debe pagarse a más tardar el ${fecha(limite)} (referencial), con la revisión del equipo ENQORA.` });
  }

  // 2. Liquidaciones del mes anterior sin aprobar (Previred se paga hasta el día 13).
  const anterior = mesPrevio(d.hoy.slice(0, 7));
  const sinLiq = activos.filter((t) => t.fecha_ingreso.slice(0, 7) <= anterior
    && !d.liquidaciones.some((l) => l.trabajador_id === t.id && l.periodo === anterior && l.estado === "aprobada"));
  if (sinLiq.length && Number(d.hoy.slice(8, 10)) <= 13) {
    out.push({ clave: "liq-anterior", nivel: "urgente", href: `/remuneraciones?periodo=${anterior}`,
      titulo: `Liquidaciones de ${anterior} sin aprobar`,
      detalle: `${plural(sinLiq.length, "trabajador", "trabajadores")}: ${nombres(sinLiq.map((t) => t.nombre))}. Apruébalas para generar Previred, que vence el día 13.` });
  }

  // 3. Horas extra sin pacto aprobado en los últimos 3 meses (art. 32).
  const pactos = (tid: string) => d.contratos.filter((c) => c.trabajador_id === tid && c.tipo === "pacto_he" && c.estado === "aprobado")
    .map((c) => ({ desde: String(c.datos.desde ?? ""), hasta: String(c.datos.hasta ?? "") }));
  const desde3 = mesPrevio(mesPrevio(d.hoy.slice(0, 7)));
  const sinPacto = new Map<string, string>();
  for (const l of d.liquidaciones) {
    if (l.horas_extra > 0 && l.periodo >= desde3 && l.estado !== "anulada" && !pactoCubreMes(pactos(l.trabajador_id), l.periodo)) {
      const t = d.trabajadores.find((x) => x.id === l.trabajador_id);
      if (t) sinPacto.set(t.id, t.nombre);
    }
  }
  if (sinPacto.size) {
    out.push({ clave: "he-sin-pacto", nivel: "importante", href: "/remuneraciones",
      titulo: "Horas extra sin pacto escrito",
      detalle: `${nombres([...sinPacto.values()])}. Trabajar horas extra sin pacto es infracción (art. 32): prepáralo en «Contrato y anexos».` });
  }
  // Pactos aprobados que vencen en los próximos 15 días.
  for (const t of activos) {
    const vence = pactos(t.id).find((p) => p.hasta >= d.hoy && p.hasta <= masDias(d.hoy, 15));
    if (vence && !pactos(t.id).some((p) => p.desde > vence.hasta)) {
      out.push({ clave: `pacto-${t.id}`, nivel: "aviso", href: `/remuneraciones#t-${t.id}`, titulo: `Vence el pacto de horas extra de ${t.nombre}`,
        detalle: `Termina el ${fecha(vence.hasta)}. Si siguen siendo necesarias, prepara un pacto nuevo (máximo tres meses).` });
    }
  }

  // 4. Ley Karin y reglamento interno.
  if (activos.length && !(docAprobado("protocolo_karin") && docAprobado("procedimiento_karin"))) {
    out.push({ clave: "karin", nivel: "importante", href: "/laboral", titulo: "Protocolo y procedimiento de la Ley Karin",
      detalle: "Toda empresa con trabajadores debe tener el protocolo de prevención y el procedimiento de investigación (Ley 21.643)." });
  }
  if (activos.length >= 10 && !docAprobado("reglamento_interno")) {
    out.push({ clave: "riohs", nivel: "importante", href: "/laboral/reglamento", titulo: "Reglamento interno de orden, higiene y seguridad",
      detalle: `Con ${activos.length} trabajadores es obligatorio (art. 153 del Código del Trabajo).` });
  }

  // 5. Contratos: escrituración dentro de 15 días desde el ingreso (art. 9).
  const nuevosSin = activos.filter((t) => !aprobado(t.id, "contrato") && t.fecha_ingreso >= masDias(d.hoy, -30));
  for (const t of nuevosSin) {
    const limite = masDias(t.fecha_ingreso, 15);
    out.push({ clave: `ct-${t.id}`, nivel: limite >= d.hoy ? "importante" : "aviso", href: `/remuneraciones#t-${t.id}`, titulo: `Contrato de ${t.nombre}`,
      detalle: limite >= d.hoy ? `Debe quedar por escrito a más tardar el ${fecha(limite)} (5 días si es por obra o de menos de 30 días).`
        : `El plazo de escrituración venció el ${fecha(limite)}, salvo que ya esté firmado en papel.` });
  }
  const antiguosSin = activos.filter((t) => !aprobado(t.id, "contrato") && t.fecha_ingreso < masDias(d.hoy, -30));
  if (antiguosSin.length) {
    out.push({ clave: "ct-antiguos", nivel: "aviso", href: "/remuneraciones", titulo: `${plural(antiguosSin.length, "trabajador", "trabajadores")} sin contrato en ENQORA`,
      detalle: `${nombres(antiguosSin.map((t) => t.nombre))}. Si sus contratos están firmados en papel, no hay problema; si no, prepáralos.` });
  }

  // 6. Vacaciones acumuladas sobre dos períodos (art. 70).
  const acumulan = activos.filter((t) => saldoVacaciones(t.fecha_ingreso, d.hoy, d.hoy, d.vacaciones.filter((v) => v.trabajador_id === t.id)).saldo > 30
    && d.vacaciones.some((v) => v.trabajador_id === t.id));
  if (acumulan.length) {
    out.push({ clave: "vac-acumuladas", nivel: "aviso", href: "/remuneraciones", titulo: "Vacaciones acumuladas",
      detalle: `${nombres(acumulan.map((t) => t.nombre))} acumulan más de dos períodos. El feriado solo puede acumularse hasta dos (art. 70).` });
  }

  // 7. Certificados de sueldos (N° 6) entre enero y el plazo de la DJ 1887.
  const mes = Number(d.hoy.slice(5, 7));
  if (mes >= 1 && mes <= 3) {
    const anio = Number(d.hoy.slice(0, 4)) - 1;
    const conPago = new Set(d.liquidaciones.filter((l) => l.periodo.startsWith(`${anio}-`) && l.estado === "aprobada").map((l) => l.trabajador_id));
    const faltan = [...conPago].filter((tid) => !d.certificados.some((c) => c.trabajador_id === tid && c.anio === anio && c.estado === "vigente"));
    if (faltan.length) {
      out.push({ clave: "cert6", nivel: "importante", href: `/remuneraciones/anual?anio=${anio}`, titulo: `Certificados de sueldos ${anio}`,
        detalle: `Faltan ${plural(faltan.length, "certificado", "certificados")} N° 6. Revisa también la propuesta de la DJ 1887 del SII antes de que venza.` });
    }
  }

  // 8. Documentos observados por el abogado.
  const observados = d.contratos.filter((c) => c.estado === "observado").length + d.documentos.filter((x) => x.estado === "observado").length
    + d.finiquitos.filter((f) => f.estado === "observado").length;
  if (observados) {
    out.push({ clave: "observados", nivel: "aviso", href: "/remuneraciones", titulo: `${plural(observados, "documento observado", "documentos observados")}`,
      detalle: "El equipo ENQORA dejó observaciones: revisa y prepara una versión nueva." });
  }

  return out.sort((a, b) => ORDEN[a.nivel] - ORDEN[b.nivel]);
}
