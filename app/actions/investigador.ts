"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { PublicCompany } from "@/app/actions/public";
import { isValidRut, normalizeRut } from "@/lib/rut";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// Centro de Mando · CORA Web Research Agent (piloto). Crea la investigación y la entrega al servidor,
// que la ejecuta en la nube aunque se cierre esta página.
export async function iniciarInvestigacionAction(fd: FormData) {
  const role = await myStaffRole();
  if (!role) redirect("/mando");
  const modo = fd.get("modo") === "entorno" ? "entorno" : "investigacion";
  const rut = normalizeRut(String(fd.get("rut") ?? (modo === "entorno" ? "76086428-5" : "")));
  if (!rut || !isValidRut(rut)) redirect("/mando/investigador?error=rut");
  const supabase = await createClient();

  let razon: string | null = null;
  if (modo === "investigacion") {
    const { data } = await supabase.rpc("lookup_public_company", { p_rut: rut });
    const p = data as PublicCompany | null;
    if (!p || p.estado !== "encontrada" || !p.razon_social) redirect("/mando/investigador?error=no_encontrada");
    razon = p.razon_social;
  }
  const { data: run, error } = await supabase.from("research_runs").insert({ rut, razon_social: razon, modo }).select("id").single();
  if (error || !run) redirect("/mando/investigador?error=registro");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  try {
    await fetch(`${proto}://${host}/api/cora/investigador`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8_000),
      headers: { "content-type": "application/json", cookie: h.get("cookie") ?? "" },
      body: JSON.stringify({ run: run.id }),
    });
  } catch {
    // Si la respuesta tarda, la ejecución sigue en el servidor; el estado se ve en la lista.
  }
  redirect(`/mando/investigador?run=${run.id}`);
}

// Búsqueda asistida: cuando un portal pide resolver un CAPTCHA, una persona del equipo hace la búsqueda en el
// portal oficial y registra el resultado con su captura. Queda como evidencia con fecha, fuente y responsable.
export async function registrarBusquedaAsistidaAction(fd: FormData) {
  const role = await myStaffRole();
  if (!role) redirect("/mando");
  const run = String(fd.get("run") ?? "");
  const portal = String(fd.get("portal") ?? "");
  const estado = fd.get("estado") === "encontrado" ? "encontrado" : "sin_resultados";
  const texto = String(fd.get("resultado") ?? "").trim().slice(0, 3000);
  const archivo = fd.get("captura");
  if (!/^[0-9a-f-]{36}$/.test(run) || !/^[a-z_]{2,30}$/.test(portal)) redirect("/mando/investigador?error=asistida");
  if (!(archivo instanceof File) || !archivo.size || archivo.size > 5 * 1024 * 1024 || !["image/png", "image/jpeg"].includes(archivo.type)) {
    redirect(`/mando/investigador?run=${run}&error=captura`);
  }
  if (estado === "encontrado" && !texto) redirect(`/mando/investigador?run=${run}&error=resultado`);
  const supabase = await createClient();
  const { data: original } = await supabase.from("research_evidence").select("query, url").eq("run_id", run).eq("portal", portal)
    .order("consulted_at", { ascending: false }).limit(1).maybeSingle();
  if (!original) redirect(`/mando/investigador?run=${run}&error=asistida`);
  const path = `${run}/${portal}-asistida-${Date.now()}.${archivo.type === "image/png" ? "png" : "jpg"}`;
  const { error: upErr } = await supabase.storage.from("cora-evidencias").upload(path, archivo, { contentType: archivo.type, upsert: false });
  if (upErr) redirect(`/mando/investigador?run=${run}&error=captura`);
  const lineas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 30);
  await supabase.from("research_evidence").insert({
    run_id: run, portal, procedure_version: "asistida-humana", query: original.query, url: original.url, status: estado,
    result: { tablas: lineas.length ? [{ headers: ["Resultado registrado por el equipo"], rows: lineas.map((l) => [l]) }] : [], coincidencias_exactas: estado === "encontrado" ? lineas.length : 0 },
    screenshot_path: path, duration_ms: 0,
    detail: `Búsqueda asistida por el equipo ENQORA (${role}). ${estado === "encontrado" ? `${lineas.length} resultado(s) registrado(s).` : "Sin resultados para la consulta."}`,
  });
  redirect(`/mando/investigador?run=${run}`);
}

// Centro de Mando: avanza la carga de los datos abiertos del Registro de Empresas y Sociedades.
export async function sincronizarRegistroAction() {
  if ((await myStaffRole()) !== "enqora_admin") redirect("/mando");
  const secret = process.env.CRON_SECRET;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  let msg = "";
  if (!secret || !process.env.ENQORA_SERVICE_TOKEN) msg = "Falta CRON_SECRET o ENQORA_SERVICE_TOKEN en Vercel.";
  else {
    try {
      const res = await fetch(`${proto}://${host}/api/cron/registro`, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(55_000) });
      const d = (await res.json().catch(() => null)) as { estado?: string; detalle?: string; filas?: number } | null;
      msg = d?.estado === "error" ? d.detalle ?? "Error" : d?.estado === "al_dia" ? "Todos los archivos están cargados." : `${d?.filas?.toLocaleString("es-CL") ?? 0} filas en este tramo; la carga sigue sola.`;
    } catch (e) {
      msg = e instanceof Error && e.name === "TimeoutError" ? "La carga sigue en segundo plano." : "No se pudo iniciar la carga.";
    }
  }
  redirect(`/mando/investigador?registro=${encodeURIComponent(msg.slice(0, 300))}`);
}
