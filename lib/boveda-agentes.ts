import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { llamarHerramienta } from "@/lib/ai/gateway";
import { interpretarPedido, TIPOS, tipoPorKey, type TipoDocumento } from "@/lib/boveda";
import { RULES } from "@/lib/knowledge";

// Equipo documental de la Bóveda. Los agentes PREPARAN (antecedentes y borradores); las personas revisan,
// aprueban, autorizan y envían (reglas en la base, 0059).

type Doc = { id: string; folio: string; company_id: string; case_id: string | null; tipo: string; titulo: string; proposito: string | null;
  destinatario: string | null; antecedentes: Record<string, unknown> };

// Archivero: interpreta un pedido escrito en palabras. Reglas primero (gratis); IA solo si no calza ninguna.
export async function archiveroInterpreta(texto: string): Promise<{ tipo: TipoDocumento; titulo: string; proposito: string }> {
  const porReglas = interpretarPedido(texto);
  const proposito = texto.trim().slice(0, 500);
  if (porReglas.key !== "otro") return { tipo: porReglas, titulo: porReglas.titulo, proposito };
  const r = await llamarHerramienta({
    modulo: "boveda", datos: "privados", anonimizar: {}, maxTokens: 400, timeoutMs: 20_000,
    system: "Eres el Archivero de ENQORA (Chile). Clasificas pedidos de documentos en el catálogo. Responde solo con la herramienta.",
    prompt: `Pedido: """${proposito}"""\nCatálogo:\n${TIPOS.map((t) => `- ${t.key}: ${t.titulo}`).join("\n")}`,
    tool: { name: "clasificar", description: "Clasifica el pedido.", input_schema: { type: "object", properties: {
      tipo: { type: "string", enum: TIPOS.map((t) => t.key) }, titulo: { type: "string", maxLength: 160 } }, required: ["tipo", "titulo"] } },
    validar: (i) => typeof (i as { tipo?: unknown }).tipo === "string",
  });
  const i = (r.input ?? {}) as { tipo?: string; titulo?: string };
  const tipo = tipoPorKey(i.tipo);
  return { tipo, titulo: (i.titulo ?? "").trim().slice(0, 160) || tipo.titulo, proposito };
}

