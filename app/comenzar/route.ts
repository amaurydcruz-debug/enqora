import { NextResponse, type NextRequest } from "next/server";
import { categoryByKey, INTENT_COOKIE } from "@/lib/discovery";
import { createClient } from "@/lib/supabase/server";

// Puerta de entrada → servicio elegido. Guarda la elección para que el cliente no tenga que
// volver a buscarla después de crear su cuenta, verificar su correo y activar el segundo factor.
export async function GET(request: NextRequest) {
  const category = categoryByKey(request.nextUrl.searchParams.get("servicio"));
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const dest = request.nextUrl.clone();
  dest.search = "";
  if (user) {
    // Ya tiene cuenta: directo a la solicitud con el servicio elegido.
    dest.pathname = "/casos/nuevo";
    if (category) dest.searchParams.set("modulo", category.module);
    return NextResponse.redirect(dest);
  }

  dest.pathname = "/registro";
  if (category) dest.searchParams.set("servicio", category.key);
  const res = NextResponse.redirect(dest);
  if (category) {
    res.cookies.set(INTENT_COOKIE, category.key, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  return res;
}
