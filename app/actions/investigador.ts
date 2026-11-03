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
