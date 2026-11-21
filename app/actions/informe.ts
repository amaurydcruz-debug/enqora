"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { generarInformeIngreso } from "@/lib/informe-ingreso";
import { esLinea, type Linea } from "@/lib/lineas";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODULO_DE_LINEA: Record<Linea, string> = {
  CON: "contabilidad", TRI: "contabilidad", CRE: "create", FOR: "formaliza", BRA: "brand", LEG: "legal", LAB: "legal",
  GES: "gestion", CRC: "crece", IDE: "idea", GEN: "general",
};
const volver = (q: string, id?: string) => redirect(`/mando/solicitudes?${q}${id ? `#sol-${id}` : ""}`);

// Equipo: vuelve a ejecutar el enjambre sobre la solicitud (queda como versión nueva; la anterior se conserva).
export async function regenerarInformeAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const rol = await myStaffRole();
  if (!UUID.test(id) || !rol || rol === "ai_agent") volver("error=ENQ_SIN_PERMISO");
  const r = await generarInformeIngreso(id, null);
  revalidatePath("/mando/solicitudes");
  volver(r.ok ? "aviso=informe" : "error=ENQ_INFORME", id);
}

// Equipo: corrige el informe. La corrección queda como versión nueva y enseña al enjambre de esa línea.
export async function corregirInformeAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const correccion = String(form.get("correccion") ?? "").trim().slice(0, 2000);
  if (!UUID.test(id) || correccion.length < 10) volver("error=ENQ_CORRECCION_CORTA", UUID.test(id) ? id : undefined);
  const cambios: Record<string, unknown> = {};
  const mensaje = String(form.get("mensaje_cliente") ?? "").trim();
  if (mensaje) cambios.mensaje_cliente = mensaje.slice(0, 2500);
  const ruta = String(form.get("ruta") ?? "").split("\n").map((l) => l.replace(/^\s*[-•\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, 10);
  if (ruta.length) cambios.ruta = ruta.map((texto) => ({ texto: texto.slice(0, 500), fuente: "profesional", certeza: "alta" }));
  const supabase = await createClient();
  const { error } = await supabase.rpc("solicitud_corregir_informe", { p_sol: id, p_informe: cambios, p_correccion: correccion });
  revalidatePath("/mando/solicitudes");
  volver(error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=corregido", id);
}

// Supervisión: crea el caso con la línea del informe y une la solicitud (sus documentos pasan al expediente).
export async function crearCasoDesdeSolicitudAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const company = String(form.get("company_id") ?? "");
  const lineaRaw = String(form.get("linea") ?? "GEN").toUpperCase();
  const titulo = String(form.get("titulo") ?? "").trim().slice(0, 160);
  const descripcion = String(form.get("descripcion") ?? "").trim().slice(0, 4000);
  if (!isSupervisorRole(await myStaffRole())) volver("error=ENQ_SIN_PERMISO", id);
  if (!UUID.test(id) || !UUID.test(company) || titulo.length < 3) volver("error=ENQ_DATOS_INVALIDOS", UUID.test(id) ? id : undefined);
  const linea: Linea = esLinea(lineaRaw) ? (lineaRaw as Linea) : "GEN";
  const supabase = await createClient();
  const { data: caseId, error } = await supabase.rpc("create_case", {
    p_company: company, p_module: MODULO_DE_LINEA[linea], p_title: titulo, p_description: descripcion || null, p_linea: linea,
  });
  if (error || typeof caseId !== "string") volver(`error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`, id);
  const { data: c } = await supabase.from("cases").select("folio").eq("id", caseId as string).maybeSingle();
  const folio = (c as { folio: string } | null)?.folio ?? "";
  const { error: e2 } = await supabase.rpc("staff_vincular_solicitud", { p_id: id, p_folio: folio });
  if (e2) console.error("[ENQORA Informe] vincular:", e2.message);
  revalidatePath("/mando/solicitudes");
  redirect(`/casos/${caseId as string}?aviso=creado`);
}
