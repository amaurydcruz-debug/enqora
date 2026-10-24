import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { markRecovery } from "@/lib/recovery";

// Destino de los enlaces de los correos (confirmación de cuenta y recuperación).
// 1) Plantillas de ENQORA: token_hash → funciona aunque el enlace se abra en otro dispositivo.
// 2) Plantillas por defecto de Supabase: code (PKCE) → funciona en el mismo navegador del registro.
const ALLOWED: EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const code = params.get("code");
  const type = params.get("type") as EmailOtpType | null;
  const isRecovery = type === "recovery";
  const next = safeNext(params.get("next"), isRecovery ? "/restablecer" : "/panel");

  const supabase = await createClient();
  let ok = false;

  if (tokenHash && type && ALLOWED.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  }

  if (ok) {
    if (isRecovery) {
      await markRecovery();
      redirect("/restablecer");
    }
    redirect(next);
  }

  redirect("/ingresar?error=enlace");
}
