import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { empresaOperadaId } from "@/lib/operando";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Accesos a empresas" };
export const dynamic = "force-dynamic";

type Acceso = { fecha: string; accion: string; destino: string | null; empresa: string; empresa_nombre: string | null; prueba: boolean; persona: string; propio: boolean };

const ACCION: Record<string, string> = { "equipo.operar.entrar": "Entró a operar", "equipo.operar.salir": "Dejó de operar", "equipo.operar_empresa": "Entró a operar" };
const PANTALLA: Record<string, string> = {
  "/remuneraciones": "Remuneraciones", "/remuneraciones/anual": "Remuneraciones · resumen anual", "/laboral": "Ley Karin",
  "/laboral/reglamento": "Reglamento interno", "/datos-personales": "Datos personales",
};
const pantalla = (d: string | null) => (d ? PANTALLA[d] ?? (d.startsWith("/contabilidad") ? `Contabilidad ${d.split("/")[2] ?? ""}`.trim() : d) : "—");

// Centro de Mando → Accesos a empresas: cada vez que alguien del equipo entró a operar una empresa, adónde y cuándo
// salió. «Operar» usa la sesión del propio equipo, nunca la del cliente.
export default async function AccesosPage() {
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  const sb = await createClient();
  const [{ data, error }, actual] = await Promise.all([sb.rpc("accesos_operacion", { p_limite: 200 }), empresaOperadaId()]);
  const accesos = (data as Acceso[] | null) ?? [];
  const fmt = new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" });

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Trazabilidad</span>
          <h1>Accesos a empresas</h1>
          <p className="hero-lead">
            Cuándo alguien del equipo entró a operar una empresa, a qué pantalla y cuándo salió. Operar no es entrar a la sesión del cliente: es tu
            propia sesión del equipo, con los permisos del servicio, y todo queda registrado. {isSupervisorRole(role) ? "Ves los accesos de todo el equipo." : "Ves tus propios accesos."}
          </p>
        </div>
      </header>

      {actual ? (
        <section className="card">
          <p>Ahora mismo estás operando una empresa. <Link href="/mando/operar?salir=1" className="btn btn-gold btn-inline btn-sm">Dejar de operar</Link></p>
        </section>
      ) : null}

      <section className="card">
        <h2>Últimos accesos</h2>
        {error ? <p className="muted-line">Para ver el detalle de pantallas y salidas, aplica la migración 0099.</p> : null}
        {accesos.length ? (
          <ul className="ref-list" role="list">
            {accesos.map((a, i) => (
              <li key={i}>
                <span className="ref-main">
                  <b>{ACCION[a.accion] ?? a.accion}{a.accion !== "equipo.operar.salir" ? ` · ${pantalla(a.destino)}` : ""}</b>
                  <small className="muted-line">
                    {a.empresa_nombre ?? "Empresa"}{a.prueba ? " (ficticia de prueba)" : ""} · {fmt.format(new Date(a.fecha))} · {a.propio ? "tú" : a.persona}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin accesos registrados.</p>}
      </section>
    </div>
  );
}
