import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addUpdateAction, reviewUpdateAction, runWatchAction } from "@/app/actions/learning";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { MODULES } from "@/lib/cases";
import { messageForCode } from "@/lib/db-errors";
import { RUBROS } from "@/lib/rubros";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { WATCH_GROUPS, groupsForThisRun } from "@/lib/watch";

export const metadata: Metadata = { title: "Vigilancia normativa" };
export const maxDuration = 60;

type Update = {
  id: string; title: string; summary: string; institution: string | null; kind: string; source_url: string;
  published_on: string | null; impact: string | null; modules: string[]; rubros: string[]; status: string;
  client_visible: boolean; detected_by: string; review_note: string | null; created_at: string;
};

const KINDS: Record<string, string> = {
  ley: "Ley", reglamento: "Reglamento", circular: "Circular", resolucion: "Resolución", beneficio: "Beneficio", tramite: "Trámite", plazo: "Plazo", otro: "Otro",
};
const STATUS: Record<string, [string, string]> = {
  detectada: ["badge-gold", "Por verificar"], verificada: ["badge-ok", "Verificada"], aplicada: ["badge-ok", "Aplicada a la base ENQORA"], descartada: ["badge-muted", "Descartada"],
};
const fmt = (d: string | null) => (d ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(d)) : "—");

function Avisos({ aviso }: { aviso?: string }) {
  if (!aviso) return null;
  const m = aviso.match(/^vigilancia_(\d+)$/);
  const n = aviso.match(/^novedad_avisada_(\d+)$/);
  const text = m ? `Vigilancia completada: ${m[1]} novedad${m[1] === "1" ? "" : "es"} nueva${m[1] === "1" ? "" : "s"} por verificar.`
    : n ? `Novedad verificada. Se avisó a ${n[1]} empresa${n[1] === "1" ? "" : "s"} del rubro.`
    : ({ novedad_revisada: "Novedad revisada.", novedad_agregada: "Novedad registrada para verificación." } as Record<string, string>)[aviso];
  return text ? <Notice kind="ok">{text}</Notice> : null;
}

