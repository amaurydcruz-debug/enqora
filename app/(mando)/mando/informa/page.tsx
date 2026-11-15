import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { runWatchAction } from "@/app/actions/learning";
import { barridoAction, pedirMisionAction } from "@/app/actions/informa";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { DEP_KEYS, DEPARTAMENTOS, DIAS_REVERIFICAR, diasDesde, ETAPAS, fechaCL, type Departamento } from "@/lib/informa";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "ENQORA Informa · Centro de mando" };
export const maxDuration = 60;

type Tablero = { fuentes: number; fuentes_al_dia: number; misiones_activas: number; misiones_30d: number; fallidas_30d: number; hallazgos_30d: number;
  por_verificar: number; revision_profesional: number; por_publicar: number; publicadas: number; alertas_criticas: number };
type Mision = { id: string; folio: string; departamento: Departamento; tema: string | null; origen: string; estado: string; hallazgos: number; nuevas: number; error: string | null; created_at: string; ended_at: string | null };
type Fuente = { key: string; institucion: string; url: string; departamentos: string[]; frecuencia: string; ultima_revision: string | null; hallazgos: number; activa: boolean };
type Item = { id: string; title: string; institution: string | null; etapa: string; alerta: string; departamento: string | null; requiere_revision: boolean; revision_prof_at: string | null; created_at: string; mission_id: string | null; fecha_consulta: string | null };

const AVISOS: Record<string, string> = { mision_pedida: "Misión planificada: el Director IA la tomará primero en la próxima ronda." };
const ESTADO_MISION: Record<string, string> = { planificada: "badge-gold", en_curso: "badge-gold", terminada: "badge-ok", fallida: "badge-muted", cancelada: "badge-muted" };
const DIAS = { diaria: 2, semanal: 10, mensual: 35 } as Record<string, number>;

