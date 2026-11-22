// Reglamento Interno de Orden, Higiene y Seguridad (0087). Plantilla riohs-2026-11. Función pura que arma un BORRADOR;
// un abogado de ENQORA lo revisa y aprueba antes de que la empresa lo publique.
// Fuentes: Código del Trabajo arts. 153 a 157 (art. 154 N° 1 a 13: contenidos mínimos; N° 10 multas hasta 25% de la
// remuneración diaria; N° 12 protocolo y procedimiento de la Ley Karin; N° 13 reclamos por igualdad de remuneraciones
// con respuesta escrita y fundada dentro de 30 días); Ley 16.744 art. 67; D.S. N° 44 de 2024 del Ministerio del Trabajo
// (vigente desde el 01-02-2025), arts. 58 a 61: preámbulo y capítulos de disposiciones generales, obligaciones,
// prohibiciones y sanciones.

export const PLANTILLA_RIOHS_VERSION = "riohs-2026-11";

export type DatosRIOHS = {
  razon_social: string; rut: string; domicilio: string; giro: string; representante: string;
  trabajadores: number; mutual: string;
  horario: string; descanso: string; dia_pago: string; forma_pago: string;
  reclamos: string;          // cargo o persona que recibe peticiones, reclamos y consultas (art. 154 N° 6)
  responsable_sst: string;   // cargo responsable de seguridad y salud en el trabajo
  riesgos: string;           // principales riesgos de la actividad y medidas
  emergencia: string;        // punto de encuentro y cómo se avisa una emergencia
  instancia: "comite" | "delegado" | "ninguna"; // comité paritario (25+), delegado SST o ninguna
};

