import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { reviewTaxRecordAction } from "@/app/actions/tax-records";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { MODULES } from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { salesTrancheLabel, SIGNALS, SOURCE_PAGE, type Signal } from "@/lib/public-data";
import { formatRut } from "@/lib/rut";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";
import type { Extract, Finding } from "@/lib/tax-record";
import { FolderUpload, RetryAnalysis } from "./folder-upload";

export const metadata: Metadata = { title: "Hoja de vida de la empresa" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CTE_HELP = "https://www.chileatiende.gob.cl/fichas/3262-carpeta-tributaria-electronica";
const CTE_TYPES = "https://www.sii.cl/preguntas_frecuentes/sit_tributaria/001_052_5777.htm";

type Profile = {
  estado: "encontrada" | "no_encontrada" | "sin_datos";
  rut?: string; razon_social?: string; inicio_actividades?: string | null; termino_giro?: string | null;
  actividades?: { codigo: string; descripcion: string | null }[]; total_actividades?: number;
  perfil?: {
    anio_comercial: number; tramo_ventas: string | null; trabajadores: number | null; region: string | null; rubro: string | null;
    subrubro: string | null; actividad_principal: string | null; tipo_contribuyente: string | null; subtipo_contribuyente: string | null;
    tramo_capital: string | null; tipo_termino: string | null;
  } | null;
  senales?: Signal[];
  fuentes?: { nombre: string; url: string; publicada: string }[];
};
type TaxRecord = {
  id: string; file_name: string; status: string; folder_kind: string | null; issued_on: string | null; valid_until: string | null;
  document_rut: string | null; rut_matches: boolean | null; summary: Partial<Extract>; findings: Finding[]; error: string | null;
  created_at: string; analyzed_at: string | null; reviewed_at: string | null; review_note: string | null;
};

const AVISOS: Record<string, string> = { revisada: "Revisión registrada. La empresa recibió el aviso." };
const fmt = (d?: string | null) => (d ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d.slice(0, 10)}T12:00:00Z`)) : "—");
const clp = (n?: number | null) => (n == null ? "—" : `$${n.toLocaleString("es-CL")}`);
const period = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 15)));
};
const TONE = { alta: "badge-risk", media: "badge-gold", baja: "badge-muted" } as const;
const GRAV = { alta: "Prioridad alta", media: "Atención", baja: "Para tu información" } as const;
const modName = (k: string) => (MODULES as Record<string, { name: string }>)[k]?.name ?? "ENQORA";

// Hoja de vida (M18): perfil público del SII (automático) + historial tributario desde la Carpeta
// Tributaria Electrónica que la empresa genera y sube. ENQORA propone cómo resolver lo que aparezca.
export default async function LifeSheetPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const user = await currentUser();
  if (!user) notFound();

  const [staff, { data: co }, { data: member }, { data: prof, error: profErr }, { data: recs }] = await Promise.all([
    myStaffRole(),
    supabase.from("companies").select("id, rut, legal_name, trade_name").eq("id", id).maybeSingle(),
    supabase.from("company_members").select("role").eq("company_id", id).eq("user_id", user.id).maybeSingle(),
    supabase.rpc("company_public_profile", { p_company: id }),
    supabase.from("tax_records").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(10),
  ]);
  if (!co || profErr) notFound();
  const company = co as { id: string; rut: string; legal_name: string; trade_name: string | null };
  const role = (member as { role: string } | null)?.role ?? null;
  // Equipo ENQORA: supervisión o asignado a algún caso de la empresa (igual que Cumplimiento).
  let canManage = isSupervisorRole(staff);
  if (!canManage && staff && staff !== "ai_agent") {
    const { data: cs } = await supabase.from("cases").select("id").eq("company_id", id);
    const ids = ((cs ?? []) as { id: string }[]).map((c) => c.id);
    if (ids.length) {
      const { count } = await supabase.from("case_assignments").select("case_id", { count: "exact", head: true }).in("case_id", ids).eq("user_id", user.id);
      canManage = (count ?? 0) > 0;
    }
  }
  const canUpload = role === "owner" || role === "admin" || canManage;
  const canRequest = !!role && role !== "viewer";
  const profile = (prof ?? { estado: "sin_datos" }) as Profile;
  const records = (recs ?? []) as TaxRecord[];
  const latest = records[0] ?? null;
  const ready = records.find((r) => r.status === "lista") ?? null;
  const x = ready?.summary ?? null;
  const signals = profile.senales ?? [];
  const findings = ready && ready.rut_matches !== false ? ready.findings : ready ? ready.findings.filter((f) => f.codigo === "rut_distinto") : [];
  const nothingFound = profile.estado === "encontrada" && !signals.length && ready && ready.rut_matches !== false && !findings.length;

  const solve = (servicio: string, asunto: string) =>
    canRequest ? (
      <Link href={`/casos/nuevo?modulo=${servicio}&asunto=${encodeURIComponent(asunto)}`} className="btn btn-gold btn-inline btn-sm">
        Solucionarlo con {modName(servicio)}
      </Link>
    ) : null;

  return (
    <div className="page">
      <Link href={`/empresas/${company.id}`} className="back-link"><span aria-hidden="true">←</span> {company.trade_name || company.legal_name}</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Hoja de vida · RUT {formatRut(company.rut)}</span>
          <h1>Hoja de vida de la empresa</h1>
          <p className="hero-lead">
            Reunimos lo que dicen las fuentes oficiales sobre tu empresa y lo traducimos en acciones: qué está bien, qué hay que regularizar y
            quién de ENQORA lo resuelve.
          </p>
        </div>
        <div className="hero-actions">
          <Link href={`/empresas/${company.id}/cumplimiento`} className="btn btn-ghost btn-inline">Cumplimiento y vencimientos</Link>
        </div>
      </header>
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {/* 1 · Perfil público */}
      <section className="card" id="perfil">
        <h2>1 · Perfil público según el SII</h2>
        {profile.estado === "encontrada" ? (
          <>
            <dl className="lookup-facts">
              <div><dt>Razón social</dt><dd>{profile.razon_social}</dd></div>
              <div><dt>Inicio de actividades</dt><dd>{fmt(profile.inicio_actividades)}</dd></div>
              <div><dt>Situación</dt><dd>{profile.termino_giro ? `Término de giro el ${fmt(profile.termino_giro)}` : "Sin término de giro informado"}</dd></div>
              {profile.perfil ? (
                <>
                  <div><dt>Tamaño por ventas ({profile.perfil.anio_comercial})</dt><dd>{salesTrancheLabel(profile.perfil.tramo_ventas) ?? "—"}</dd></div>
                  <div><dt>Trabajadores informados</dt><dd>{profile.perfil.trabajadores ?? "—"}</dd></div>
                  <div><dt>Rubro</dt><dd>{profile.perfil.rubro ?? "—"}{profile.perfil.subrubro ? ` · ${profile.perfil.subrubro}` : ""}</dd></div>
                  {profile.perfil.region ? <div><dt>Región</dt><dd>{profile.perfil.region}</dd></div> : null}
                  {profile.perfil.tipo_contribuyente ? <div><dt>Tipo de contribuyente</dt><dd>{profile.perfil.tipo_contribuyente}{profile.perfil.subtipo_contribuyente ? ` · ${profile.perfil.subtipo_contribuyente}` : ""}</dd></div> : null}
                </>
              ) : null}
            </dl>
            {profile.actividades?.length ? (
              <div className="lookup-acts">
                <h4 className="lookup-acts-title">Actividades económicas vigentes ({profile.total_actividades})</h4>
                <ul>{profile.actividades.map((a) => <li key={a.codigo}><span className="mono">{a.codigo}</span> {a.descripcion}</li>)}</ul>
              </div>
            ) : null}
          </>
        ) : profile.estado === "no_encontrada" ? (
          <p className="muted-line">Este RUT no aparece en la nómina pública de personas jurídicas del SII publicada el {fmt(profile.fuentes?.[0]?.publicada)}. Si la empresa es nueva, aparecerá en la próxima publicación.</p>
        ) : (
          <p className="muted-line">El conector con las nóminas del SII aún está completando su primera carga. Vuelve a revisar en unas horas.</p>
        )}
        {profile.fuentes?.length ? (
          <p className="lookup-source">
            Fuentes: {profile.fuentes.map((f, i) => (
              <span key={f.url}>{i ? " · " : ""}<a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a> (publicada el {fmt(f.publicada)})</span>
            ))}. Datos públicos que el SII advierte como preliminares. <a href={SOURCE_PAGE} target="_blank" rel="noopener noreferrer">Más información</a>.
          </p>
        ) : null}
      </section>

      {/* 2 · Historial tributario */}
      <section className="card" id="historial">
        <h2>2 · Historial tributario (Carpeta Tributaria Electrónica)</h2>
        <p>
          Las declaraciones de IVA (F29), de renta (F22) y las observaciones del SII no son públicas: solo tu empresa puede obtenerlas. La forma
          oficial y gratuita es la <b>Carpeta Tributaria Electrónica</b>. ENQORA nunca te pedirá tu clave del SII ni tu ClaveÚnica.
        </p>
        <ol className="steps-list">
          <li>Entra a <a href="https://www.sii.cl" target="_blank" rel="noopener noreferrer">sii.cl</a> → Servicios online → Situación tributaria → <b>Carpeta tributaria electrónica</b>, con tu propia clave.</li>
          <li>Elige <b>Carpeta personalizada</b> y marca todo, con 36 períodos de F29 y 4 de F22 (o «Para solicitar créditos»: 24 F29 y 3 F22). <a href={CTE_TYPES} target="_blank" rel="noopener noreferrer">Tipos de carpeta</a> · <a href={CTE_HELP} target="_blank" rel="noopener noreferrer">Guía ChileAtiende</a>.</li>
          <li>Descarga el PDF y súbelo aquí. Lo leemos en menos de un minuto y te mostramos qué encontramos.</li>
        </ol>
        {canUpload ? <FolderUpload companyId={company.id} /> : <p className="muted-line">La carpeta la sube el propietario o un administrador de la empresa.</p>}

        {latest && latest.status !== "lista" ? (
          <p className={latest.status === "error" ? "lookup-error" : "muted-line"}>
            Última carpeta ({latest.file_name}, {fmt(latest.created_at)}): {latest.status === "error" ? latest.error ?? "no se pudo analizar" : latest.status === "analizando" ? "en análisis…" : "subida, pendiente de análisis"}.{" "}
            {canUpload && latest.status !== "analizando" ? <RetryAnalysis recordId={latest.id} /> : null}
          </p>
        ) : null}

        {ready && x ? (
          <div className="taxsheet">
            <p className="muted-line">
              Carpeta {ready.folder_kind ? `«${ready.folder_kind}»` : ""} emitida el {fmt(ready.issued_on)}
              {ready.valid_until ? `, vigente hasta el ${fmt(ready.valid_until)}` : ""} · analizada el {fmt(ready.analyzed_at)}.
              {ready.rut_matches === false ? <b> Corresponde a otro RUT ({ready.document_rut}).</b> : null}
            </p>
            {ready.rut_matches !== false ? (
              <>
                {x.f29?.length ? (
                  <div className="table-scroll">
                    <h3>IVA mensual (F29)</h3>
                    <table className="ledger-table">
                      <thead><tr><th>Período</th><th>Estado</th><th className="num">Ventas netas</th><th className="num">IVA débito</th><th className="num">IVA crédito</th><th className="num">Total a pagar</th></tr></thead>
                      <tbody>
                        {[...x.f29].reverse().map((f) => (
                          <tr key={f.periodo}>
                            <td>{period(f.periodo)}</td>
                            <td>{f.declarado === false ? <span className="badge badge-risk">Sin declaración</span> : f.declarado ? <span className="badge badge-ok">Declarado</span> : "—"}</td>
                            <td className="num">{clp(f.ventas_netas)}</td><td className="num">{clp(f.iva_debito)}</td><td className="num">{clp(f.iva_credito)}</td><td className="num">{clp(f.total_a_pagar)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="muted-line">La carpeta no incluye declaraciones F29 (elige una carpeta con períodos de IVA para verlas).</p>}
                {x.f22?.length ? (
                  <div className="table-scroll">
                    <h3>Renta anual (F22)</h3>
                    <table className="ledger-table">
                      <thead><tr><th>Año tributario</th><th>Estado</th><th className="num">Base imponible</th><th className="num">Impuesto</th><th className="num">Devolución</th></tr></thead>
                      <tbody>
                        {[...x.f22].reverse().map((f) => (
                          <tr key={f.anio_tributario}>
                            <td>{f.anio_tributario}</td>
                            <td>{f.declarado === false ? <span className="badge badge-risk">Sin declaración</span> : f.estado ?? (f.declarado ? "Declarado" : "—")}</td>
                            <td className="num">{clp(f.base_imponible)}</td><td className="num">{clp(f.impuesto)}</td><td className="num">{clp(f.devolucion)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <dl className="lookup-facts">
                  {x.regimen ? <div><dt>Régimen</dt><dd>{x.regimen}</dd></div> : null}
                  {x.honorarios ? <div><dt>Boletas de honorarios</dt><dd>{x.honorarios.meses ?? "—"} meses · {clp(x.honorarios.total_bruto)} brutos</dd></div> : null}
                  {x.propiedades != null ? <div><dt>Bienes raíces</dt><dd>{x.propiedades}</dd></div> : null}
                  <div><dt>Observaciones del SII</dt><dd>{x.observaciones_sii?.length ? x.observaciones_sii.length : "Ninguna informada"}</dd></div>
                </dl>
              </>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* 3 · Diagnóstico y soluciones */}
      <section className="card" id="analisis">
        <h2>3 · Lo que encontramos y cómo lo resolvemos</h2>
        {signals.length || findings.length ? (
          <ul className="watch-list">
            {findings.map((f) => (
              <li key={`f-${f.codigo}`} className="watch-item">
                <div className="watch-head"><span className={`badge ${TONE[f.gravedad]}`}>{GRAV[f.gravedad]}</span><small>Carpeta tributaria</small></div>
                <b>{f.titulo}</b>
                <p>{f.detalle}</p>
                {f.codigo !== "rut_distinto" && f.codigo !== "no_es_carpeta" ? solve(f.servicio, f.asunto) : null}
              </li>
            ))}
            {signals.map((s) => {
              const t = SIGNALS[s.codigo];
              if (!t) return null;
              return (
                <li key={`s-${s.codigo}`} className="watch-item">
                  <div className="watch-head"><span className={`badge ${TONE[s.gravedad]}`}>{GRAV[s.gravedad]}</span><small>Datos públicos del SII</small></div>
                  <b>{t.titulo(s)}</b>
                  <p>{t.detalle(s)}</p>
                  {solve(t.servicio, t.asunto)}
                </li>
              );
            })}
          </ul>
        ) : nothingFound ? (
          <p>No encontramos situaciones pendientes en las fuentes revisadas. Te avisaremos de los próximos vencimientos en <Link href={`/empresas/${company.id}/cumplimiento`}>Cumplimiento</Link>.</p>
        ) : (
          <p className="muted-line">{ready ? "Sin observaciones en los datos públicos." : "Sube tu carpeta tributaria para completar el diagnóstico con tu historial de impuestos."}</p>
        )}
        <p className="hint">
          Análisis preliminar automático sobre documentos y datos oficiales: no reemplaza la revisión de un profesional. Al abrir el caso, un
          contador o abogado ENQORA confirma el diagnóstico, el costo y los plazos antes de actuar.
        </p>
        {ready?.reviewed_at ? <Notice kind="info">Revisado por el equipo ENQORA el {fmt(ready.reviewed_at)}: {ready.review_note}</Notice> : null}
        {ready && canManage && !ready.reviewed_at ? (
          <form action={reviewTaxRecordAction} className="inline-form">
            <input type="hidden" name="record_id" value={ready.id} />
            <input type="hidden" name="company_id" value={company.id} />
            <input name="note" className="input input-sm" required minLength={10} maxLength={1000} placeholder="Observación profesional para el cliente" aria-label="Observación" />
            <SubmitButton className="btn-inline btn-sm" pendingText="Guardando…">Marcar revisada</SubmitButton>
          </form>
        ) : null}
      </section>

      {records.length > 1 ? (
        <section className="card">
          <h2>Carpetas anteriores</h2>
          <ul className="ref-list" role="list">
            {records.slice(1).map((r) => (
              <li key={r.id}>
                <span className="ref-main"><b>{r.file_name}</b><small>Subida el {fmt(r.created_at)} · {r.status === "lista" ? `${r.findings.length} hallazgo(s)` : r.status}</small></span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
