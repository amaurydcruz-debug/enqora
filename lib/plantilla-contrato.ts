// Contrato individual de trabajo y anexos (0085). Plantilla contrato-2026-11. Función pura que arma un BORRADOR con
// las estipulaciones mínimas del art. 10 del Código del Trabajo; un abogado de ENQORA (persona) lo revisa y aprueba
// antes de que la empresa lo imprima. Jornada ordinaria máxima de 42 horas semanales desde el 26-04-2026 (Ley 21.561).

export const PLANTILLA_CONTRATO_VERSION = "contrato-2026-11";
export const JORNADA_MAXIMA = 42;

export type DatosContrato = {
  ciudad: string; fecha: string;
  // Trabajador (art. 10 N° 2): nacionalidad, fecha de nacimiento, domicilio y correo si lo tiene.
  nacionalidad: string; fecha_nacimiento: string; domicilio_trabajador: string; email_trabajador: string;
  // Empleador
  representante: string; rut_representante: string; email_empleador: string;
  // Servicios, lugar, jornada y plazo
  funciones: string; lugar: string; distribucion: string; plazo_hasta: string; obra: string;
  forma_pago: "transferencia" | "efectivo" | "cheque"; dia_pago: string; especies: string; procedencia: string; otros_pactos: string;
};
export type FichaContrato = {
  nombre: string; rut: string; cargo: string | null; fecha_ingreso: string; tipo_contrato: "indefinido" | "plazo_fijo" | "obra";
  sueldo_base: number; jornada_horas: number; colacion: number; movilizacion: number; gratificacion: "art50" | "ninguna";
};
export type EmpresaContrato = { nombre: string; rut: string; domicilio: string };

export const TIPOS_ANEXO = {
  remuneracion: "Modificación de la remuneración",
  jornada: "Modificación de la jornada o su distribución",
  funciones: "Modificación de funciones o lugar de trabajo",
  plazo: "Renovación o cambio del plazo del contrato",
  otro: "Otra modificación",
} as const;
export type TipoAnexo = keyof typeof TIPOS_ANEXO;
export type DatosAnexo = { ciudad: string; fecha: string; materia: TipoAnexo; vigencia: string; texto: string; representante: string };

const FECHA = /^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const FECHA_NAC = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const limpio = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n]+/g, " ").replace(/[<>#]/g, "").trim().slice(0, max);
const RUT = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;

export function validarContrato(x: Partial<Record<keyof DatosContrato, unknown>>, f: FichaContrato): DatosContrato | string {
  const d: DatosContrato = {
    ciudad: limpio(x.ciudad, 60), fecha: limpio(x.fecha, 10), nacionalidad: limpio(x.nacionalidad, 40), fecha_nacimiento: limpio(x.fecha_nacimiento, 10),
    domicilio_trabajador: limpio(x.domicilio_trabajador, 200), email_trabajador: limpio(x.email_trabajador, 120),
    representante: limpio(x.representante, 120), rut_representante: limpio(x.rut_representante, 12), email_empleador: limpio(x.email_empleador, 120),
    funciones: limpio(x.funciones, 600), lugar: limpio(x.lugar, 200), distribucion: limpio(x.distribucion, 300),
    plazo_hasta: limpio(x.plazo_hasta, 10), obra: limpio(x.obra, 300),
    forma_pago: (["transferencia", "efectivo", "cheque"].includes(String(x.forma_pago)) ? x.forma_pago : "transferencia") as DatosContrato["forma_pago"],
    dia_pago: limpio(x.dia_pago, 60), especies: limpio(x.especies, 300), procedencia: limpio(x.procedencia, 120), otros_pactos: limpio(x.otros_pactos, 1500),
  };
  if (d.ciudad.length < 2 || !FECHA.test(d.fecha)) return "Indica la ciudad y la fecha del contrato.";
  if (d.nacionalidad.length < 3 || !FECHA_NAC.test(d.fecha_nacimiento) || d.domicilio_trabajador.length < 5) return "Completa la nacionalidad, la fecha de nacimiento y el domicilio del trabajador.";
  if (d.email_trabajador && !EMAIL.test(d.email_trabajador)) return "Revisa el correo del trabajador.";
  if (d.email_empleador && !EMAIL.test(d.email_empleador)) return "Revisa el correo del empleador.";
  if (d.representante.length < 5 || !RUT.test(d.rut_representante)) return "Indica el nombre y el RUT del representante legal.";
  if (d.funciones.length < 10 || d.lugar.length < 3) return "Describe las funciones y el lugar donde se prestan los servicios.";
  if (d.distribucion.length < 10) return "Indica cómo se distribuye la jornada (días y horario).";
  if (f.tipo_contrato === "plazo_fijo" && (!FECHA.test(d.plazo_hasta) || d.plazo_hasta <= f.fecha_ingreso)) return "Indica hasta cuándo dura el contrato a plazo fijo.";
  if (f.tipo_contrato === "obra" && d.obra.length < 10) return "Describe la obra o faena para la que se contrata.";
  if (d.dia_pago.length < 3) return "Indica cuándo se paga la remuneración.";
  return d;
}

// Avisos para el abogado y la empresa (no bloquean: el abogado decide).
export function avisosContrato(d: DatosContrato, f: FichaContrato, imm: number | null): string[] {
  const a: string[] = [];
  if (f.jornada_horas > JORNADA_MAXIMA) a.push(`La jornada de ${f.jornada_horas} horas supera el máximo legal de ${JORNADA_MAXIMA} horas semanales vigente desde el 26-04-2026.`);
  if (imm && f.sueldo_base < Math.round((imm * Math.min(f.jornada_horas, JORNADA_MAXIMA)) / JORNADA_MAXIMA))
    a.push("El sueldo base es menor al ingreso mínimo mensual (proporcional a la jornada).");
  if (f.tipo_contrato === "plazo_fijo" && d.plazo_hasta) {
    const ini = new Date(`${f.fecha_ingreso}T00:00:00Z`), fin = new Date(`${d.plazo_hasta}T00:00:00Z`);
    if ((fin.getTime() - ini.getTime()) / 86400000 > 366) a.push("El plazo fijo supera un año: solo se permite hasta dos años para gerentes o personas con título profesional o técnico (art. 159 N° 4).");
  }
  const dias = (new Date(`${d.fecha}T00:00:00Z`).getTime() - new Date(`${f.fecha_ingreso}T00:00:00Z`).getTime()) / 86400000;
  if (dias > 15) a.push("El contrato se escribe después de 15 días desde el ingreso (art. 9 exige escriturarlo dentro de ese plazo; 5 días si es por obra o de menos de 30 días).");
  return a;
}

const pesos = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const largo = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });
const FORMA = { transferencia: "transferencia electrónica a la cuenta que indique el trabajador", efectivo: "dinero efectivo", cheque: "cheque nominativo" };

