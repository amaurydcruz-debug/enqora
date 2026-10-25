import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnqoraMirror } from "@/components/mirror/enqora-mirror";
import { MirrorExplore } from "@/components/mirror/mirror-explore";
import type { MirrorStep } from "@/lib/mirror";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ENQORA MIRROR" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vista inmersiva de la Ventana de Inteligencia de un caso.
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
    <div className="page">
      <div className="page-head page-head-row">
        <div>
          <span className="eyebrow"><span className="mono">{c.folio}</span> · Ventana de Inteligencia</span>
          <h1>{c.title}</h1>
          <p>Una ventana hacia la inteligencia de tu empresa.</p>
        </div>
        <Link href={`/casos/${c.id}`} className="btn btn-ghost btn-inline">Volver a la ficha</Link>
      </div>
      <EnqoraMirror
        steps={steps}
        caseStatus={c.status}
        caseInfo={{ id: c.id, folio: c.folio }}
        documents={documents}
        immersive
      />
      <MirrorExplore caseId={c.id} caseStatus={c.status} steps={steps} documents={documents} pendingAuthorizations={pendingAuth ?? 0} />
    </div>
  );
}
