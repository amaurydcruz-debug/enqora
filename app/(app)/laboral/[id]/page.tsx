import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { PrintButton } from "@/components/print-button";
import { TextoDocumento } from "@/components/texto-documento";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documento laboral" };

// Vista e impresión de un documento laboral. Solo una versión aprobada por el equipo legal se imprime como definitiva.
export default async function DocumentoLaboralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_laborales").select("id, tipo, version, estado, contenido, plantilla, revisado_at").eq("id", id).maybeSingle();
  const d = data as { id: string; version: number; estado: string; contenido: string; plantilla: string; revisado_at: string | null } | null;
  if (!d) notFound();
  const aprobado = d.estado === "aprobado";
  return (
    <div className="page narrow print-page">
      <div className="print-tools upload-row">
        <Link href="/laboral" className="ps-link">← Ley Karin</Link>
        {aprobado ? <PrintButton /> : null}
      </div>
      {!aprobado ? (
        <Callout kind="warn" title="Borrador: no usar todavía">
          Este texto aún no está aprobado por el equipo legal de ENQORA (estado: {d.estado.replace("_", " ")}). No lo firmes ni lo difundas hasta que esté aprobado.
        </Callout>
      ) : null}
      <TextoDocumento texto={d.contenido} />
      {aprobado && d.revisado_at ? (
        <p className="muted-line doc-pie">
          Versión {d.version} · revisada y aprobada por el equipo legal de ENQORA el {new Date(d.revisado_at).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })} · plantilla {d.plantilla}.
        </p>
      ) : null}
    </div>
  );
}
