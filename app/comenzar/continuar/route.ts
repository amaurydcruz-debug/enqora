import { NextResponse, type NextRequest } from "next/server";
import { categoryByKey, INTENT_COOKIE, SOLICITUD_COOKIE } from "@/lib/discovery";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Consume lo guardado en la puerta de entrada y lo borra para que no se repita:
// 1) la solicitud enviada a CORA desde este navegador se une a la cuenta (0056);
// 2) la elección de servicio lleva al onboarding y diagnóstico gratuito con ese servicio.
// Con ?solo=solicitud (cuenta aún sin empresa) solo se une la solicitud y se conserva la elección.
export async function GET(request: NextRequest) {
  const soloSolicitud = request.nextUrl.searchParams.get("solo") === "solicitud";
  const solId = request.cookies.get(SOLICITUD_COOKIE)?.value;
  // Si la función aún no existe (0056 sin pegar), la cookie se conserva para intentarlo después.
  let borrarSolicitud = !!solId && !UUID.test(solId);
  if (solId && UUID.test(solId)) {
    const supabase = await createClient();
    const { error } = await supabase.rpc("vincular_solicitud_navegador", { p_id: solId });
    borrarSolicitud = !error;
  }
  const category = soloSolicitud ? null : categoryByKey(request.cookies.get(INTENT_COOKIE)?.value);
  const dest = request.nextUrl.clone();
  dest.search = "";
  dest.pathname = category ? "/diagnostico" : "/panel";
  if (category) dest.searchParams.set("servicio", category.key);
  const res = NextResponse.redirect(dest);
  if (borrarSolicitud) res.cookies.delete(SOLICITUD_COOKIE);
  if (!soloSolicitud) res.cookies.delete(INTENT_COOKIE);
  return res;
}
