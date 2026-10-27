import type { ModuleKey } from "@/lib/cases";

// Hoja de vida tributaria a partir de la Carpeta Tributaria Electrónica (CTE) que genera la propia
// empresa en sii.cl. La IA SOLO transcribe lo que dice el documento; las alertas y sugerencias las
// calculan reglas fijas de ENQORA sobre esa transcripción (nada se infiere ni se inventa).

export type F29 = {
  periodo: string; declarado: boolean | null; fecha_presentacion?: string | null; folio?: string | null;
  ventas_netas?: number | null; iva_debito?: number | null; iva_credito?: number | null; total_a_pagar?: number | null; observacion?: string | null;
};
export type F22 = {
  anio_tributario: number; declarado: boolean | null; estado?: string | null; fecha_presentacion?: string | null;
  base_imponible?: number | null; impuesto?: number | null; devolucion?: number | null; observacion?: string | null;
};
export type Extract = {
  es_carpeta_tributaria: boolean;
  rut: string | null;
  razon_social: string | null;
  tipo_carpeta: string | null;
  emitida: string | null;
  vigente_hasta: string | null;
  inicio_actividades: string | null;
  actividades: { codigo: string | null; descripcion: string | null; categoria?: string | null }[];
  regimen?: string | null;
  f29: F29[];
  f22: F22[];
  honorarios?: { meses: number | null; total_bruto: number | null; retenciones: number | null } | null;
  propiedades?: number | null;
  observaciones_sii: string[];
  no_legible?: string[];
};

export type Finding = {
  codigo: string; gravedad: "alta" | "media" | "baja"; titulo: string; detalle: string; servicio: ModuleKey; asunto: string;
};

const DATE = { type: ["string", "null"], description: "Fecha AAAA-MM-DD o null si no aparece" };
const NUM = { type: ["number", "null"], description: "Monto en pesos, sin puntos; null si no aparece" };

export const EXTRACT_TOOL = {
  name: "registrar_carpeta",
  description: "Registra la transcripción estructurada de la Carpeta Tributaria Electrónica.",
  input_schema: {
    type: "object",
    properties: {
      es_carpeta_tributaria: { type: "boolean", description: "true solo si el documento es una Carpeta Tributaria Electrónica del SII" },
      rut: { type: ["string", "null"], description: "RUT del contribuyente con dígito verificador" },
      razon_social: { type: ["string", "null"] },
      tipo_carpeta: { type: ["string", "null"], description: "Ej.: Para solicitar créditos, Personalizada, Para acreditar tamaño de empresa" },
      emitida: DATE,
      vigente_hasta: DATE,
      inicio_actividades: DATE,
      actividades: {
        type: "array", maxItems: 20,
        items: { type: "object", properties: { codigo: { type: ["string", "null"] }, descripcion: { type: ["string", "null"] }, categoria: { type: ["string", "null"] } }, required: ["codigo", "descripcion"] },
      },
      regimen: { type: ["string", "null"], description: "Régimen tributario si aparece" },
      f29: {
        type: "array", maxItems: 40, description: "Un elemento por período mensual que la carpeta informa (formato compacto)",
        items: {
          type: "object",
          properties: {
            periodo: { type: "string", description: "AAAA-MM" },
            declarado: { type: ["boolean", "null"], description: "false si la carpeta indica que no hay declaración para el período" },
            fecha_presentacion: DATE, folio: { type: ["string", "null"] },
            ventas_netas: NUM, iva_debito: NUM, iva_credito: NUM, total_a_pagar: NUM,
            observacion: { type: ["string", "null"], description: "Texto literal de observación o anotación del período, si existe" },
          },
          required: ["periodo", "declarado"],
        },
      },
      f22: {
        type: "array", maxItems: 6,
        items: {
          type: "object",
          properties: {
            anio_tributario: { type: "integer" },
            declarado: { type: ["boolean", "null"] },
            estado: { type: ["string", "null"], description: "Estado literal si aparece (p. ej. observada, aceptada)" },
            fecha_presentacion: DATE, base_imponible: NUM, impuesto: NUM, devolucion: NUM,
            observacion: { type: ["string", "null"] },
          },
          required: ["anio_tributario", "declarado"],
        },
      },
      honorarios: {
        type: ["object", "null"],
        properties: { meses: { type: ["integer", "null"] }, total_bruto: NUM, retenciones: NUM },
      },
      propiedades: { type: ["integer", "null"], description: "Cantidad de bienes raíces informados" },
      observaciones_sii: { type: "array", maxItems: 20, items: { type: "string" }, description: "Observaciones tributarias que la carpeta informa, textuales" },
      no_legible: { type: "array", maxItems: 10, items: { type: "string" }, description: "Secciones que no se pudieron leer" },
    },
    required: ["es_carpeta_tributaria", "rut", "f29", "f22", "actividades", "observaciones_sii"],
  },
};

