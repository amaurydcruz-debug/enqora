// Diagnóstico «Empresa al día» (0071). Motor puro, sin red y sin IA: las mismas respuestas dan siempre el mismo
// resultado. Cada obligación lleva su fundamento con texto fijo y su fuente oficial (investigación del 21-11-2026,
// docs: «ENQORA · Empresa al día: obligaciones y planes»). Las preguntas que no aplican al tamaño no se hacen.

export type Respuesta = "si" | "no" | "no_se";
export type Perfil = {
  tipo: "persona" | "empresa";
  trabajadores: number;
  local: boolean;
  rubro_regulado: boolean;
  vende_a_personas: boolean;
};
export type Frente = "sii" | "municipal" | "laboral" | "prevision" | "seguridad" | "entorno";
export type Riesgo = "alto" | "medio" | "bajo";
export type Pregunta = {
  id: string; frente: Frente; texto: string; ayuda: string; riesgo: Riesgo; fuente: { nombre: string; url: string } | null;
  categoria: string | null; aplica: (p: Perfil) => boolean;
};
export type Item = { id: string; frente: Frente; texto: string; estado: "ok" | "falta" | "revisar"; riesgo: Riesgo; ayuda: string; fuente: { nombre: string; url: string } | null; categoria: string | null };
export type Resultado = {
  version: string; frentes: { frente: Frente; nombre: string; semaforo: "verde" | "amarillo" | "rojo"; pendientes: number; total: number }[];
  pendientes: Item[]; al_dia: Item[]; puntaje: number;
};

export const VERSION_DIAGNOSTICO = "2026-11-21";

export const NOMBRE_FRENTE: Record<Frente, string> = {
  sii: "SII y Tesorería", municipal: "Municipalidad, local y marca", laboral: "Dirección del Trabajo",
  prevision: "Previsión y salud", seguridad: "Seguridad laboral (mutual)", entorno: "Clientes, datos y comunidad",
};

const F = {
  sii: { nombre: "SII · Calendario tributario", url: "https://www.sii.cl/ayudas/ayudas_por_servicios/2120-formularios_y_plazos_2026-2171.html" },
  renta: { nombre: "ChileAtiende · Declaración de Renta", url: "https://www.chileatiende.gob.cl/fichas/3178-declaracion-de-renta" },
  honorarios: { nombre: "SII · Retención de honorarios 2026", url: "https://www.sii.cl/destacados/boletas_honorarios/" },
  patente: { nombre: "Ley de Rentas Municipales (DL 3.063)", url: "https://www.diariooficial.interior.gob.cl/publicaciones/2025/11/11/44296/01/2722068.pdf" },
  jornada: { nombre: "Dirección del Trabajo · 42 horas", url: "https://www.dt.gob.cl/legislacion/1624/articles-129189_recurso_pdf.pdf" },
  cotiz: { nombre: "Superintendencia de Pensiones · Plazo de cotizaciones", url: "https://www.spensiones.cl/portal/institucional/594/w3-article-2728.html" },
  aporte: { nombre: "Superintendencia de Pensiones · Cotización del empleador", url: "https://www.spensiones.cl/portal/institucional/594/alt-propertyvalue-10964.html" },
  lre: { nombre: "ChileAtiende · Libro de Remuneraciones Electrónico", url: "https://www.chileatiende.gob.cl/fichas/90679/1/pdf" },
  karin: { nombre: "SUSESO · Obligaciones Ley Karin", url: "https://www.suseso.cl/613/alt-propertyvalue-726760.pdf" },
  prevencion: { nombre: "SUSESO · Obligaciones de prevención", url: "https://www.suseso.cl/613/alt-propertyvalue-137119.pdf" },
  ds44: { nombre: "Previsión Social · DS 44", url: "https://previsionsocial.gob.cl/wp-content/uploads/2025/02/PPT-DS-44-06-FEB-2025_Final.pdf" },
  comite: { nombre: "ChileAtiende · Comité paritario", url: "https://www.chileatiende.gob.cl/fichas/1375/1/pdf" },
  depto: { nombre: "Dirección del Trabajo · Departamento de Prevención", url: "https://www.dt.gob.cl/portal/1628/w3-article-60276.html" },
  inclusion: { nombre: "Dirección del Trabajo · Inclusión laboral", url: "https://dt.gob.cl/legislacion/1624/articles-126809_recurso_pdf.pdf" },
  datos: { nombre: "Diario Oficial · Ley 21.719", url: "https://www.diariooficial.interior.gob.cl/publicaciones/2026/09/09/44546/01/2865940.pdf" },
  mpd: { nombre: "Ley 20.393 (reformada por la Ley 21.595)", url: "https://www.bcn.cl/leychile/navegar?idLey=20393" },
  contrato: { nombre: "Ley 21.327 · Registro electrónico laboral", url: "https://www.buk.cl/hubfs/Ebooks/Chile/Q%26A%20Modernizaci%C3%B3n%20de%20la%20DT.pdf" },
};

