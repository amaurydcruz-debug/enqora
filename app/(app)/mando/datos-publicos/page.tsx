import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { PublicDataImporter } from "./importer";

export const metadata: Metadata = { title: "Datos públicos" };

type Import = {
  id: string; dataset: string; source_url: string; published_on: string; file_name: string | null;
  rows_received: number; status: string; started_at: string; finished_at: string | null;
};

const DATASETS: Record<string, string> = { razon_social: "Razón social (PJ)", actividades: "Actividades económicas (PJ)" };
const STATUS: Record<string, { label: string; tone: string }> = {
  en_curso: { label: "En curso", tone: "gold" }, completada: { label: "Completada", tone: "ok" }, cancelada: { label: "Detenida", tone: "muted" },
};
const fmt = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(iso)) : "—";
const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

// Datos públicos del SII para la consulta por RUT de la puerta de entrada.
export default async function PublicDataPage() {
  const role = await myStaffRole();
  if (!role) notFound();
  const admin = role === "enqora_admin";
  const supabase = await createClient();
  const { data } = await supabase.from("public_data_imports").select("*").order("started_at", { ascending: false }).limit(20);
  const imports = (data ?? []) as Import[];
  const current = (ds: string) => imports.find((i) => i.dataset === ds && i.status === "completada");

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
        {(["razon_social", "actividades"] as const).map((ds) => {
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

      <Callout kind="info" title="Cómo actualizar">
        Descarga desde el SII la nómina vigente (archivo .zip) y súbela aquí tal cual: el navegador la lee, la interpreta y la envía por lotes.
        El SII advierte que estas nóminas son preliminares; la portada las muestra como información pública según el SII, con su fecha.
      </Callout>

      {admin ? (
        <section className="card">
          <h2>Cargar una nómina</h2>
          <PublicDataImporter />
        </section>
      ) : (
        <p className="muted-line">Solo el Administrador ENQORA carga datos públicos.</p>
      )}

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
