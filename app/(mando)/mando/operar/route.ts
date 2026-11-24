import { NextResponse, type NextRequest } from "next/server";
import { booksCompany } from "@/lib/accounting-server";
import { DESTINOS_OPERAR, OPERANDO_COOKIE } from "@/lib/operando";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

// Centro de Mando → operar una empresa: el equipo ENQORA presta el servicio de remuneraciones y laboral desde las
// mismas herramientas. Fija la empresa por 10 horas (la jornada del pase) o la suelta con ?salir=1.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const rol = await myStaffRole();
  if (!rol || rol === "ai_agent") return NextResponse.redirect(new URL("/panel", url));
  if (url.searchParams.get("salir")) {
    const r = NextResponse.redirect(new URL("/mando/remuneraciones", url));
    r.cookies.delete(OPERANDO_COOKIE);
    return r;
  }
  const empresa = url.searchParams.get("empresa") ?? "";
  const destino = url.searchParams.get("destino") ?? "/remuneraciones";
  // Además de los destinos de servicio, el cierre contable de un mes (lo usa la sala de pruebas, 0095).
  const ok = (DESTINOS_OPERAR as readonly string[]).includes(destino) || /^\/contabilidad(\/\d{4}-(0[1-9]|1[0-2]))?$/.test(destino) ? destino : "/remuneraciones";
  if (!/^[0-9a-f-]{36}$/i.test(empresa) || !(await booksCompany(empresa))) return NextResponse.redirect(new URL("/mando/remuneraciones?error=ENQ_SIN_PERMISO", url));
  const supabase = await createClient();
  await supabase.rpc("log_operacion_empresa", { p_company: empresa }).then(() => undefined, () => undefined);
  const r = NextResponse.redirect(new URL(ok, url));
  r.cookies.set(OPERANDO_COOKIE, empresa, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 3600 });
  return r;
}