const conTrab = (p: Perfil) => p.trabajadores >= 1;
export const PREGUNTAS: Pregunta[] = [
  { id: "inicio", frente: "sii", riesgo: "alto", texto: "¿Tienes inicio de actividades en el SII con tu giro y domicilio actualizados?", ayuda: "Sin inicio de actividades no puedes emitir boletas ni facturas; cada cambio de giro o domicilio se informa al SII.", fuente: F.sii, categoria: "formalizacion", aplica: () => true },
  { id: "f29", frente: "sii", riesgo: "alto", texto: "¿Declaras el F29 todos los meses, aunque no tengas movimiento?", ayuda: "El F29 vence el día 12 (o el 20 si declaras por internet como facturador electrónico) y se presenta aunque no haya ventas.", fuente: F.sii, categoria: "contabilidad", aplica: () => true },
  { id: "f22", frente: "sii", riesgo: "alto", texto: "¿Presentaste el F22 (Operación Renta) del último año?", ayuda: "Sin F22 el SII deja la anotación «No declarante F22», que bloquea trámites.", fuente: F.renta, categoria: "tributario", aplica: () => true },
  { id: "dj", frente: "sii", riesgo: "medio", texto: "¿Presentas las declaraciones juradas anuales que te corresponden (sueldos, honorarios u otras)?", ayuda: "Se presentan entre marzo y junio según cada declaración; el atraso tiene multa desde 7,2 UTM.", fuente: F.sii, categoria: "tributario", aplica: (p) => p.tipo === "empresa" || p.trabajadores >= 1 },
  { id: "retencion", frente: "sii", riesgo: "medio", texto: "Si recibes boletas de honorarios, ¿retienes el 15,25% y lo declaras en el F29?", ayuda: "La retención de 2026 es 15,25%; sube a 16% en 2027 y a 17% en 2028.", fuente: F.honorarios, categoria: "contabilidad", aplica: (p) => p.tipo === "empresa" },
  { id: "tgr", frente: "sii", riesgo: "medio", texto: "¿Estás sin deudas vencidas con la Tesorería (o con un convenio al día)?", ayuda: "Las deudas fiscales generan intereses y multas; la Tesorería ofrece convenios y condonaciones.", fuente: null, categoria: "tributario", aplica: () => true },
  { id: "patente", frente: "municipal", riesgo: "alto", texto: "¿Tienes patente municipal vigente y pagada (cuotas de enero y julio)?", ayuda: "Toda actividad lucrativa paga patente: entre 2,5 y 5 por mil del capital propio, mínimo 1 UTM, en dos cuotas al año.", fuente: F.patente, categoria: "formalizacion", aplica: (p) => p.local || p.tipo === "empresa" },
  { id: "recepcion", frente: "municipal", riesgo: "alto", texto: "¿Tu local tiene recepción final de obras?", ayuda: "Sin recepción final del local la municipalidad no otorga la patente.", fuente: null, categoria: "formalizacion", aplica: (p) => p.local },
  { id: "sanitaria", frente: "municipal", riesgo: "alto", texto: "¿Tienes la autorización sanitaria que exige tu rubro?", ayuda: "Alimentos, salud, belleza y otros rubros regulados necesitan autorización de la SEREMI de Salud antes de operar.", fuente: null, categoria: "formalizacion", aplica: (p) => p.rubro_regulado },
  { id: "marca", frente: "municipal", riesgo: "bajo", texto: "¿El nombre o logo con que vendes está registrado como marca en INAPI?", ayuda: "Sin registro, otro puede inscribir tu nombre; el registro dura 10 años y se renueva.", fuente: null, categoria: "marcas", aplica: () => true },
  { id: "contratos", frente: "laboral", riesgo: "alto", texto: "¿Todos tus trabajadores tienen contrato escrito, registrado en el portal de la Dirección del Trabajo?", ayuda: "El contrato se registra dentro de 15 días desde su firma.", fuente: F.contrato, categoria: "empleador", aplica: conTrab },
  { id: "jornada", frente: "laboral", riesgo: "alto", texto: "¿Las jornadas ya están en 42 horas semanales o menos, sin rebajar sueldos?", ayuda: "Desde el 26-04-2026 el máximo es 42 horas; desde el 26-04-2028 serán 40.", fuente: F.jornada, categoria: "empleador", aplica: conTrab },
  { id: "asistencia", frente: "laboral", riesgo: "medio", texto: "¿Llevas registro de asistencia de tus trabajadores?", ayuda: "La Dirección del Trabajo reforzó su fiscalización con la rebaja de jornada.", fuente: F.jornada, categoria: "empleador", aplica: conTrab },
  { id: "lre", frente: "laboral", riesgo: "medio", texto: "¿Subes cada mes el Libro de Remuneraciones Electrónico a la Dirección del Trabajo?", ayuda: "Obligatorio con 5 o más trabajadores, dentro de los 15 primeros días del mes siguiente al pago.", fuente: F.lre, categoria: "empleador", aplica: (p) => p.trabajadores >= 5 },
  { id: "karin", frente: "laboral", riesgo: "alto", texto: "¿Tienes el protocolo de prevención del acoso (Ley Karin) y lo entregas al contratar?", ayuda: "Obligatorio para todo empleador, también con menos de 10 trabajadores, desde el 1-08-2024.", fuente: F.karin, categoria: "empleador", aplica: conTrab },
  { id: "reglamento", frente: "laboral", riesgo: "alto", texto: "¿Tienes Reglamento Interno de Orden, Higiene y Seguridad actualizado (con el procedimiento Ley Karin)?", ayuda: "Obligatorio desde 10 trabajadores.", fuente: F.prevencion, categoria: "empleador", aplica: (p) => p.trabajadores >= 10 },
  { id: "inclusion", frente: "laboral", riesgo: "medio", texto: "¿Cumples la cuota de inclusión laboral y la informas cada enero a la Dirección del Trabajo?", ayuda: "Aplica a empresas de 100 o más trabajadores; la Ley 21.690 eleva la cuota de 1% a 2%.", fuente: F.inclusion, categoria: "empleador", aplica: (p) => p.trabajadores >= 100 },
  { id: "cotizaciones", frente: "prevision", riesgo: "alto", texto: "¿Pagas todas las cotizaciones (AFP, salud, cesantía) en Previred a tiempo?", ayuda: "Se declaran hasta el día 10 y se pagan por internet hasta el día 13 del mes siguiente.", fuente: F.cotiz, categoria: "empleador", aplica: conTrab },
  { id: "aporte", frente: "prevision", riesgo: "alto", texto: "¿Pagas el nuevo aporte del empleador a pensiones (3,5% desde agosto de 2026)?", ayuda: "Ley 21.735: 3,5% de la remuneración imponible desde agosto de 2026 hasta julio de 2027, y sigue subiendo por etapas.", fuente: F.aporte, categoria: "empleador", aplica: conTrab },
  { id: "mutual", frente: "seguridad", riesgo: "alto", texto: "¿Estás adherido a una mutual o al ISL (seguro de accidentes del trabajo)?", ayuda: "Todo empleador cotiza el seguro de la Ley 16.744 por sus trabajadores.", fuente: F.prevencion, categoria: "empleador", aplica: conTrab },
  { id: "delegado", frente: "seguridad", riesgo: "medio", texto: "¿Eligieron un delegado de seguridad y salud en el trabajo, con acta?", ayuda: "Entre 10 y 25 trabajadores, si no hay comité paritario (DS 44).", fuente: F.ds44, categoria: "empleador", aplica: (p) => p.trabajadores >= 10 && p.trabajadores <= 25 },
  { id: "comite", frente: "seguridad", riesgo: "alto", texto: "¿Tienes Comité Paritario constituido y registrado en la Dirección del Trabajo?", ayuda: "Obligatorio con más de 25 trabajadores por faena o sucursal; los cambios se registran en 15 días.", fuente: F.comite, categoria: "empleador", aplica: (p) => p.trabajadores > 25 },
  { id: "depto", frente: "seguridad", riesgo: "alto", texto: "¿Tienes Departamento de Prevención de Riesgos dirigido por un experto?", ayuda: "Obligatorio con más de 100 trabajadores.", fuente: F.depto, categoria: "empleador", aplica: (p) => p.trabajadores > 100 },
  { id: "datos", frente: "entorno", riesgo: "medio", texto: "¿Tienes política de privacidad y sabes qué datos de clientes y trabajadores guardas y para qué?", ayuda: "La Ley 21.719 de datos personales rige el 1-12-2026 salvo que antes se publique la postergación al 15-10-2027 que el Congreso despachó el 17-11-2026. ENQORA te ayuda a preparar tu política de datos.", fuente: F.datos, categoria: "profesionales", aplica: () => true },
  { id: "consumidor", frente: "entorno", riesgo: "medio", texto: "¿Tus precios, garantías y publicidad cumplen la ley del consumidor?", ayuda: "Quien vende a personas debe informar precios y garantías y no hacer publicidad engañosa.", fuente: null, categoria: "profesionales", aplica: (p) => p.vende_a_personas },
  { id: "mpd", frente: "entorno", riesgo: "bajo", texto: "¿Tu empresa tiene un modelo de prevención de delitos, aunque sea simple?", ayuda: "La ley no lo exige expresamente, pero sin él la persona jurídica queda expuesta a responder penalmente.", fuente: F.mpd, categoria: "profesionales", aplica: (p) => p.tipo === "empresa" },
];

