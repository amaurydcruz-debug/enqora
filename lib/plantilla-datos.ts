// Política de tratamiento de datos personales para empresas cliente (Ley N°19.628 modificada por la Ley N°21.719,
// art. 14 ter: deber de información y transparencia). Plantilla datos-2026-11. Función pura que arma un BORRADOR;
// un abogado de ENQORA lo revisa y aprueba antes de que la empresa lo publique.

export const PLANTILLA_DATOS_VERSION = "datos-2026-11";

export const GRUPOS = {
  clientes: { nombre: "Clientes", datos: "nombre, RUT, datos de contacto, dirección de despacho, historial de compras y de pagos", fin: "vender y entregar los productos o servicios, emitir documentos tributarios, cobrar, atender consultas y reclamos", base: "la ejecución del contrato y el cumplimiento de obligaciones legales (tributarias y de protección al consumidor)", plazo: "mientras dure la relación comercial y luego por 6 años, plazo en que el SII puede revisar los documentos tributarios" },
  trabajadores: { nombre: "Personas trabajadoras", datos: "nombre, RUT, datos de contacto, previsión, salud previsional, datos bancarios para el pago, remuneraciones, asistencia y antecedentes del contrato", fin: "administrar el contrato de trabajo, pagar remuneraciones y cotizaciones, y cumplir las obligaciones laborales, previsionales y de seguridad", base: "la ejecución del contrato de trabajo y el cumplimiento de obligaciones legales", plazo: "mientras dure la relación laboral y luego por los plazos que exigen las leyes laborales, previsionales y tributarias" },
  postulantes: { nombre: "Postulantes a empleos", datos: "nombre, datos de contacto, currículum y referencias que la persona entregue", fin: "evaluar su postulación", base: "el consentimiento de la persona postulante", plazo: "hasta 6 meses después de cerrado el proceso, salvo que la persona pida conservarlos o eliminarlos antes" },
  proveedores: { nombre: "Proveedores y sus contactos", datos: "nombre, RUT, datos de contacto y datos bancarios para el pago", fin: "contratar, pagar y comunicarse con los proveedores", base: "la ejecución del contrato y el cumplimiento de obligaciones legales", plazo: "mientras dure la relación y luego por 6 años por razones tributarias" },
  web: { nombre: "Usuarios del sitio web o formularios", datos: "nombre, correo y teléfono que ingresen en formularios, y datos técnicos de navegación", fin: "responder consultas y operar el sitio", base: "el consentimiento o el interés legítimo de operar y proteger el sitio", plazo: "hasta 12 meses desde la última interacción" },
} as const;
export type Grupo = keyof typeof GRUPOS;

export const DESTINATARIOS = {
  contabilidad: "Servicios contables, tributarios y legales (como ENQORA), que actúan por encargo de la empresa",
  tecnologia: "Proveedores de tecnología y almacenamiento en la nube, que actúan por encargo de la empresa",
  pagos: "Bancos y medios de pago, para procesar cobros y pagos",
  despacho: "Empresas de transporte o despacho, para entregar los pedidos",
  publicos: "Organismos públicos cuando la ley lo exige (SII, Dirección del Trabajo, Previred, tribunales, entre otros)",
} as const;
export type Destinatario = keyof typeof DESTINATARIOS;

export type DatosPolitica = {
  razon_social: string; rut: string; domicilio: string; representante: string; correo: string; sitio: string;
  encargado: string; grupos: Grupo[]; destinatarios: Destinatario[]; internacional: string; automatizadas: boolean;
};

const t = (s: unknown, max = 200) => String(s ?? "").replace(/[\r\n]+/g, " ").replace(/[<>]/g, "").trim().slice(0, max);

