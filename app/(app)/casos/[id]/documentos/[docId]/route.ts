import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descarga segura: valida el acceso (RLS) y redirige a un enlace firmado que vence en 60 segundos.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  const back = new URL(`/casos/${UUID_RE.test(id) ? id : ""}`, request.url);
  if (!UUID_RE.test(id) || !UUID_RE.test(docId)) return NextResponse.redirect(back);

  const supabase = await createClient();
  const { data } = await supabase
    .from("case_documents")
    .select("storage_path, file_name")
    .eq("id", docId)
    .eq("case_id", id)
    .maybeSingle();
  const doc = data as { storage_path: string; file_name: string } | null;
  if (!doc) return NextResponse.redirect(back);

  const { data: signed, error } = await supabase.storage
    .from("expedientes")
    .createSignedUrl(doc.storage_path, 60, { download: doc.file_name });
  if (error || !signed?.signedUrl) return NextResponse.redirect(back);

  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
