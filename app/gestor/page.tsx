import Link from "next/link";
import type { Metadata } from "next";
import { gestorEncargoAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { InstallApp } from "@/components/install-app";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { createClient } from "@/lib/supabase/server";
import { clp, FIELD_STATUS, hora, type FieldAgent, type MiEncargo } from "@/lib/terreno";

export const metadata: Metadata = { title: "Mis encargos" };

const AVISOS: Record<string, string> = {
  bienvenido: "¡Listo! Ya eres gestor de ENQORA. Aquí verás los encargos que te asignen.",
  g_rechazar: "Devolviste el encargo. Vuelve a la bandeja de ENQORA, sin ningún efecto para ti.",
};

type Payout = { id: string; period: string; tasks: number; total: number; status: string };

// Panel del gestor: sus encargos activos (o «sin actividad») y sus liquidaciones.
export default async function GestorHome({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: me } = await supabase.from("field_agents").select("*").maybeSingle();
  const agent = me as FieldAgent | null;

  if (!agent || agent.status !== "activo") {
    return (
      <section className="card">
        <h1 className="card-title">{agent?.status === "suspendido" ? "Tu acceso está suspendido" : "Aún no estás activo como gestor"}</h1>
        <p className="muted-line">
          {agent?.status === "suspendido"
            ? "Comunícate con ENQORA para revisar tu situación."
            : "Para recibir encargos, ENQORA debe registrarte primero y enviarte tu enlace personal. Ábrelo desde tu teléfono para activarte."}
        </p>
      </section>
    );
  }

  const [{ data }, { data: pData }] = await Promise.all([
    supabase.rpc("mis_encargos_terreno"),
    supabase.from("field_payouts").select("id, period, tasks, total, status").order("period", { ascending: false }).limit(6),
  ]);
  const mios = (Array.isArray(data) ? data : []) as MiEncargo[];
  const liqs = (pData ?? []) as Payout[];
  const nuevos = mios.filter((e) => e.estado === "asignado");
  const enCurso = mios.filter((e) => e.estado !== "asignado");

  const tarjeta = (e: MiEncargo) => (
    <li key={e.id} className="card terreno-card">
      <div className="terreno-head">
        <span className={`status status-${FIELD_STATUS[e.estado]?.tone ?? "muted"}`}>{FIELD_STATUS[e.estado]?.label ?? e.estado}</span>
        <b className="mono">{e.folio}</b>
        <span className="terreno-pago">{clp(e.pago)}</span>
      </div>
      <h2 className="card-title">{e.tipo}</h2>
      <p><b>{e.oficina}</b><br />{e.direccion}{e.comuna ? `, ${e.comuna}` : ""}</p>
      <p className="muted-line">
        {e.vence ? `Vence ${e.vence.split("-").reverse().join("-")}` : "Sin fecha límite"}
        {e.eta ? ` · llegada estimada ${hora(e.eta)}` : ""}
        {e.archivos ? ` · ${e.archivos} documento(s) ${e.descarga_autorizada ? "listos para descargar" : "esperan autorización de CORA"}` : ""}
      </p>
      <Link href={`/gestor/encargo/${e.id}`} className="btn btn-ghost btn-inline btn-sm">Ver instrucciones y documentos</Link>
      {e.estado === "asignado" ? (
        <div className="terreno-actions">
          <form action={gestorEncargoAction} className="inline-form">
            <input type="hidden" name="task_id" value={e.id} />
            <input type="hidden" name="accion" value="aceptar" />
            <select name="minutos" className="input input-sm" defaultValue="30" aria-label="Llego en">
              {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>Llego en {m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
            </select>
            <SubmitButton className="btn-inline btn-sm" pendingText="…">Aceptar</SubmitButton>
          </form>
          <form action={gestorEncargoAction} className="inline-form">
            <input type="hidden" name="task_id" value={e.id} />
            <input type="hidden" name="accion" value="rechazar" />
            <input name="nota" className="input input-sm" maxLength={300} placeholder="Motivo (opcional)" aria-label="Motivo" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Rechazar</SubmitButton>
          </form>
        </div>
      ) : null}
    </li>
  );

  return (
    <div className="gestor-page">
      <h1 className="gestor-title">Hola, {agent.full_name.split(" ")[0]}</h1>
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}
      <InstallApp />

      <h2 className="gestor-sub">Nuevos para aceptar ({nuevos.length})</h2>
      {nuevos.length ? <ul className="terreno-list" role="list">{nuevos.map(tarjeta)}</ul>
        : <p className="muted-line gestor-empty">Sin actividad pendiente. Te avisaremos cuando ENQORA te asigne un encargo.</p>}

      <h2 className="gestor-sub">En curso ({enCurso.length})</h2>
      {enCurso.length ? <ul className="terreno-list" role="list">{enCurso.map(tarjeta)}</ul> : <p className="muted-line gestor-empty">Nada en curso.</p>}

      <section className="card">
        <h2 className="card-title">Mis liquidaciones</h2>
        <p className="muted-line">Solo cuentan los encargos verificados por ENQORA.</p>
        {liqs.length ? (
          <ul className="ref-list" role="list">
            {liqs.map((l) => (
              <li key={l.id}><span className="ref-main"><b>{l.period.slice(5, 7)}-{l.period.slice(0, 4)}</b><small className="muted-line">{l.tasks} encargo(s) · {clp(l.total)}</small></span>
                <span className={`status status-${l.status === "pagada" ? "ok" : l.status === "aprobada" ? "gold" : "muted"}`}>{l.status}</span></li>
            ))}
          </ul>
        ) : <p className="muted-line">Aún no tienes liquidaciones.</p>}
      </section>
      <p className="muted-line">Nunca firmes, pagues ni aceptes convenios por un cliente. ENQORA nunca te pedirá claves de clientes.</p>
    </div>
  );
}
