"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { llamarHerramienta } from "@/lib/ai/gateway";
import { dbCode, dbMessage } from "@/lib/db-errors";
import { gastoDesdeTexto, HERRAMIENTA_GASTO, SISTEMA_GASTO, validarGasto, type Gasto } from "@/lib/gastos";
import { todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FOTO_MAX = 6 * 1024 * 1024;
const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
type TipoFoto = (typeof TIPOS_FOTO)[number];

// 1) Foto: el servidor firma la subida a gas/<empresa>/… (el almacenamiento solo la acepta si la persona lleva la contabilidad).
export async function prepararFotoGastoAction(companyId: string, mime: string, size: number): Promise<{ error?: string; path?: string; token?: string }> {
  if (!UUID.test(companyId)) return { error: "Empresa no válida." };
  if (!TIPOS_FOTO.includes(mime as TipoFoto)) return { error: "Usa una foto (JPG o PNG) o un PDF." };
  if (!size || size > FOTO_MAX) return { error: "La foto supera 6 MB." };
  const supabase = await createClient();
  const path = `gas/${companyId}/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`;
  const { data, error } = await supabase.storage.from("expedientes").createSignedUploadUrl(path);
  if (error || !data) return { error: "No pudimos preparar la subida. Confirma tu segundo factor e intenta nuevamente." };
  return { path, token: data.token };
}

// 2) La IA lee la foto y PROPONE los datos; el cliente los revisa antes de guardar.
export async function leerFotoGastoAction(companyId: string, path: string, mime: string): Promise<{ gasto?: Gasto; error?: string; lectura?: unknown }> {
  if (!UUID.test(companyId) || !path.startsWith(`gas/${companyId}/`) || !TIPOS_FOTO.includes(mime as TipoFoto)) return { error: "Foto no válida." };
  const supabase = await createClient();
  const { data: blob, error } = await supabase.storage.from("expedientes").download(path);
  if (error || !blob) return { error: "No pudimos leer la foto." };
  const hoy = todayCL();
  const ia = await llamarHerramienta({
    system: SISTEMA_GASTO, prompt: `Fecha de referencia (hoy en Chile): ${hoy}. Transcribe el gasto de este comprobante.`,
    tool: HERRAMIENTA_GASTO, datos: "privados", modulo: "gastos", maxTokens: 800, timeoutMs: 40_000,
    adjuntos: [{ media_type: mime as TipoFoto, base64: Buffer.from(await blob.arrayBuffer()).toString("base64") }],
    validar: (x) => !!validarGasto(x, hoy) || (x as { es_comprobante?: boolean })?.es_comprobante === false,
  });
  if ((ia.input as { es_comprobante?: boolean } | null)?.es_comprobante === false) return { error: "La foto no parece un comprobante de compra. Prueba de nuevo o escribe el gasto." };
  const gasto = ia.input ? validarGasto(ia.input, hoy) : null;
  if (!gasto) return { error: "No pudimos leer la foto automáticamente. Completa los datos a mano: la foto igual queda guardada." };
  return { gasto, lectura: ia.input };
}

// 3) Dictado o texto: la IA lo ordena; si no está disponible, una lectura simple por reglas.
export async function leerTextoGastoAction(texto: string): Promise<{ gasto?: Gasto; error?: string; lectura?: unknown }> {
  const t = String(texto ?? "").trim().slice(0, 500);
  if (t.length < 3) return { error: "Cuéntanos el gasto: cuánto, en qué y si tienes boleta o factura." };
  const hoy = todayCL();
  const ia = await llamarHerramienta({
    system: SISTEMA_GASTO, prompt: `Fecha de referencia (hoy en Chile): ${hoy}.\nLo que dijo la persona:\n"""${t}"""`,
    tool: HERRAMIENTA_GASTO, datos: "privados", modulo: "gastos", maxTokens: 600, timeoutMs: 25_000, validar: (x) => !!validarGasto(x, hoy),
  });
  const gasto = (ia.input ? validarGasto(ia.input, hoy) : null) ?? gastoDesdeTexto(t, hoy);
  if (!gasto) return { error: "No entendimos el monto. Dilo así: «gasté 15.990 en bencina, con boleta»." };
  return { gasto, lectura: ia.input ?? { reglas: t } };
}

// 4) Guardar (el cliente ya revisó). Devuelve error legible o nada.
export async function guardarGastoAction(companyId: string, datos: {
  fecha: string; monto: number; iva: number | null; descripcion: string; categoria: string; documento: string; proveedor: string | null;
  folio: string | null; uso: string; origen: "foto" | "voz" | "texto"; storage_path: string | null; lectura: unknown;
}): Promise<{ error?: string }> {
  if (!UUID.test(companyId)) return { error: "Empresa no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_gasto", { p_company: companyId, p: datos });
  if (error) return { error: dbMessage(error) };
  revalidatePath("/gastos");
  return {};
}

const volver = (q: string) => redirect(`/gastos?${q}`);

export async function gastoUsoAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const uso = String(form.get("uso") ?? "");
  if (!UUID.test(id)) volver("error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("gasto_uso", { p_id: id, p_uso: uso });
  revalidatePath("/gastos");
  volver(error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=uso");
}

export async function gastoDescartarAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const motivo = String(form.get("motivo") ?? "").trim();
  if (!UUID.test(id)) volver("error=ENQ_DATOS_INVALIDOS");
  const { error } = await (await createClient()).rpc("gasto_descartar", { p_id: id, p_motivo: motivo });
  revalidatePath("/gastos");
  volver(error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : "aviso=descartado");
}

export async function gastoRevisarAction(form: FormData): Promise<void> {
  const id = String(form.get("id") ?? "");
  const empresa = String(form.get("empresa") ?? "");
  const periodo = String(form.get("periodo") ?? "");
  if (!UUID.test(id)) redirect("/contabilidad");
  const { error } = await (await createClient()).rpc("gasto_revisar", { p_id: id, p_nota: String(form.get("nota") ?? "") || null });
  revalidatePath(`/contabilidad/${periodo}`);
  redirect(`/contabilidad/${/^\d{4}-\d{2}$/.test(periodo) ? periodo : ""}?empresa=${UUID.test(empresa) ? empresa : ""}${error ? `&error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : ""}#gastos`);
}
