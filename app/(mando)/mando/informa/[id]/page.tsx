import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { editarInformaAction, reverificarAction, revisionProfesionalAction } from "@/app/actions/informa";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { CATEGORIES } from "@/lib/discovery";
import { messageForCode } from "@/lib/db-errors";
import { ALERTAS, DEP_KEYS, DEPARTAMENTOS, DIAS_REVERIFICAR, diasDesde, ETAPAS, FICHA_CAMPOS, fechaCL, revisadoHace, TIPO_CONTENIDO } from "@/lib/informa";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ficha editorial · ENQORA Informa" };

type U = {
  id: string; title: string; summary: string; institution: string | null; kind: string; source_url: string; published_on: string | null;
  impact: string | null; etapa: string; alerta: string; tipo_contenido: string; confianza: string; departamento: string | null; categorias: string[];
  fecha_consulta: string | null; vigente_desde: string | null; vigente_hasta: string | null; ficha: Record<string, string>; requiere_revision: boolean;
  revision_prof_at: string | null; revision_prof_nota: string | null; version: number; review_note: string | null; created_at: string; detected_by: string;
};
type V = { version: number; title: string; summary: string; motivo: string | null; created_at: string };

const AVISOS: Record<string, string> = { ficha_guardada: "Ficha guardada.", revision_profesional: "Revisión profesional registrada.", reverificada: "Fecha de revisión actualizada: la publicación sigue vigente según la fuente." };
const SIGUIENTES: Record<string, { etapa: string; texto: string }[]> = {
  detectado: [{ etapa: "en_investigacion", texto: "Tomar para investigar" }, { etapa: "verificado", texto: "Marcar verificado en la fuente" }],
  en_investigacion: [{ etapa: "pendiente_contraste", texto: "Pasar a contraste" }, { etapa: "verificado", texto: "Marcar verificado en la fuente" }],
  pendiente_contraste: [{ etapa: "verificado", texto: "Marcar verificado en la fuente" }],
  verificado: [{ etapa: "revision_profesional", texto: "Enviar a revisión profesional" }, { etapa: "publicado", texto: "Publicar" }],
  revision_profesional: [{ etapa: "publicado", texto: "Publicar" }],
  publicado: [{ etapa: "actualizado", texto: "Publicar actualización" }, { etapa: "rectificado", texto: "Publicar rectificación" }],
  actualizado: [{ etapa: "actualizado", texto: "Publicar actualización" }, { etapa: "rectificado", texto: "Publicar rectificación" }],
  rectificado: [{ etapa: "actualizado", texto: "Publicar actualización" }],
};

