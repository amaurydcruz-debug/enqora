import Link from "next/link";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { IconActivity, IconAlert, IconBuilding, IconShield, IconSpark } from "@/components/icons";
import { CLOSED, statusClass, statusLabel, type CaseRow } from "@/lib/cases";
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
  const { data: caseRows } = active
    ? await supabase
        .from("cases")
        .select("id, folio, title, status, updated_at")
        .eq("company_id", active.id)
        .order("updated_at", { ascending: false })
        .limit(20)
    : { data: [] };
  // Autorizaciones que esperan la decisión de la empresa (RLS: solo miembros de la empresa y equipo asignado).
  const { data: authRows } = active
    ? await supabase
        .from("client_authorizations")
        .select("id, case_id, title, valid_until")
        .eq("company_id", active.id)
        .eq("status", "pendiente")
        .order("requested_at")
    : { data: [] };
  const pendingAuth = (authRows ?? []) as { id: string; case_id: string; title: string; valid_until: string | null }[];
  const canAuthorize = !!active && ["owner", "admin"].includes(active.role);
  const openCases = ((caseRows ?? []) as CaseRow[]).filter((c) => !CLOSED.includes(c.status));
  const waiting = openCases.filter((c) => ["esperando_cliente", "autorizacion_cliente"].includes(c.status));

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

      {pendingAuth.length ? (
        <div className="alert alert-warn alert-row" role="status">
          <IconShield size={22} />
          <div>
            <b>{pendingAuth.length === 1 ? "Una autorización espera tu decisión" : `${pendingAuth.length} autorizaciones esperan tu decisión`}</b>
            <p>
              {canAuthorize
                ? "ENQORA solo actuará dentro de lo que autorices, y puedes revocarlo cuando quieras."
                : "Solo el Propietario o un Administrador de la empresa puede decidirlas."}
            </p>
            <ul className="auth-panel-list">
              {pendingAuth.slice(0, 4).map((a) => (
                <li key={a.id}><Link href={`/casos/${a.case_id}#autorizaciones`}>{a.title}</Link></li>
              ))}
            </ul>
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

        {active ? (
          <section className="card">
            <h2 className="card-title"><IconActivity /> Tus casos</h2>
            {waiting.length ? (
              <p className="text-warn">{waiting.length === 1 ? "1 caso necesita tu acción." : `${waiting.length} casos necesitan tu acción.`}</p>
            ) : null}
            {openCases.length ? (
              openCases.slice(0, 4).map((c) => (
                <div className="row" key={c.id}>
                  <Link href={`/casos/${c.id}`}>{c.title}</Link>
                  <span className={statusClass(c.status)}>{statusLabel(c.status)}</span>
                </div>
              ))
            ) : (
              <p>No tienes casos en curso. ¿Necesitas ayuda con algo?</p>
            )}
            <p className="mt-12">
              <Link href="/casos">Ver todos →</Link>
              {active.role !== "viewer" ? <> · <Link href="/casos/nuevo">Nueva solicitud</Link></> : null}
            </p>
          </section>
        ) : null}

        <section className="card">
          <h2 className="card-title"><IconSpark /> Inteligencia ENQORA</h2>
          <p>Tu asistente contable y el Centro de Resolución se activarán cuando tu empresa esté conectada.</p>
          <span className="badge badge-muted">Próximamente</span>
        </section>
      </div>
    </div>
  );
}
