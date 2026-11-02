import type { SectionKey } from "@/lib/cora/secciones";

// CORA · Obligaciones laborales, previsionales y de seguridad (agentes 04, 05 y 06).
// Cada regla tiene fundamento legal y fuente oficial verificada (fecha en «verificada»).
// El número de trabajadores del SII es un INDICADOR ORIENTATIVO (dato anual, informado por la empresa):
// no prueba cuántos trabajadores tiene hoy ni si cumple. Por eso el resultado es siempre
// «potencialmente aplicable» y dice qué falta confirmar y qué documento acredita el cumplimiento.

export type Aplicacion = "potencial" | "por_confirmar" | "no_aplica_indicador" | "sin_datos";

export type ObligacionLaboral = {
  id: string;
  seccion: SectionKey;
  nombre: string;
  fundamento: string;
  fuente: { nombre: string; url: string; verificada: string };
  condicion: string; // cuándo aplica
  acredita: string; // documento que acredita el cumplimiento
  evalua: (trabajadores: number) => Aplicacion;
};

const DT = "https://www.dt.gob.cl";
const SIEMPRE = (n: number): Aplicacion => (n > 0 ? "potencial" : "no_aplica_indicador");

export const OBLIGACIONES_LABORALES: ObligacionLaboral[] = [
  {
    id: "contrato", seccion: "laboral", nombre: "Contrato de trabajo escrito",
    fundamento: "Código del Trabajo, art. 9", fuente: { nombre: "Dirección del Trabajo", url: DT, verificada: "2026-11-02" },
    condicion: "Todo trabajador dependiente.", acredita: "Contratos firmados y sus anexos.", evalua: SIEMPRE,
  },
  {
    id: "jornada_42", seccion: "laboral", nombre: "Jornada máxima de 42 horas semanales",
    fundamento: "Ley 21.561 (reducción gradual a 40 horas): 42 horas desde abril de 2026", fuente: { nombre: "Dirección del Trabajo", url: DT, verificada: "2026-11-02" },
    condicion: "Trabajadores con jornada ordinaria; hay regímenes y exclusiones especiales.", acredita: "Contratos o anexos con la jornada y el registro de asistencia.", evalua: SIEMPRE,
  },
  {
    id: "karin", seccion: "laboral", nombre: "Protocolo de prevención del acoso y la violencia (Ley Karin)",
    fundamento: "Ley 21.643, vigente desde el 1 de agosto de 2024; obligatorio también para empresas con menos de 10 trabajadores",
    fuente: { nombre: "Ministerio del Trabajo · dictamen DT", url: "https://www.mintrab.gob.cl/direccion-del-trabajo-dictamen-ley-karin/", verificada: "2026-11-02" },
    condicion: "Todo empleador.", acredita: "Protocolo de prevención y procedimiento de investigación, dados a conocer a los trabajadores.", evalua: SIEMPRE,
  },
  {
    id: "reglamento_interno", seccion: "laboral", nombre: "Reglamento interno de orden, higiene y seguridad",
    fundamento: "Código del Trabajo, art. 153: empresas con 10 o más trabajadores permanentes (actualizado con la Ley Karin)",
    fuente: { nombre: "Ministerio del Trabajo · dictamen DT", url: "https://www.mintrab.gob.cl/direccion-del-trabajo-dictamen-ley-karin/", verificada: "2026-11-02" },
    condicion: "10 o más trabajadores permanentes.", acredita: "Reglamento interno vigente, entregado a los trabajadores.",
    evalua: (n) => (n >= 10 ? "potencial" : n > 0 ? "no_aplica_indicador" : "no_aplica_indicador"),
  },
  {
    id: "lre", seccion: "laboral", nombre: "Libro de Remuneraciones Electrónico",
    fundamento: "Código del Trabajo, art. 62 bis (Ley 21.327): empleadores con 5 o más trabajadores; se carga hasta el día 15 del mes siguiente",
    fuente: { nombre: "Dirección del Trabajo", url: "https://dt.gob.cl/portal/1627/w3-article-120353.html", verificada: "2026-11-02" },
    condicion: "5 o más trabajadores.", acredita: "Comprobantes de carga mensual del LRE en el portal de la DT.",
    evalua: (n) => (n >= 5 ? "potencial" : "no_aplica_indicador"),
  },
  {
    id: "cotizaciones", seccion: "prevision", nombre: "Declaración y pago de cotizaciones previsionales",
    fundamento: "DL 3.500 y normas de seguridad social: hasta el día 10 de cada mes, o el 13 si se paga en línea",
    fuente: { nombre: "Previred", url: "https://www.previred.com", verificada: "2026-10-30" },
    condicion: "Todo trabajador dependiente.", acredita: "Certificado de cotizaciones pagadas (Previred) o certificado F30 de la DT.", evalua: SIEMPRE,
  },
  {
    id: "afc", seccion: "prevision", nombre: "Seguro de cesantía (AFC)",
    fundamento: "Ley 19.728: obligatorio para los contratos regidos por el Código del Trabajo celebrados desde octubre de 2002 (con excepciones)",
    fuente: { nombre: "AFC Chile", url: "https://www.afc.cl", verificada: "2026-11-02" },
    condicion: "Trabajadores dependientes con contrato posterior a octubre de 2002; hay excepciones (por ejemplo, aprendices y pensionados).",
    acredita: "Cotizaciones del seguro de cesantía en el certificado de cotizaciones.", evalua: SIEMPRE,
  },
  {
    id: "seguro_16744", seccion: "seguridad", nombre: "Seguro de accidentes del trabajo y enfermedades profesionales",
    fundamento: "Ley 16.744: seguro obligatorio; el empleador cotiza en el ISL o en una mutualidad adherida",
    fuente: { nombre: "ISL", url: "https://www.isl.gob.cl/decreto-44/", verificada: "2026-11-02" },
    condicion: "Todo empleador con trabajadores.", acredita: "Certificado de adhesión a la mutualidad o comprobante del ISL.", evalua: SIEMPRE,
  },
  {
    id: "ds44_base", seccion: "seguridad", nombre: "Encargado de prevención, matriz de riesgos y programa preventivo",
    fundamento: "DS 44 (vigente desde el 1 de febrero de 2025), reemplazó a los DS 40 y 54",
    fuente: { nombre: "ISL · Decreto 44", url: "https://www.isl.gob.cl/decreto-44/", verificada: "2026-11-02" },
    condicion: "Todo empleador.", acredita: "Matriz de riesgos, programa preventivo y designación del encargado.", evalua: SIEMPRE,
  },
  {
    id: "delegado", seccion: "seguridad", nombre: "Delegado de seguridad y salud en el trabajo",
    fundamento: "DS 44: empresas de 10 a 25 trabajadores sin comité paritario", fuente: { nombre: "ISL · Decreto 44", url: "https://www.isl.gob.cl/decreto-44/", verificada: "2026-11-02" },
    condicion: "10 a 25 trabajadores.", acredita: "Acta de elección del delegado.",
    evalua: (n) => (n >= 10 && n <= 25 ? "potencial" : "no_aplica_indicador"),
  },
  {
    id: "cphs", seccion: "seguridad", nombre: "Comité paritario de higiene y seguridad",
    fundamento: "Ley 16.744, art. 66 y DS 44: más de 25 trabajadores (por empresa, faena, sucursal o agencia)",
    fuente: { nombre: "ISL · Decreto 44", url: "https://www.isl.gob.cl/decreto-44/", verificada: "2026-11-02" },
    condicion: "Más de 25 trabajadores.", acredita: "Acta de constitución del comité y registro en la DT.",
    evalua: (n) => (n > 25 ? "potencial" : "no_aplica_indicador"),
  },
  {
    id: "depto_prevencion", seccion: "seguridad", nombre: "Departamento de prevención de riesgos",
    fundamento: "DS 44: más de 100 trabajadores, a cargo de un experto", fuente: { nombre: "ISL · Decreto 44", url: "https://www.isl.gob.cl/decreto-44/", verificada: "2026-11-02" },
    condicion: "Más de 100 trabajadores.", acredita: "Designación del experto y organización del departamento.",
    evalua: (n) => (n > 100 ? "potencial" : "no_aplica_indicador"),
  },
];

export type ObligacionEvaluada = ObligacionLaboral & { aplicacion: Aplicacion; datos: string; falta: string };

// trabajadores: indicador del SII (o null si no hay dato). declaraSinTrabajadores: respuesta «No tengo trabajadores».
export function evaluarObligaciones(trabajadores: number | null, anio: number | null, declaraSinTrabajadores = false): ObligacionEvaluada[] {
  return OBLIGACIONES_LABORALES.map((o) => {
    if (trabajadores == null) {
      return { ...o, aplicacion: "sin_datos", datos: "El SII no informa trabajadores para esta empresa.", falta: "Número actual de trabajadores y sus contratos." };
    }
    const aplicacion = o.evalua(trabajadores);
    return {
      ...o, aplicacion,
      datos: `${trabajadores} trabajador(es) informado(s) por la empresa al SII${anio ? ` para ${anio}` : ""} (indicador orientativo).`,
      falta: declaraSinTrabajadores && trabajadores > 0
        ? "Contradicción: el SII informa trabajadores y la autoevaluación dice que no hay. Confirmar la dotación actual."
        : "Dotación actual, tipo de contratos y documentos que acreditan el cumplimiento.",
    };
  });
}
