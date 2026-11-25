import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DESCRIPCION_HABILIDAD, HABILIDADES_ANTHROPIC, HABILIDADES_POR_AGENTE } from "@/lib/habilidades";
import { PAQUETES_HABILIDADES } from "@/lib/habilidades/paquetes";
import type { AgentKey } from "@/lib/mirror";

// Computador del enjambre (0096). Cada agente trabaja con un contenedor Linux de la API de Claude (ejecución de
// código: Python, terminal y archivos; SIN internet), uno por caso y por agente, que dura hasta 30 días. Aquí:
//   · se copian al contenedor los documentos del expediente (Files API),
//   · se arman las habilidades del agente (las de ENQORA más las de Anthropic para Excel, Word y PDF),
//   · se suben o actualizan las habilidades propias (Skills API),
//   · se descargan los archivos que el agente crea, que quedan en el expediente como documentos internos.
// Variables (solo en Vercel): ANTHROPIC_API_KEY (la misma de los agentes) y ENQORA_COMPUTADOR=off para apagarlo.

const API = "https://api.anthropic.com/v1";
const VERSION = "2023-06-01";
const BETA_FILES = "files-api-2025-04-14";

export const computadorActivo = () => !!process.env.ANTHROPIC_API_KEY && process.env.ENQORA_COMPUTADOR?.trim() !== "off";

const cabeceras = (extra: Record<string, string> = {}) => ({
  "x-api-key": process.env.ANTHROPIC_API_KEY ?? "", "anthropic-version": VERSION, ...extra,
});

// Tipos de archivo que se copian al computador y límites (por archivo y por ejecución).
const EXT_OK = /\.(pdf|xlsx|xlsm|xls|csv|txt|xml|docx|json|png|jpe?g|webp)$/i;
export const MAX_ARCHIVO = 10 * 1024 * 1024;
const MAX_TOTAL = 30 * 1024 * 1024;
const MAX_DOCUMENTOS = 12;
const MAX_SALIDAS = 5;
const MAX_SALIDA = 20 * 1024 * 1024;

export type DocumentoCaso = { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; storage_path: string };
export type Computador = { containerId: string | null; documentos: string[] };
export type HabilidadContenedor = { type: "anthropic" | "custom"; skill_id: string; version: string };

// Nombre de archivo seguro dentro del contenedor y del expediente.
export const nombreSeguro = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "archivo";

export async function computadorDelCaso(sb: SupabaseClient, caseId: string, agent: AgentKey): Promise<Computador> {
  const { data, error } = await sb.rpc("agente_computador_obtener", { p_case: caseId, p_agent: agent });
  if (error || !data) return { containerId: null, documentos: [] };
  const d = data as { container_id?: string; documentos?: string[] };
  return { containerId: d.container_id ?? null, documentos: d.documentos ?? [] };
}

export async function guardarComputador(sb: SupabaseClient, caseId: string, agent: AgentKey, containerId: string, expira: string | null, documentos: string[]) {
  await sb.rpc("agente_computador_guardar", {
    p_case: caseId, p_agent: agent, p_container: containerId, p_expira: expira, p_documentos: documentos.slice(0, 200),
  }).then(() => undefined, () => undefined);
}

// Habilidades que carga el agente: las propias ya subidas (agente_habilidades) más las de Anthropic.
export async function habilidadesDelAgente(sb: SupabaseClient, agent: AgentKey): Promise<{ lista: HabilidadContenedor[]; nombres: string[] }> {
  const quiere = HABILIDADES_POR_AGENTE[agent] ?? [];
  const { data } = await sb.from("agente_habilidades").select("nombre, skill_id").in("nombre", quiere);
  const propias = ((data as { nombre: string; skill_id: string }[] | null) ?? []);
  return {
    lista: [
      ...propias.map((h) => ({ type: "custom" as const, skill_id: h.skill_id, version: "latest" })),
      ...HABILIDADES_ANTHROPIC.map((s) => ({ type: "anthropic" as const, skill_id: s, version: "latest" })),
    ].slice(0, 20),
    nombres: [...propias.map((h) => h.nombre), ...HABILIDADES_ANTHROPIC],
  };
}

