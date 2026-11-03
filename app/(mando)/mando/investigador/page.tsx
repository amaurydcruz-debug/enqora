/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { iniciarInvestigacionAction } from "@/app/actions/investigador";
import { SubmitButton } from "@/components/submit-button";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "CORA · Investigador web" };
export const dynamic = "force-dynamic";

type Run = { id: string; rut: string; razon_social: string | null; modo: string; status: string; created_at: string; started_at: string | null; finished_at: string | null; metrics: Record<string, unknown> | null; error: string | null };
type Ev = { id: string; run_id: string; portal: string; procedure_version: string; query: Record<string, string>; url: string; consulted_at: string; status: string; result: { tablas?: { headers: string[]; rows: string[][] }[]; coincidencias_exactas?: number; aciertos_totales?: number; titulo?: string } | null; screenshot_path: string | null; duration_ms: number | null; detail: string | null };

const STATUS: Record<string, [string, string]> = {
  en_cola: ["En cola", "muted"], en_curso: ["Investigando", "gold"], completada: ["Completada", "ok"], fallida: ["Fallida", "risk"],
  encontrado: ["Encontrado", "ok"], sin_resultados: ["Sin resultados localizados", "muted"], bloqueado: ["Bloqueado (CAPTCHA o login)", "warn"],
  procedimiento_fallo: ["Procedimiento por validar", "warn"], error: ["Error", "risk"],
};
const ERRORES: Record<string, string> = { rut: "El RUT no es válido.", no_encontrada: "Ese RUT no está en las nóminas públicas de empresas del SII.", registro: "No se pudo registrar la investigación. ¿Se ejecutó la migración 0026?" };
const fmt = (iso: string | null) => (iso ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "medium", timeZone: "America/Santiago" }).format(new Date(iso)) : "—");

