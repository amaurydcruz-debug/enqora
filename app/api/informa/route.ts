import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lectura pública de ENQORA Informa para la pestaña flotante: solo lo publicado por el equipo
// (fuente oficial, fecha de consulta, verificación humana). Sin datos de usuarios.
export const revalidate = 300;

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("informa_publicaciones", { p_categoria: null, p_q: null, p_limit: 12 });
  if (error) return NextResponse.json({ publicaciones: [] }, { headers: { "cache-control": "public, max-age=60" } });
  return NextResponse.json({ publicaciones: data ?? [] }, { headers: { "cache-control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
