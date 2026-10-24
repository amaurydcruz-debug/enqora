import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { IconAlert, IconBuilding, IconShield, IconSpark } from "@/components/icons";
import { SubmitButton } from "@/components/submit-button";
import { acknowledgeAlertsAction } from "@/app/actions/security";
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
  const { count: pendingAlerts } = await supabase
    .from("security_events")
    .select("id", { count: "exact", head: true })
    .eq("event", "nuevo_dispositivo")
    .is("acknowledged_at", null);

  return (
    <div className="stack">
      <div className="page-head">
        <span className="eyebrow">Centro de control</span>
        <h1>{active ? active.trade_name || active.legal_name : "Bienvenido a ENQORA"}</h1>
        <p>{active ? `${formatRut(active.rut)} · ${ROLES[active.role]}` : user?.email}</p>
      </div>

      {aviso && AVISOS[aviso] ? <Notice kind="ok">{AVISOS[aviso]}</Notice> : null}

      {pendingAlerts ? (
        <div className="alert alert-warn alert-row" role="alert">
          <IconAlert size={22} />
          <div>
            <b>Detectamos un ingreso desde un dispositivo nuevo</b>
            <p>Si no fuiste tú, revisa tu seguridad ahora: cambia tu contraseña y cierra las demás sesiones.</p>
          </div>
          <div className="actions-inline">
            <Link href="/seguridad" className="btn btn-gold btn-inline btn-sm">Revisar</Link>
            <form action={acknowledgeAlertsAction}>
              <input type="hidden" name="next" value="/panel" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Fui yo</SubmitButton>
            </form>
          </div>
        </div>
      ) : null}

      <div className="grid">
        <section className="card">
          <h2 className="card-title"><IconBuilding /> Empresa activa</h2>
          {active ? (
            <>
              <div className="row"><span>Razón social</span><span>{active.legal_name}</span></div>
              <div className="row"><span>Régimen</span><span>{REGIMES[active.tax_regime] ?? "Por definir"}</span></div>
              <div className="row"><span>Tu rol</span><span className="badge badge-muted">{ROLES[active.role]}</span></div>
              <p className="mt-12">
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
          <h2 className="card-title"><IconShield /> Estado de tu cuenta</h2>
          <div className="row"><span>Correo verificado</span><span className="badge badge-ok">Verificado</span></div>
          <div className="row"><span>Verificación en dos pasos</span><span className="badge badge-ok">Activa</span></div>
          <div className="row"><span>Sesión actual</span><span className="badge badge-ok">Protegida</span></div>
          <div className="row"><span>Alertas pendientes</span><span className={`badge ${pendingAlerts ? "badge-warn" : "badge-ok"}`}>{pendingAlerts ? pendingAlerts : "Ninguna"}</span></div>
          <p className="mt-12"><Link href="/seguridad">Administrar seguridad →</Link></p>
        </section>

        <section className="card">
          <h2 className="card-title"><IconSpark /> Inteligencia ENQORA</h2>
          <p>Tu asistente contable y el Centro de Resolución se activarán cuando tu empresa esté conectada.</p>
          <span className="badge badge-muted">Próximamente</span>
        </section>
      </div>
    </div>
  );
}