export function textoContrato(d: DatosContrato, f: FichaContrato, e: EmpresaContrato): string {
  const l: string[] = [];
  let n = 0;
  const cl = (t: string) => { n++; l.push(`## ${["Primero", "Segundo", "Tercero", "Cuarto", "Quinto", "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo", "Undécimo", "Duodécimo"][n - 1] ?? n}: ${t}`); };
  l.push("# Contrato individual de trabajo", "");
  l.push(`En ${d.ciudad}, a ${largo(d.fecha)}, entre ${e.nombre}, RUT ${e.rut}, con domicilio en ${e.domicilio || "____________"}${d.email_empleador ? ` y correo ${d.email_empleador}` : ""}, representada por ${d.representante}, RUT ${d.rut_representante}, en adelante «el empleador»; y don(ña) ${f.nombre}, RUT ${f.rut}, de nacionalidad ${d.nacionalidad}, nacido(a) el ${largo(d.fecha_nacimiento)}, con domicilio en ${d.domicilio_trabajador}${d.email_trabajador ? ` y correo ${d.email_trabajador}` : ""}, en adelante «el trabajador», se celebra el siguiente contrato de trabajo:`, "");
  cl("Servicios");
  l.push(`El trabajador se obliga a prestar servicios como ${f.cargo || "____________"}, con las siguientes funciones: ${d.funciones}.`, "");
  cl("Lugar de trabajo");
  l.push(`Los servicios se prestarán en ${d.lugar}.${d.procedencia ? ` Se deja constancia de que el trabajador fue contratado desde ${d.procedencia}, lugar de su procedencia.` : ""}`, "");
  cl("Jornada");
  l.push(`La jornada ordinaria será de ${f.jornada_horas} horas semanales, distribuidas de la siguiente forma: ${d.distribucion}. Las horas extraordinarias solo se trabajarán cuando se pacten por escrito y se pagarán con el recargo legal.`, "");
  cl("Remuneración");
  l.push(`El empleador pagará al trabajador un sueldo base mensual de ${pesos(f.sueldo_base)}.`);
  if (f.gratificacion === "art50") l.push("Además pagará una gratificación mensual equivalente al 25% de lo devengado por remuneraciones mensuales, con el tope de 4,75 ingresos mínimos mensuales al año, conforme al artículo 50 del Código del Trabajo.");
  if (f.colacion > 0 || f.movilizacion > 0) l.push(`Asimismo pagará, como asignaciones no remuneracionales, ${[f.colacion > 0 ? `colación por ${pesos(f.colacion)}` : "", f.movilizacion > 0 ? `movilización por ${pesos(f.movilizacion)}` : ""].filter(Boolean).join(" y ")} al mes.`);
  if (d.especies) l.push(`Beneficios en especie: ${d.especies}.`);
  l.push(`La remuneración se pagará por períodos mensuales, ${d.dia_pago}, mediante ${FORMA[d.forma_pago]}. De ella se descontarán los impuestos y las cotizaciones de seguridad social que correspondan.`, "");
  cl("Plazo");
  if (f.tipo_contrato === "indefinido") l.push(`El contrato es de duración indefinida. El trabajador ingresó a prestar servicios el ${largo(f.fecha_ingreso)}.`, "");
  else if (f.tipo_contrato === "plazo_fijo") l.push(`El contrato es a plazo fijo, desde el ${largo(f.fecha_ingreso)} hasta el ${largo(d.plazo_hasta)}.`, "");
  else l.push(`El contrato es por obra o faena: ${d.obra}. Rige desde el ${largo(f.fecha_ingreso)} y termina con la conclusión de esa obra o faena.`, "");
  cl("Reglamento interno y prevención del acoso");
  l.push("El trabajador declara conocer el reglamento interno de orden, higiene y seguridad, si la empresa está obligada a tenerlo, y el protocolo de prevención del acoso sexual, laboral y la violencia en el trabajo (Ley 21.643), que el empleador le entrega en este acto.", "");
  cl("Datos personales");
  l.push("El empleador tratará los datos personales del trabajador solo para administrar este contrato y cumplir las obligaciones laborales, previsionales y tributarias, conforme a la Ley 19.628 y sus modificaciones. El trabajador puede ejercer sus derechos de acceso, rectificación, supresión, oposición y portabilidad ante el empleador.", "");
  if (d.otros_pactos) { cl("Otros pactos"); l.push(`${d.otros_pactos}`, ""); }
  cl("Ejemplares");
  l.push("El contrato se firma en dos ejemplares del mismo tenor, quedando uno en poder de cada parte. El empleador lo registrará en el portal de la Dirección del Trabajo cuando corresponda.", "");
  l.push("Firma del empleador: ______________________________", "");
  l.push(`Firma del trabajador (${f.rut}): ______________________________`);
  return l.join("\n");
}

