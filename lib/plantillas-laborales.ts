// Documentos laborales de la Ley N°21.643 (Ley Karin), versión de plantillas 2026-11.
// Funciones puras: con los datos que entrega la empresa arman un BORRADOR en texto simple (## títulos, párrafos y
// viñetas «- »). Ningún borrador llega al cliente como definitivo sin la aprobación de un abogado de ENQORA.
// Fuentes: Código del Trabajo (arts. 2°, 154 N°12, 211-A y siguientes, 160, 162); SUSESO, Compendio Libro IV,
// Título I, Letra F (estructura y contenidos mínimos del protocolo; modelo del Anexo N°53).

export const PLANTILLAS_VERSION = "karin-2026-11";

export const TIPOS_DOC = {
  protocolo_karin: "Protocolo de prevención del acoso sexual, laboral y la violencia en el trabajo",
  procedimiento_karin: "Procedimiento de investigación y sanción del acoso sexual, laboral y la violencia en el trabajo",
} as const;
export type TipoDoc = keyof typeof TIPOS_DOC;

export type DatosDoc = {
  razon_social: string; rut: string; domicilio: string; representante: string; cargo_representante: string;
  rubro: string; trabajadores: number; atiende_publico: boolean; teletrabajo: boolean;
  canal_correo: string; canal_responsable: string; investigacion: "interna" | "inspeccion";
  organismo: string; // mutual o ISL
};

const r = (s: unknown, max = 200) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);

export function validarDatos(x: Partial<Record<keyof DatosDoc, unknown>>): DatosDoc | string {
  const d: DatosDoc = {
    razon_social: r(x.razon_social, 160), rut: r(x.rut, 12), domicilio: r(x.domicilio, 200), representante: r(x.representante, 120),
    cargo_representante: r(x.cargo_representante, 80), rubro: r(x.rubro, 120), trabajadores: Math.trunc(Number(x.trabajadores)),
    atiende_publico: x.atiende_publico === true || x.atiende_publico === "si", teletrabajo: x.teletrabajo === true || x.teletrabajo === "si",
    canal_correo: r(x.canal_correo, 120).toLowerCase(), canal_responsable: r(x.canal_responsable, 120),
    investigacion: x.investigacion === "inspeccion" ? "inspeccion" : "interna", organismo: r(x.organismo, 40),
  };
  if (d.razon_social.length < 3 || !/^\d{7,8}-[\dkK]$/.test(d.rut)) return "Revisa la razón social y el RUT de la empresa.";
  if (d.representante.length < 3 || d.cargo_representante.length < 3) return "Indica quién firma (la máxima autoridad de la empresa) y su cargo.";
  if (d.domicilio.length < 5 || d.rubro.length < 3) return "Indica el domicilio y el rubro de la empresa.";
  if (!(d.trabajadores >= 1 && d.trabajadores <= 100000)) return "Indica cuántas personas trabajan en la empresa.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.canal_correo) || d.canal_responsable.length < 3) return "Indica el correo y el responsable (cargo) que recibe las denuncias.";
  if (d.organismo.length < 2) return "Indica tu mutual o el ISL.";
  return d;
}

const SIN_RIOHS = (n: number) => n < 10;

export function generarDocumento(tipo: TipoDoc, d: DatosDoc, fecha: string): string {
  return tipo === "protocolo_karin" ? protocolo(d, fecha) : procedimiento(d, fecha);
}

function cabecera(tipo: TipoDoc, d: DatosDoc, fecha: string) {
  return [`# ${TIPOS_DOC[tipo]}`, `${d.razon_social} · RUT ${d.rut}`, `Domicilio: ${d.domicilio}`, `Fecha de esta versión: ${fecha}`, ""];
}

