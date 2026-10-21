import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { markRecovery } from "@/lib/recovery";

// Destino de los enlaces de los correos (confirmación de cuenta y recuperación).
// Usa token_hash para que funcione aunque el enlace se abra en otro dispositivo.
const ALLOWED: EmailOtpType[] = ["email", "signup", "recovery", "email_change"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const fallback = type === "recovery" ? "/restablecer" : "/panel";
  const next = safeNext(params.get("next"), fallback);

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      if (type === "recovery") {
        await markRecovery();
        redirect("/restablecer");
      }
      redirect(next);
    }
  }

  redirect("/ingresar?error=enlace");
}