export function validarAnexo(x: Partial<Record<keyof DatosAnexo, unknown>>): DatosAnexo | string {
  const d: DatosAnexo = {
    ciudad: limpio(x.ciudad, 60), fecha: limpio(x.fecha, 10), materia: (String(x.materia) in TIPOS_ANEXO ? x.materia : "otro") as TipoAnexo,
    vigencia: limpio(x.vigencia, 10), texto: String(x.texto ?? "").replace(/[<>#]/g, "").trim().slice(0, 3000), representante: limpio(x.representante, 120),
  };
  if (d.ciudad.length < 2 || !FECHA.test(d.fecha) || !FECHA.test(d.vigencia)) return "Indica la ciudad, la fecha del anexo y desde cuándo rige.";
  if (d.texto.length < 20) return "Describe la modificación que se acuerda.";
  if (d.representante.length < 5) return "Indica el nombre del representante legal.";
  return d;
}

export function textoAnexo(d: DatosAnexo, f: FichaContrato, e: EmpresaContrato, numero: number): string {
  return [
    `# Anexo N° ${numero} de contrato de trabajo`, "",
    `En ${d.ciudad}, a ${largo(d.fecha)}, entre ${e.nombre}, RUT ${e.rut}, representada por ${d.representante}, en adelante «el empleador», y don(ña) ${f.nombre}, RUT ${f.rut}, en adelante «el trabajador», se acuerda el siguiente anexo al contrato de trabajo vigente desde el ${largo(f.fecha_ingreso)}:`, "",
    `## Primero: ${TIPOS_ANEXO[d.materia]}`,
    d.texto, "",
    "## Segundo: vigencia",
    `Esta modificación rige desde el ${largo(d.vigencia)}. En todo lo no modificado se mantiene el contrato de trabajo y sus anexos anteriores.`, "",
    "## Tercero: ejemplares",
    "El anexo se firma en dos ejemplares, uno para cada parte, y se entiende formar parte del contrato de trabajo (art. 11 del Código del Trabajo).", "",
    "Firma del empleador: ______________________________", "",
    `Firma del trabajador (${f.rut}): ______________________________`,
  ].join("\n");
}

// ---------- Pacto de horas extraordinarias (art. 32; 0086) ----------
// Solo para necesidades o situaciones temporales; por escrito; vigencia no superior a tres meses, renovable; máximo
// 2 horas extraordinarias por día; recargo mínimo de 50% o compensación por días adicionales de feriado (hasta 5
// días hábiles al año, a usar dentro de los seis meses siguientes).
export type DatosPactoHE = {
  ciudad: string; fecha: string; desde: string; hasta: string; horas_dia: number; motivo: string; compensacion: "pago" | "feriado"; representante: string;
};
// Último día permitido: un día antes de cumplir tres meses desde el inicio.
export function hastaMaximoPacto(desde: string): string {
  const d = new Date(`${desde}T00:00:00Z`);
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1));
  const ultimo = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(d.getUTCDate(), ultimo));
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
}
export function validarPactoHE(x: Partial<Record<keyof DatosPactoHE, unknown>>, ingreso: string): DatosPactoHE | string {
  const d: DatosPactoHE = {
    ciudad: limpio(x.ciudad, 60), fecha: limpio(x.fecha, 10), desde: limpio(x.desde, 10), hasta: limpio(x.hasta, 10),
    horas_dia: Math.round(Number(String(x.horas_dia ?? "").replace(",", ".")) * 2) / 2, motivo: limpio(x.motivo, 500),
    compensacion: x.compensacion === "feriado" ? "feriado" : "pago", representante: limpio(x.representante, 120),
  };
  if (d.ciudad.length < 2 || !FECHA.test(d.fecha) || d.representante.length < 5) return "Indica la ciudad, la fecha y el representante legal.";
  if (!FECHA.test(d.desde) || !FECHA.test(d.hasta) || d.hasta < d.desde || d.desde < ingreso) return "Revisa las fechas del pacto.";
  if (d.hasta > hastaMaximoPacto(d.desde)) return "El pacto puede durar como máximo tres meses; para seguir, se firma uno nuevo.";
  if (!(d.horas_dia >= 0.5 && d.horas_dia <= 2)) return "Las horas extraordinarias no pueden ser más de dos por día.";
  if (d.motivo.length < 15) return "Describe la necesidad o situación temporal que justifica las horas extraordinarias.";
  return d;
}
export function textoPactoHE(d: DatosPactoHE, f: FichaContrato, e: EmpresaContrato): string {
  const h = String(d.horas_dia).replace(".", ",");
  return [
    "# Pacto de horas extraordinarias", "",
    `En ${d.ciudad}, a ${largo(d.fecha)}, entre ${e.nombre}, RUT ${e.rut}, representada por ${d.representante}, en adelante «el empleador», y don(ña) ${f.nombre}, RUT ${f.rut}, en adelante «el trabajador», se acuerda el siguiente pacto conforme al artículo 32 del Código del Trabajo:`, "",
    "## Primero: necesidad temporal",
    `Las horas extraordinarias se pactan para atender la siguiente necesidad o situación temporal de la empresa: ${d.motivo}.`, "",
    "## Segundo: vigencia",
    `Este pacto rige desde el ${largo(d.desde)} hasta el ${largo(d.hasta)}. No supera tres meses y solo puede renovarse por acuerdo escrito de las partes.`, "",
    "## Tercero: límite",
    `El trabajador podrá trabajar hasta ${h} hora${d.horas_dia === 1 ? "" : "s"} extraordinaria${d.horas_dia === 1 ? "" : "s"} por día, sin superar el máximo legal de dos horas diarias. Solo se trabajarán cuando el empleador las requiera dentro de este pacto.`, "",
    "## Cuarto: pago o compensación",
    d.compensacion === "feriado"
      ? "Las partes acuerdan que las horas extraordinarias se compensen con días adicionales de feriado, hasta cinco días hábiles al año, que el trabajador usará dentro de los seis meses siguientes. Las horas que excedan esa compensación se pagarán con un recargo de 50% sobre el sueldo convenido para la jornada ordinaria."
      : "Las horas extraordinarias se pagarán con un recargo de 50% sobre el sueldo convenido para la jornada ordinaria, junto con las remuneraciones del mes en que se trabajen.", "",
    "## Quinto: registro",
    "Las horas extraordinarias trabajadas quedarán en el registro de asistencia del empleador.", "",
    "Firma del empleador: ______________________________", "",
    `Firma del trabajador (${f.rut}): ______________________________`,
  ].join("\n");
}
// ¿Algún pacto aprobado cubre el mes (AAAA-MM)?
export function pactoCubreMes(pactos: { desde: string; hasta: string }[], periodo: string): boolean {
  const ini = `${periodo}-01`;
  const [y, m] = periodo.split("-").map(Number);
  const fin = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return pactos.some((p) => p.desde <= fin && p.hasta >= ini);
}
