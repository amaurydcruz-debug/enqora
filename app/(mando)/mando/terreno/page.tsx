import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { crearEncargoAction, estadoGestorAction, liquidacionAction, tarifaTipoAction } from "@/app/actions/terreno";
import { InvitarGestor, RegistrarGestor } from "./gestores";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import {
  atrasado, clp, COLUMNAS, FIELD_STATUS, hora, INSTITUTIONS,
  AGENT_STATUS, type FieldAgent, type FieldTask, type FieldTaskType,
} from "@/lib/terreno";

export const metadata: Metadata = { title: "Despacho en terreno" };

const AVISOS: Record<string, string> = {
  tarifa: "Tarifa guardada.",
  liq_generada: "Liquidación generada en borrador.",
  liq_aprobar: "Liquidación aprobada. Se avisó al gestor.",
  liq_pagada: "Pago registrado.",
  liq_anular: "Liquidación anulada: sus encargos vuelven a quedar por liquidar.",
  gestor_estado: "Estado del gestor actualizado.",
};

type Payout = { id: string; gestor_id: string; period: string; tasks: number; total: number; status: string; paid_reference: string | null };
type Gestor = { id: string; nombre: string; comuna: string | null; cobertura: string[]; activos: number };

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

  // El gestor trabaja desde su propia app (0054).
  if (role === "field_agent") redirect("/gestor");

  // ---------- Vista del equipo ----------
  const admin = role === "enqora_admin";
  const supervisor = isSupervisorRole(role);
  const [{ data: tData }, { data: tyData }, { data: gData }, { data: pData }, { data: teamData }] = await Promise.all([
    supabase.from("field_tasks").select("*").not("status", "in", "(verificado,cancelado)").order("created_at", { ascending: true }).limit(300),
    supabase.from("field_task_types").select("*").order("code"),
    supervisor ? supabase.rpc("gestores_disponibles") : Promise.resolve({ data: [] }),
    admin ? supabase.from("field_payouts").select("id, gestor_id, period, tasks, total, status, paid_reference").order("created_at", { ascending: false }).limit(20) : Promise.resolve({ data: [] }),
    supervisor ? supabase.from("field_agents").select("*").order("full_name") : Promise.resolve({ data: [] }),
  ]);
  const registro = (teamData ?? []) as FieldAgent[];
  // Para liquidar: todos los gestores con cuenta, estén o no activos hoy.
  const todosGestores = registro.filter((g) => g.user_id).map((g) => ({ id: g.user_id as string, nombre: g.full_name }));
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
        <section className="card" id="gestores">
          <h2>Gestores de terreno ({registro.filter((g) => g.status === "activo").length} activos)</h2>
          <p className="muted-line">
            Solo un gestor registrado aquí y activo recibe encargos. Regístralo, envíale su enlace personal (por WhatsApp o correo) y, al abrirlo,
            instala la app ENQORA Gestor, crea su cuenta con segundo factor y acepta el tratamiento de sus datos. No ve nada del Centro de Mando.
          </p>
          {registro.length ? (
            <ul className="ref-list" role="list">
              {registro.map((g) => (
                <li key={g.id}>
                  <span className="ref-main">
                    <b>{g.full_name}</b>
                    <small className="muted-line">
                      {g.email}{g.phone ? ` · ${g.phone}` : ""}{g.comuna ? ` · vive en ${g.comuna}` : ""}{g.coverage.length ? ` · cubre ${g.coverage.join(", ")}` : ""}
                      {g.status === "activo" ? ` · ${gestores.find((x) => x.id === g.user_id)?.activos ?? 0} encargo(s) en curso` : ""}
                    </small>
                  </span>
                  <span className="inline-form">
                    <span className={`status status-${AGENT_STATUS[g.status].tone}`}>{AGENT_STATUS[g.status].label}</span>
                    {g.status === "invitado" ? <InvitarGestor id={g.id} nombre={g.full_name} /> : null}
                    {g.status === "activo" ? (
                      <form action={estadoGestorAction}><input type="hidden" name="agent_id" value={g.id} /><input type="hidden" name="estado" value="suspendido" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Suspender</SubmitButton></form>
                    ) : null}
                    {g.status === "suspendido" && g.user_id ? (
                      <form action={estadoGestorAction}><input type="hidden" name="agent_id" value={g.id} /><input type="hidden" name="estado" value="activo" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Reactivar</SubmitButton></form>
                    ) : null}
                    {g.status !== "retirado" ? (
                      <form action={estadoGestorAction}><input type="hidden" name="agent_id" value={g.id} /><input type="hidden" name="estado" value="retirado" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Retirar</SubmitButton></form>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : <p className="muted-line">Aún no hay gestores registrados.</p>}
          <RegistrarGestor />
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