// Centro de mando de ENQORA Informa: estado del enjambre, fuentes, misiones y cola editorial.
export default async function InformaMandoPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const sp = await searchParams;
  const supabase = await createClient();
  const [tabRes, misRes, fuenRes, itemsRes] = await Promise.all([
    supabase.rpc("informa_tablero"),
    supabase.from("info_missions").select("id, folio, departamento, tema, origen, estado, hallazgos, nuevas, error, created_at, ended_at").order("created_at", { ascending: false }).limit(60),
    supabase.from("info_sources").select("key, institucion, url, departamentos, frecuencia, ultima_revision, hallazgos, activa").order("institucion"),
    supabase.from("regulatory_updates").select("id, title, institution, etapa, alerta, departamento, requiere_revision, revision_prof_at, created_at, mission_id, fecha_consulta").neq("etapa", "archivado").order("created_at", { ascending: false }).limit(150),
  ]);
  if (tabRes.error && /informa_tablero|function/.test(tabRes.error.message)) {
    return (
      <div className="page"><header className="hero"><div className="hero-main"><span className="eyebrow">Centro de Mando</span><h1>ENQORA Informa</h1>
        <p className="hero-lead">Falta pegar en Supabase la migración 0058 (ENQORA Informa). Revisa Estado del sistema.</p></div></header></div>
    );
  }
  const t = (tabRes.data ?? {}) as Tablero;
  const misiones = (misRes.data ?? []) as Mision[];
  const fuentes = (fuenRes.data ?? []) as Fuente[];
  const items = (itemsRes.data ?? []) as Item[];
  const ahora = Date.now();
  const porVerificar = items.filter((i) => ["detectado", "en_investigacion", "pendiente_contraste"].includes(i.etapa));
  const enRevision = items.filter((i) => i.etapa === "revision_profesional" || (i.etapa === "verificado" && i.requiere_revision && !i.revision_prof_at));
  const porPublicar = items.filter((i) => i.etapa === "verificado" && (!i.requiere_revision || i.revision_prof_at));
  const publicadasTodas = items.filter((i) => ["publicado", "actualizado", "rectificado"].includes(i.etapa));
  const reverificar = publicadasTodas.filter((i) => (diasDesde(i.fecha_consulta) ?? 999) > DIAS_REVERIFICAR);
  const publicadas = publicadasTodas.slice(0, 12);
  const ultimaDe = (d: Departamento) => misiones.find((m) => m.departamento === d && m.estado !== "planificada");
  const enCola = (d: Departamento) => misiones.some((m) => m.departamento === d && m.estado === "planificada");

  const fila = (i: Item) => (
    <li key={i.id} className="inf-cola-item">
      <span className={`badge ${ETAPAS[i.etapa]?.tono === "ok" ? "badge-ok" : ETAPAS[i.etapa]?.tono === "muted" ? "badge-muted" : "badge-gold"}`}>{ETAPAS[i.etapa]?.texto ?? i.etapa}</span>
      {i.alerta !== "informativa" ? <span className="badge badge-gold">{i.alerta}</span> : null}
      {i.requiere_revision ? <span className="badge badge-muted">{i.revision_prof_at ? "Revisión profesional ✓" : "Requiere revisión profesional"}</span> : null}
      <Link href={`/mando/informa/${i.id}`}><b>{i.title}</b></Link>
      <small>{i.institution ?? "—"} · {i.departamento ? DEPARTAMENTOS[i.departamento as Departamento]?.titulo : "sin departamento"} · {fechaCL(i.created_at)}</small>
    </li>
  );

  return (
    <div className="page inf-mando">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando</span>
          <h1>ENQORA Informa</h1>
          <p className="hero-lead">El Director IA planifica misiones y el enjambre investiga fuentes oficiales. Los agentes solo proponen: el equipo verifica en la fuente, un profesional revisa lo de alto impacto y recién entonces se publica en <Link href="/informa">/informa</Link>.</p>
        </div>
        <div className="hero-actions">
          {supervisor ? (
            <form action={runWatchAction}>
              <input type="hidden" name="volver" value="informa" />
              <SubmitButton variant="gold" className="btn-inline" pendingText="El enjambre está investigando…">Ejecutar ronda del Director IA</SubmitButton>
            </form>
          ) : null}
          <Link href="/informa" className="btn btn-ghost btn-inline">Ver panel público</Link>
        </div>
      </header>

      {sp.aviso && (AVISOS[sp.aviso] || /^(vigilancia|barrido)_\d+$/.test(sp.aviso)) ? (
        <Notice kind="ok">{AVISOS[sp.aviso] ?? (sp.aviso.startsWith("barrido_")
          ? `Barrido en cola: ${sp.aviso.split("_")[1]} área(s). Cada ronda investiga dos; usa «Ejecutar ronda» para adelantarlas (cerca de un minuto cada una).`
          : `Ronda terminada: ${sp.aviso.split("_")[1]} hallazgo(s) nuevo(s) por verificar.`)}</Notice>
      ) : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="inf-kpis" aria-label="Indicadores">
        <div><b>{t.por_verificar ?? 0}</b><small>Por verificar</small></div>
        <div><b>{t.revision_profesional ?? 0}</b><small>En revisión profesional</small></div>
        <div><b>{t.por_publicar ?? 0}</b><small>Listas para publicar</small></div>
        <div className={reverificar.length ? "is-alerta" : undefined}><b>{t.publicadas ?? 0}</b><small>Publicadas{reverificar.length ? ` · ${reverificar.length} por reverificar` : ""}</small></div>
        <div className={t.alertas_criticas ? "is-alerta" : undefined}><b>{t.alertas_criticas ?? 0}</b><small>Alertas importantes o urgentes</small></div>
        <div><b>{t.fuentes_al_dia ?? 0}/{t.fuentes ?? 0}</b><small>Fuentes revisadas (35 días)</small></div>
        <div><b>{t.misiones_30d ?? 0}</b><small>Misiones en 30 días{t.fallidas_30d ? ` · ${t.fallidas_30d} fallidas` : ""}</small></div>
        <div><b>{t.hallazgos_30d ?? 0}</b><small>Hallazgos nuevos en 30 días</small></div>
      </section>

      <section className="card" aria-labelledby="enjambre-t">
        <h2 id="enjambre-t">Enjambre investigador</h2>
        <ul className="inf-agentes">
          {DEP_KEYS.map((d) => {
            const m = ultimaDe(d);
            return (
              <li key={d}>
                <b>{DEPARTAMENTOS[d].titulo}</b>
                <small>{DEPARTAMENTOS[d].monitorea}</small>
                <span className={`badge ${m ? ESTADO_MISION[m.estado] ?? "badge-muted" : "badge-muted"}`}>{m ? `${m.estado} · ${fechaCL(m.created_at)}` : "Sin misiones aún"}</span>
                {m ? <small>{m.folio} · {m.nuevas} nuevo(s) de {m.hallazgos}</small> : null}
                {enCola(d) ? <span className="badge badge-gold">En cola para la próxima ronda</span> : null}
              </li>
            );
          })}
        </ul>
        {supervisor ? (
          <form action={barridoAction} className="inline-form">
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Barrido completo: poner en cola las 8 áreas</SubmitButton>
          </form>
        ) : null}
        <p className="muted-line">«Sin misiones aún» = el área nunca se ha investigado. «terminada · 0 nuevos» = se investigó y no había novedades oficiales en los últimos 45 días. Cada ronda investiga dos departamentos: primero los pedidos por la supervisión y luego los que llevan más tiempo sin revisar. La ronda automática corre lunes, miércoles y viernes (09:00 de Chile en horario de verano); con «Ejecutar ronda» puedes adelantarla.</p>
      </section>

      <section className="card" id="cola" aria-labelledby="cola-t">
        <h2 id="cola-t">Cola editorial</h2>
        <h3 className="sub-title">Por verificar en la fuente ({porVerificar.length})</h3>
        {porVerificar.length ? <ul className="inf-cola">{porVerificar.map(fila)}</ul> : <p className="muted-line">Nada pendiente.</p>}
        <h3 className="sub-title">Esperan revisión profesional ({enRevision.length})</h3>
        {enRevision.length ? <ul className="inf-cola">{enRevision.map(fila)}</ul> : <p className="muted-line">Nada pendiente.</p>}
        <h3 className="sub-title">Listas para publicar ({porPublicar.length})</h3>
        {porPublicar.length ? <ul className="inf-cola">{porPublicar.map(fila)}</ul> : <p className="muted-line">Nada pendiente.</p>}
        <h3 className="sub-title">Para reverificar: más de {DIAS_REVERIFICAR} días sin revisar ({reverificar.length})</h3>
        {reverificar.length ? <ul className="inf-cola">{reverificar.map(fila)}</ul> : <p className="muted-line">Todo lo publicado se revisó en los últimos {DIAS_REVERIFICAR} días.</p>}
        <h3 className="sub-title">Publicadas recientes</h3>
        {publicadas.length ? <ul className="inf-cola">{publicadas.map(fila)}</ul> : <p className="muted-line">Aún no hay publicaciones.</p>}
      </section>

      <section className="card" id="misiones" aria-labelledby="mis-t">
        <h2 id="mis-t">Misiones de investigación</h2>
        {supervisor ? (
          <form action={pedirMisionAction} className="mini-form">
            <div className="inline-form">
              <select name="departamento" className="input input-sm" aria-label="Departamento" defaultValue="tributario">
                {DEP_KEYS.map((d) => <option key={d} value={d}>{DEPARTAMENTOS[d].titulo}</option>)}
              </select>
              <input name="tema" className="input" required minLength={8} maxLength={300} placeholder="Qué investigar (ej.: cambios al F29 de 2027)" aria-label="Tema" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Pedir investigación</SubmitButton>
            </div>
          </form>
        ) : null}
        {misiones.length ? (
          <table className="table inf-tabla">
            <thead><tr><th>Folio</th><th>Departamento</th><th>Origen</th><th>Estado</th><th>Hallazgos</th><th>Fecha</th></tr></thead>
            <tbody>
              {misiones.slice(0, 25).map((m) => (
                <tr key={m.id}>
                  <td className="mono">{m.folio}</td>
                  <td>{DEPARTAMENTOS[m.departamento]?.titulo}{m.tema ? <small className="muted-line"> · {m.tema}</small> : null}</td>
                  <td>{m.origen === "demanda" ? "Bajo demanda" : m.origen === "evento" ? "Por evento" : "Programada"}</td>
                  <td><span className={`badge ${ESTADO_MISION[m.estado] ?? "badge-muted"}`}>{m.estado}</span>{m.error ? <small className="muted-line"> {m.error}</small> : null}</td>
                  <td>{m.nuevas} / {m.hallazgos}</td>
                  <td>{fechaCL(m.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted-line">Aún no hay misiones. Ejecuta la primera ronda.</p>}
      </section>

      <section className="card" aria-labelledby="fuentes-t">
        <h2 id="fuentes-t">Fuentes oficiales monitoreadas ({fuentes.filter((f) => f.activa).length})</h2>
        <table className="table inf-tabla">
          <thead><tr><th>Institución</th><th>Departamentos</th><th>Frecuencia</th><th>Última revisión</th><th>Hallazgos</th></tr></thead>
          <tbody>
            {fuentes.map((f) => {
              const atrasada = !f.ultima_revision || ahora - new Date(f.ultima_revision).getTime() > (DIAS[f.frecuencia] ?? 35) * 86400000;
              return (
                <tr key={f.key}>
                  <td><a href={f.url} target="_blank" rel="noopener noreferrer">{f.institucion} ↗</a></td>
                  <td>{f.departamentos.map((d) => DEPARTAMENTOS[d as Departamento]?.titulo ?? d).join(", ")}</td>
                  <td>{f.frecuencia}</td>
                  <td><span className={`badge ${atrasada ? "badge-gold" : "badge-ok"}`}>{f.ultima_revision ? fechaCL(f.ultima_revision) : "Sin revisar"}</span></td>
                  <td>{f.hallazgos}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted-line">Solo fuentes primarias oficiales. La búsqueda del enjambre está restringida a dominios del Estado y servicios oficiales; el contenido de las páginas se trata como información, nunca como instrucciones.</p>
      </section>
    </div>
  );
}
