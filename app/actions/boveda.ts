"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { archiveroInterpreta, redactorEscribe, secretariaReune } from "@/lib/boveda-agentes";
import { tipoPorKey } from "@/lib/boveda";
import { dbCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";

// Bóveda de archivos (0059). Las reglas viven en la base; aquí solo se arma cada paso y se vuelve con un aviso.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function volver(path: string, error: { message?: string } | null, ok: string, hash = ""): never {
  revalidatePath("/mando/boveda");
  if (dbCode(error) === "ENQ_MFA") redirect(`/mfa?next=${encodeURIComponent(path)}`);
  redirect(`${path}${path.includes("?") ? "&" : "?"}${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}${hash}`);
}

// Pedido al Archivero (cliente desde su caso o equipo desde Mando). Texto libre o tipo elegido.
export async function pedirDocumentoAction(fd: FormData) {
  const caseId = String(fd.get("case_id") ?? "");
  const desde = String(fd.get("desde") ?? "") === "mando" ? "mando" : "caso";
  if (!UUID_RE.test(caseId)) redirect(desde === "mando" ? "/mando/boveda?error=ENQ_DATOS_INVALIDOS" : "/casos");
  const texto = String(fd.get("pedido") ?? "").trim().slice(0, 500);
  const tipoKey = String(fd.get("tipo") ?? "");
  if (texto.length < 8 && !tipoKey) redirect(desde === "mando" ? "/mando/boveda?error=ENQ_DATOS_INVALIDOS" : `/casos/${caseId}?error=ENQ_DATOS_INVALIDOS#boveda`);
  const interpretado = tipoKey ? { tipo: tipoPorKey(tipoKey), titulo: tipoPorKey(tipoKey).titulo, proposito: texto } : await archiveroInterpreta(texto);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vault_pedir", { p_case: caseId, p: {
    tipo: interpretado.tipo.key, clase: interpretado.tipo.clase, revisor: interpretado.tipo.revisor, titulo: interpretado.titulo,
    proposito: interpretado.proposito || null, destinatario: String(fd.get("destinatario") ?? "").trim().slice(0, 200) || null,
    confidencialidad: String(fd.get("confidencialidad") ?? "cliente"),
  } });
  const id = (data as { id?: string } | null)?.id;
  if (desde === "mando") volver(id && !error ? `/mando/boveda/${id}` : "/mando/boveda", error, "pedido");
  revalidatePath(`/casos/${caseId}`);
  volver(`/casos/${caseId}`, error, "documento_pedido", "#boveda");
}

async function cargarDoc(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("vault_documents")
    .select("id, folio, company_id, case_id, tipo, titulo, proposito, destinatario, antecedentes, version_actual").eq("id", id).maybeSingle();
  return { supabase, doc: data as (Parameters<typeof secretariaReune>[1] & { version_actual: number }) | null };
}

export async function secretariaAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const { supabase, doc } = await cargarDoc(id);
  if (!doc) redirect("/mando/boveda?error=ENQ_NO_ENCONTRADO");
  const antecedentes = await secretariaReune(supabase, doc);
  const { error } = await supabase.rpc("vault_guardar_antecedentes", { p_doc: id, p: antecedentes, p_agente: "secretaria" });
  volver(`/mando/boveda/${id}`, error, "antecedentes");
}

export async function redactorAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const { supabase, doc } = await cargarDoc(id);
  if (!doc) redirect("/mando/boveda?error=ENQ_NO_ENCONTRADO");
  // Sin antecedentes, la Secretaria los reúne primero.
  if (!doc.antecedentes || !Object.keys(doc.antecedentes).length) {
    const ant = await secretariaReune(supabase, doc);
    await supabase.rpc("vault_guardar_antecedentes", { p_doc: id, p: ant, p_agente: "secretaria" });
    doc.antecedentes = ant;
  }
  const b = await redactorEscribe(supabase, doc);
  if (!b) redirect(`/mando/boveda/${id}?error=ENQ_IA_NO_DISPONIBLE`);
  const { error } = await supabase.rpc("vault_guardar_borrador", { p_doc: id, p_cuerpo: b.cuerpo, p_faltantes: b.faltantes, p_normas: b.normas, p_agente: "redactor", p_nota: null });
  volver(`/mando/boveda/${id}`, error, "borrador");
}

export async function editarBorradorAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const cuerpo = String(fd.get("cuerpo") ?? "").replace(/<[^>]*>/g, "").slice(0, 120000);
  const faltantes = [...cuerpo.matchAll(/\[COMPLETAR:?\s*([^\]]*)\]/g)].map((m) => m[1].trim()).filter(Boolean).slice(0, 30);
  const supabase = await createClient();
  const { error } = await supabase.rpc("vault_guardar_borrador", { p_doc: id, p_cuerpo: cuerpo, p_faltantes: faltantes, p_normas: [], p_agente: null,
    p_nota: String(fd.get("nota") ?? "").trim().slice(0, 1000) || null });
  volver(`/mando/boveda/${id}`, error, "borrador_editado");
}

export async function enviarRevisionAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const supabase = await createClient();
  const { error } = await supabase.rpc("vault_enviar_revision", { p_doc: id });
  volver(`/mando/boveda/${id}`, error, "en_revision");
}

export async function revisarAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const supabase = await createClient();
  const decision = String(fd.get("decision") ?? "");
  const { error } = await supabase.rpc("vault_revisar", { p_doc: id, p_decision: decision, p_nota: String(fd.get("nota") ?? "").trim().slice(0, 1000) });
  volver(`/mando/boveda/${id}`, error, decision === "aprobar" ? "aprobado" : "observado");
}

export async function autorizarEnviarAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const supabase = await createClient();
  const { error } = await supabase.rpc("vault_autorizar_enviar", { p_doc: id, p_via: String(fd.get("via") ?? ""), p_nota: String(fd.get("nota") ?? "").trim().slice(0, 500) || null });
  volver(`/mando/boveda/${id}`, error, "enviado");
}

export async function anularAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const supabase = await createClient();
  const { error } = await supabase.rpc("vault_anular", { p_doc: id, p_motivo: String(fd.get("motivo") ?? "").trim().slice(0, 500) });
  volver(`/mando/boveda/${id}`, error, "anulado");
}

export async function retencionAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/boveda");
  const hasta = String(fd.get("hasta") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("vault_retencion", { p_doc: id, p_retencion_legal: fd.get("legal") === "on",
    p_hasta: /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? hasta : null, p_motivo: String(fd.get("motivo") ?? "").trim().slice(0, 300) });
  volver(`/mando/boveda/${id}`, error, "retencion");
}
