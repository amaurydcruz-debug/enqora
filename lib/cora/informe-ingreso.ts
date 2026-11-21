// Informe de ingreso («el análisis antes del médico»). Funciones puras, sin red: arman las fuentes que el
// enjambre puede usar, el pedido a la IA, validan su salida y, si no hay IA, arman un informe por reglas.
//
// Regla de oro: el enjambre solo puede citar fuentes de la lista que ENQORA le entrega (F1, F2… o «relato»).
// Lo que cite otra cosa se descarta y queda en la bitácora. Los plazos laborales son texto fijo verificado,
// el precio sale del catálogo vigente y el conflicto de interés lo calcula la base de datos: nunca la IA.

import { PLAYBOOKS, RULES, KNOWLEDGE_VERSION } from "@/lib/knowledge";
import { OBLIGACIONES_LABORALES } from "@/lib/cora/normativa-laboral";
import { DOCUMENTOS, nombreCategoria, type AnalisisCaso } from "@/lib/cora/caso";
import { LINEAS, esLinea, type Linea } from "@/lib/lineas";

export type Certeza = "alta" | "media" | "baja";
export type FuenteInforme = { id: string; tipo: "norma" | "ruta" | "publicacion" | "registro_publico" | "catalogo" | "documento" | "plazo"; titulo: string; url?: string; verificada?: string; texto: string };
export type Afirmacion = { texto: string; fuente: string; certeza: Certeza };
export type Informe = {
  pide: string;
  hechos: Afirmacion[];
  linea: Linea;
  especialista: string;
  urgencia: { texto: string; fuente: string } | null;
  faltantes: { dato: string; por_que: string }[];
  documentos: string[];
  ruta: Afirmacion[];
  servicio: { codigo: string; nombre: string; precio_desde: number | null; unidad: string; motivo: string } | null;
  riesgos: (Afirmacion & { nivel: "bajo" | "medio" | "alto" })[];
  preguntas: string[];
  mensaje_cliente: string;
  contraparte: string | null;
  confianza: Certeza;
};
export type Paso = { agente: string; resultado: string };
export type ServicioCatalogo = { code: string; module: string; name: string; summary: string | null; unit: string; price_from: number | null };
export type PerfilPublico = { razon_social?: string; inicio_actividades?: string | null; termino_giro?: string | null; actividades?: { descripcion: string | null }[]; perfil?: { tramo_ventas?: string | null; trabajadores?: number | null; region?: string | null; rubro?: string | null } | null };
export type Publicacion = { titulo: string; institucion: string | null; fuente: string; resumen: string; publicado?: string | null };

export type Entrada = {
  relato: string;
  analisis: Partial<AnalisisCaso>;
  linea: Linea;
  razonSocial: string | null;
  perfil: PerfilPublico | null;
  publicaciones: Publicacion[];
  catalogo: ServicioCatalogo[];
  documentosCliente: string[];
  lecciones: string[];
  aviso: string;
};

// Especialista por línea y el área del catálogo (módulo) donde se busca el servicio.
export const ESPECIALISTA: Record<Linea, { quien: string; modulos: string[] }> = {
  CON: { quien: "Contador (agente contable)", modulos: ["contabilidad"] },
  TRI: { quien: "Contador tributario (agente tributario)", modulos: ["contabilidad", "gestion"] },
  CRE: { quien: "Abogado societario (agente legal)", modulos: ["create"] },
  FOR: { quien: "Gestor de formalización (agente legal)", modulos: ["formaliza"] },
  BRA: { quien: "Especialista en marcas (agente legal)", modulos: ["brand"] },
  LEG: { quien: "Abogado (agente legal)", modulos: ["legal"] },
  LAB: { quien: "Abogado laboral (agente laboral)", modulos: ["legal"] },
  GES: { quien: "Asesor de gestión (agente financiero)", modulos: ["gestion"] },
  CRC: { quien: "Asesor de crecimiento (agente estratégico)", modulos: ["crece"] },
  IDE: { quien: "Asesor de emprendimiento (agente estratégico)", modulos: ["idea", "create"] },
  GEN: { quien: "Profesional de turno (CORA asigna)", modulos: ["general", "contabilidad", "legal"] },
};

