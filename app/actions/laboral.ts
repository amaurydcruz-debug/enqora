"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dbCode } from "@/lib/db-errors";
import { generarPolitica, PLANTILLA_DATOS_VERSION, validarPolitica } from "@/lib/plantilla-datos";
import { generarDocumento, PLANTILLAS_VERSION, TIPOS_DOC, validarDatos, type TipoDoc } from "@/lib/plantillas-laborales";
import { todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// La empresa genera ambos documentos con los mismos datos y los envía a revisión jurídica.
export async function generarDocumentosLaboralesAction(form: FormData): Promise<void> {
  const company = txt(form, "empresa");
  if (!UUID.test(company)) redirect("/laboral?error=ENQ_DATOS_INVALIDOS");
  const datos = validarDatos(Object.fromEntries(
    ["razon_social", "rut", "domicilio", "representante", "cargo_representante", "rubro", "trabajadores", "atiende_publico", "teletrabajo",
      "canal_correo", "canal_responsable", "investigacion", "organismo"].map((k) => [k, txt(form, k)]),
  ));
  if (typeof datos === "string") redirect(`/laboral?mensaje=${encodeURIComponent(datos)}`);
  const tipos = (form.getAll("tipo").map(String).filter((t) => t in TIPOS_DOC) as TipoDoc[]);
  if (!tipos.length) redirect(`/laboral?mensaje=${encodeURIComponent("Elige al menos un documento.")}`);
  const supabase = await createClient();
  const fecha = todayCL().split("-").reverse().join("-");
  for (const tipo of tipos) {
    const { error } = await supabase.rpc("doc_laboral_generar", {
      p_company: company, p_tipo: tipo, p_plantilla: PLANTILLAS_VERSION, p_datos: datos, p_contenido: generarDocumento(tipo, datos, fecha),
    });
    if (error) redirect(`/laboral?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  }
  revalidatePath("/laboral");
  redirect("/laboral?aviso=enviado");
}

// Revisión jurídica (equipo ENQORA): aprobar, aprobar con texto corregido u observar.
export async function revisarDocumentoLaboralAction(form: FormData): Promise<void> {
  const id = txt(form, "id");
  const decision = txt(form, "decision");
  if (!UUID.test(id) || !["aprobar", "observar"].includes(decision)) redirect("/mando/laboral?error=ENQ_DATOS_INVALIDOS");
  if (decision === "aprobar" && form.get("confirmo") !== "si") redirect("/mando/laboral?error=ENQ_CONFIRMA_REVISION");
  const contenido = String(form.get("contenido") ?? "").replace(/\r\n/g, "\n");
  const { error } = await (await createClient()).rpc("doc_laboral_revisar", {
    p_id: id, p_decision: decision, p_observacion: txt(form, "observacion") || null, p_contenido: decision === "aprobar" ? contenido : null,
  });
  revalidatePath("/mando/laboral");
  redirect(`/mando/laboral?${error ? `error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}` : `aviso=${decision}`}`);
}

// Política de tratamiento de datos personales (0076): mismo flujo de revisión jurídica.
export async function generarPoliticaDatosAction(form: FormData): Promise<void> {
  const company = txt(form, "empresa");
  if (!UUID.test(company)) redirect("/datos-personales?error=ENQ_DATOS_INVALIDOS");
  const datos = validarPolitica({
    ...Object.fromEntries(["razon_social", "rut", "domicilio", "representante", "correo", "sitio", "encargado", "internacional", "automatizadas"].map((k) => [k, txt(form, k)])),
    grupos: form.getAll("grupos").map(String), destinatarios: form.getAll("destinatarios").map(String),
  });
  if (typeof datos === "string") redirect(`/datos-personales?mensaje=${encodeURIComponent(datos)}`);
  const fecha = todayCL().split("-").reverse().join("-");
  const { error } = await (await createClient()).rpc("doc_laboral_generar", {
    p_company: company, p_tipo: "politica_datos", p_plantilla: PLANTILLA_DATOS_VERSION, p_datos: datos, p_contenido: generarPolitica(datos, fecha),
  });
  if (error) redirect(`/datos-personales?error=${dbCode(error) ?? "ENQ_DATOS_INVALIDOS"}`);
  revalidatePath("/datos-personales");
  redirect("/datos-personales?aviso=enviado");
}
