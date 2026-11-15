// Bóveda de archivos ENQORA (0059): catálogo de documentos, estados y equipo documental.
// Solo datos: las reglas (quién puede, cuándo, cuatro ojos, previsualización obligatoria) viven en la base.

export type Revisor = "abogado" | "contador" | "profesional";
export type Clase = "escrito_legal" | "contrato" | "poder_mandato" | "solicitud_tramite" | "declaracion" | "informe" | "correspondencia" | "otro";

export type TipoDocumento = {
  key: string; titulo: string; clase: Clase; revisor: Revisor;
  // Antecedentes que la Secretaria debe reunir antes de que el Redactor escriba.
  antecedentes: string[];
  // Reglas de la base de conocimiento (lib/knowledge.ts) que el Redactor debe considerar, con su fuente.
  normas: string[];
  // Áreas ENQORA (para usar lo publicado en ENQORA Informa del área).
  areas: string[];
  pistas: RegExp;
};

export const TIPOS: TipoDocumento[] = [
  { key: "antecedentes_marca", titulo: "Ficha de antecedentes para registro de marca (INAPI)", clase: "solicitud_tramite", revisor: "abogado",
    antecedentes: ["Titular (nombre o razón social y RUT)", "Signo a registrar (palabra, logo o ambos)", "Tipo de marca (denominativa, figurativa o mixta)", "Productos o servicios y clases de Niza", "Representante y poder, si actúa un tercero"],
    normas: ["marcas", "propiedad_industrial"], areas: ["marcas"], pistas: /marca|inapi|logo|niza|propiedad industrial/ },
  { key: "poder_simple", titulo: "Poder simple o mandato", clase: "poder_mandato", revisor: "abogado",
    antecedentes: ["Mandante (nombre, RUT y domicilio)", "Mandatario (nombre y RUT)", "Trámite o facultades que se otorgan", "Vigencia del poder"],
    normas: [], areas: ["profesionales"], pistas: /poder|mandato|representar|autoriz/ },
  { key: "respuesta_fiscalizacion", titulo: "Respuesta a requerimiento o fiscalización (SII o Dirección del Trabajo)", clase: "escrito_legal", revisor: "profesional",
    antecedentes: ["Institución y número del requerimiento o fiscalización", "Fecha de notificación", "Hechos y antecedentes que se acompañan", "Lo que se solicita"],
    normas: ["prescripcion_200", "multa_97_2"], areas: ["tributario", "empleador"], pistas: /fiscaliz|requerimiento|notificaci|citaci|respuesta al sii|inspecci/ },
  { key: "solicitud_condonacion", titulo: "Solicitud de condonación de intereses y multas", clase: "solicitud_tramite", revisor: "contador",
    antecedentes: ["Contribuyente (nombre y RUT)", "Deuda y períodos (formularios y montos)", "Motivo del atraso", "Forma de pago propuesta"],
    normas: ["tgr_condonacion", "interes_53"], areas: ["tributario"], pistas: /condonaci|convenio|deuda|tesorer|tgr|intereses y multas/ },
  { key: "minuta_tributaria", titulo: "Minuta o informe tributario", clase: "informe", revisor: "contador",
    antecedentes: ["Contribuyente y régimen tributario", "Consulta o situación a analizar", "Períodos involucrados", "Documentos revisados"],
    normas: ["pro_pyme", "f29_plazos", "iva_credito_24"], areas: ["tributario", "contabilidad"], pistas: /minuta|informe tributari|r[eé]gimen|iva|renta|f29|f22/ },
  { key: "contrato_trabajo", titulo: "Contrato de trabajo", clase: "contrato", revisor: "abogado",
    antecedentes: ["Empleador (razón social, RUT y domicilio)", "Trabajador (nombre, RUN, domicilio y nacionalidad)", "Cargo, funciones y lugar de trabajo", "Jornada y distribución", "Remuneración y forma de pago", "Duración del contrato y fecha de inicio"],
    normas: ["jornada_40h", "ley_karin"], areas: ["empleador"], pistas: /contrato de trabajo|contratar|contrataci[oó]n de (un|una)|trabajador nuevo/ },
  { key: "carta_despido", titulo: "Carta de aviso de término de contrato (borrador)", clase: "escrito_legal", revisor: "abogado",
    antecedentes: ["Empleador y trabajador (nombres y RUT)", "Causal legal invocada y artículo", "Hechos que fundan la causal", "Fecha de término", "Estado de cotizaciones previsionales"],
    normas: ["despido_plazo_168", "prescripcion_laboral_510"], areas: ["empleador"], pistas: /despid|carta de aviso|t[eé]rmino de contrato|desvincul/ },
  { key: "finiquito", titulo: "Finiquito (borrador)", clase: "contrato", revisor: "abogado",
    antecedentes: ["Empleador y trabajador (nombres y RUT)", "Fechas de inicio y término", "Causal de término", "Montos: remuneraciones pendientes, vacaciones e indemnizaciones", "Estado de cotizaciones previsionales"],
    normas: ["prescripcion_laboral_510"], areas: ["empleador", "trabajador"], pistas: /finiquito/ },
  { key: "contrato_servicios", titulo: "Contrato de prestación de servicios", clase: "contrato", revisor: "abogado",
    antecedentes: ["Partes (nombres, RUT y domicilios)", "Servicio que se presta y entregables", "Precio y forma de pago", "Plazo y término", "Confidencialidad y datos personales"],
    normas: ["datos_personales", "retencion_honorarios"], areas: ["profesionales"], pistas: /prestaci[oó]n de servicios|contrato con (un|una) proveedor|honorarios/ },
  { key: "declaracion_jurada", titulo: "Declaración jurada simple", clase: "declaracion", revisor: "abogado",
    antecedentes: ["Declarante (nombre, RUN y domicilio)", "Hechos que se declaran", "Institución o trámite para el que se presenta"],
    normas: [], areas: ["profesionales"], pistas: /declaraci[oó]n jurada|declaro|jurad/ },
  { key: "informe_caso", titulo: "Informe de situación del caso", clase: "informe", revisor: "profesional",
    antecedentes: ["Situación actual del caso", "Gestiones realizadas", "Próximos pasos y plazos", "Documentos pendientes del cliente"],
    normas: [], areas: [], pistas: /informe|estado del caso|resumen del caso|avance/ },
  { key: "carta", titulo: "Carta o comunicación formal", clase: "correspondencia", revisor: "profesional",
    antecedentes: ["Destinatario (nombre, cargo e institución)", "Asunto", "Lo que se comunica o solicita"],
    normas: [], areas: [], pistas: /carta|comunicaci[oó]n|oficio|correo formal/ },
  { key: "otro", titulo: "Otro documento", clase: "otro", revisor: "profesional",
    antecedentes: ["Qué documento se necesita y para qué", "Destinatario o institución", "Datos que debe contener"],
    normas: [], areas: [], pistas: /$^/ },
];
export const tipoPorKey = (k: string | null | undefined) => TIPOS.find((t) => t.key === k) ?? TIPOS[TIPOS.length - 1];

