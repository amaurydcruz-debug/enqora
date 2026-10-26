import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Abre una notificación: la marca como leída y lleva a su destino (solo rutas internas).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dest = request.nextUrl.clone();
  dest.search = "";
  dest.hash = "";
  dest.pathname = "/notificaciones";
  if (!/^\d{1,18}$/.test(id)) return NextResponse.redirect(dest);
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("link").eq("id", id).maybeSingle();
  await supabase.rpc("mark_notifications_read", { p_ids: [Number(id)] });
  const link = (data as { link: string | null } | null)?.link;
  if (link && /^\/[A-Za-z0-9/_#?=&.-]*$/.test(link) && !link.startsWith("//")) {
    const [path, hash] = link.split("#");
    const [pathname, query] = path.split("?");
    dest.pathname = pathname;
    dest.search = query ? `?${query}` : "";
    dest.hash = hash ?? "";
  }
  return NextResponse.redirect(dest);
}
