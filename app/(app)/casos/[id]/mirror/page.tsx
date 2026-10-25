import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MirrorStage } from "@/components/mirror/mirror-stage";
import { MirrorExplore } from "@/components/mirror/mirror-explore";
import { statusLabel, statusTone } from "@/lib/cases";
import type { MirrorStep } from "@/lib/mirror";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ENQORA MIRROR" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Pantalla completa de ENQORA MIRROR: el núcleo más grande y las preguntas del análisis.
export default async function MirrorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: caseRow } = await supabase.from("cases").select("id, folio, title, status").eq("id", id).maybeSingle();
  if (!caseRow) notFound();
  const c = caseRow as { id: string; folio: string; title: string; status: string };

  const [{ data }, { data: docs }, { count: pendingAuth }] = await Promise.all([
    supabase
      .from("case_analysis_steps")
      .select("id, agent, stage, title, detail, status, progress, visibility, created_at, updated_at")
      .eq("case_id", id)
      .order("created_at"),
    supabase.from("case_documents").select("id, file_name").eq("case_id", id).eq("visibility", "cliente"),
    supabase.from("client_authorizations").select("id", { count: "exact", head: true }).eq("case_id", id).eq("status", "pendiente"),
  ]);
  const documents = (docs ?? []) as { id: string; file_name: string }[];
  const steps = (data ?? []) as MirrorStep[];

  return (
    <div className="page ws-page">
      <section className="ws ws-immersive" aria-label={`ENQORA MIRROR · ${c.folio}`}>
        <header className="ws-head">
          <Link href={`/casos/${c.id}`} className="ws-back" aria-label="Volver a la ficha del caso"><span aria-hidden="true">←</span></Link>
          <div className="ws-title">
            <span className="ws-wordmark">ENQORA <em>MIRROR</em> <span className="mono">{c.folio}</span></span>
            <h1>{c.title}</h1>
          </div>
          <span className={`status status-${statusTone(c.status)} ws-status`}>{statusLabel(c.status)}</span>
        </header>
        <MirrorStage steps={steps} caseStatus={c.status} pendingAuthorizations={pendingAuth ?? 0} />
        <div className="ws-panel">
          <MirrorExplore caseId={c.id} caseStatus={c.status} steps={steps} documents={documents} pendingAuthorizations={pendingAuth ?? 0} />
        </div>
      </section>
    </div>
  );
}