export const EXTRACT_SYSTEM = [
  "Eres el lector documental de ENQORA, plataforma chilena de contabilidad e impuestos.",
  "Recibes una Carpeta Tributaria Electrónica (CTE) generada por el propio contribuyente en sii.cl.",
  "Tu única tarea es TRANSCRIBIR en forma estructurada lo que el documento dice: no calcules, no interpretes, no completes datos que no estén.",
  "Si un dato no aparece, usa null. Si una sección no existe en la carpeta, entrega una lista vacía.",
  "Montos en pesos chilenos como números (sin puntos). Fechas en formato AAAA-MM-DD; períodos mensuales en AAAA-MM.",
  "No transcribas nombres, RUT ni domicilios de personas naturales (socios, representantes): no se necesitan.",
  "Si el documento no es una Carpeta Tributaria Electrónica del SII, marca es_carpeta_tributaria = false y deja el resto vacío.",
  "Termina llamando una vez a registrar_carpeta.",
].join("\n");

type ApiResponse = { content?: { type: string; name?: string; input?: unknown }[]; error?: { type?: string; message?: string } };

export async function extractTaxFolder(pdf: ArrayBuffer, signal: AbortSignal): Promise<Extract> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta configurar ANTHROPIC_API_KEY en Vercel.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5-5",
      max_tokens: 12000,
      system: EXTRACT_SYSTEM,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: EXTRACT_TOOL.name },
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") } },
          { type: "text", text: "Transcribe esta carpeta tributaria con registrar_carpeta." },
        ],
      }],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as ApiResponse;
  if (!res.ok) throw new Error(`No se pudo leer el documento (${res.status}${data.error?.type ? `: ${data.error.type}` : ""}).`);
  const use = data.content?.find((b) => b.type === "tool_use" && b.name === EXTRACT_TOOL.name);
  if (!use?.input || typeof use.input !== "object") throw new Error("La lectura del documento no devolvió datos.");
  return sanitize(use.input as Partial<Extract>);
}

const str = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
const bool = (v: unknown) => (typeof v === "boolean" ? v : null);