// Secretaria: reúne los antecedentes reales del caso, sin IA. Lo que no está, queda como faltante.
export async function secretariaReune(supabase: SupabaseClient, doc: Doc) {
  const tipo = tipoPorKey(doc.tipo);
  const [{ data: co }, caseRes, partyRes, filesRes, eventsRes] = await Promise.all([
    supabase.from("companies").select("rut, legal_name, trade_name, activity, tax_regime, address, commune").eq("id", doc.company_id).maybeSingle(),
    doc.case_id ? supabase.from("cases").select("folio, title, description, module, status, created_at").eq("id", doc.case_id).maybeSingle() : Promise.resolve({ data: null }),
    doc.case_id ? supabase.rpc("case_party", { p_case: doc.case_id }) : Promise.resolve({ data: null }),
    doc.case_id ? supabase.from("vault_documents").select("folio, titulo, origen, estado").eq("case_id", doc.case_id).neq("id", doc.id).neq("estado", "anulado").order("created_at", { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    doc.case_id ? supabase.from("case_events").select("kind, body, created_at").eq("case_id", doc.case_id).neq("kind", "nota_interna").order("created_at", { ascending: false }).limit(15) : Promise.resolve({ data: [] }),
  ]);
  const empresa = co as Record<string, string | null> | null;
  const caso = (caseRes as { data: Record<string, string | null> | null }).data;
  const partes = (partyRes as { data: { lado?: string; contraparte_nombre?: string | null } | null }).data;
  const archivos = ((filesRes as { data: unknown[] | null }).data ?? []) as { folio: string; titulo: string; origen: string; estado: string }[];
  const historial = ((eventsRes as { data: unknown[] | null }).data ?? []) as { kind: string; body: string | null; created_at: string }[];

  const datos: Record<string, string> = {};
  if (empresa?.legal_name) datos["Cliente (razón social o nombre)"] = empresa.legal_name;
  if (empresa?.rut) datos["RUT del cliente"] = empresa.rut;
  if (empresa?.trade_name) datos["Nombre de fantasía"] = empresa.trade_name;
  if (empresa?.activity) datos["Giro o actividad"] = empresa.activity;
  if (empresa?.tax_regime) datos["Régimen tributario"] = empresa.tax_regime;
  if (empresa?.address) datos["Domicilio"] = `${empresa.address}${empresa.commune ? `, ${empresa.commune}` : ""}`;
  if (caso?.folio) datos["Caso"] = `${caso.folio} · ${caso.title ?? ""}`;
  if (caso?.description) datos["Descripción del caso"] = String(caso.description).slice(0, 1500);
  if (partes?.lado) datos["Lado del cliente"] = partes.lado;
  if (partes?.contraparte_nombre) datos["Contraparte"] = partes.contraparte_nombre;
  if (doc.proposito) datos["Para qué se necesita"] = doc.proposito;
  if (doc.destinatario) datos["Destinatario"] = doc.destinatario;

  // Cada antecedente del tipo: «disponible» solo si hay un dato real que lo respalde; si no, faltante.
  const conocido = (a: string) => {
    const t = a.toLowerCase();
    if (/titular|mandante|cliente|empleador|contribuyente|partes/.test(t) && datos["Cliente (razón social o nombre)"] && datos["RUT del cliente"]) return true;
    if (/domicilio/.test(t) && !/trabajador|mandatario|declarante/.test(t) && datos["Domicilio"]) return true;
    if (/r[eé]gimen/.test(t) && datos["Régimen tributario"]) return true;
    if (/situaci[oó]n|consulta|hechos/.test(t) && datos["Descripción del caso"]) return true;
    if (/para qu[eé]|tr[aá]mite|lo que se (solicita|comunica)/.test(t) && datos["Para qué se necesita"]) return true;
    if (/destinatario|instituci[oó]n/.test(t) && datos["Destinatario"]) return true;
    return false;
  };
  const checklist = tipo.antecedentes.map((a) => ({ antecedente: a, estado: conocido(a) ? "disponible" : "falta" }));
  return {
    preparado_por: "Secretaria (agente ENQORA)",
    tipo: tipo.key,
    datos,
    checklist,
    faltantes: checklist.filter((c) => c.estado === "falta").map((c) => c.antecedente),
    archivos_del_caso: archivos.map((a) => `${a.folio} · ${a.titulo} (${a.origen === "subido" ? "archivo" : a.estado})`),
    historial: historial.filter((h) => h.body).map((h) => `${h.created_at.slice(0, 10)} · ${String(h.body).slice(0, 200)}`),
  };
}

const TOOL_REDACTAR = {
  name: "entregar_borrador",
  description: "Entrega el borrador del documento.",
  input_schema: {
    type: "object",
    properties: {
      cuerpo: { type: "string", description: "Documento completo en markdown simple (# título, ## secciones, párrafos, listas)." },
      faltantes: { type: "array", items: { type: "string", maxLength: 200 }, maxItems: 20, description: "Datos que faltan (los mismos marcados [COMPLETAR: …])." },
      normas: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 10, description: "Claves de las reglas entregadas que usaste." },
    },
    required: ["cuerpo", "faltantes", "normas"],
  },
} as const;

// Redactor: escribe el borrador SOLO con los antecedentes reunidos y la normativa entregada (con fuente).
export async function redactorEscribe(supabase: SupabaseClient, doc: Doc) {
  const tipo = tipoPorKey(doc.tipo);
  const normas = tipo.normas.map((k) => RULES[k]).filter(Boolean);
  let informa = "";
  for (const area of tipo.areas.slice(0, 2)) {
    const { data } = await supabase.rpc("informa_publicaciones", { p_categoria: area, p_q: null, p_limit: 3 });
    for (const p of ((data ?? []) as { titulo: string; institucion: string | null; fuente: string; resumen: string }[]))
      informa += `- ${p.titulo} (${p.institucion ?? "fuente oficial"}, ${p.fuente}): ${p.resumen.slice(0, 300)}\n`;
  }
  const ant = doc.antecedentes ?? {};
  const r = await llamarHerramienta({
    modulo: "boveda", datos: "privados", anonimizar: {}, maxTokens: 3500, timeoutMs: 45_000,
    system: [
      "Eres el Redactor de la Bóveda de ENQORA (Chile). Redactas borradores formales en español de Chile para que un abogado o contador los revise.",
      "Usa SOLO los antecedentes entregados. Nunca inventes nombres, RUT, domicilios, fechas, montos, números de resolución, de rol ni de causa.",
      "Donde falte un dato escribe exactamente [COMPLETAR: qué dato falta]. No dejes campos vacíos ni datos ficticios de ejemplo.",
      "Cita normativa solo de las reglas entregadas (con su artículo y fuente) o de las novedades verificadas de ENQORA Informa. Si no hay norma aplicable entregada, no cites ninguna.",
      "No firmes: deja al final un bloque de firma con [COMPLETAR: nombre, RUN y cargo de quien firma]. No agregues fecha de firma inventada.",
      "Formato: markdown simple (# título, ## secciones, párrafos, listas numeradas). Sin HTML. Sin comentarios fuera del documento.",
    ].join("\n"),
    prompt: [
      `Documento: ${tipo.titulo} (folio ${doc.folio}).`,
      `Título pedido: ${doc.titulo}.`,
      doc.proposito ? `Para qué se necesita: ${doc.proposito}.` : "",
      doc.destinatario ? `Destinatario: ${doc.destinatario}.` : "",
      `Antecedentes reunidos por la Secretaria:\n${JSON.stringify(ant, null, 2).slice(0, 12000)}`,
      `Antecedentes que este tipo de documento requiere: ${tipo.antecedentes.join("; ")}.`,
      normas.length ? `Reglas vigentes (con fuente):\n${tipo.normas.map((k) => RULES[k] ? `- ${k}: ${RULES[k].regla} [${RULES[k].fuente.articulo ?? ""} · ${RULES[k].fuente.titulo}]` : "").filter(Boolean).join("\n")}` : "Sin reglas específicas entregadas.",
      informa ? `Novedades verificadas de ENQORA Informa:\n${informa}` : "",
    ].filter(Boolean).join("\n\n"),
    tool: TOOL_REDACTAR,
    validar: (i) => typeof (i as { cuerpo?: unknown }).cuerpo === "string" && ((i as { cuerpo: string }).cuerpo.length >= 50),
  });
  if (!r.input) return null;
  const i = r.input as { cuerpo: string; faltantes?: string[]; normas?: string[] };
  const cuerpo = i.cuerpo.replace(/<[^>]*>/g, "").slice(0, 120000);
  const faltantes = [...new Set([...(i.faltantes ?? []), ...[...cuerpo.matchAll(/\[COMPLETAR:?\s*([^\]]*)\]/g)].map((m) => m[1].trim())])].filter(Boolean).slice(0, 30);
  return { cuerpo, faltantes, normas: (i.normas ?? []).filter((k) => tipo.normas.includes(k)) };
}