const NORMAS: Record<Linea, string[]> = {
  CON: ["f29_plazos", "f29_sin_movimiento", "iva_tasa", "iva_credito_24", "iva_servicios", "pro_pyme", "propyme_transparente_contabilidad", "retencion_honorarios", "multa_97_2", "interes_53"],
  TRI: ["multa_97_2", "interes_53", "ley_21713", "inicio_actividades", "termino_giro", "presuncion_termino_giro", "prescripcion_tributaria", "tgr_condonacion", "dj_1947", "dj_fuera_plazo", "f22_plazos_2026", "mandato_digital_sii", "pro_pyme", "idpc_tasas"],
  CRE: ["empresa_un_dia", "pro_pyme", "inicio_actividades"],
  FOR: ["inicio_actividades", "empresa_un_dia"],
  BRA: ["marcas", "propiedad_industrial"],
  LEG: ["datos_personales", "ley_karin", "jornada_40h"],
  LAB: ["despido_plazo_168", "tutela_486_489", "prescripcion_laboral_510", "jornada_40h", "ley_karin"],
  GES: ["sence_franquicia", "idpc_tasas", "pro_pyme"],
  CRC: ["sence_franquicia", "pro_pyme", "idpc_tasas"],
  IDE: ["inicio_actividades", "empresa_un_dia", "pro_pyme"],
  GEN: ["inicio_actividades", "f29_plazos", "multa_97_2", "ley_karin"],
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palabras = (s: string) => new Set(sinTildes(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
// Quita RUT, correos y teléfonos antes de usar una corrección como lección (aprendizaje anonimizado).
export const anonimizar = (s: string) =>
  s.replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-?[\dkK]\b/g, "[RUT]").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[correo]").replace(/\+?\d[\d\s]{7,}\d/g, "[teléfono]");

// 1) Fuentes que el enjambre puede citar, numeradas F1, F2… (cada una con su origen y fecha de verificación).
export function armarFuentes(e: Entrada): FuenteInforme[] {
  const out: FuenteInforme[] = [];
  const add = (f: Omit<FuenteInforme, "id">) => out.push({ ...f, id: `F${out.length + 1}` });

  for (const k of NORMAS[e.linea]) {
    const r = RULES[k];
    if (r) add({ tipo: "norma", titulo: `${r.fuente.titulo}${r.fuente.articulo ? ` · ${r.fuente.articulo}` : ""}`, url: r.fuente.url, verificada: KNOWLEDGE_VERSION, texto: `${r.tema}: ${r.regla}` });
  }
  // Rutas de ENQORA (casos reales anonimizados) que se parecen al relato.
  const rel = palabras(e.relato);
  const normasLinea = new Set(NORMAS[e.linea]);
  const rutas = PLAYBOOKS.map((p) => {
    const sen = palabras([p.caso, ...p.senales].join(" "));
    let hits = 0;
    for (const w of sen) if (rel.has(w)) hits++;
    return { p, hits: hits + (p.normas.some((n) => normasLinea.has(n)) ? 1 : 0) };
  }).filter((x) => x.hits >= 3).sort((a, b) => b.hits - a.hits).slice(0, 2);
  for (const { p } of rutas) {
    add({ tipo: "ruta", titulo: `Ruta ENQORA: ${p.caso}`, verificada: KNOWLEDGE_VERSION, texto: `Pasos: ${p.pasos.join(" → ")} Preguntar si falta: ${p.preguntar.join(" / ")} Riesgo: ${p.riesgo}.` });
  }
  if (e.linea === "LAB" || e.linea === "LEG") {
    for (const o of OBLIGACIONES_LABORALES.slice(0, 6)) {
      add({ tipo: "norma", titulo: `${o.fuente.nombre} · ${o.fundamento}`, url: o.fuente.url, verificada: o.fuente.verificada, texto: `${o.nombre}. Aplica: ${o.condicion} Acredita: ${o.acredita}` });
    }
  }
  if (e.analisis.urgencia) add({ tipo: "plazo", titulo: "Plazo legal (texto fijo verificado por ENQORA)", texto: e.analisis.urgencia });
  if (e.aviso) add({ tipo: "norma", titulo: "Lectura del aviso del SII citado en el relato", texto: e.aviso });
  for (const p of e.publicaciones.slice(0, 3)) {
    add({ tipo: "publicacion", titulo: `ENQORA Informa · ${p.titulo} (${p.institucion ?? "fuente oficial"})`, url: p.fuente, verificada: p.publicado ?? undefined, texto: p.resumen.slice(0, 500) });
  }
  if (e.perfil?.razon_social) {
    const pf = e.perfil;
    add({
      tipo: "registro_publico", titulo: "SII · Datos abiertos de empresas (nómina pública)",
      texto: [
        `Razón social: ${pf.razon_social}.`,
        pf.inicio_actividades ? `Inicio de actividades: ${pf.inicio_actividades}.` : "",
        pf.termino_giro ? `Término de giro: ${pf.termino_giro}.` : "",
        pf.perfil?.tramo_ventas ? `Tramo de ventas: ${pf.perfil.tramo_ventas}.` : "",
        typeof pf.perfil?.trabajadores === "number" ? `Trabajadores informados (dato anual, orientativo): ${pf.perfil.trabajadores}.` : "",
        pf.perfil?.region ? `Región: ${pf.perfil.region}.` : "",
        pf.perfil?.rubro ? `Rubro: ${pf.perfil.rubro}.` : "",
        pf.actividades?.length ? `Actividades: ${pf.actividades.slice(0, 3).map((a) => a.descripcion).filter(Boolean).join("; ")}.` : "",
      ].filter(Boolean).join(" "),
    });
  }
  const mods = ESPECIALISTA[e.linea].modulos;
  for (const s of e.catalogo.filter((c) => mods.includes(c.module)).slice(0, 8)) {
    add({ tipo: "catalogo", titulo: `Catálogo ENQORA · ${s.code} ${s.name}`, texto: `${s.summary ?? ""} Unidad: ${s.unit}. ${s.price_from != null ? "Tiene precio vigente." : "Sin precio vigente."}` });
  }
  if (e.documentosCliente.length) {
    add({ tipo: "documento", titulo: "Documentos enviados por el cliente (solo nombres; el contenido lo revisa el profesional)", texto: e.documentosCliente.slice(0, 20).join(" · ") });
  }
  return out;
}

// 2) El pedido al enjambre.
export const SISTEMA_INFORME = [
  "Eres el enjambre de especialistas de ENQORA (Chile): CORA dirige y consolida; participan el agente de la línea, el investigador, el verificador de fuentes y el crítico.",
  "Preparas el INFORME DE INGRESO de una solicitud para que un profesional humano lo lea, corrija y decida. No hablas con el cliente: el borrador de mensaje lo aprueba una persona antes de enviarlo.",
  "Reglas estrictas:",
  "- Cada hecho, paso de la ruta y riesgo lleva su fuente: «relato» (lo que dijo el cliente) o el id de una fuente de la lista (F1, F2…). Nunca cites algo fuera de la lista ni inventes normas, artículos, plazos, montos o precios.",
  "- Si un dato no está en el relato ni en las fuentes, va a «faltantes». Distingue lo que el cliente afirma (certeza media) de lo que consta en una fuente oficial (alta).",
  "- No calcules multas, intereses ni indemnizaciones: indica qué dato falta para calcularlas.",
  "- Nunca pidas claves (ClaveÚnica, clave del SII, bancos). Para actuar en el SII, ENQORA usa el Mandato Digital.",
  "- En casos laborales, el lado lo define quién habla (trabajador o empleador). Si el relato menciona a la otra parte (empresa o persona), escribe su nombre en «contraparte»; si no, déjalo vacío.",
  "- No escribas el nombre ni el RUT del cliente en las rutas ni en los riesgos.",
  "- Tono del borrador al cliente: cercano, claro, en segunda persona, sin prometer resultados, pidiendo solo lo necesario.",
].join("\n");

export function armarPrompt(e: Entrada, fuentes: FuenteInforme[]): string {
  return [
    `Línea de servicio: ${e.linea} (${LINEAS[e.linea]}). Especialista sugerido: ${ESPECIALISTA[e.linea].quien}.`,
    e.razonSocial ? `Empresa declarada: ${e.razonSocial}.` : "",
    `Análisis previo de CORA: ${e.analisis.resumen ?? "sin resumen"}${e.analisis.categorias?.length ? ` · áreas: ${e.analisis.categorias.map(nombreCategoria).join(", ")}` : ""}.`,
    `Relato del cliente:\n"""${e.relato}"""`,
    "Fuentes que puedes citar (usa su id):",
    ...fuentes.map((f) => `[${f.id}] (${f.tipo}) ${f.titulo}${f.verificada ? ` · verificada ${f.verificada}` : ""}: ${f.texto}`),
    `Documentos posibles para pedir (usa la clave): ${Object.entries(DOCUMENTOS).map(([k, d]) => `${k} (${d.nombre})`).join("; ")}.`,
    `Servicios del catálogo para esta línea (usa el código o deja vacío si ninguno calza): ${e.catalogo.filter((c) => ESPECIALISTA[e.linea].modulos.includes(c.module)).map((c) => `${c.code} ${c.name}`).join("; ") || "ninguno activo"}.`,
    e.lecciones.length ? `Correcciones recientes del equipo en esta línea (apréndelas y no repitas el error):\n${e.lecciones.map((l) => `- ${anonimizar(l)}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

const AFIRMACION = { type: "object", properties: { texto: { type: "string" }, fuente: { type: "string", description: "«relato» o id de fuente (F1, F2…)." }, certeza: { type: "string", enum: ["alta", "media", "baja"] } }, required: ["texto", "fuente", "certeza"] };
export const HERRAMIENTA_INFORME = {
  name: "entregar_informe_ingreso",
  description: "Entrega el informe de ingreso consolidado de la solicitud.",
  input_schema: {
    type: "object",
    properties: {
      pide: { type: "string", description: "Qué pide el cliente, en una o dos frases." },
      hechos: { type: "array", items: AFIRMACION, description: "Hechos clave extraídos (máx. 8)." },
      faltantes: { type: "array", items: { type: "object", properties: { dato: { type: "string" }, por_que: { type: "string" } }, required: ["dato", "por_que"] } },
      documentos: { type: "array", items: { type: "string", enum: Object.keys(DOCUMENTOS) } },
      ruta: { type: "array", items: AFIRMACION, description: "Pasos sugeridos para resolver (máx. 8)." },
      servicio: { type: "string", description: "Código del catálogo que calza, o vacío." },
      servicio_motivo: { type: "string" },
      riesgos: { type: "array", items: { ...AFIRMACION, properties: { ...AFIRMACION.properties, nivel: { type: "string", enum: ["bajo", "medio", "alto"] } }, required: ["texto", "fuente", "certeza", "nivel"] } },
      preguntas: { type: "array", items: { type: "string" }, description: "Preguntas para el cliente (máx. 5)." },
      mensaje_cliente: { type: "string", description: "Borrador del primer mensaje al cliente (lo aprueba una persona)." },
      contraparte: { type: "string", description: "Nombre de la otra parte si el relato la menciona; vacío si no." },
      confianza: { type: "string", enum: ["alta", "media", "baja"] },
    },
    required: ["pide", "hechos", "faltantes", "documentos", "ruta", "riesgos", "preguntas", "mensaje_cliente", "confianza"],
  },
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const certeza = (v: unknown): Certeza => (v === "alta" || v === "media" || v === "baja" ? v : "baja");

// 3) Valida y limpia la salida: descarta lo que cite fuentes inexistentes y fija lo que no decide la IA.
export function sanear(raw: unknown, e: Entrada, fuentes: FuenteInforme[]): { informe: Informe; descartes: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const pide = str(o.pide, 600);
  if (pide.length < 5) return null;
  const ids = new Set(["relato", ...fuentes.map((f) => f.id)]);
  let descartes = 0;
  const afirm = (v: unknown, max: number): Afirmacion[] =>
    (Array.isArray(v) ? v : []).flatMap((x) => {
      const a = x as Record<string, unknown>;
      const texto = str(a?.texto, 500);
      const fuente = str(a?.fuente, 12).replace(/^\[|\]$/g, "");
      if (!texto) return [];
      if (!ids.has(fuente)) { descartes++; return []; }
      // Lo que solo dice el cliente nunca es certeza «alta».
      const c = certeza(a.certeza);
      return [{ texto, fuente, certeza: fuente === "relato" && c === "alta" ? "media" : c }];
    }).slice(0, max);
  const riesgos = (Array.isArray(o.riesgos) ? o.riesgos : []).flatMap((x) => {
    const [a] = afirm([x], 1);
    const nivel = (x as Record<string, unknown>)?.nivel;
    return a ? [{ ...a, nivel: nivel === "alto" || nivel === "medio" ? nivel : "bajo" } as Informe["riesgos"][number]] : [];
  }).slice(0, 6);
  const codigo = str(o.servicio, 12).toUpperCase();
  const svc = e.catalogo.find((c) => c.code === codigo && ESPECIALISTA[e.linea].modulos.includes(c.module));
  const plazo = fuentes.find((f) => f.tipo === "plazo");
  const informe: Informe = {
      pide,
      hechos: afirm(o.hechos, 8),
      linea: e.linea,
      especialista: ESPECIALISTA[e.linea].quien,
      urgencia: plazo ? { texto: plazo.texto, fuente: plazo.id } : null,
      faltantes: (Array.isArray(o.faltantes) ? o.faltantes : []).flatMap((x) => {
        const f = x as Record<string, unknown>;
        const dato = str(f?.dato, 200);
        return dato ? [{ dato, por_que: str(f.por_que, 300) }] : [];
      }).slice(0, 8),
      documentos: [...new Set((Array.isArray(o.documentos) ? o.documentos : []).filter((d): d is string => typeof d === "string" && d in DOCUMENTOS))].slice(0, 8),
      ruta: afirm(o.ruta, 8),
      servicio: svc ? { codigo: svc.code, nombre: svc.name, precio_desde: svc.price_from, unidad: svc.unit, motivo: str(o.servicio_motivo, 300) } : null,
      riesgos,
      preguntas: (Array.isArray(o.preguntas) ? o.preguntas : []).map((p) => str(p, 300)).filter(Boolean).slice(0, 5),
      mensaje_cliente: str(o.mensaje_cliente, 2500),
      contraparte: str(o.contraparte, 160) || null,
      confianza: certeza(o.confianza),
  };
  // «descartes» se lee al final: cuenta lo que se eliminó al armar el informe.
  return { informe, descartes };
}

// 4) Sin IA disponible: informe por reglas (honesto: dice que no hubo análisis del enjambre).
export function informePorReglas(e: Entrada, fuentes: FuenteInforme[]): Informe {
  const ruta = fuentes.find((f) => f.tipo === "ruta");
  const plazo = fuentes.find((f) => f.tipo === "plazo");
  return {
    pide: e.analisis.resumen?.trim() || e.relato.slice(0, 280),
    hechos: [{ texto: e.relato.slice(0, 400), fuente: "relato", certeza: "media" }],
    linea: e.linea,
    especialista: ESPECIALISTA[e.linea].quien,
    urgencia: plazo ? { texto: plazo.texto, fuente: plazo.id } : null,
    faltantes: [{ dato: "Análisis del enjambre", por_que: "La IA no estuvo disponible; el profesional debe leer el relato completo." }],
    documentos: (e.analisis.documentos ?? []).filter((d) => d in DOCUMENTOS).slice(0, 6),
    ruta: ruta ? [{ texto: `Revisar la ruta ENQORA sugerida: ${ruta.titulo.replace("Ruta ENQORA: ", "")}`, fuente: ruta.id, certeza: "media" }] : [],
    servicio: null,
    riesgos: [],
    preguntas: [],
    mensaje_cliente: "",
    contraparte: null,
    confianza: "baja",
  };
}

export const lineaValida = (v: unknown): Linea => (typeof v === "string" && esLinea(v) ? (v.toUpperCase() as Linea) : "GEN");
