import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { RetryButton } from "@/components/pwa";

export const metadata: Metadata = { title: "Sin conexión", robots: { index: false, follow: false } };
export const dynamic = "force-static";

// Página que el service worker muestra cuando no hay internet. No contiene datos: ENQORA no muestra
// información de empresas guardada como si fuera actual.
export default function Offline() {
  return (
    <AuthCard title="Sin conexión" subtitle="ENQORA necesita internet para mostrarte información actualizada y proteger tus datos.">
      <p className="auth-sub">Revisa tu conexión y vuelve a intentarlo. Nada de lo que estabas haciendo se envió sin conexión.</p>
      <div className="error-actions">
        <RetryButton />
      </div>
    </AuthCard>
  );
}
