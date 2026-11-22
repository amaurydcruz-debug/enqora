import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { PrintButton } from "@/components/print-button";
import { TextoDocumento } from "@/components/texto-documento";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contrato de trabajo" };

// Vista e impresión del contrato o anexo. Solo lo aprobado por un abogado de ENQORA se imprime.
export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await (await createClient()).from("rem_contratos")
    .select("id, trabajador_id, tipo, version, numero_anexo, estado, contenido, plantilla, avisos, observacion, revisado_at").eq("id", id).maybeSingle();
  const c = data as { id: string; trabajador_id: string; tipo: string; version: number; numero_anexo: number | null; estado: string; contenido: string;
    plantilla: string; avisos: string[]; observacion: string | null; revisado_at: string | null } | null;
  if (!c) notFound();
  const aprobado = c.estado === "aprobado";
  return (
    <div className="page narrow print-page">
      <div className="print-tools upload-row">
        <Link href={`/remuneraciones#t-${c.trabajador_id}`} className="ps-link">← Remuneraciones</Link>
        {aprobado ? <PrintButton /> : null}
      </div>
      {!aprobado ? (
        <Callout kind="warn" title="Borrador: no firmar todavía">
          Este documento aún no está aprobado por un abogado de ENQORA (estado: {c.estado.replace("_", " ")}).{c.observacion ? ` Observación: ${c.observacion}` : ""}
          {c.avisos?.length ? ` Avisos: ${c.avisos.join(" ")}` : ""}
        </Callout>
      ) : (
        <Callout kind="info" title="Antes de firmar">
          Imprime dos ejemplares, uno para cada parte. {c.tipo === "contrato" ? "Regístralo en el portal de la Dirección del Trabajo y entrega al trabajador una copia del reglamento interno (si corresponde) y del protocolo de la Ley Karin." : c.tipo === "anexo" ? "Actualiza la ficha del trabajador si el anexo cambia su sueldo, jornada o cargo." : "Las horas extra trabajadas deben quedar en el registro de asistencia. Para seguir después del plazo, prepara un pacto nuevo."}
        </Callout>
      )}
      <TextoDocumento texto={c.contenido} />
      {aprobado && c.revisado_at ? (
        <p className="muted-line doc-pie">
          {c.tipo === "contrato" ? "Contrato" : c.tipo === "anexo" ? `Anexo N° ${c.numero_anexo}` : "Pacto de horas extraordinarias"} · versión {c.version} · revisado y aprobado por un abogado de ENQORA el {new Date(c.revisado_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })} · plantilla {c.plantilla}.
        </p>
      ) : null}
    </div>
  );
}
