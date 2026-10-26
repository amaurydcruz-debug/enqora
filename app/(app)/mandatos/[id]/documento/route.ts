import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Abre el mandato firmado con un enlace temporal (60 s). El acceso lo decide la base de datos.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("No encontrado", { status: 404 });
  const supabase = await createClient();
  const { data } = await supabase.from("mandates").select("document_path").eq("id", id).maybeSingle();
  const path = (data as { document_path: string | null } | null)?.document_path;
  if (!path) return new NextResponse("No encontrado", { status: 404 });
  const { data: signed, error } = await supabase.storage.from("mandatos").createSignedUrl(path, 60);
  if (error || !signed?.signedUrl) return new NextResponse("No encontrado", { status: 404 });
  return NextResponse.redirect(signed.signedUrl, { headers: { "cache-control": "no-store" } } as ResponseInit);
}
