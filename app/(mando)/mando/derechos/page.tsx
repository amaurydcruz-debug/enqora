import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { answerDataRightAction } from "@/app/actions/security";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { DERECHO_ESTADO, DERECHOS } from "@/lib/legal-versions";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Derechos sobre datos personales" };

type Req = { id: string; user_id: string; tipo: string; detalle: string | null; estado: string; vence: string; prorrogada: boolean; respuesta: string | null; created_at: string };
const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
const fecha = (d: string) => d.split("-").reverse().join("-");

// Solicitudes de acceso, rectificación, supresión, oposición, portabilidad y bloqueo (Ley 21.719, desde el 01-12-2026).
// Plazo: 30 días corridos, prorrogable una vez por 30 más (por confirmar con el estudio jurídico).
export default async function DerechosPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("data_rights_requests").select("*").order("created_at", { ascending: false }).limit(200);
  const lista = (data ?? []) as Req[];
  const abiertas = lista.filter((r) => r.estado === "recibida" || r.estado === "en_curso");
  const h = hoy();

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Datos personales</span>
          <h1>Derechos sobre datos personales</h1>
          <p className="hero-lead">
            Lo que los clientes piden sobre sus datos: acceso, rectificación, supresión, oposición, portabilidad y bloqueo. Plazo legal: 30 días
            corridos desde la solicitud, prorrogable una vez por 30 más. La respuesta llega al cliente en su cuenta.
          </p>
        </div>
      </header>
      {sp.aviso ? <Notice kind="ok">Solicitud actualizada y cliente avisado.</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}
      <div className="kpis kpis-mando">
        <div className={`kpi${abiertas.length ? " kpi-gold" : ""}`}><span>Abiertas</span><b>{abiertas.length}</b></div>
        <div className={`kpi${abiertas.some((r) => r.vence < h) ? " kpi-gold" : ""}`}><span>Vencidas</span><b>{abiertas.filter((r) => r.vence < h).length}</b></div>
        <div className="kpi"><span>Respondidas</span><b>{lista.filter((r) => r.estado === "respondida").length}</b></div>
      </div>
      {!lista.length ? <section className="card"><p className="muted-line">No hay solicitudes.</p></section> : null}
      {lista.map((r) => (
        <section key={r.id} className="card">
          <div className="auth-head">
            <h2 className="card-title">{DERECHOS[r.tipo]?.label ?? r.tipo}</h2>
            <span className={`status status-${DERECHO_ESTADO[r.estado]?.tone ?? "muted"}`}>{DERECHO_ESTADO[r.estado]?.label ?? r.estado}</span>
          </div>
          <p className="muted-line">
            Pedida el {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(r.created_at))}
            {" · "}plazo hasta el {fecha(r.vence)}{r.prorrogada ? " (prorrogado)" : ""}
            {(r.estado === "recibida" || r.estado === "en_curso") && r.vence < h ? <b className="status status-risk"> · vencida</b> : null}
            {" · "}cuenta <span className="mono">{r.user_id.slice(0, 8)}</span>
          </p>
          {r.detalle ? <p style={{ whiteSpace: "pre-wrap" }}>{r.detalle}</p> : null}
          {r.respuesta ? <p className="muted-line">Respuesta: {r.respuesta}</p> : null}
          {r.estado === "recibida" || r.estado === "en_curso" ? (
            <form action={answerDataRightAction} className="catalog-form">
              <input type="hidden" name="id" value={r.id} />
              <div className="form-grid">
                <div className="field">
                  <label htmlFor={`e-${r.id}`}>Nuevo estado</label>
                  <select id={`e-${r.id}`} name="estado" className="input" defaultValue={r.estado === "recibida" ? "en_curso" : "respondida"}>
                    <option value="en_curso">En curso</option>
                    <option value="respondida">Respondida</option>
                    <option value="rechazada">Resuelta (no procede)</option>
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor={`r-${r.id}`}>Respuesta al cliente (obligatoria al responder; mínimo 20 caracteres)</label>
                <textarea id={`r-${r.id}`} name="respuesta" className="input" rows={3} maxLength={4000} />
              </div>
              {!r.prorrogada ? (
                <label className="check-inline"><input type="checkbox" name="prorrogar" /> <span>Prorrogar el plazo 30 días (una sola vez; se avisa al cliente)</span></label>
              ) : null}
              <SubmitButton pendingText="Guardando…">Guardar y avisar al cliente</SubmitButton>
            </form>
          ) : null}
        </section>
      ))}
    </div>
  );
}