// Centro de Mando → Vigilancia normativa. El agente propone; la supervisión verifica en la fuente,
// define a qué servicios y rubros aplica y si los clientes la ven.
export default async function WatchPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("regulatory_updates").select("*").order("created_at", { ascending: false }).limit(100);
  const updates = (data ?? []) as Update[];
  const pending = updates.filter((u) => u.status === "detectada");
  const done = updates.filter((u) => u.status !== "detectada");
  const next = groupsForThisRun().map((g) => g.titulo).join(" y ");

  const card = (u: Update) => (
    <li key={u.id} className="watch-item">
      <div className="watch-head">
        <span className={`badge ${STATUS[u.status]?.[0] ?? "badge-muted"}`}>{STATUS[u.status]?.[1] ?? u.status}</span>
        <span className="badge badge-muted">{KINDS[u.kind] ?? u.kind}</span>
        {u.client_visible ? <span className="badge badge-ok">Visible para clientes</span> : null}
        <small>{u.institution ?? ""} · publicada {fmt(u.published_on)} · {u.detected_by === "vigilancia" ? "detectada por el agente" : "registrada por el equipo"} el {fmt(u.created_at)}</small>
      </div>
      <b>{u.title}</b>
      <p className="pre">{u.summary}</p>
      {u.impact ? <p className="muted-line">Impacto: {u.impact}</p> : null}
      <a href={u.source_url} target="_blank" rel="noopener noreferrer" className="watch-src">Revisar la fuente oficial ↗</a>
      {u.review_note ? <p className="muted-line">Nota de revisión: {u.review_note}</p> : null}
      {supervisor && u.status !== "descartada" ? (
        <form action={reviewUpdateAction} className="watch-review">
          <input type="hidden" name="update_id" value={u.id} />
          <fieldset>
            <legend>Servicios a los que aplica</legend>
            <div className="chip-row">
              {Object.entries(MODULES).map(([k, m]) => (
                <label key={k} className="chip"><input type="checkbox" name="modulos" value={k} defaultChecked={u.modules.includes(k)} /> {m.name.replace("ENQORA ", "")}</label>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend>Rubros (se avisa a las empresas de estos rubros si es visible para clientes)</legend>
            <div className="chip-row">
              {RUBROS.map((r) => (
                <label key={r.key} className="chip"><input type="checkbox" name="rubros" value={r.key} defaultChecked={u.rubros.includes(r.key)} /> {r.nombre}</label>
              ))}
            </div>
          </fieldset>
          <textarea name="note" className="input" rows={2} maxLength={1000} placeholder="Qué verificaste en la fuente (obligatorio para descartar)" aria-label="Nota de revisión" />
          <div className="comment-actions">
            <label className="check-inline"><input type="checkbox" name="client_visible" defaultChecked={u.client_visible} /> Mostrar a clientes</label>
            <div className="inline-form">
              <select name="status" className="input input-sm" defaultValue={u.status === "detectada" ? "verificada" : u.status} aria-label="Decisión">
                <option value="verificada">Verificada</option>
                <option value="aplicada">Aplicada a la base ENQORA</option>
                <option value="descartada">Descartar</option>
              </select>
              <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
            </div>
          </div>
        </form>
      ) : null}
    </li>
  );

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando</span>
          <h1>Vigilancia normativa</h1>
          <p className="hero-lead">Un agente revisa cada semana fuentes oficiales (SII, BCN, DT, INAPI, Sercotec, CORFO…) y propone novedades. Nada llega a los agentes ni a los clientes sin verificación de la supervisión.</p>
        </div>
        <div className="hero-actions">
          <Link href="/mando" className="btn btn-ghost btn-inline">Volver al Centro de Mando</Link>
        </div>
      </header>

      <Avisos aviso={sp.aviso} />
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="card">
        <h2>Cómo funciona</h2>
        <ul className="watch-groups">
          {WATCH_GROUPS.map((g) => <li key={g.key}><b>{g.titulo}</b><small>{g.consulta}</small></li>)}
        </ul>
        <p className="muted-line">Cada semana se revisan dos grupos, rotando. Esta semana: {next}. Las novedades verificadas se entregan a los agentes en cada caso del servicio correspondiente; las marcadas «aplicadas» ya se incorporaron a la base normativa del sistema.</p>
        {supervisor ? (
          <form action={runWatchAction} className="panel-actions">
            <SubmitButton variant="ghost" className="btn-inline" pendingText="Revisando fuentes oficiales…">Ejecutar vigilancia ahora</SubmitButton>
            <span className="muted-line">Puede tardar hasta un minuto.</span>
          </form>
        ) : null}
      </section>

      <section className="card" id="por-verificar">
        <h2>Por verificar ({pending.length})</h2>
        {pending.length ? <ul className="watch-list">{pending.map(card)}</ul> : <p className="muted-line">No hay novedades pendientes.</p>}
      </section>

      <section className="card">
        <h2>Registrar una novedad</h2>
        <form action={addUpdateAction} className="mini-form">
          <input name="titulo" className="input" required minLength={5} maxLength={200} placeholder="Título" aria-label="Título" />
          <textarea name="resumen" className="input" required minLength={10} maxLength={2000} rows={3} placeholder="Qué cambia, para quién y desde cuándo" aria-label="Resumen" />
          <div className="inline-form">
            <input name="institucion" className="input input-sm" maxLength={120} placeholder="Institución" aria-label="Institución" />
            <select name="tipo" className="input input-sm" defaultValue="circular" aria-label="Tipo">
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input name="publicado" type="date" className="input input-sm" aria-label="Fecha de publicación" />
          </div>
          <input name="url" type="url" className="input" required pattern="https://.+" placeholder="https://… (fuente oficial)" aria-label="Fuente oficial" />
          <input name="impacto" className="input" maxLength={1000} placeholder="Impacto para los clientes de ENQORA (opcional)" aria-label="Impacto" />
          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Registrar para verificación</SubmitButton>
        </form>
      </section>

      <section className="card">
        <h2>Historial ({done.length})</h2>
        {done.length ? <ul className="watch-list">{done.map(card)}</ul> : <p className="muted-line">Aún no hay novedades revisadas.</p>}
      </section>
    </div>
  );
}
