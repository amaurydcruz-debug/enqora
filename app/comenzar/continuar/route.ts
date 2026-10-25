import { NextResponse, type NextRequest } from "next/server";
import { categoryByKey, INTENT_COOKIE } from "@/lib/discovery";

// Consume la elección guardada en la puerta de entrada: lleva a la solicitud del servicio
// elegido y borra la elección para que no se repita.
export async function GET(request: NextRequest) {
  const category = categoryByKey(request.cookies.get(INTENT_COOKIE)?.value);
  const dest = request.nextUrl.clone();
  dest.search = "";
  dest.pathname = category ? "/casos/nuevo" : "/panel";
  if (category) dest.searchParams.set("modulo", category.module);
  const res = NextResponse.redirect(dest);
  res.cookies.delete(INTENT_COOKIE);
  return res;
}
