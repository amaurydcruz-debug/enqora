import Link from "next/link";
import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";

export const metadata: Metadata = { title: "Página no encontrada", robots: { index: false, follow: false } };

// 404 de toda la aplicación (también cuando no tienes acceso a un caso o empresa: no se revela si existe).
export default function NotFound() {
  return (
    <AuthCard title="No encontramos esta página" subtitle="La dirección no existe o no tienes acceso a ella.">
      <div className="error-actions">
        <Link href="/panel" className="btn btn-gold">Ir al Centro de control</Link>
        <Link href="/" className="btn btn-ghost">Ir al inicio</Link>
      </div>
    </AuthCard>
  );
}
