"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// Hoja de vida (M18): subida de la Carpeta Tributaria Electrónica, revisión del equipo y
// sincronización manual del conector de datos públicos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 20 * 1024 * 1024;

export async function prepareTaxUploadAction(
  companyId: string,
  fileName: string,
  size: number,
  mime: string,
): Promise<{ error?: string; path?: string; token?: string }> {
  if (!UUID_RE.test(companyId)) return { error: "Empresa no válida." };
  if (!size || size > MAX_BYTES) return { error: "El archivo supera el máximo de 20 MB." };
  if (mime !== "application/pdf" && !/\.pdf$/i.test(fileName)) return { error: "Sube la carpeta tributaria en PDF, tal como la entrega el SII." };
  const safe =
    fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").replace(/\.pdf$/i, "").slice(-60) ||
    "carpeta-tributaria";
  const path = `${companyId}/${randomUUID()}-${safe}.pdf`;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("carpetas").createSignedUploadUrl(path);
  if (error || !data) return { error: "No tienes permiso para subir la carpeta de esta empresa (propietario o administrador)." };
  return { path, token: data.token };
}

export async function registerTaxRecordAction(companyId: string, path: string, fileName: string): Promise<{ error?: string; id?: string }> {
  if (!UUID_RE.test(companyId)) return { error: "Empresa no válida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_tax_record", { p_company: companyId, p_path: path, p_name: fileName.slice(0, 200) });
  if (error) return { error: dbMessage(error) };
  revalidatePath(`/empresas/${companyId}/hoja-de-vida`);
  return { id: data as string };
}

export async function reviewTaxRecordAction(fd: FormData) {
  const record = String(fd.get("record_id") ?? "");
  const company = String(fd.get("company_id") ?? "");
  if (!UUID_RE.test(record) || !UUID_RE.test(company)) redirect("/empresas");
  const supabase = await createClient();
  const { error } = await supabase.rpc("review_tax_record", { p_record: record, p_note: String(fd.get("note") ?? "").trim().slice(0, 1000) });
  revalidatePath(`/empresas/${company}/hoja-de-vida`);
  redirect(`/empresas/${company}/hoja-de-vida?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=revisada"}#analisis`);
}

// Centro de Mando → Datos públicos: ejecuta un tramo del conector y muestra su resultado
// (si queda trabajo, el conector sigue solo por tramos hasta completar la carga).
export async function syncPublicDataAction() {
  if ((await myStaffRole()) !== "enqora_admin") redirect("/mando");
  const secret = process.env.CRON_SECRET;
  if (!secret || !process.env.ENQORA_SERVICE_TOKEN) redirect("/mando/datos-publicos?error=sin_configurar");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  let estado = "error";
  let detalle = "";
  if (!host) detalle = "No se pudo determinar la dirección del sitio.";
  else {
    try {
      const res = await fetch(`${proto}://${host}/api/cron/nomina?origen=manual`, {
        headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(55_000),
      });
      const data = (await res.json().catch(() => null)) as { estado?: string; detalle?: string; filas?: number } | null;
      if (data?.estado) {
        estado = data.estado;
        detalle = data.detalle ?? (data.filas ? `${data.filas.toLocaleString("es-CL")} filas cargadas en este tramo.` : "");
      } else {
        detalle = res.status === 401
          ? "El servidor rechazó la ejecución: revisa CRON_SECRET en Vercel y vuelve a desplegar."
          : `El conector respondió ${res.status}. Si la protección de despliegues de Vercel está activa en producción, desactívala para /api/cron.`;
      }
    } catch (e) {
      // Si el tramo sigue trabajando más de 55 s, continúa en segundo plano.
      estado = e instanceof Error && e.name === "TimeoutError" ? "continua" : "error";
      detalle = estado === "continua" ? "La carga sigue en segundo plano." : e instanceof Error ? e.message : "Error";
    }
  }
  revalidatePath("/mando/datos-publicos");
  redirect(`/mando/datos-publicos?resultado=${encodeURIComponent(estado)}&detalle=${encodeURIComponent(detalle.slice(0, 400))}`);
}