// CORA Web Research Agent (piloto): el equipo lanza una investigación real y revisa la prueba de cada búsqueda.
export default async function InvestigadorPage({ searchParams }: { searchParams: Promise<{ run?: string; error?: string }> }) {
  const sp = await searchParams;
  const role = await myStaffRole();
  if (!role) notFound();
  const supabase = await createClient();
  const { data: runRows } = await supabase.from("research_runs").select("*").order("created_at", { ascending: false }).limit(10);
  const runs = (runRows ?? []) as Run[];
  const selected = runs.find((r) => r.id === sp.run) ?? runs[0];
  const { data: evRows } = selected
    ? await supabase.from("research_evidence").select("*").eq("run_id", selected.id).order("consulted_at")
    : { data: [] };
  const evs = (evRows ?? []) as Ev[];
  const paths = evs.map((e) => e.screenshot_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await supabase.storage.from("cora-evidencias").createSignedUrls(paths, 600) : { data: [] };
  const url = new Map<string, string>(((signed ?? []) as { path: string | null; signedUrl: string }[]).map((s) => [s.path ?? "", s.signedUrl]));

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · CORA</span>
          <h1>Investigador web (piloto)</h1>
          <p className="hero-lead">
            El bot de CORA consulta portales oficiales con un navegador en la nube y deja la prueba de cada búsqueda: captura, fecha y hora,
            fuente, consulta y resultado. Nunca intenta superar CAPTCHA ni usa credenciales. Orden del piloto: INAPI → Registro de Empresas y
            Sociedades → Mercado Público (cuando exista el ticket).
          </p>
        </div>
      </header>

      {sp.error ? <p className="lookup-error" role="alert">{ERRORES[sp.error] ?? "No se pudo iniciar."}</p> : null}

      <section className="card">
        <h2>Lanzar</h2>
        <form action={iniciarInvestigacionAction} className="inline-form">
          <input type="hidden" name="modo" value="entorno" />
          <SubmitButton className="btn-inline btn-sm" pendingText="Iniciando…">1 · Probar el navegador en Vercel</SubmitButton>
          <span className="muted-line">Abre Chromium en la nube y entra a INAPI: mide lanzamiento, tiempo, memoria y versión.</span>
        </form>
        <form action={iniciarInvestigacionAction} className="inline-form">
          <input type="hidden" name="modo" value="investigacion" />
          <input name="rut" className="input input-sm mono" placeholder="RUT de prueba autorizado" maxLength={12} required style={{ width: 200 }} />
          <SubmitButton className="btn-inline btn-sm" pendingText="Iniciando…">2 · Investigar en INAPI y Registro de Empresas</SubmitButton>
        </form>
        <p className="muted-line">La investigación sigue en el servidor aunque cierres esta página (hasta 5 minutos). Recarga para ver el avance.</p>
      </section>

      <section className="card">
        <h2>Investigaciones recientes</h2>
        {runs.length ? (
          <ul className="ref-list" role="list">
            {runs.map((r) => (
              <li key={r.id} className={r.id === selected?.id ? "" : "is-stale"}>
                <span className="ref-main">
                  <b><Link href={`/mando/investigador?run=${r.id}`}>{r.modo === "entorno" ? "Prueba de entorno" : `${r.razon_social ?? ""} · ${r.rut}`}</Link></b>
                  <small className="muted-line">
                    {fmt(r.created_at)}
                    {r.metrics ? ` · ${Object.entries(r.metrics).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}` : ""}
                    {r.error ? ` · ${r.error}` : ""}
                  </small>
                </span>
                <span className={`status status-${STATUS[r.status]?.[1] ?? "muted"}`}>{STATUS[r.status]?.[0] ?? r.status}</span>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Aún no hay investigaciones.</p>}
      </section>

      {selected ? (
        <section className="card">
          <h2>Evidencias · {selected.modo === "entorno" ? "prueba de entorno" : selected.razon_social}</h2>
          {!evs.length ? <p className="muted-line">{selected.status === "fallida" ? `La ejecución falló: ${selected.error ?? ""}` : "Sin evidencias todavía: recarga en unos segundos."}</p> : null}
          <div className="cora-sections">
            {evs.map((e) => (
              <article key={e.id} className="cora-section" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <b>{e.portal.toUpperCase()} · {e.procedure_version}</b>
                  <span className={`status status-${STATUS[e.status]?.[1] ?? "muted"}`}>{STATUS[e.status]?.[0] ?? e.status}</span>
                </div>
                <dl className="cora-dl">
                  <div><dt>Consultado</dt><dd>{fmt(e.consulted_at)} · {e.duration_ms != null ? `${(e.duration_ms / 1000).toFixed(1)} s` : "—"}</dd></div>
                  <div><dt>Fuente</dt><dd><a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a></dd></div>
                  <div><dt>Consulta</dt><dd>{Object.entries(e.query).map(([k, v]) => `${k}: ${v}`).join(" · ")}</dd></div>
                  <div><dt>Resultado</dt><dd>{e.detail}</dd></div>
                  {e.result?.tablas?.length ? (
                    <div>
                      <dt>Datos extraídos</dt>
                      <dd className="cora-table-wrap">
                        {e.result.tablas.slice(0, 1).map((t, i) => (
                          <table key={i} className="cora-table">
                            {t.headers.length ? <thead><tr>{t.headers.slice(0, 8).map((h, j) => <th key={j}>{h}</th>)}</tr></thead> : null}
                            <tbody>{t.rows.slice(0, 10).map((r, j) => <tr key={j}>{r.slice(0, 8).map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
                          </table>
                        ))}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {e.screenshot_path && url.get(e.screenshot_path) ? (
                  <a href={url.get(e.screenshot_path)!} target="_blank" rel="noopener noreferrer">
                    <img src={url.get(e.screenshot_path)!} alt={`Captura de ${e.portal} del ${fmt(e.consulted_at)}`} style={{ width: "100%", maxWidth: 900, borderRadius: 12, border: "1px solid var(--hairline)" }} />
                  </a>
                ) : <p className="muted-line">Sin captura.</p>}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
