// ENQORA Informa (0058): departamentos del enjambre investigador, etapas de verificación y alertas.
// Solo datos y textos: la lógica de verificación vive en la base (informa_editar, informa_revision_profesional).

export type Departamento = "tributario" | "contable" | "legal" | "laboral" | "empresas" | "marcas" | "financiero" | "municipal";

export const DEPARTAMENTOS: Record<Departamento, { titulo: string; icono: string; monitorea: string; consulta: string }> = {
  tributario: { titulo: "Tributario", icono: "tributario", monitorea: "SII, Tesorería y normativa tributaria",
    consulta: "Circulares, resoluciones y leyes tributarias nuevas del SII y la Tesorería: IVA, F29, F22, renta, Pro Pyme, boletas de honorarios, intereses, multas, convenios y calendario de obligaciones." },
  contable: { titulo: "Contable", icono: "contabilidad", monitorea: "Normas y obligaciones contables",
    consulta: "Cambios en obligaciones contables y registros: Registro de Compras y Ventas, facturación electrónica, libros contables electrónicos, remuneraciones y respaldo documental." },
  legal: { titulo: "Legal", icono: "profesionales", monitorea: "Leyes, reformas y Diario Oficial",
    consulta: "Leyes, reglamentos y decretos nuevos publicados en el Diario Oficial o en LeyChile que afecten a empresas: normativa civil y comercial, protección de datos personales (Ley 21.719), consumidor (SERNAC)." },
  laboral: { titulo: "Laboral", icono: "trabajador", monitorea: "Dirección del Trabajo y Código del Trabajo",
    consulta: "Dictámenes y cambios de la Dirección del Trabajo, modificaciones al Código del Trabajo, jornada (Ley 40 horas), sueldo mínimo, cotizaciones previsionales, Ley Karin, despidos y finiquitos, seguridad laboral." },
  empresas: { titulo: "Empresas", icono: "constitucion", monitorea: "Constitución, formalización y obligaciones",
    consulta: "Cambios en el Registro de Empresas y Sociedades, constitución y modificación de sociedades, inicio de actividades y obligaciones de funcionamiento de las empresas." },
  marcas: { titulo: "Marcas", icono: "marcas", monitorea: "INAPI y propiedad industrial",
    consulta: "Novedades de INAPI: procedimientos y plazos de registro de marcas, aranceles, clasificación de productos y servicios, resoluciones." },
  financiero: { titulo: "Financiero y oportunidades", icono: "crecimiento", monitorea: "CORFO, Sercotec, FOSIS y fondos",
    consulta: "Convocatorias abiertas o próximas de Sercotec, CORFO, FOSIS, SENCE y ProChile para emprendedores y pymes, con requisitos y fechas de postulación." },
  municipal: { titulo: "Municipal y sectorial", icono: "formalizacion", monitorea: "Patentes, permisos y autorizaciones",
    consulta: "Cambios en patentes municipales, autorizaciones sanitarias de la SEREMI de Salud y permisos sectoriales (SAG, SERNATUR, transporte)." },
};
export const DEP_KEYS = Object.keys(DEPARTAMENTOS) as Departamento[];

export const ETAPAS: Record<string, { texto: string; tono: "gold" | "ok" | "muted" | "info" }> = {
  detectado: { texto: "Detectado", tono: "gold" },
  en_investigacion: { texto: "En investigación", tono: "gold" },
  pendiente_contraste: { texto: "Pendiente de contraste", tono: "gold" },
  verificado: { texto: "Verificado", tono: "info" },
  revision_profesional: { texto: "En revisión profesional", tono: "gold" },
  publicado: { texto: "Publicado", tono: "ok" },
  actualizado: { texto: "Actualizado", tono: "ok" },
  rectificado: { texto: "Rectificado", tono: "ok" },
  archivado: { texto: "Archivado", tono: "muted" },
};

export const ALERTAS: Record<string, { texto: string; clase: string }> = {
  informativa: { texto: "Informativa", clase: "inf-alerta-informativa" },
  preventiva: { texto: "Preventiva", clase: "inf-alerta-preventiva" },
  importante: { texto: "Importante", clase: "inf-alerta-importante" },
  urgente: { texto: "Urgente", clase: "inf-alerta-urgente" },
};

export const TIPO_CONTENIDO: Record<string, string> = {
  obligacion: "Obligación legal", interpretacion: "Interpretación profesional", recomendacion: "Recomendación", oportunidad: "Oportunidad de financiamiento",
};

export const FICHA_CAMPOS: { key: string; titulo: string }[] = [
  { key: "que_cambio", titulo: "¿Qué cambió?" },
  { key: "antes", titulo: "¿Qué existía antes?" },
  { key: "ahora", titulo: "¿Qué establece ahora?" },
  { key: "afecta_a", titulo: "¿A quién afecta?" },
  { key: "desde", titulo: "¿Desde cuándo se aplica?" },
  { key: "obligaciones", titulo: "¿Qué obligaciones genera?" },
  { key: "riesgos", titulo: "¿Qué riesgos existen?" },
  { key: "acciones", titulo: "¿Qué debes hacer?" },
];

export type Publicacion = {
  id: string; titulo: string; resumen: string; institucion: string | null; tipo: string; fuente: string; publicado: string | null;
  consultado: string | null; vigente_desde: string | null; vigente_hasta: string | null; etapa: string; alerta: string;
  tipo_contenido: string; departamento: string | null; categorias: string[]; revision_profesional: boolean;
  verificado_at: string | null; version: number; ficha: Record<string, string>;
};

// Fechas sin hora (AAAA-MM-DD) se leen a mediodía de Chile para no correrse un día.
export const fechaCL = (d: string | null | undefined, estilo: "medium" | "long" = "medium") =>
  d ? new Intl.DateTimeFormat("es-CL", { dateStyle: estilo, timeZone: "America/Santiago" }).format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00-03:00` : d)) : "—";

// Director IA: planifica cada ronda. Primero lo pedido por la supervisión; después, los departamentos que
// llevan más tiempo sin investigar. Nunca el mismo departamento dos veces en una ronda.
export type PlanInforma = { pedidas: { id: string; departamento: Departamento; tema: string | null }[]; ultimas: Record<string, string | null> };
export type MisionInforma = { id?: string; departamento: Departamento; tema: string | null; origen: "programada" | "demanda" };

export function planificar(plan: PlanInforma, porRonda = 2): MisionInforma[] {
  const elegidas: MisionInforma[] = [];
  for (const p of plan.pedidas) {
    if (elegidas.length >= porRonda) break;
    if (!DEP_KEYS.includes(p.departamento) || elegidas.some((m) => m.departamento === p.departamento)) continue;
    elegidas.push({ id: p.id, departamento: p.departamento, tema: p.tema, origen: "demanda" });
  }
  const antiguedad = (d: Departamento) => (plan.ultimas[d] ? new Date(plan.ultimas[d] as string).getTime() : 0);
  for (const d of [...DEP_KEYS].sort((a, b) => antiguedad(a) - antiguedad(b))) {
    if (elegidas.length >= porRonda) break;
    if (!elegidas.some((m) => m.departamento === d)) elegidas.push({ departamento: d, tema: null, origen: "programada" });
  }
  return elegidas;
}

