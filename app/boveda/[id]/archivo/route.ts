import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Descarga de un archivo registrado en la Bóveda: queda en la bitácora y entrega un enlace firmado de 60 segundos.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ ok: false }, { status: 404 });
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("vault_registrar_descarga", { p_doc: id });
  if (error || !path) return NextResponse.json({ ok: false }, { status: 404 });
  const { data } = await supabase.storage.from("expedientes").createSignedUrl(String(path), 60);
  if (!data?.signedUrl) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
