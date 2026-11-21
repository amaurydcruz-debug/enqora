"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, currentUser } from "@/lib/supabase/server";
import { dbMessage } from "@/lib/db-errors";
import { myStaffRole } from "@/lib/staff";
import { construirExpediente, type EntradaExpediente } from "@/lib/pdf-expediente";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOCS = 40;
const MAX_BYTES = 60 * 1024 * 1024;

type Doc = { id: string; file_name: string; mime_type: string | null; size_bytes: number | null; storage_path: string; created_at: string };

// Equipo ENQORA: une los documentos elegidos del caso en un solo PDF numerado (portada con índice y huella
// SHA-256 de cada original, y pie «folio · documento n/N · página»). El PDF entra al expediente como
// documento interno y la Bóveda le da su número (DOC-…). Los originales no se tocan: quedan en la Bóveda.
export async function unirEnPdfAction(caseIdRaw: string, idsRaw: string[]): Promise<{ error?: string; ok?: string }> {
  const caseId = UUID_RE.test(caseIdRaw) ? caseIdRaw : null;
  const ids = [...new Set((Array.isArray(idsRaw) ? idsRaw : []).filter((x) => typeof x === "string" && UUID_RE.test(x)))].slice(0, MAX_DOCS);
  if (!caseId || !ids.length) return { error: "Elige al menos un documento." };
  const rol = await myStaffRole();
  if (!rol || rol === "ai_agent") return { error: "Solo el equipo ENQORA puede unir documentos en PDF." };

  const supabase = await createClient();
  const user = await currentUser();
  const { data: caso } = await supabase.from("cases").select("id, folio, title, company_id").eq("id", caseId).maybeSingle();
  const c = caso as { id: string; folio: string; title: string; company_id: string } | null;
  if (!c) return { error: "No tienes acceso a este caso." };
  const [{ data: emp }, { data: rows }, { data: perfil }] = await Promise.all([
    supabase.from("companies").select("legal_name, trade_name").eq("id", c.company_id).maybeSingle(),
    supabase.from("case_documents").select("id, file_name, mime_type, size_bytes, storage_path, created_at").eq("case_id", caseId).in("id", ids),
    supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle(),
  ]);
  const orden = new Map(ids.map((id, i) => [id, i]));
  const docs = ((rows ?? []) as Doc[]).sort((a, b) => (orden.get(a.id) ?? 0) - (orden.get(b.id) ?? 0));
  if (!docs.length) return { error: "No encontramos esos documentos en el caso." };
  if (docs.reduce((s, d) => s + Number(d.size_bytes ?? 0), 0) > MAX_BYTES) return { error: "Los documentos elegidos superan 60 MB en total. Únelos en dos partes." };

  const cliente = (emp as { legal_name: string } | null)?.legal_name ?? "";
  const preparo = ((perfil as { full_name: string | null } | null)?.full_name ?? "").trim() || user?.email || "Equipo ENQORA";
  const entradas: EntradaExpediente[] = [];
  for (const d of docs) {
    const { data: blob, error } = await supabase.storage.from("expedientes").download(d.storage_path);
    entradas.push({ doc: d, bytes: error || !blob ? null : new Uint8Array(await blob.arrayBuffer()) });
  }
  const { bytes: salida, unidos } = await construirExpediente({ folio: c.folio, titulo: c.title, cliente, preparo, entradas });
  if (!unidos) return { error: "Ninguno de los documentos elegidos es PDF o foto (JPG/PNG). Esos quedan como originales en la Bóveda." };
  if (salida.byteLength > 20 * 1024 * 1024) return { error: "El PDF unido supera 20 MB. Únelo en dos partes." };
  const nombre = `Expediente ${c.folio} (${unidos} ${unidos === 1 ? "documento" : "documentos"}).pdf`;
  const path = `${c.company_id}/${c.id}/${randomUUID()}-expediente-${c.folio}.pdf`;
  const up = await supabase.storage.from("expedientes").upload(path, salida, { contentType: "application/pdf", upsert: false });
  if (up.error) return { error: "No se pudo guardar el PDF en el expediente. Confirma tu segundo factor e intenta nuevamente." };
  const { error } = await supabase.rpc("register_document", {
    p_case: c.id, p_path: path, p_name: nombre, p_mime: "application/pdf", p_size: salida.byteLength, p_visibility: "interno",
  });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/casos/${c.id}`);
  return { ok: `Listo: «${nombre}» quedó en el expediente (solo equipo) y la Bóveda le asignó su número.` };
}