// Copia al computador los documentos del expediente que aún no tiene (los más recientes primero).
export async function copiarDocumentos(sb: SupabaseClient, caseId: string, yaCopiados: string[]): Promise<{ fileIds: string[]; copiados: string[]; omitidos: string[] }> {
  const { data } = await sb.from("case_documents").select("id, file_name, mime_type, size_bytes, storage_path")
    .eq("case_id", caseId).order("created_at", { ascending: false }).limit(40);
  const docs = ((data as DocumentoCaso[] | null) ?? []).filter((d) => !yaCopiados.includes(d.id));
  const fileIds: string[] = [];
  const copiados: string[] = [];
  const omitidos: string[] = [];
  let total = 0;
  for (const d of docs) {
    if (copiados.length >= MAX_DOCUMENTOS) { omitidos.push(d.file_name); continue; }
    if (!EXT_OK.test(d.file_name) || (d.size_bytes ?? 0) > MAX_ARCHIVO || total + (d.size_bytes ?? 0) > MAX_TOTAL) { omitidos.push(d.file_name); continue; }
    const { data: blob } = await sb.storage.from("expedientes").download(d.storage_path);
    if (!blob) { omitidos.push(d.file_name); continue; }
    const id = await subirArchivo(new Uint8Array(await blob.arrayBuffer()), nombreSeguro(d.file_name), d.mime_type ?? blob.type);
    if (!id) { omitidos.push(d.file_name); continue; }
    fileIds.push(id);
    copiados.push(d.id);
    total += d.size_bytes ?? blob.size;
  }
  return { fileIds, copiados, omitidos };
}

export async function subirArchivo(bytes: Uint8Array, nombre: string, mime: string): Promise<string | null> {
  const form = new FormData();
  form.append("file", new Blob([bytes as unknown as BlobPart], { type: mime || "application/octet-stream" }), nombre);
  try {
    const res = await fetch(`${API}/files`, { method: "POST", headers: cabeceras({ "anthropic-beta": BETA_FILES }), body: form, signal: AbortSignal.timeout(30_000) });
    const j = (await res.json().catch(() => null)) as { id?: string } | null;
    return res.ok && j?.id ? j.id : null;
  } catch {
    return null;
  }
}