function protocolo(d: DatosDoc, fecha: string): string {
  const L = cabecera("protocolo_karin", d, fecha);
  L.push(
    "## 1. Política de prevención",
    `${d.razon_social} declara su compromiso con un ambiente de trabajo seguro, saludable y de mutuo respeto, y adopta tolerancia cero frente a la discriminación, el acoso sexual, el acoso laboral y la violencia en el trabajo, cualquiera sea la persona que los ejerza.`,
    "Esta política se basa en los principios de la Política Nacional de Seguridad y Salud en el Trabajo:",
    "- Respeto a la vida y a la integridad física y psíquica de las personas trabajadoras como derecho fundamental.",
    "- Enfoque preventivo, controlando los riesgos desde su origen.",
    "- Equidad de género y diversidad.",
    "- Universalidad e inclusión.",
    "- Participación y diálogo social.",
    "- Mejora continua, con metas e indicadores medibles que se revisan periódicamente.",
    "- Responsabilidad de la entidad empleadora en la gestión de los riesgos.",
    "Y en los principios para la gestión preventiva de los riesgos psicosociales: tolerancia cero; valores fundamentales de un entorno seguro; participación y diálogo social con construcción bipartita; control de los riesgos en su origen; y perspectiva de género.",
    "",
    "## 2. Conductas que este protocolo previene",
    "- Acoso sexual: que una persona realice, en forma indebida y por cualquier medio, requerimientos de carácter sexual no consentidos por quien los recibe, que amenacen o perjudiquen su situación laboral o sus oportunidades en el empleo (art. 2° del Código del Trabajo).",
    "- Acoso laboral: toda conducta que constituya agresión u hostigamiento, ejercida por el empleador o por una o más personas trabajadoras en contra de otra u otras, por cualquier medio, se manifieste una sola vez o de manera reiterada, y que tenga como resultado su menoscabo, maltrato o humillación, o que amenace o perjudique su situación laboral o sus oportunidades en el empleo (art. 2° del Código del Trabajo).",
    "- Violencia en el trabajo ejercida por terceros: conductas que afecten a las personas trabajadoras con ocasión de la prestación de sus servicios, por parte de clientes, proveedores o usuarios, entre otros (art. 2° del Código del Trabajo).",
    "- También se previenen los comportamientos incívicos y sexistas, que pueden dar origen a las conductas anteriores.",
    "",
    "## 3. Identificación de peligros y evaluación de riesgos",
    SIN_RIOHS(d.trabajadores)
      ? `Por contar con menos de 10 personas trabajadoras, ${d.razon_social} identificará los peligros y evaluará los riesgos psicosociales con la pauta para entidades pequeñas de la Superintendencia de Seguridad Social (Anexo N°54), con perspectiva de género y con la asistencia técnica de ${d.organismo}.`
      : `${d.razon_social} identificará los peligros y evaluará los riesgos psicosociales asociados al acoso y la violencia con perspectiva de género, conforme al Protocolo de Vigilancia de Riesgos Psicosociales del Ministerio de Salud y al cuestionario CEAL-SM/SUSESO, con la asistencia técnica de ${d.organismo}.`,
    `Rubro: ${d.rubro}.${d.atiende_publico ? " La empresa atiende público, por lo que se evaluará en especial el riesgo de violencia ejercida por clientes o usuarios." : ""}${d.teletrabajo ? " Hay personas en trabajo a distancia o teletrabajo: la evaluación incluirá los medios digitales de comunicación." : ""}`,
    "",
    "## 4. Medidas de prevención y control",
    "Programa de trabajo (se revisa y actualiza con participación de las personas trabajadoras):",
    `- Difundir este protocolo y el procedimiento de investigación a todas las personas trabajadoras. Responsable: ${d.cargo_representante}. Plazo: 30 días desde su aprobación. Indicador: % de personas que confirman su recepción.`,
    `- Realizar la evaluación de riesgos del punto 3. Responsable: ${d.cargo_representante}, con ${d.organismo}. Plazo: 90 días. Indicador: evaluación realizada y sus resultados informados.`,
    `- Capacitar a todas las personas trabajadoras, incluidas jefaturas y gerencia. Responsable: ${d.cargo_representante}. Plazo: 6 meses y luego una vez al año. Indicador: % de personas capacitadas.`,
    ...(d.atiende_publico ? [`- Fijar reglas de atención y apoyo ante clientes o usuarios agresivos (aviso visible, derecho a suspender la atención, registro de incidentes). Responsable: ${d.cargo_representante}. Plazo: 60 días. Indicador: incidentes registrados y atendidos.`] : []),
    "- Revisar el cumplimiento y la eficacia de estas medidas y corregirlas cuando no den resultado. Plazo: al menos una vez al año.",
    "",
    "## 5. Información y capacitación",
    "Las personas trabajadoras serán informadas sobre los riesgos identificados, las medidas de prevención, sus derechos y responsabilidades, la forma de presentar una denuncia completa y coherente, y el resguardo de la información sensible. La capacitación es periódica e incluye a gerentes y jefaturas.",
    "",
    "## 6. Canales de denuncia",
    `Las denuncias se pueden presentar por escrito o verbalmente a ${d.canal_responsable}, o al correo ${d.canal_correo}. También se pueden presentar directamente en la Inspección del Trabajo.`,
    "La denuncia y su investigación siguen el procedimiento de investigación y sanción de la empresa.",
    "",
    "## 7. Resguardos",
    "Se protegerá la privacidad y la honra de las personas denunciantes, víctimas, denunciadas y testigos. Se adoptarán medidas de resguardo desde la recepción de la denuncia. Nadie podrá sufrir represalias por denunciar o declarar de buena fe. Las medidas de prevención, formación y protección se mantienen con independencia del resultado de la investigación.",
    "",
    "## 8. Difusión y vigencia",
    SIN_RIOHS(d.trabajadores)
      ? "Este protocolo se entrega a cada persona trabajadora al firmar su contrato de trabajo, junto con el procedimiento de investigación y sanción, y se publica en los medios disponibles de la empresa."
      : "Este protocolo y el procedimiento de investigación y sanción se incorporan al Reglamento Interno de Orden, Higiene y Seguridad (art. 154 N°12 del Código del Trabajo) y se publican en los medios disponibles de la empresa.",
    "Se revisará al menos una vez al año, o antes si cambian las condiciones de trabajo o la normativa.",
    "",
    "## Firma",
    `${d.representante}`,
    `${d.cargo_representante} · ${d.razon_social}`,
  );
  return L.join("\n");
}