export function validarPolitica(x: Record<string, unknown>): DatosPolitica | string {
  const lista = <K extends string>(v: unknown, permitidos: Record<K, unknown>) =>
    (Array.isArray(v) ? v : v == null ? [] : [v]).map(String).filter((k): k is K => k in permitidos);
  const d: DatosPolitica = {
    razon_social: t(x.razon_social, 160), rut: t(x.rut, 12), domicilio: t(x.domicilio), representante: t(x.representante, 120),
    correo: t(x.correo, 120).toLowerCase(), sitio: t(x.sitio, 120), encargado: t(x.encargado, 120),
    grupos: [...new Set(lista(x.grupos, GRUPOS))], destinatarios: [...new Set(lista(x.destinatarios, DESTINATARIOS))],
    internacional: t(x.internacional, 300), automatizadas: x.automatizadas === true || x.automatizadas === "si",
  };
  if (d.razon_social.length < 3 || !/^\d{7,8}-[\dkK]$/.test(d.rut)) return "Revisa la razón social y el RUT de la empresa.";
  if (d.domicilio.length < 5 || d.representante.length < 3) return "Indica el domicilio y el representante legal.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.correo)) return "Indica un correo para que las personas ejerzan sus derechos.";
  if (!d.grupos.length) return "Marca al menos un grupo de personas cuyos datos trata la empresa.";
  return d;
}

export function generarPolitica(d: DatosPolitica, fecha: string): string {
  const L: string[] = [
    "# Política de tratamiento de datos personales",
    `${d.razon_social} · RUT ${d.rut}`,
    `Versión del ${fecha}`,
    "",
    "## 1. Quién es responsable de sus datos",
    `${d.razon_social}, RUT ${d.rut}, con domicilio en ${d.domicilio}, representada legalmente por ${d.representante}.`,
    `Para cualquier consulta o para ejercer sus derechos puede escribir a ${d.correo}${d.sitio ? ` o usar el sitio ${d.sitio}` : ""}.${d.encargado ? ` Encargado de prevención o de protección de datos: ${d.encargado}.` : ""}`,
    "",
    "## 2. Qué datos tratamos, para qué y con qué fundamento",
  ];
  for (const g of d.grupos) {
    const x = GRUPOS[g];
    L.push(`- ${x.nombre}: tratamos ${x.datos}. Los usamos para ${x.fin}. Fundamento: ${x.base}. Los conservamos ${x.plazo}.`);
  }
  L.push(
    "No tratamos datos sensibles, salvo los que la ley laboral y previsional exige para administrar los contratos de trabajo (por ejemplo, la institución de salud), con las medidas de reserva que corresponden.",
    "Los datos provienen directamente de las personas a quienes se refieren, o de fuentes que la ley permite usar.",
    "",
    "## 3. Con quién compartimos los datos",
    ...(d.destinatarios.length ? d.destinatarios.map((k) => `- ${DESTINATARIOS[k]}.`) : ["- No comunicamos datos a terceros, salvo cuando la ley lo exige."]),
    "Quienes tratan datos por encargo de la empresa solo pueden usarlos para ese encargo y deben protegerlos.",
    "",
    "## 4. Transferencias internacionales",
    d.internacional
      ? `Algunos datos se almacenan o se tratan fuera de Chile: ${d.internacional}. Lo hacemos con proveedores que ofrecen garantías adecuadas de protección.`
      : "No transferimos datos personales fuera de Chile.",
    "",
    "## 5. Decisiones automatizadas",
    d.automatizadas
      ? "Usamos herramientas automatizadas para apoyar algunas decisiones. Usted puede pedir información sobre la lógica aplicada y solicitar que una persona revise la decisión."
      : "No tomamos decisiones basadas únicamente en tratamientos automatizados ni elaboramos perfiles.",
    "",
    "## 6. Sus derechos",
    "Usted puede ejercer, en forma gratuita, los derechos de acceso, rectificación, supresión, oposición, portabilidad y bloqueo de sus datos, y retirar su consentimiento cuando el tratamiento se base en él.",
    `Para hacerlo, escriba a ${d.correo} indicando su nombre, la forma de verificar su identidad y lo que solicita. Responderemos dentro de 30 días corridos, plazo que puede prorrogarse una vez por igual período, informándole el motivo.`,
    "Si no responde la solicitud o la rechaza, usted puede reclamar ante la Agencia de Protección de Datos Personales.",
    "",
    "## 7. Seguridad",
    "Aplicamos medidas técnicas y organizativas proporcionales a los riesgos: acceso restringido según la función de cada persona, claves y segundo factor de autenticación, registros de acceso, respaldos y obligación de reserva para quienes tratan los datos. Si ocurre una vulneración que pueda afectar a las personas, la informaremos según lo exige la ley.",
    "",
    "## 8. Cambios a esta política",
    "Si modificamos esta política, publicaremos la nueva versión con su fecha en los mismos medios donde se encuentra esta.",
  );
  return L.join("\n");
}
