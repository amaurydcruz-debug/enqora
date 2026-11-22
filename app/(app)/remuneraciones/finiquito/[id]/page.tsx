import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { PrintButton } from "@/components/print-button";
import { TextoDocumento } from "@/components/texto-documento";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Finiquito" };

// Vista e impresión de la propuesta de finiquito. Solo la versión aprobada por el equipo ENQORA se imprime.
export default async function FiniquitoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("rem_finiquitos").select("id, version, estado, contenido, motor, revisado_at, observacion").eq("id", id).maybeSingle();
  const f = data as { id: string; version: number; estado: string; contenido: string; motor: string; revisado_at: string | null; observacion: string | null } | null;
  if (!f) notFound();
  const aprobado = f.estado === "aprobado";
  return (
    <div className="page narrow print-page">
      <div className="print-tools upload-row">
        <Link href="/remuneraciones" className="ps-link">← Remuneraciones</Link>
        {aprobado ? <PrintButton /> : null}
      </div>
      {!aprobado ? (
        <Callout kind="warn" title="Borrador: no usar todavía">
          Esta propuesta aún no está aprobada por el equipo ENQORA (estado: {f.estado.replace("_", " ")}). No la firmes ni la pagues hasta que esté aprobada.
          {f.observacion ? ` Observación: ${f.observacion}` : ""}
        </Callout>
      ) : (
        <Callout kind="info" title="Antes de firmar">
          Completa los espacios en blanco, adjunta los certificados de cotizaciones pagadas y fírmalo ante un ministro de fe o en el portal de la Dirección del Trabajo, dentro de 10 días hábiles desde el término.
        </Callout>
      )}
      <TextoDocumento texto={f.contenido} />
      {aprobado && f.revisado_at ? (
        <p className="muted-line doc-pie">
          Versión {f.version} · revisada y aprobada por el equipo ENQORA el {new Date(f.revisado_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })} · cálculo {f.motor}.
        </p>
      ) : null}
    </div>
  );
}