function procedimiento(d: DatosDoc, fecha: string): string {
  const L = cabecera("procedimiento_karin", d, fecha);
  L.push(
    "## 1. Objeto y alcance",
    `Este procedimiento regula la recepción, investigación y sanción de las denuncias de acoso sexual, acoso laboral y violencia en el trabajo en ${d.razon_social}, conforme a los artículos 211-A y siguientes del Código del Trabajo. Se aplica a todas las personas trabajadoras, cualquiera sea su cargo o tipo de contrato.`,
    "",
    "## 2. Presentación de la denuncia",
    `- La persona afectada puede denunciar por escrito o verbalmente a ${d.canal_responsable} o al correo ${d.canal_correo}. Una denuncia verbal se deja por escrito en un acta firmada por quien denuncia.`,
    "- También puede denunciar directamente en la Inspección del Trabajo.",
    "- La denuncia debe indicar, en lo posible, los hechos, las personas involucradas, las fechas y los antecedentes con que se cuente.",
    "- Se informará a la persona denunciante sobre los canales para denunciar hechos que puedan constituir delito.",
    "",
    "## 3. Medidas de resguardo",
    "Al recibir la denuncia, la empresa adoptará de inmediato medidas de resguardo según la gravedad de los hechos y las posibilidades de la empresa, como la separación de espacios físicos, la redistribución de la jornada o la derivación de la persona afectada a atención psicológica temprana a través del organismo administrador de la Ley N°16.744.",
    "",
    "## 4. Inicio de la investigación",
    d.investigacion === "interna"
      ? "Dentro de los 3 días siguientes a la recepción de la denuncia, la empresa iniciará una investigación interna o, si lo estima pertinente, remitirá los antecedentes a la Inspección del Trabajo para que la realice."
      : "Dentro de los 3 días siguientes a la recepción de la denuncia, la empresa remitirá los antecedentes a la Inspección del Trabajo para que realice la investigación.",
    "",
    "## 5. Investigación interna",
    "- Estará a cargo de una persona con formación en acoso, género o derechos fundamentales, imparcial y sin relación con los hechos, o de una entidad externa especializada.",
    "- Se realizará con estricta reserva, oyendo a ambas partes, que podrán presentar antecedentes y proponer testigos, con imparcialidad, celeridad y perspectiva de género.",
    "- Debe concluir en un plazo máximo de 30 días, con un informe que contenga los hechos, las diligencias, las conclusiones y las medidas o sanciones que se proponen.",
    "- El informe se remite a la Inspección del Trabajo, que tiene 30 días para pronunciarse. Si no lo hace, se tendrán por válidas las conclusiones del informe.",
    "",
    "## 6. Medidas y sanciones",
    "- Dentro de los 15 días siguientes a la recepción del pronunciamiento de la Inspección o al vencimiento de su plazo, la empresa adoptará las medidas y sanciones que correspondan y las comunicará a la persona denunciante y a la denunciada.",
    "- Las sanciones pueden ser amonestación verbal o escrita, multa de hasta el 25% de la remuneración diaria, o el término del contrato por las causales del artículo 160 N°1 letras b) o f) del Código del Trabajo, según la gravedad de los hechos.",
    "- El despido se comunicará con la carta del artículo 162 del Código del Trabajo, indicando la causal y los hechos.",
    "",
    "## 7. Reserva y no represalia",
    "Toda la información de la investigación es reservada. Nadie podrá sufrir represalias por denunciar o declarar de buena fe. Las denuncias inconsistentes se tratarán con los mismos resguardos para todas las partes.",
    "",
    "## 8. Difusión",
    SIN_RIOHS(d.trabajadores)
      ? "Este procedimiento se entrega a cada persona trabajadora al firmar su contrato de trabajo, junto con el protocolo de prevención."
      : "Este procedimiento forma parte del Reglamento Interno de Orden, Higiene y Seguridad (art. 154 N°12 del Código del Trabajo).",
    "",
    "## Firma",
    `${d.representante}`,
    `${d.cargo_representante} · ${d.razon_social}`,
  );
  return L.join("\n");
}

// Pendientes que la empresa debe cumplir aparte (no los resuelve el documento).
export function recordatorios(d: DatosDoc): string[] {
  const out = ["Firma de la máxima autoridad y difusión a todas las personas trabajadoras, con registro de recepción."];
  if (d.trabajadores >= 10) out.push("Incorporar ambos documentos al Reglamento Interno de Orden, Higiene y Seguridad y entregar la copia a la Dirección del Trabajo (en formato electrónico) y a la SEREMI de Salud.");
  else out.push("Entregar ambos documentos al firmar cada contrato de trabajo e incorporarlos al Reglamento Interno de Higiene y Seguridad (art. 67, Ley N°16.744).");
  out.push(`Solicitar a ${d.organismo} la asistencia técnica para la evaluación de riesgos psicosociales.`);
  return out;
}