export const preguntasPara = (p: Perfil) => PREGUNTAS.filter((q) => q.aplica(p));

const PESO: Record<Riesgo, number> = { alto: 3, medio: 2, bajo: 1 };

export function diagnosticar(p: Perfil, respuestas: Record<string, Respuesta>): Resultado {
  const items: Item[] = preguntasPara(p).map((q) => {
    const r = respuestas[q.id];
    return { id: q.id, frente: q.frente, texto: q.texto, riesgo: q.riesgo, ayuda: q.ayuda, fuente: q.fuente, categoria: q.categoria,
      estado: r === "si" ? "ok" : r === "no" ? "falta" : "revisar" };
  });
  const frentes = (Object.keys(NOMBRE_FRENTE) as Frente[]).map((f) => {
    const de = items.filter((i) => i.frente === f);
    const pend = de.filter((i) => i.estado !== "ok");
    const semaforo: "verde" | "amarillo" | "rojo" = pend.some((i) => i.estado === "falta" && i.riesgo === "alto") ? "rojo" : pend.length ? "amarillo" : "verde";
    return { frente: f, nombre: NOMBRE_FRENTE[f], semaforo, pendientes: pend.length, total: de.length };
  }).filter((f) => f.total > 0);
  // Lo que falta primero, por riesgo; «no sé» se trata como revisar (pesa menos que un «no» del mismo riesgo).
  const pendientes = items.filter((i) => i.estado !== "ok")
    .sort((a, b) => PESO[b.riesgo] * (b.estado === "falta" ? 2 : 1) - PESO[a.riesgo] * (a.estado === "falta" ? 2 : 1));
  const total = items.reduce((s, i) => s + PESO[i.riesgo], 0);
  const ok = items.filter((i) => i.estado === "ok").reduce((s, i) => s + PESO[i.riesgo], 0);
  return { version: VERSION_DIAGNOSTICO, frentes, pendientes, al_dia: items.filter((i) => i.estado === "ok"), puntaje: total ? Math.round((100 * ok) / total) : 100 };
}

export function perfilValido(x: unknown): Perfil | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const t = Math.floor(Number(o.trabajadores));
  if (!(o.tipo === "persona" || o.tipo === "empresa") || !Number.isFinite(t) || t < 0 || t > 100000) return null;
  return { tipo: o.tipo, trabajadores: t, local: o.local === true, rubro_regulado: o.rubro_regulado === true, vende_a_personas: o.vende_a_personas === true };
}