// Archivos que el agente creó en su computador → expediente del caso, como documentos INTERNOS (borradores).
export async function guardarSalidas(sb: SupabaseClient, caso: { id: string; company_id: string }, agent: AgentKey, fileIds: string[]): Promise<string[]> {
  const guardados: string[] = [];
  for (const fid of [...new Set(fileIds)].slice(0, MAX_SALIDAS)) {
    try {
      const meta = await fetch(`${API}/files/${encodeURIComponent(fid)}`, { headers: cabeceras({ "anthropic-beta": BETA_FILES }), signal: AbortSignal.timeout(15_000) });
      const m = (await meta.json().catch(() => null)) as { filename?: string; size_bytes?: number; mime_type?: string } | null;
      if (!meta.ok || !m || (m.size_bytes ?? 0) > MAX_SALIDA) continue;
      const res = await fetch(`${API}/files/${encodeURIComponent(fid)}/content`, { headers: cabeceras({ "anthropic-beta": BETA_FILES }), signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.byteLength > MAX_SALIDA) continue;
      const nombre = `IA-${agent}-${new Date().toISOString().slice(0, 10)}-${nombreSeguro(m.filename ?? "archivo")}`;
      const path = `${caso.company_id}/${caso.id}/${Date.now().toString(36)}-${nombre}`;
      const mime = m.mime_type || "application/octet-stream";
      const up = await sb.storage.from("expedientes").upload(path, bytes, { contentType: mime, upsert: false });
      if (up.error) continue;
      const { error } = await sb.rpc("register_document", { p_case: caso.id, p_path: path, p_name: nombre, p_mime: mime, p_size: bytes.byteLength, p_visibility: "interno" });
      if (!error) guardados.push(nombre);
    } catch {
      // Un archivo que no se pudo traer no detiene el resto.
    }
  }
  return guardados;
}

// Sube o actualiza las habilidades propias (Skills API). Solo lo que cambió (huella distinta).
export type ResultadoSincronizar = { nombre: string; estado: "igual" | "creada" | "actualizada" | "error"; detalle?: string }[];
export async function sincronizarHabilidades(sb: SupabaseClient): Promise<ResultadoSincronizar> {
  const { data } = await sb.from("agente_habilidades").select("nombre, skill_id, huella");
  const previas = new Map(((data as { nombre: string; skill_id: string; huella: string }[] | null) ?? []).map((h) => [h.nombre, h]));
  const out: ResultadoSincronizar = [];
  let existentes: { id: string; display_title?: string | null }[] | null = null;
  for (const p of PAQUETES_HABILIDADES) {
    const previa = previas.get(p.nombre);
    if (previa?.huella === p.huella) { out.push({ nombre: p.nombre, estado: "igual" }); continue; }
    const form = new FormData();
    if (!previa) form.append("display_title", p.nombre);
    for (const [ruta, contenido] of Object.entries(p.archivos)) {
      form.append("files[]", new Blob([contenido], { type: ruta.endsWith(".md") ? "text/markdown" : "text/x-python" }), ruta);
    }
    try {
      let skillId = previa?.skill_id ?? null;
      if (!skillId) {
        // Si ya existe en la API (por ejemplo, se subió antes de esta base), se reutiliza.
        existentes ??= await listarHabilidades();
        skillId = existentes.find((s) => s.display_title === p.nombre)?.id ?? null;
      }
      const url = skillId ? `${API}/skills/${encodeURIComponent(skillId)}/versions` : `${API}/skills`;
      if (skillId) form.delete("display_title");
      const res = await fetch(url, { method: "POST", headers: cabeceras(), body: form, signal: AbortSignal.timeout(45_000) });
      const j = (await res.json().catch(() => null)) as { id?: string; skill_id?: string; version?: string; latest_version?: string; error?: { message?: string } } | null;
      if (!res.ok || !j) { out.push({ nombre: p.nombre, estado: "error", detalle: `${res.status} ${j?.error?.message ?? ""}`.trim().slice(0, 200) }); continue; }
      const id = skillId ?? j.id ?? "";
      const version = j.version ?? j.latest_version ?? "";
      const { error } = await sb.rpc("agente_habilidad_guardar", { p_nombre: p.nombre, p_skill: id, p_version: String(version), p_huella: p.huella });
      out.push(error ? { nombre: p.nombre, estado: "error", detalle: "No se pudo registrar en la base." } : { nombre: p.nombre, estado: skillId ? "actualizada" : "creada" });
    } catch (e) {
      out.push({ nombre: p.nombre, estado: "error", detalle: e instanceof Error ? e.message.slice(0, 200) : "error" });
    }
  }
  return out;
}

async function listarHabilidades(): Promise<{ id: string; display_title?: string | null }[]> {
  try {
    const res = await fetch(`${API}/skills?source=custom&limit=100`, { headers: cabeceras(), signal: AbortSignal.timeout(20_000) });
    const j = (await res.json().catch(() => null)) as { data?: { id: string; display_title?: string | null }[] } | null;
    return res.ok ? j?.data ?? [] : [];
  } catch {
    return [];
  }
}

export const catalogoHabilidades = () =>
  PAQUETES_HABILIDADES.map((p) => ({ nombre: p.nombre, huella: p.huella, descripcion: DESCRIPCION_HABILIDAD[p.nombre] ?? "", archivos: Object.keys(p.archivos).length }));
