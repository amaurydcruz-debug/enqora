import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Centro de control" };

const AVISOS: Record<string, string> = {
  mfa: "Segundo factor activado. Tu cuenta quedó protegida con verificación en dos pasos.",
  clave: "Contraseña actualizada. Cerramos las demás sesiones abiertas de tu cuenta.",
};

export default async function PanelPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>;
}) {
  const { aviso } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="stack">
      <div className="page-head">
        <span className="eyebrow">Centro de control</span>
        <h1>Bienvenido a ENQORA</h1>
        <p>{user?.email}</p>
      </div>

      {aviso && AVISOS[aviso] ? <Notice kind="ok">{AVISOS[aviso]}</Notice> : null}

      <div className="grid">
        <section className="card">
          <h2>Estado de tu cuenta</h2>
          <div className="row"><span>Correo verificado</span><span className="badge badge-ok">Verificado</span></div>
          <div className="row"><span>Verificación en dos pasos</span><span className="badge badge-ok">Activa</span></div>
          <div className="row"><span>Sesión actual</span><span className="badge badge-ok">Protegida</span></div>
          <p style={{ marginTop: 12 }}><Link href="/seguridad">Administrar seguridad →</Link></p>
        </section>

        <section className="card">
          <h2>Tus empresas</h2>
          <p>Próximamente podrás registrar tu empresa y autorizar las fuentes de información de forma segura.</p>
          <span className="badge badge-muted">Etapa 2</span>
        </section>

        <section className="card">
          <h2>Inteligencia ENQORA</h2>
          <p>Tu asistente contable y el Centro de Resolución se activarán cuando tu empresa esté conectada.</p>
          <span className="badge badge-muted">Próximamente</span>
        </section>
      </div>
    </div>
  );
}