// Archivero (reglas): si no hay IA, interpreta el pedido por palabras clave.
export function interpretarPedido(texto: string): TipoDocumento {
  const t = texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return TIPOS.find((x) => x.pistas.test(t)) ?? tipoPorKey("otro");
}

export const ESTADOS: Record<string, { texto: string; tono: "gold" | "ok" | "muted" | "info" }> = {
  solicitado: { texto: "Pedido al Archivero", tono: "gold" },
  antecedentes: { texto: "Antecedentes reunidos", tono: "gold" },
  borrador: { texto: "Borrador", tono: "gold" },
  en_revision: { texto: "En revisión profesional", tono: "info" },
  observado: { texto: "Observado", tono: "gold" },
  aprobado: { texto: "Aprobado · por autorizar", tono: "info" },
  enviado: { texto: "Autorizado y enviado", tono: "ok" },
  archivado: { texto: "Archivado", tono: "ok" },
  anulado: { texto: "Anulado", tono: "muted" },
};

export const CLASES: Record<string, string> = {
  escrito_legal: "Escrito legal", contrato: "Contrato", poder_mandato: "Poder o mandato", solicitud_tramite: "Solicitud o trámite",
  declaracion: "Declaración", informe: "Informe", correspondencia: "Correspondencia", respaldo_tributario: "Respaldo tributario",
  respaldo_contable: "Respaldo contable", respaldo_laboral: "Respaldo laboral", identidad: "Identidad", evidencia: "Archivo del caso", otro: "Otro",
};

export const REVISORES: Record<Revisor, string> = { abogado: "Abogado", contador: "Contador", profesional: "Abogado o contador" };

export const ACCIONES: Record<string, string> = {
  registrado: "Registrado en la Bóveda", pedido: "Pedido al Archivero", antecedentes: "Secretaria reunió los antecedentes",
  borrador: "Nueva versión del borrador", enviado_a_revision: "Enviado a revisión profesional", visualizado: "Previsualizado",
  aprobado: "Aprobado por el revisor", observado: "Observado por el revisor", autorizado_enviado: "Autorizado y enviado",
  asignado: "Responsables asignados", anulado: "Anulado", retencion: "Retención actualizada", descargado: "Descargado",
};

// El equipo documental de ENQORA.
export const EQUIPO = [
  { rol: "Archivero", quien: "Agente IA + encargado del caso", hace: "Recibe el pedido, identifica el tipo de documento, le da folio y lo registra en la Bóveda." },
  { rol: "Secretaria", quien: "Agente IA", hace: "Reúne los antecedentes del caso (empresa, partes, archivos, historial) y lista lo que falta." },
  { rol: "Redactor", quien: "Agente IA", hace: "Redacta el borrador con los antecedentes y la normativa vigente; marca [COMPLETAR] donde falta un dato." },
  { rol: "Revisor", quien: "Abogado o contador", hace: "Previsualiza y revisa cada versión; aprueba u observa. Nunca aprueba lo que redactó él mismo." },
  { rol: "Autorizador", quien: "Responsable del caso o supervisión", hace: "Autoriza y envía: la versión final queda congelada con su huella SHA-256." },
];
