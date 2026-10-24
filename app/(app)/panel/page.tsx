import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { activeCompany } from "@/lib/companies";
import { REGIMES, ROLES } from "@/lib/company-constants";
import { formatRut } from "@/lib/rut";
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
  const { companies, active } = await activeCompany();

  return (
    <div className="stack">
      <div className="page-head">
        <span className="eyebrow">Centro de control</span>
        <h1>{active ? active.trade_name || active.legal_name : "Bienvenido a ENQORA"}</h1>
        <p>{active ? `${formatRut(active.rut)} · ${ROLES[active.role]}` : user?.email}</p>
      </div>

      {aviso && AVISOS[aviso] ? <Notice kind="ok">{AVISOS[aviso]}</Notice> : null}

      <div className="grid">
        <section className="card">
          <h2>Empresa activa</h2>
          {active ? (
            <>
              <div className="row"><span>Razón social</span><span>{active.legal_name}</span></div>
              <div className="row"><span>Régimen</span><span>{REGIMES[active.tax_regime] ?? "Por definir"}</span></div>
              <div className="row"><span>Tu rol</span><span className="badge badge-muted">{ROLES[active.role]}</span></div>
              <p style={{ marginTop: 12 }}>
                <Link href={`/empresas/${active.id}`}>Administrar empresa →</Link>
                {companies.length > 1 ? <> · <Link href="/empresas">Cambiar ({companies.length})</Link></> : null}
              </p>
            </>
          ) : (
            <>
              <p>Registra tu empresa para comenzar, o pide a su propietario que te invite.</p>
              <Link href="/empresas/nueva" className="btn btn-gold btn-inline">Registrar empresa</Link>
            </>
          )}
        </section>

        <section className="card">
          <h2>Estado de tu cuenta</h2>
          <div className="row"><span>Correo verificado</span><span className="badge badge-ok">Verificado</span></div>
          <div className="row"><span>Verificación en dos pasos</span><span className="badge badge-ok">Activa</span></div>
          <div className="row"><span>Sesión actual</span><span className="badge badge-ok">Protegida</span></div>
          <p style={{ marginTop: 12 }}><Link href="/seguridad">Administrar seguridad →</Link></p>
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
