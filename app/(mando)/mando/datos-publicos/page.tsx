import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { syncPublicDataAction } from "@/app/actions/tax-records";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { SOURCE_PAGE } from "@/lib/public-data";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { PublicDataImporter } from "./importer";

export const metadata: Metadata = { title: "Datos públicos" };
// «Sincronizar ahora» espera el resultado de un tramo del conector.
export const maxDuration = 60;

type Import = {
  id: string; dataset: string; source_url: string; published_on: string; file_name: string | null;
  rows_received: number; status: string; started_at: string; finished_at: string | null;
  mode: string; cursor_line: number; heartbeat_at: string | null; last_error: string | null;
};

const DATASETS: Record<string, string> = {
  razon_social: "Razón social (PJ)", actividades: "Actividades económicas (PJ)", empresas: "Nómina de empresas (PJ)",
};
type Run = { id: number; ran_at: string; origin: string; result: string; dataset: string | null; rows_loaded: number; cursor_line: number | null; detail: string | null };
const RESULT: Record<string, { label: string; tone: string; text: string }> = {
  al_dia: { label: "Al día", tone: "ok", text: "Las nóminas ya están al día: el SII no ha publicado una versión nueva." },
  continua: { label: "Avanzando", tone: "gold", text: "Carga en marcha: el conector sigue solo, por tramos. Recarga esta página en unos minutos." },
  completada: { label: "Completada", tone: "ok", text: "Carga completada. El conector revisa ahora las demás nóminas." },
  ocupado: { label: "En curso", tone: "gold", text: "Ya hay una carga avanzando en este momento." },
  error: { label: "Error", tone: "risk", text: "El conector no pudo completar el tramo." },
};
const STATUS: Record<string, { label: string; tone: string }> = {
  en_curso: { label: "En curso", tone: "gold" }, completada: { label: "Completada", tone: "ok" }, cancelada: { label: "Detenida", tone: "muted" },
};
const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";
const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

// Datos públicos del SII para la consulta por RUT de la puerta de entrada.
export default async function PublicDataPage({ searchParams }: { searchParams: Promise<{ resultado?: string; detalle?: string; error?: string }> }) {
  const sp = await searchParams;
  const role = await myStaffRole();
  if (!role) notFound();
  const admin = role === "enqora_admin";
  const supabase = await createClient();
  const [{ data }, { data: runRows }] = await Promise.all([
    supabase.from("public_data_imports").select("*").order("started_at", { ascending: false }).limit(20),
    supabase.from("public_sync_runs").select("*").order("ran_at", { ascending: false }).limit(10),
  ]);
  const imports = (data ?? []) as Import[];
  const runs = (runRows ?? []) as Run[];
  const res = sp.resultado ? RESULT[sp.resultado] : null;
  const current = (ds: string) => imports.find((i) => i.dataset === ds && i.status === "completada");
  const running = imports.find((i) => i.status === "en_curso" && i.mode === "automatica");
  const failed = imports.find((i) => i.mode === "automatica" && i.last_error && (i.status === "en_curso" || i.status === "cancelada"));

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Puerta de entrada</span>
          <h1>Datos públicos del SII</h1>
          <p className="hero-lead">
            Nóminas abiertas del SII sobre personas jurídicas que alimentan la consulta por RUT de la portada. No contienen datos de personas naturales.
          </p>
        </div>
      </header>

      <div className="kpis kpis-mando">
        {(["razon_social", "actividades", "empresas"] as const).map((ds) => {
          const c = current(ds);
          return (
            <div key={ds} className={`kpi${c ? "" : " kpi-gold"}`}>
              <span>{DATASETS[ds]}</span>
              <b>{c ? c.rows_received.toLocaleString("es-CL") : "Sin datos"}</b>
              <small className="muted-line">{c ? `Publicación del ${fmtDate(c.published_on)}` : "La consulta por RUT aún no responde"}</small>
            </div>
          );
        })}
      </div>

      {res ? <Notice kind={sp.resultado === "error" ? "error" : "ok"}>{res.text}{sp.detalle ? ` ${sp.detalle}` : ""}</Notice> : null}
      {sp.error === "sin_configurar" ? <Notice kind="error">Falta configurar CRON_SECRET y ENQORA_SERVICE_TOKEN en Vercel.</Notice> : null}

      <Callout kind="info" title="Actualización automática">
        Un conector del servidor descarga cada día las nóminas oficiales desde el sitio del SII{" "}
        (<a href={SOURCE_PAGE} target="_blank" rel="noopener noreferrer">fuente</a>), detecta si hay una versión nueva y la carga por tramos
        hasta completarla. Nadie necesita descargar ni subir archivos. El SII advierte que estas nóminas son preliminares; la portada las
        muestra como información pública según el SII, con su fecha.
      </Callout>

      <section className="card">
        <h2>Estado del conector</h2>
        {running ? (
          <p>
            Cargando <b>{DATASETS[running.dataset]}</b>: {running.cursor_line.toLocaleString("es-CL")} líneas procesadas,{" "}
            {running.rows_received.toLocaleString("es-CL")} filas válidas. Último avance: {fmt(running.heartbeat_at)}.
          </p>
        ) : (
          <p className="muted-line">Sin cargas en curso.</p>
        )}
        {failed?.last_error ? <p className="lookup-error">Último problema ({DATASETS[failed.dataset]}): {failed.last_error}</p> : null}
        {runs.length ? (
          <>
            <h3>Últimas ejecuciones</h3>
            <ul className="ref-list" role="list">
              {runs.map((r) => (
                <li key={r.id}>
                  <span className="ref-main">
                    <b>{fmt(r.ran_at)} · {r.origin === "manual" ? "manual" : "automática"}{r.dataset ? ` · ${DATASETS[r.dataset]}` : ""}</b>
                    <small>{r.rows_loaded ? `${r.rows_loaded.toLocaleString("es-CL")} filas · ` : ""}{r.detail ?? RESULT[r.result]?.text ?? ""}</small>
                  </span>
                  <span className={`status status-${RESULT[r.result]?.tone ?? "muted"}`}>{RESULT[r.result]?.label ?? r.result}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="muted-line">El conector aún no se ha ejecutado. Pulsa «Sincronizar ahora» para la primera carga.</p>}
        {admin ? (
          <form action={syncPublicDataAction} className="inline-form">
            <SubmitButton className="btn-inline btn-sm" pendingText="Conectando con el SII… (hasta 1 minuto)">Sincronizar ahora</SubmitButton>
          </form>
        ) : null}
      </section>

      {admin ? (
        <details className="card">
          <summary><b>Carga manual (respaldo)</b> · solo si el conector no puede descargar desde el SII</summary>
          <PublicDataImporter />
        </details>
      ) : null}

      <section className="card">
        <h2>Historial de cargas</h2>
        {imports.length ? (
          <ul className="ref-list" role="list">
            {imports.map((i) => (
              <li key={i.id}>
                <span className="ref-main">
                  <b>{DATASETS[i.dataset] ?? i.dataset}</b>
                  <small>
                    {i.rows_received.toLocaleString("es-CL")} filas · publicación del {fmtDate(i.published_on)} · {i.file_name ?? "archivo"} · {fmt(i.started_at)}
                    {" · "}{i.mode === "automatica" ? "automática" : "manual"}{i.last_error ? ` · ${i.last_error}` : ""}
                  </small>
                </span>
                <span className={`status status-${STATUS[i.status]?.tone ?? "muted"}`}>{STATUS[i.status]?.label ?? i.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-line">Aún no hay cargas.</p>
        )}
      </section>
    </div>
  );
}