export function sanitize(x: Partial<Extract>): Extract {
  const arr = <T>(v: unknown, max: number) => (Array.isArray(v) ? (v.slice(0, max) as T[]) : []);
  return {
    es_carpeta_tributaria: x.es_carpeta_tributaria === true,
    rut: str(x.rut, 14),
    razon_social: str(x.razon_social),
    tipo_carpeta: str(x.tipo_carpeta, 120),
    emitida: day(x.emitida),
    vigente_hasta: day(x.vigente_hasta),
    inicio_actividades: day(x.inicio_actividades),
    actividades: arr<Extract["actividades"][number]>(x.actividades, 20).map((a) => ({ codigo: str(a?.codigo, 20), descripcion: str(a?.descripcion), categoria: str(a?.categoria, 40) })),
    regimen: str(x.regimen, 120),
    f29: arr<F29>(x.f29, 40)
      .filter((f) => typeof f?.periodo === "string" && /^\d{4}-\d{2}$/.test(f.periodo))
      .map((f) => ({
        periodo: f.periodo, declarado: bool(f.declarado), fecha_presentacion: day(f.fecha_presentacion), folio: str(f.folio, 30),
        ventas_netas: num(f.ventas_netas), iva_debito: num(f.iva_debito), iva_credito: num(f.iva_credito), total_a_pagar: num(f.total_a_pagar),
        observacion: str(f.observacion),
      }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo)),
    f22: arr<F22>(x.f22, 6)
      .filter((f) => Number.isInteger(f?.anio_tributario) && f.anio_tributario > 1990 && f.anio_tributario < 2100)
      .map((f) => ({
        anio_tributario: f.anio_tributario, declarado: bool(f.declarado), estado: str(f.estado, 80), fecha_presentacion: day(f.fecha_presentacion),
        base_imponible: num(f.base_imponible), impuesto: num(f.impuesto), devolucion: num(f.devolucion), observacion: str(f.observacion),
      }))
      .sort((a, b) => a.anio_tributario - b.anio_tributario),
    honorarios: x.honorarios && typeof x.honorarios === "object"
      ? { meses: num(x.honorarios.meses), total_bruto: num(x.honorarios.total_bruto), retenciones: num(x.honorarios.retenciones) } : null,
    propiedades: num(x.propiedades),
    observaciones_sii: arr<string>(x.observaciones_sii, 20).map((o) => str(o, 400)).filter((o): o is string => !!o),
    no_legible: arr<string>(x.no_legible, 10).map((o) => str(o, 200)).filter((o): o is string => !!o),
  };
}

