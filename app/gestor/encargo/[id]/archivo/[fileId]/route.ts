import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Descarga del gestor: la base comprueba que el encargo es suyo, está en curso y CORA autorizó la descarga;
// registra la descarga y el enlace firmado vence en 60 segundos.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const { id, fileId } = await params;
  const back = new URL(`/gestor/encargo/${UUID_RE.test(id) ? id : ""}`, request.url);
  if (!UUID_RE.test(id) || !UUID_RE.test(fileId)) return NextResponse.redirect(back);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("field_task_file_get", { p_file: fileId });
  const f = data as { path: string; nombre: string } | null;
  if (error || !f?.path) {
    back.searchParams.set("error", "ENQ_DESCARGA_NO_AUTORIZADA");
    return NextResponse.redirect(back);
  }
  const { data: signed, error: e2 } = await supabase.storage.from("expedientes").createSignedUrl(f.path, 60, { download: f.nombre });
  if (e2 || !signed?.signedUrl) return NextResponse.redirect(back);
  return NextResponse.redirect(signed.signedUrl, { headers: { "Cache-Control": "no-store" } });
}
