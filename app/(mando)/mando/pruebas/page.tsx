import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prepararSalaPruebasAction } from "@/app/actions/pruebas";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sala de pruebas" };
export const dynamic = "force-dynamic";

type Estado = {
  empresa?: string; nombre?: string; rut?: string; trabajadores?: number; gastos?: number;
  casos?: { id: string; folio: string; titulo: string; estado: string; modulo: string; ejecuciones: number; creado: string }[];
};

const MODULOS: Record<string, string> = { contabilidad: "Tributario y contable", legal: "Legal y laboral", gestion: "Financiero", formaliza: "Estratégico" };
const periodoActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit" }).format(new Date());

// Centro de Mando → Sala de pruebas: empresa FICTICIA para poner a trabajar a los agentes y probar las herramientas
// del equipo sin tocar clientes reales.
export default async function SalaPruebasPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  const sp = await searchParams;
  const supervisor = isSupervisorRole(role);
  const { data } = await (await createClient()).rpc("sala_pruebas_estado");
  const e = (data as Estado | null) ?? {};
  const operar = (destino: string) => `/mando/operar?empresa=${e.empresa}&destino=${encodeURIComponent(destino)}`;

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Pruebas</span>
          <h1>Sala de pruebas</h1>
          <p className="hero-lead">
            Una empresa ficticia para poner a trabajar a los agentes y probar las herramientas del equipo sin tocar clientes reales.
            Nombre, RUT, trabajadores, gastos y casos son inventados. La empresa no tiene clientes, así que ningún aviso sale de aquí.
          </p>
        </div>
      </header>

      {sp.aviso?.startsWith("preparada_") ? <Notice kind="ok">{`Sala lista: ${sp.aviso.split("_")[1]} casos de prueba nuevos.`}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="card">
        <h2>Empresa ficticia</h2>
        {e.empresa ? (
          <p>
            <b>{e.nombre}</b> · RUT {e.rut} · {e.trabajadores ?? 0} trabajadores · {e.gastos ?? 0} gastos{" "}
            <span className="badge badge-muted">PRUEBA</span>
          </p>
        ) : <p className="muted-line">Aún no existe. {supervisor ? "Prepárala con el botón." : "La prepara supervisión o administración."}</p>}
        {supervisor ? (
          <form action={prepararSalaPruebasAction} className="inline-form">
            <SubmitButton className="btn-inline btn-sm" pendingText="Preparando…">{e.empresa ? "Agregar 4 casos de prueba nuevos" : "Preparar sala de pruebas"}</SubmitButton>
          </form>
        ) : null}
      </section>

      {e.empresa ? (
        <>
          <section className="card">
            <h2>Casos de prueba para los agentes</h2>
            <p className="muted-line">Abre un caso y usa el panel de agentes como en un caso real. Cada caso admite hasta 20 ejecuciones al día; si se agotan, agrega casos nuevos.</p>
            <ul className="ref-list" role="list">
              {(e.casos ?? []).map((c) => (
                <li key={c.id}>
                  <span className="ref-main">
                    <Link href={`/casos/${c.id}`}><b>{c.titulo}</b></Link>
                    <small className="muted-line">{c.folio} · {MODULOS[c.modulo] ?? c.modulo} · {c.estado.replace(/_/g, " ")} · {c.ejecuciones} ejecución(es) de agentes</small>
                  </span>
                  <Link href={`/casos/${c.id}`} className="btn btn-ghost btn-inline btn-sm">Abrir</Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Probar herramientas del equipo con la empresa ficticia</h2>
            <div className="panel-actions" style={{ flexWrap: "wrap" }}>
              <a href={operar("/remuneraciones")} className="btn btn-ghost btn-inline btn-sm">Remuneraciones</a>
              <a href={operar("/laboral")} className="btn btn-ghost btn-inline btn-sm">Laboral</a>
              <a href={operar("/laboral/reglamento")} className="btn btn-ghost btn-inline btn-sm">Reglamento interno</a>
              <a href={operar(`/contabilidad/${periodoActual()}`)} className="btn btn-ghost btn-inline btn-sm">Cierre del mes (alertas de gastos)</a>
              <Link href="/mando/buscador" className="btn btn-ghost btn-inline btn-sm">Buscador legal</Link>
              <Link href="/mando/laboratorio" className="btn btn-ghost btn-inline btn-sm">Laboratorio de IA</Link>
            </div>
            <p className="muted-line">
              Al operar, la franja superior indica la empresa; usa «Dejar de operar» al terminar. Los gastos de prueba traen a propósito un
              duplicado, un monto atípico, un gasto sin documento y una factura sin IVA, para ver las alertas del cierre.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