const cleanRut = (r: string | null | undefined) => (r ?? "").toUpperCase().replace(/[^0-9K]/g, "").replace(/^0+/, "");
const monthsBetween = (a: string, b: string) => {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
};
const addMonths = (p: string, n: number) => {
  const [y, m] = p.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const label = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
};
const list = (xs: string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(", ")} y ${xs.length - max} más` : xs.join(", "));

// Reglas fijas: cada hallazgo cita lo que dice la carpeta y sugiere el servicio ENQORA que lo resuelve.
export function buildFindings(x: Extract, companyRut: string | null, today = new Date().toISOString().slice(0, 10)): Finding[] {
  const out: Finding[] = [];
  if (!x.es_carpeta_tributaria) {
    return [{ codigo: "no_es_carpeta", gravedad: "alta", titulo: "El archivo no parece una Carpeta Tributaria Electrónica",
      detalle: "Genera la carpeta en sii.cl y sube el PDF tal como lo entrega el SII.", servicio: "contabilidad", asunto: "Revisar mi carpeta tributaria" }];
  }
  if (companyRut && x.rut && cleanRut(companyRut) !== cleanRut(x.rut)) {
    out.push({ codigo: "rut_distinto", gravedad: "alta", titulo: "La carpeta corresponde a otro RUT",
      detalle: `La carpeta es del RUT ${x.rut}, distinto al de esta empresa. El análisis no se usará para esta empresa hasta subir la carpeta correcta.`,
      servicio: "contabilidad", asunto: "Revisar mi carpeta tributaria" });
  }
  if (x.vigente_hasta && x.vigente_hasta < today) {
    out.push({ codigo: "carpeta_vencida", gravedad: "baja", titulo: "La carpeta ya no está vigente",
      detalle: `Su vigencia terminó el ${x.vigente_hasta}. Para un análisis al día, genera una nueva en sii.cl.`, servicio: "contabilidad", asunto: "Actualizar mi hoja de vida tributaria" });
  }

  // F29
  const noDecl = x.f29.filter((f) => f.declarado === false).map((f) => f.periodo);
  if (x.f29.length) {
    const first = x.f29[0].periodo;
    const last = x.f29[x.f29.length - 1].periodo;
    const listed = new Set(x.f29.map((f) => f.periodo));
    for (let i = 1; i < monthsBetween(first, last); i++) {
      const p = addMonths(first, i);
      if (!listed.has(p)) noDecl.push(p);
    }
  }
  const pending = [...new Set(noDecl)].sort();
  if (pending.length) {
    out.push({ codigo: "f29_sin_declarar", gravedad: "alta", titulo: `${pending.length} período(s) de IVA (F29) sin declaración en la carpeta`,
      detalle: `Períodos: ${list(pending.map(label))}. Un F29 fuera de plazo genera multa (art. 97 N°2 del Código Tributario), reajustes e intereses diarios; regularizar antes de una fiscalización reduce el costo.`,
      servicio: "contabilidad", asunto: "Regularizar declaraciones de IVA (F29) pendientes" });
  }
  const f29Obs = x.f29.filter((f) => f.observacion).map((f) => `${label(f.periodo)}: ${f.observacion}`);
  if (f29Obs.length) {
    out.push({ codigo: "f29_observaciones", gravedad: "media", titulo: "Declaraciones de IVA con anotaciones",
      detalle: list(f29Obs, 4), servicio: "contabilidad", asunto: "Revisar anotaciones en mis declaraciones de IVA" });
  }
  const declared = x.f29.filter((f) => f.declarado !== false);
  const lastYear = declared.slice(-12);
  if (lastYear.length >= 6 && lastYear.every((f) => (f.ventas_netas ?? 0) === 0 && (f.iva_debito ?? 0) === 0)) {
    out.push({ codigo: "sin_movimiento", gravedad: "media", titulo: `Sin ventas declaradas en los últimos ${lastYear.length} meses informados`,
      detalle: "Si la empresa no está operando, conviene evaluar una suspensión ordenada o el término de giro; si opera, hay que revisar que las ventas se estén declarando.",
      servicio: "legal", asunto: "Evaluar si mi empresa debe regularizarse o cerrar" });
  }

  // F22
  const f22No = x.f22.filter((f) => f.declarado === false).map((f) => String(f.anio_tributario));
  if (f22No.length) {
    out.push({ codigo: "f22_sin_declarar", gravedad: "alta", titulo: "Declaración de renta (F22) sin presentar",
      detalle: `Años tributarios: ${f22No.join(", ")}. La renta anual vence el 30 de abril; fuera de plazo hay multa e intereses.`,
      servicio: "contabilidad", asunto: "Presentar o rectificar mi declaración de renta (F22)" });
  }
  const f22Obs = x.f22.filter((f) => (f.estado && /observ|rechaz|impugn|pendient|anulad|revisi/i.test(f.estado)) || f.observacion);
  if (f22Obs.length) {
    out.push({ codigo: "f22_observada", gravedad: "alta", titulo: "Declaración de renta con observaciones o en revisión",
      detalle: list(f22Obs.map((f) => `AT ${f.anio_tributario}: ${f.estado ?? ""}${f.observacion ? ` ${f.observacion}` : ""}`.trim()), 4),
      servicio: "contabilidad", asunto: "Resolver observaciones de mi declaración de renta" });
  }

  if (x.observaciones_sii.length) {
    out.push({ codigo: "observaciones_sii", gravedad: "alta", titulo: "El SII registra observaciones tributarias",
      detalle: list(x.observaciones_sii, 4), servicio: "contabilidad", asunto: "Resolver observaciones tributarias del SII" });
  }
  if (!x.actividades.length) {
    out.push({ codigo: "sin_actividades", gravedad: "media", titulo: "La carpeta no informa actividades económicas vigentes",
      detalle: "Para emitir documentos y declarar correctamente, la empresa debe tener actividades inscritas en el SII.", servicio: "formaliza", asunto: "Regularizar mis actividades económicas en el SII" });
  }
  if (x.no_legible?.length) {
    out.push({ codigo: "no_legible", gravedad: "baja", titulo: "Partes de la carpeta no se pudieron leer",
      detalle: `${list(x.no_legible, 4)}. El equipo ENQORA lo revisará en el documento original.`, servicio: "contabilidad", asunto: "Revisar mi carpeta tributaria" });
  }
  const order = { alta: 0, media: 1, baja: 2 };
  return out.sort((a, b) => order[a.gravedad] - order[b.gravedad]);
}