export default async function FichaInformaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const profesional = ["enqora_admin", "lawyer_pro", "accountant_pro"].includes(role);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: vers }] = await Promise.all([
    supabase.from("regulatory_updates").select("*").eq("id", id).maybeSingle(),
    supabase.from("info_versions").select("version, title, summary, motivo, created_at").eq("update_id", id).order("version", { ascending: false }),
  ]);
  if (!data) notFound();
  const u = data as U;
  const versiones = (vers ?? []) as V[];
  const publicada = ["publicado", "actualizado", "rectificado"].includes(u.etapa);
  const avisoEtapa = sp.aviso?.startsWith("etapa_") ? `Etapa: ${ETAPAS[sp.aviso.slice(6)]?.texto ?? sp.aviso.slice(6)}.` : null;

  return (
    <div className="page inf-mando">
      <Link href="/mando/informa#cola" className="back-link"><span aria-hidden="true">←</span> ENQORA Informa</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Ficha editorial · versión {u.version}</span>
          <h1>{u.title}</h1>
          <p className="hero-lead">
            <span className={`badge ${ETAPAS[u.etapa]?.tono === "ok" ? "badge-ok" : "badge-gold"}`}>{ETAPAS[u.etapa]?.texto ?? u.etapa}</span>{" "}
            {u.requiere_revision ? <span className="badge badge-muted">{u.revision_prof_at ? `Revisión profesional ✓ ${fechaCL(u.revision_prof_at)}` : "Alto impacto: requiere revisión profesional"}</span> : null}{" "}
            <a href={u.source_url} target="_blank" rel="noopener noreferrer">Revisar la fuente oficial ↗</a>
          </p>
        </div>
        {publicada ? <div className="hero-actions"><Link href={`/informa/${u.id}`} className="btn btn-ghost btn-inline">Ver publicación</Link></div> : null}
      </header>

      {sp.aviso && (AVISOS[sp.aviso] || avisoEtapa) ? <Notice kind="ok">{AVISOS[sp.aviso] ?? avisoEtapa}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {publicada && supervisor ? (
        <section className={`card${(diasDesde(u.fecha_consulta) ?? 999) > DIAS_REVERIFICAR ? " inf-reverificar" : ""}`}>
          <h2>Vigencia de la información</h2>
          <p className="muted-line">{revisadoHace(u.fecha_consulta)}{(diasDesde(u.fecha_consulta) ?? 999) > DIAS_REVERIFICAR ? ` · lleva más de ${DIAS_REVERIFICAR} días sin revisarse: abre la fuente y confirma que sigue igual, o corrige y publica una actualización.` : "."}</p>
          <form action={reverificarAction} className="inline-form">
            <input type="hidden" name="id" value={u.id} />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Revisé la fuente hoy: sigue vigente</SubmitButton>
          </form>
        </section>
      ) : null}

      {u.requiere_revision && profesional ? (
        <section className="card">
          <h2>Revisión profesional</h2>
          {u.revision_prof_at ? <p className="muted-line">Revisado el {fechaCL(u.revision_prof_at)}: {u.revision_prof_nota}</p> : null}
          <form action={revisionProfesionalAction} className="mini-form">
            <input type="hidden" name="id" value={u.id} />
            <textarea name="nota" className="input" rows={2} required minLength={10} maxLength={1000} placeholder="Qué revisaste y contra qué documento oficial (obligatorio)" aria-label="Nota de revisión profesional" />
            <SubmitButton variant="gold" className="btn-inline btn-sm" pendingText="…">{u.revision_prof_at ? "Actualizar revisión" : "Registrar revisión profesional"}</SubmitButton>
          </form>
        </section>
      ) : null}

      {supervisor ? (
        <form action={editarInformaAction} className="card mini-form inf-editor">
          <input type="hidden" name="id" value={u.id} />
          <h2>Contenido</h2>
          <label className="field"><span>Titular</span><input name="titulo" className="input" defaultValue={u.title} required minLength={5} maxLength={200} /></label>
          <label className="field"><span>Resumen ejecutivo (versión informativa)</span><textarea name="resumen" className="input" rows={3} defaultValue={u.summary} required minLength={10} maxLength={2000} /></label>
          {FICHA_CAMPOS.map((f) => (
            <label key={f.key} className="field"><span>{f.titulo}</span><textarea name={`ficha_${f.key}`} className="input" rows={2} maxLength={3000} defaultValue={u.ficha?.[f.key] ?? ""} /></label>
          ))}
          <label className="field"><span>Versión técnica (artículos, antecedentes, referencias)</span><textarea name="ficha_tecnica" className="input" rows={4} maxLength={3000} defaultValue={u.ficha?.tecnica ?? ""} /></label>
          <label className="field"><span>Documentos oficiales (enlaces o números)</span><textarea name="ficha_documentos" className="input" rows={2} maxLength={3000} defaultValue={u.ficha?.documentos ?? ""} /></label>

          <label className="field"><span>Imagen de la publicación (opcional; solo desde la fuente oficial, https)</span><input name="ficha_imagen" type="url" className="input" defaultValue={u.ficha?.imagen ?? ""} pattern="https://.+" placeholder="https://www.sii.cl/…/imagen.jpg" /></label>

          <h2>Fuente, fechas y clasificación</h2>
          <div className="inline-form">
            <label className="field"><span>Institución</span><input name="institucion" className="input" defaultValue={u.institution ?? ""} maxLength={120} /></label>
            <label className="field"><span>Fuente oficial (https)</span><input name="url" type="url" className="input" defaultValue={u.source_url} pattern="https://.+" /></label>
          </div>
          <div className="inline-form">
            <label className="field"><span>Publicado</span><input name="publicado" type="date" className="input input-sm" defaultValue={u.published_on ?? ""} /></label>
            <label className="field"><span>Consultado por ENQORA</span><input name="fecha_consulta" type="date" className="input input-sm" defaultValue={u.fecha_consulta ?? ""} /></label>
            <label className="field"><span>Vigente desde</span><input name="vigente_desde" type="date" className="input input-sm" defaultValue={u.vigente_desde ?? ""} /></label>
            <label className="field"><span>Vigente hasta</span><input name="vigente_hasta" type="date" className="input input-sm" defaultValue={u.vigente_hasta ?? ""} /></label>
          </div>
          <div className="inline-form">
            <label className="field"><span>Departamento</span><select name="departamento" className="input input-sm" defaultValue={u.departamento ?? ""}><option value="">—</option>{DEP_KEYS.map((d) => <option key={d} value={d}>{DEPARTAMENTOS[d].titulo}</option>)}</select></label>
            <label className="field"><span>Alerta</span><select name="alerta" className="input input-sm" defaultValue={u.alerta}>{Object.entries(ALERTAS).map(([k, a]) => <option key={k} value={k}>{a.texto}</option>)}</select></label>
            <label className="field"><span>Tipo de contenido</span><select name="tipo_contenido" className="input input-sm" defaultValue={u.tipo_contenido}>{Object.entries(TIPO_CONTENIDO).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label className="field"><span>Confianza</span><select name="confianza" className="input input-sm" defaultValue={u.confianza}><option value="alta">Alta</option><option value="media">Media</option><option value="baja">Baja</option></select></label>
          </div>
          <fieldset>
            <legend>Servicios ENQORA relacionados</legend>
            <div className="chip-row">
              {CATEGORIES.map((c) => <label key={c.key} className="chip"><input type="checkbox" name="categorias" value={c.key} defaultChecked={u.categorias.includes(c.key)} /> {c.title}</label>)}
            </div>
          </fieldset>
          {publicada ? <label className="field"><span>Motivo del cambio (obligatorio si corriges algo publicado; queda en el historial público)</span><input name="motivo" className="input" maxLength={500} /></label> : null}

          <div className="panel-actions">
            <SubmitButton variant="ghost" className="btn-inline" pendingText="…">Guardar ficha</SubmitButton>
            {(SIGUIENTES[u.etapa] ?? []).map((s) => (
              <button key={s.etapa} type="submit" name="etapa" value={s.etapa} className="btn btn-gold btn-inline">{s.texto}</button>
            ))}
            {u.etapa !== "archivado" ? <button type="submit" name="etapa" value="archivado" className="btn btn-ghost btn-inline">Archivar</button> : null}
          </div>
          <p className="muted-line">Publicar exige fuente oficial y fecha de consulta; si es de alto impacto (normas tributarias, legales o laborales, o alerta importante/urgente), también la revisión de un abogado o contador del equipo.</p>
        </form>
      ) : (
        <section className="card"><p className="pre">{u.summary}</p><p className="muted-line">Solo la supervisión edita y publica.</p></section>
      )}

      {versiones.length ? (
        <section className="card">
          <h2>Historial de versiones</h2>
          <ol className="inf-cola">{versiones.map((v) => <li key={v.version} className="inf-cola-item"><b>Versión {v.version}</b><small>{fechaCL(v.created_at)}{v.motivo ? ` · ${v.motivo}` : ""}</small><span>{v.title}</span></li>)}</ol>
        </section>
      ) : null}
    </div>
  );
}
