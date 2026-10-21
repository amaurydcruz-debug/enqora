import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/server";
import { hasRecovery } from "@/lib/recovery";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default async function ResetPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasRecovery())) redirect("/ingresar?error=enlace");

  return (
    <AuthCard
      title="Crea una nueva contraseña"
      subtitle="Al guardarla cerraremos las demás sesiones abiertas de tu cuenta."
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
