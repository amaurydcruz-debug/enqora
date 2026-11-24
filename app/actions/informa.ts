"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { esDominioOficial } from "@/lib/dominios-oficiales";
import { DEP_KEYS, FICHA_CAMPOS } from "@/lib/informa";
import { createClient } from "@/lib/supabase/server";

// ENQORA Informa (0058). Las reglas (quién puede, cuándo se puede publicar, versiones) viven en la base.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fecha = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
};

function volver(path: string, error: { message?: string } | null, ok: string): never {
  revalidatePath("/mando/informa");
  revalidatePath("/informa");
  if (dbCode(error) === "ENQ_MFA") redirect(`/mfa?next=${encodeURIComponent(path)}`);
  redirect(`${path}?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${ok}`}`);
}

export async function pedirMisionAction(fd: FormData) {
  const dep = String(fd.get("departamento") ?? "");
  const tema = String(fd.get("tema") ?? "").trim().slice(0, 300);
  if (!DEP_KEYS.includes(dep as never) || tema.length < 8) redirect("/mando/informa?error=ENQ_DATOS_INVALIDOS#misiones");
  const supabase = await createClient();
  const { error } = await supabase.rpc("informa_pedir_mision", { p_departamento: dep, p_tema: tema });
  volver("/mando/informa", error, "mision_pedida");
}

export async function editarInformaAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/informa");
  const ficha: Record<string, string> = {};
  for (const c of [...FICHA_CAMPOS.map((f) => f.key), "tecnica", "documentos"]) {
    const v = String(fd.get(`ficha_${c}`) ?? "").trim();
    if (v) ficha[c] = v.slice(0, 3000);
  }
  // Imagen de la publicación: solo desde la fuente oficial (dominio del Estado o servicio oficial).
  const imagen = String(fd.get("ficha_imagen") ?? "").trim();
  if (imagen && !esDominioOficial(imagen)) redirect(`/mando/informa/${id}?error=ENQ_IMAGEN_NO_OFICIAL`);
  if (imagen) ficha.imagen = imagen.slice(0, 500);
  const p: Record<string, unknown> = {
    titulo: String(fd.get("titulo") ?? "").trim().slice(0, 200),
    resumen: String(fd.get("resumen") ?? "").trim().slice(0, 2000),
    url: String(fd.get("url") ?? "").trim(),
    institucion: String(fd.get("institucion") ?? "").trim().slice(0, 120),
    departamento: String(fd.get("departamento") ?? ""),
    categorias: fd.getAll("categorias").map(String),
    alerta: String(fd.get("alerta") ?? ""),
    tipo_contenido: String(fd.get("tipo_contenido") ?? ""),
    confianza: String(fd.get("confianza") ?? ""),
    vigente_desde: fecha(fd.get("vigente_desde")),
    vigente_hasta: fecha(fd.get("vigente_hasta")),
    publicado: fecha(fd.get("publicado")),
    fecha_consulta: fecha(fd.get("fecha_consulta")),
    ficha,
  };
  const etapa = String(fd.get("etapa") ?? "");
  if (etapa) p.etapa = etapa;
  const motivo = String(fd.get("motivo") ?? "").trim().slice(0, 500);
  if (motivo) p.motivo = motivo;
  const supabase = await createClient();
  const { error } = await supabase.rpc("informa_editar", { p_update: id, p });
  volver(`/mando/informa/${id}`, error, etapa ? `etapa_${etapa}` : "ficha_guardada");
}

export async function revisionProfesionalAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/informa");
  const supabase = await createClient();
  const { error } = await supabase.rpc("informa_revision_profesional", { p_update: id, p_nota: String(fd.get("nota") ?? "").trim().slice(0, 1000) });
  volver(`/mando/informa/${id}`, error, "revision_profesional");
}

// «Sigue vigente»: el equipo volvió a revisar la fuente hoy. Solo actualiza la fecha de revisión (sin cambiar el contenido).
export async function reverificarAction(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  if (!UUID_RE.test(id)) redirect("/mando/informa");
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const supabase = await createClient();
  const { error } = await supabase.rpc("informa_editar", { p_update: id, p: { fecha_consulta: hoy } });
  volver(`/mando/informa/${id}`, error, "reverificada");
}

// Barrido completo: deja en cola una misión por cada área sin misión pendiente. El Director IA las toma de a dos
// por ronda; la ronda diaria y «Ejecutar ronda» encadenan rondas hasta vaciar la cola (hasta unos 4 minutos).
export async function barridoAction() {
  const supabase = await createClient();
  const { data: pendientes } = await supabase.from("info_missions").select("departamento").eq("estado", "planificada");
  const ya = new Set(((pendientes ?? []) as { departamento: string }[]).map((m) => m.departamento));
  let error: { message?: string } | null = null;
  let n = 0;
  for (const dep of DEP_KEYS) {
    if (ya.has(dep)) continue;
    const r = await supabase.rpc("informa_pedir_mision", { p_departamento: dep, p_tema: "Barrido completo: novedades oficiales de los últimos 45 días en esta área" });
    if (r.error) { error = r.error; break; }
    n++;
  }
  volver("/mando/informa", error, `barrido_${n}`);
}