const limpio = (v: unknown, max: number) => String(v ?? "").replace(/[\r\n]+/g, " ").replace(/[<>#]/g, "").trim().slice(0, max);

export function validarRIOHS(x: Partial<Record<keyof DatosRIOHS, unknown>>): DatosRIOHS | string {
  const d: DatosRIOHS = {
    razon_social: limpio(x.razon_social, 150), rut: limpio(x.rut, 12), domicilio: limpio(x.domicilio, 200), giro: limpio(x.giro, 150),
    representante: limpio(x.representante, 120), trabajadores: Math.max(0, Math.min(100000, Math.round(Number(x.trabajadores) || 0))),
    mutual: limpio(x.mutual, 60), horario: limpio(x.horario, 400), descanso: limpio(x.descanso, 200), dia_pago: limpio(x.dia_pago, 120),
    forma_pago: limpio(x.forma_pago, 120), reclamos: limpio(x.reclamos, 150), responsable_sst: limpio(x.responsable_sst, 150),
    riesgos: limpio(x.riesgos, 1000), emergencia: limpio(x.emergencia, 400),
    instancia: (["comite", "delegado", "ninguna"].includes(String(x.instancia)) ? x.instancia : "ninguna") as DatosRIOHS["instancia"],
  };
  if (d.razon_social.length < 3 || !/^\d{7,8}-[\dkK]$/.test(d.rut.replace(/\./g, "")) || d.domicilio.length < 5) return "Revisa la razón social, el RUT y el domicilio.";
  if (d.representante.length < 5 || d.giro.length < 3) return "Indica el giro y el representante legal.";
  if (d.trabajadores < 1) return "Indica cuántos trabajadores tiene normalmente la empresa.";
  if (d.horario.length < 15 || d.descanso.length < 5) return "Describe el horario de trabajo (y los turnos, si hay) y el descanso para colación.";
  if (d.dia_pago.length < 5 || d.forma_pago.length < 3) return "Indica cuándo y cómo se pagan las remuneraciones.";
  if (d.reclamos.length < 3 || d.responsable_sst.length < 3) return "Indica quién recibe los reclamos y quién es responsable de seguridad y salud.";
  if (d.riesgos.length < 20) return "Describe los principales riesgos del trabajo y cómo se controlan.";
  if (d.emergencia.length < 10) return "Indica el punto de encuentro y cómo se avisa una emergencia.";
  return d;
}

// Avisos para el abogado y la empresa (no bloquean).
export function avisosRIOHS(d: DatosRIOHS, karinAprobado: boolean): string[] {
  const a: string[] = [];
  if (d.trabajadores < 10) a.push("Con menos de 10 trabajadores no es obligatorio el reglamento de orden (art. 153), pero sí el de higiene y seguridad (art. 67 Ley 16.744): este documento cumple ambos.");
  if (d.trabajadores >= 25 && d.instancia !== "comite") a.push("Con 25 o más trabajadores corresponde constituir un Comité Paritario de Higiene y Seguridad.");
  if (d.trabajadores >= 100) a.push("Con más de 100 trabajadores corresponde un Departamento de Prevención de Riesgos a cargo de un experto.");
  if (d.trabajadores >= 200) a.push("Con 200 o más trabajadores el reglamento debe incluir el registro de cargos y sus características técnicas esenciales (art. 154 N° 6).");
  if (!karinAprobado) a.push("La empresa aún no tiene aprobados el protocolo y el procedimiento de la Ley Karin en ENQORA: el reglamento los exige como parte integrante (art. 154 N° 12).");
  return a;
}

export function textoRIOHS(d: DatosRIOHS, fecha: string): string {
  const L: string[] = [];
  const p = (...x: string[]) => L.push(...x, "");
  const li = (xs: string[]) => { for (const x of xs) L.push(`- ${x}`); L.push(""); };
  p(`# Reglamento Interno de Orden, Higiene y Seguridad de ${d.razon_social}`);
  p(`RUT ${d.rut} · ${d.domicilio} · Giro: ${d.giro} · Versión del ${fecha}`);

  L.push("## Preámbulo");
  p(`Este reglamento contiene las obligaciones y prohibiciones a que deben sujetarse las personas que trabajan para ${d.razon_social} en relación con sus labores, permanencia y vida en sus dependencias, y las normas de prevención, higiene y seguridad que se deben observar. Se dicta conforme al Título III del Libro I del Código del Trabajo (arts. 153 y siguientes), al artículo 67 de la Ley 16.744 y al D.S. N° 44 de 2024 del Ministerio del Trabajo y Previsión Social. Las relaciones laborales en la empresa se fundan en un trato libre de violencia, compatible con la dignidad de la persona y con perspectiva de género (art. 2 del Código del Trabajo).`);

  L.push("## Título I · Normas de orden");
  L.push("### 1. Ingreso");
  p("Quien ingrese a la empresa deberá presentar su cédula de identidad, el certificado de afiliación a su AFP y a su sistema de salud, y los demás antecedentes que exija la ley. Los menores de 18 años deberán acreditar la autorización que exige la ley y, si corresponde, que cumplen su obligación escolar (art. 154 N° 8). El contrato se escriturará dentro de los plazos del artículo 9 del Código del Trabajo.");
  L.push("### 2. Jornada y descansos (art. 154 N° 1 y 2)");
  p(`Horario de trabajo: ${d.horario}.`, `Descanso: ${d.descanso}. La jornada ordinaria no excederá el máximo legal vigente. Las horas extraordinarias solo se trabajarán con pacto escrito, por necesidades temporales y con el límite de dos horas diarias (arts. 31 y 32).`);
  L.push("### 3. Remuneraciones (art. 154 N° 3 y 4)");
  p("Las remuneraciones pueden comprender sueldo base, gratificación, horas extraordinarias y los bonos o comisiones que se pacten en cada contrato.",
    `Se pagan ${d.dia_pago}, mediante ${d.forma_pago}, junto con una liquidación que detalla montos, descuentos y cotizaciones.`);
  L.push("### 4. Obligaciones de las personas trabajadoras (art. 154 N° 5)");
  li([
    "Cumplir su contrato y las instrucciones de sus jefaturas relativas al trabajo.",
    "Respetar el horario y registrar su asistencia en el sistema que disponga la empresa.",
    "Tratar con respeto y sin discriminación a sus compañeras, compañeros, clientes y proveedores.",
    "Cuidar los bienes, herramientas e información de la empresa y mantener reserva de la información confidencial.",
    "Avisar oportunamente sus inasistencias y presentar la licencia médica dentro del plazo legal cuando corresponda.",
    "Informar los cambios en sus datos personales relevantes para el contrato (domicilio, cargas familiares, previsión).",
  ]);
  L.push("### 5. Prohibiciones (art. 154 N° 5)");
  li([
    "Ejercer acoso sexual, acoso laboral o violencia en el trabajo, o cualquier conducta discriminatoria.",
    "Presentarse o trabajar bajo los efectos del alcohol o de drogas, o ingresarlos a los lugares de trabajo.",
    "Usar los bienes de la empresa para fines ajenos al trabajo sin autorización.",
    "Ausentarse o abandonar el trabajo sin aviso ni causa justificada.",
    "Divulgar información reservada de la empresa o datos personales de otras personas.",
  ]);
  L.push("### 6. Peticiones, reclamos y consultas (art. 154 N° 6)");
  p(`Las peticiones, reclamos, consultas y sugerencias se dirigen a ${d.reclamos}, por escrito o por los medios que la empresa habilite. Se responderán dentro de un plazo razonable.`);
  L.push("### 7. Igualdad de remuneraciones (arts. 62 bis y 154 N° 13)");
  p(`Se respeta el principio de igualdad de remuneraciones entre hombres y mujeres que prestan un mismo trabajo. Quien considere que se infringe puede reclamar por escrito ante ${d.reclamos}, indicando los hechos. La empresa responderá por escrito y de manera fundada dentro de 30 días desde el reclamo. Las diferencias objetivas en las remuneraciones que se funden en capacidades, calificaciones, idoneidad, responsabilidad o productividad no se consideran arbitrarias.`);
  L.push("### 8. Inclusión y accesibilidad (art. 154 N° 7)");
  p("La empresa adoptará los ajustes necesarios y las medidas de accesibilidad para las personas con discapacidad o asignatarias de una pensión de invalidez, y prevendrá cualquier forma de acoso o discriminación en su contra. No habrá normas especiales para trabajos según edad, sexo o género salvo las que la ley establezca.");

  L.push("## Título II · Higiene y seguridad (D.S. N° 44 de 2024)");
  L.push("### 9. Disposiciones generales (art. 58)");
  li([
    `Organismo administrador del seguro de la Ley 16.744: ${d.mutual || "____________"}. Responsable de seguridad y salud en el trabajo: ${d.responsable_sst}.`,
    "Exámenes: la empresa gestionará los exámenes preocupacionales, ocupacionales y de egreso que correspondan según los riesgos del puesto y la vigilancia de la salud.",
    "Accidentes y enfermedades: todo accidente, aun leve, se informa de inmediato a la jefatura; la empresa hará la denuncia al organismo administrador y lo investigará para evitar que se repita.",
    d.instancia === "comite" ? "La empresa dará las facilidades para el funcionamiento del Comité Paritario de Higiene y Seguridad." : d.instancia === "delegado" ? "La empresa dará las facilidades para el trabajo del Delegado de Seguridad y Salud en el Trabajo." : "Si se alcanza la dotación que la ley exige, la empresa constituirá el Comité Paritario o designará al Delegado de Seguridad y Salud.",
    "Las jefaturas son responsables de la prevención de riesgos en las labores a su cargo.",
    "Elementos de protección: la empresa entrega gratuitamente los elementos de protección personal y colectiva adecuados, y capacita en su uso y mantención.",
    "Riesgo grave e inminente: ante un riesgo grave e inminente para la vida o la salud, se interrumpen las labores y se evacúa; nadie será sancionado por ello.",
    `Emergencias: ${d.emergencia}.`,
    "Mejoras y reclamos sobre condiciones de trabajo: se pueden presentar al responsable de seguridad y salud; la empresa reconocerá las propuestas destacadas.",
    "Acoso y violencia: rigen el protocolo y el procedimiento del Título III.",
  ]);
  L.push("### 10. Riesgos de la actividad y medidas (derecho a saber)");
  p(`La empresa informa a cada persona, al ingresar y cuando cambien sus labores, los riesgos de su trabajo, sus consecuencias y las medidas para controlarlos. Principales riesgos y medidas: ${d.riesgos}.`);
  L.push("### 11. Obligaciones en seguridad y salud (art. 59)");
  li([
    "Cumplir las instrucciones y medidas de seguridad legales y de la empresa.",
    "Participar en las actividades de prevención, capacitación y emergencia.",
    "Colaborar en la investigación de accidentes y enfermedades.",
    "Usar, cuidar y mantener los elementos de protección entregados.",
    "Usar y mantener correctamente las máquinas, equipos y herramientas.",
    "Informar los peligros, defectos de equipos y cualquier interrupción del trabajo por riesgo inminente.",
    "Informar los síntomas o malestares que puedan relacionarse con el trabajo.",
    "Respetar las normas del tránsito cuando conduzca por motivos de trabajo.",
    "Cumplir la política de prevención del consumo de alcohol y drogas.",
  ]);
  L.push("### 12. Prohibiciones en seguridad y salud (art. 60)");
  li([
    "Ejercer violencia o acoso de cualquier tipo.",
    "Consumir alcohol o drogas, o trabajar bajo sus efectos.",
    "Manipular indebidamente dispositivos de seguridad.",
    "Retirar o inutilizar señalética o dispositivos de seguridad.",
    "Operar máquinas o equipos sin autorización.",
    "Comer en lugares no autorizados.",
    "Fumar donde no esté permitido.",
    "Las demás conductas que pongan en riesgo los peligros propios de cada puesto, informados según el número 10.",
  ]);
  p("Se consideran faltas graves que constituyen negligencia inexcusable: trabajar bajo los efectos del alcohol o drogas, retirar o inutilizar dispositivos de seguridad, y operar maquinaria sin autorización cuando ello cause o pueda causar un accidente.");

  L.push("## Título III · Prevención del acoso sexual, laboral y la violencia en el trabajo (art. 154 N° 12)");
  p(`El protocolo de prevención y el procedimiento de investigación y sanción de ${d.razon_social}, elaborados conforme a la Ley 21.643 y aprobados por la empresa, forman parte integrante de este reglamento como Anexo 1 y Anexo 2. Incluyen las medidas de resguardo para las personas afectadas y las sanciones aplicables. Las denuncias también pueden presentarse ante la Inspección del Trabajo.`);

  L.push("## Título IV · Sanciones y procedimiento (art. 154 N° 10 y 11; art. 61 D.S. N° 44)");
  p("Las infracciones a este reglamento se sancionan, en forma proporcional a su gravedad, con amonestación verbal, amonestación escrita o multa de hasta el 25% de la remuneración diaria de la persona infractora. Ninguna sanción se aplica sin un procedimiento previo en que se informe por escrito a la persona los hechos y se escuchen sus descargos dentro de 3 días hábiles. La resolución es escrita y fundada.",
    "La persona sancionada puede reclamar de la multa ante la Inspección del Trabajo (art. 157). Las multas se destinan a incrementar los fondos de bienestar de la empresa o, a falta de ellos, al Servicio Nacional de Capacitación y Empleo.",
    "Lo anterior no impide que la empresa ponga término al contrato por las causales legales.");

  L.push("## Título V · Vigencia y difusión");
  p("Antes de su vigencia, este reglamento se pone en conocimiento del Comité Paritario o del Delegado de Seguridad y Salud, de los sindicatos y de las personas trabajadoras. Se publica en dos sitios visibles del lugar de trabajo con 30 días de anticipación a su vigencia, se entrega gratuitamente un ejemplar a cada persona trabajadora y se remite a la Secretaría Regional Ministerial de Salud y a la Dirección del Trabajo. La empresa lo mantendrá actualizado y lo revisará cuando cambien los riesgos, la dotación o la normativa.");
  p(`${d.representante}`, `Representante legal de ${d.razon_social}`);
  return L.join("\n");
}
