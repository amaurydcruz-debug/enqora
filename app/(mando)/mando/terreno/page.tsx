import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { crearEncargoAction, gestorEncargoAction, liquidacionAction, tarifaTipoAction } from "@/app/actions/terreno";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import {
  atrasado, clp, COLUMNAS, FIELD_STATUS, hora, INSTITUTIONS,
  type FieldTask, type FieldTaskType, type MiEncargo,
} from "@/lib/terreno";

export const metadata: Metadata = { title: "Despacho en terreno" };

const AVISOS: Record<string, string> = {
  tarifa: "Tarifa guardada.",
  liq_generada: "Liquidación generada en borrador.",
  liq_aprobar: "Liquidación aprobada. Se avisó al gestor.",
  liq_pagada: "Pago registrado.",
  liq_anular: "Liquidación anulada: sus encargos vuelven a quedar por liquidar.",
  g_rechazar: "Devolviste el encargo. Vuelve a la bandeja de despacho, sin ningún efecto para ti.",
};

type Payout = { id: string; gestor_id: string; period: string; tasks: number; total: number; status: string; paid_reference: string | null };
type Gestor = { id: string; nombre: string; hasta: string | null; activos: number };

// Centro de Mando → Despacho en terreno.
// · Gestor de terreno: ve solo sus encargos activos, con el pago, la oficina y los documentos que lleva.
// · Resto del equipo: tablero de despacho (preparar → abogado → despachar → en terreno → verificar).
// · Administrador: tarifas por tipo de encargo y liquidaciones de los gestores.
export default async function TerrenoPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const aviso = sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null;
  const error = messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null;

  // ---------- Vista del gestor ----------
  if (role === "field_agent") {
    const [{ data }, { data: liqData }] = await Promise.all([
      supabase.rpc("mis_encargos_terreno"),
      supabase.from("field_payouts").select("id, gestor_id, period, tasks, total, status, paid_reference").order("period", { ascending: false }).limit(6),
    ]);
    const mios = (Array.isArray(data) ? data : []) as MiEncargo[];
    const liqs = (liqData ?? []) as Payout[];
    return (
      <div className="page narrow">
        <header className="hero">
          <div className="hero-main">
            <span className="eyebrow">Gestor de terreno</span>
            <h1>Mis encargos</h1>
            <p className="hero-lead">
              Cada encargo muestra el pago antes de aceptarlo. Puedes rechazarlo sin ningún efecto. Al aceptar, indica en cuánto llegas;
              el cliente ve tu avance. Nunca firmes ni pagues por un cliente.
            </p>
          </div>
        </header>
        {aviso}{error}
        {mios.length ? (
          <ul className="terreno-list" role="list">
            {mios.map((e) => (
              <li key={e.id} className="card terreno-card">
                <div className="terreno-head">
                  <span className={`status status-${FIELD_STATUS[e.estado]?.tone ?? "muted"}`}>{FIELD_STATUS[e.estado]?.label ?? e.estado}</span>
                  <b className="mono">{e.folio}</b>
                  <span className="terreno-pago">{clp(e.pago)}</span>
                </div>
                <h2 className="card-title">{e.tipo}</h2>
                <p><b>{e.oficina}</b><br />{e.direccion}{e.comuna ? `, ${e.comuna}` : ""}</p>
                <p className="muted-line">Para {e.empresa}{e.vence ? ` · vence ${e.vence.split("-").reverse().join("-")}` : ""}{e.eta ? ` · llegada estimada ${hora(e.eta)}` : ""}</p>
                {e.instrucciones ? <p className="pre">{e.instrucciones}</p> : null}
                {e.guia ? <p className="muted-line">{e.guia}</p> : null}
                <Link href={`/mando/terreno/${e.id}`} className="btn-inline btn-sm btn btn-ghost">Ver documentos y detalle</Link>
                {e.estado === "asignado" ? (
                  <div className="terreno-actions">
                    <form action={gestorEncargoAction} className="inline-form">
                      <input type="hidden" name="task_id" value={e.id} />
                      <input type="hidden" name="accion" value="aceptar" />
                      <select name="minutos" className="input input-sm" defaultValue="30" aria-label="Llego en">
                        {[15, 30, 45, 60, 90, 120, 180].map((m) => <option key={m} value={m}>Llego en {m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
                      </select>
                      <SubmitButton className="btn-inline btn-sm" pendingText="…">Aceptar y salir</SubmitButton>
                    </form>
                    <form action={gestorEncargoAction} className="inline-form">
                      <input type="hidden" name="task_id" value={e.id} />
                      <input type="hidden" name="accion" value="rechazar" />
                      <input name="nota" className="input input-sm" maxLength={300} placeholder="Motivo (opcional)" aria-label="Motivo" />
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Rechazar</SubmitButton>
                    </form>
                  </div>
                ) : e.estado === "en_camino" ? (
                  <div className="terreno-actions">
                    <form action={gestorEncargoAction}>
                      <input type="hidden" name="task_id" value={e.id} />
                      <input type="hidden" name="accion" value="llegue" />
                      <SubmitButton className="btn-inline" pendingText="…">Llegué a la oficina</SubmitButton>
                    </form>
                    <form action={gestorEncargoAction} className="inline-form">
                      <input type="hidden" name="task_id" value={e.id} />
                      <input type="hidden" name="accion" value="eta" />
                      <select name="minutos" className="input input-sm" defaultValue="15" aria-label="Nueva hora">
                        {[10, 15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>Llego en {m} min</option>)}
                      </select>
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Actualizar hora</SubmitButton>
                    </form>
                  </div>
                ) : (
                  <p className="muted-line">Cuando termines, abre el detalle para registrar el comprobante.</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <section className="card"><p className="muted-line">No tienes encargos activos. Te avisaremos cuando te asignen uno.</p></section>
        )}
        <section className="card">
          <h2>Mis liquidaciones</h2>
          {liqs.length ? (
            <ul className="ref-list" role="list">
              {liqs.map((l) => (
                <li key={l.id}><span className="ref-main"><b>{l.period.slice(5, 7)}-{l.period.slice(0, 4)}</b><small className="muted-line">{l.tasks} encargo(s) verificados · {clp(l.total)}</small></span>
                  <span className={`status status-${l.status === "pagada" ? "ok" : l.status === "aprobada" ? "gold" : "muted"}`}>{l.status}</span></li>
              ))}
            </ul>
          ) : <p className="muted-line">Aún no tienes liquidaciones. Solo cuentan los encargos verificados por el equipo.</p>}
        </section>
      </div>
    );
  }

  // ---------- Vista del equipo ----------
  const admin = role === "enqora_admin";
  const supervisor = isSupervisorRole(role);
  const [{ data: tData }, { data: tyData }, { data: gData }, { data: pData }, { data: teamData }] = await Promise.all([
    supabase.from("field_tasks").select("*").not("status", "in", "(verificado,cancelado)").order("created_at", { ascending: true }).limit(300),
    supabase.from("field_task_types").select("*").order("code"),
    supervisor ? supabase.rpc("gestores_disponibles") : Promise.resolve({ data: [] }),
    admin ? supabase.from("field_payouts").select("id, gestor_id, period, tasks, total, status, paid_reference").order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    admin ? supabase.rpc("team_overview") : Promise.resolve({ data: [] }),
  ]);
  // Para liquidar: todos los gestores, tengan o no acceso hoy.
  const todosGestores = ((Array.isArray(teamData) ? teamData : []) as { user_id: string; email: string | null; full_name: string | null; role: string }[])
    .filter((m) => m.role === "field_agent").map((m) => ({ id: m.user_id, nombre: m.full_name || m.email || "Gestor" }));
  const tasks = (tData ?? []) as FieldTask[];
  const types = (tyData ?? []) as FieldTaskType[];
  const tipo = new Map(types.map((t) => [t.code, t]));
  const gestores = (Array.isArray(gData) ? gData : []) as Gestor[];
  const payouts = (pData ?? []) as Payout[];
  const now = Date.now();
  const caseIds = [...new Set(tasks.map((t) => t.case_id))];
  const { data: cRows } = caseIds.length ? await supabase.from("cases").select("id, folio").in("id", caseIds) : { data: [] };
  const folioCaso = new Map(((cRows ?? []) as { id: string; folio: string }[]).map((c) => [c.id, c.folio]));
  const sinTarifa = types.filter((t) => t.active && t.gestor_fee == null);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Operación</span>
          <h1>Despacho en terreno</h1>
          <p className="hero-lead">
            Trámites que exigen ir a una oficina. ENQORA prepara el paquete, el abogado lo revisa cuando corresponde, se despacha a un gestor
            con acceso del día y otra persona verifica el comprobante. Solo lo verificado se informa como hecho al cliente y cuenta para la liquidación.
          </p>
        </div>
      </header>
      {aviso}{error}
      {sinTarifa.length ? (
        <Notice kind="info">
          {sinTarifa.length} tipo(s) de encargo sin tarifa para el gestor: no se pueden despachar hasta que el Administrador la defina en «Tarifas».
        </Notice>
      ) : null}

      <div className="terreno-board">
        {COLUMNAS.map((col) => {
          const items = tasks.filter((t) => col.estados.includes(t.status));
          return (
            <section key={col.key} className="card terreno-col" aria-label={col.titulo}>
              <h2 className="card-title">{col.titulo} <small>({items.length})</small></h2>
              {items.length ? (
                <ul className="terreno-list" role="list">
                  {items.map((t) => (
                    <li key={t.id}>
                      <Link href={`/mando/terreno/${t.id}`} className="terreno-mini">
                        <span className="mono">{t.folio}</span>
                        <b>{tipo.get(t.type_code)?.name ?? t.type_code}</b>
                        <small>{t.office_name} · caso {folioCaso.get(t.case_id) ?? "—"}</small>
                        <span className={`status status-${atrasado(t, now) ? "risk" : FIELD_STATUS[t.status].tone}`}>
                          {atrasado(t, now) ? `Atrasado · llegada estimada ${hora(t.eta)}` : t.status === "en_camino" ? `En camino · llega ${hora(t.eta)}` : FIELD_STATUS[t.status].label}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="muted-line">Nada aquí.</p>}
            </section>
          );
        })}
      </div>

      <section className="card" id="nuevo">
        <h2>Nuevo encargo</h2>
        <p className="muted-line">Se crea en preparación, con la lista de documentos del tipo elegido. Para despacharlo, el caso necesita la autorización vigente del cliente y, si el tipo lo exige, un mandato vigente para la institución.</p>
        <form action={crearEncargoAction} className="mini-form">
          <div className="inline-form">
            <input name="folio" className="input input-sm" required maxLength={20} placeholder="Folio del caso (ENQ-2026-00015)" aria-label="Folio del caso" />
            <select name="tipo" className="input input-sm" required aria-label="Tipo de encargo">
              {types.filter((t) => t.active).map((t) => <option key={t.code} value={t.code}>{t.name} · {INSTITUTIONS[t.institution] ?? t.institution}</option>)}
            </select>
            <input name="vence" type="date" className="input input-sm" aria-label="Fecha límite" />
          </div>
          <input name="oficina" className="input" required minLength={3} maxLength={160} placeholder="Oficina (p. ej., Notaría Pérez, 12.ª Notaría de Santiago)" aria-label="Oficina" />
          <div className="inline-form">
            <input name="direccion" className="input" required minLength={5} maxLength={240} placeholder="Dirección" aria-label="Dirección" />
            <input name="comuna" className="input input-sm" maxLength={80} placeholder="Comuna" aria-label="Comuna" />
          </div>
          <textarea name="instrucciones" className="input" rows={3} maxLength={2000} placeholder="Instrucciones para el gestor (horario, a quién preguntar, qué retirar)" aria-label="Instrucciones" />
          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Creando…">Crear encargo</SubmitButton>
        </form>
      </section>

      {supervisor ? (
        <section className="card">
          <h2>Gestores con acceso hoy ({gestores.length})</h2>
          {gestores.length ? (
            <ul className="ref-list" role="list">
              {gestores.map((g) => <li key={g.id}><span className="ref-main"><b>{g.nombre}</b><small className="muted-line">{g.activos} encargo(s) en curso · acceso hasta {hora(g.hasta)}</small></span></li>)}
            </ul>
          ) : <p className="muted-line">No hay gestores con acceso hoy. Créales un pase del día en Equipo (rol «Gestor presencial»).</p>}
        </section>
      ) : null}

      <section className="card" id="tarifas">
        <h2>Tipos de encargo y tarifas del gestor</h2>
        <p className="muted-line">
          La tarifa es lo que se paga al gestor por cada encargo <b>verificado</b>, y él la ve antes de aceptar. La define el dueño; el sistema no la sugiere.
          El esquema de contrato y pago debe validarlo el estudio jurídico (Código del Trabajo o Ley 21.431) antes de usarlo con personas reales.
        </p>
        <div className="table-scroll">
          <table className="table">
            <thead><tr><th>Tipo</th><th>Institución</th><th>Abogado</th><th>Mandato</th><th>Tarifa del gestor</th></tr></thead>
            <tbody>
              {types.map((t) => (
                <tr key={t.code}>
                  <td><b>{t.name}</b><br /><small className="muted-line">{t.code}{t.source_url ? <> · <a href={t.source_url} target="_blank" rel="noopener noreferrer">fuente ↗</a></> : null}</small></td>
                  <td>{INSTITUTIONS[t.institution] ?? t.institution}</td>
                  <td>{t.requires_lawyer ? "Sí" : "No"}</td>
                  <td>{t.requires_mandate ? "Sí" : "No"}</td>
                  <td>
                    {admin ? (
                      <form action={tarifaTipoAction} className="inline-form">
                        <input type="hidden" name="code" value={t.code} />
                        <input name="tarifa" className="input input-sm" inputMode="numeric" defaultValue={t.gestor_fee ?? ""} placeholder="Sin definir" aria-label={`Tarifa ${t.name}`} />
                        <label className="check-inline"><input type="checkbox" name="activo" defaultChecked={t.active} /> Activo</label>
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton>
                      </form>
                    ) : clp(t.gestor_fee)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {admin ? (
        <section className="card" id="liquidaciones">
          <h2>Liquidaciones de gestores</h2>
          <p className="muted-line">Suma los encargos verificados del mes. ENQORA no paga sola: apruebas la liquidación (con tu segundo factor) y registras el pago cuando lo hagas, con su referencia.</p>
          <form action={liquidacionAction} className="inline-form">
            <input type="hidden" name="accion" value="generar" />
            <select name="gestor_id" className="input input-sm" required aria-label="Gestor">
              {todosGestores.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
            <input name="mes" type="month" className="input input-sm" required aria-label="Mes" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Generar liquidación</SubmitButton>
          </form>
          {payouts.length ? (
            <ul className="ref-list" role="list">
              {payouts.map((p) => (
                <li key={p.id}>
                  <span className="ref-main"><b>{todosGestores.find((g) => g.id === p.gestor_id)?.nombre ?? "Gestor"} · {p.period.slice(5, 7)}-{p.period.slice(0, 4)}</b>
                    <small className="muted-line">{p.tasks} encargo(s) · {clp(p.total)}{p.paid_reference ? ` · pago ${p.paid_reference}` : ""}</small></span>
                  <span className="inline-form">
                    <span className={`status status-${p.status === "pagada" ? "ok" : p.status === "aprobada" ? "gold" : "muted"}`}>{p.status}</span>
                    {p.status === "borrador" ? (
                      <form action={liquidacionAction}><input type="hidden" name="payout_id" value={p.id} /><input type="hidden" name="accion" value="aprobar" />
                        <SubmitButton className="btn-inline btn-sm" pendingText="…">Aprobar</SubmitButton></form>
                    ) : null}
                    {p.status === "aprobada" ? (
                      <form action={liquidacionAction} className="inline-form"><input type="hidden" name="payout_id" value={p.id} /><input type="hidden" name="accion" value="pagada" />
                        <input name="referencia" className="input input-sm" required minLength={3} maxLength={120} placeholder="N° de transferencia y boleta" aria-label="Referencia del pago" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Registrar pago</SubmitButton></form>
                    ) : null}
                    {p.status === "borrador" || p.status === "aprobada" ? (
                      <form action={liquidacionAction}><input type="hidden" name="payout_id" value={p.id} /><input type="hidden" name="accion" value="anular" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular</SubmitButton></form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted-line">Aún no hay liquidaciones.</p>}
        </section>
      ) : null}
    </div>
  );
}
