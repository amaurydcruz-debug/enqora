import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AGENTES, DIRECTOR, ESTADOS_AGENTE, TRANSVERSALES } from "@/lib/cora/agentes";
import { resumenCatalogo } from "@/lib/cora/director";
import { ESTADOS_CONEXION, FUENTES, NIVELES } from "@/lib/cora/fuentes";
import { OBLIGACIONES_LABORALES } from "@/lib/cora/normativa-laboral";
import { nombreSeccion } from "@/lib/cora/secciones";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { PRESETS } from "@/lib/cora/inspector";
import { InspectorFuentes } from "./inspector";

export const metadata: Metadata = { title: "CORA · Fuentes y agentes" };
export const maxDuration = 120;

const fmt = (d: string | null) => (d ? d.split("-").reverse().join("-") : "Sin verificar");

// Catálogo Maestro de Fuentes y equipo de agentes de CORA (Etapa 1). Solo lectura: se mantiene en el código
// (lib/cora) para que cada cambio quede revisado en un PR.
export default async function CoraSourcesPage() {
  const role = await myStaffRole();
  if (!role) notFound();
  const r = resumenCatalogo();

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · CORA</span>
          <h1>Fuentes y agentes de CORA</h1>
          <p className="hero-lead">
            Catálogo Maestro de Fuentes y equipo de investigación de CORA. Una fuente solo figura como conectada o verificada si se
            comprobó; lo demás queda «por investigar». Alcance actual: Chile.
          </p>
        </div>
      </header>

      <div className="kpis kpis-mando">
        <div className="kpi"><span>Fuentes en el catálogo</span><b>{r.fuentes}</b></div>
        <div className="kpi"><span>Conectadas, normativas o curadas</span><b>{r.conectadas}</b></div>
        <div className="kpi"><span>Agentes especializados</span><b>{r.agentes}</b></div>
        <div className="kpi"><span>Agentes con resultados hoy</span><b>{r.activos}</b></div>
      </div>

      <section className="card">
        <h2>Catálogo Maestro de Fuentes</h2>
        <p className="panel-lead">Niveles: {Object.entries(NIVELES).map(([k, v]) => `${k} = ${v}`).join(" · ")}.</p>
        <div className="cora-table-wrap">
          <table className="cora-table">
            <thead><tr><th>Fuente</th><th>Nivel</th><th>Estado</th><th>Método y campos</th><th>Restricciones</th><th>Frecuencia</th><th>Verificada</th></tr></thead>
            <tbody>
              {FUENTES.map((f) => (
                <tr key={f.id}>
                  <td><b>{f.organismo}</b><br />{f.url ? <a href={f.url} target="_blank" rel="noopener noreferrer">{f.nombre}</a> : f.nombre}<br /><small className="muted-line">{f.secciones.map(nombreSeccion).join(", ")}</small></td>
                  <td>{f.nivel}</td>
                  <td><span className={`status status-${ESTADOS_CONEXION[f.estado].tone}`}>{ESTADOS_CONEXION[f.estado].label}</span>{f.nota ? <><br /><small className="muted-line">{f.nota}</small></> : null}</td>
                  <td>{f.metodo}<br /><small className="muted-line">{f.campos.join(", ")}</small></td>
                  <td>{f.restricciones}</td>
                  <td>{f.frecuencia}</td>
                  <td>{fmt(f.verificada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>{DIRECTOR.nombre}</h2>
        <ul className="report-check">{DIRECTOR.responsabilidades.map((x) => <li key={x}>{x}</li>)}</ul>
        <div className="cora-table-wrap">
          <table className="cora-table">
            <thead><tr><th>Agente</th><th>Especialidad</th><th>Secciones</th><th>Fuentes</th><th>Responsabilidades</th><th>Estado</th></tr></thead>
            <tbody>
              {AGENTES.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.numero} · {a.nombre}</b></td>
                  <td>{a.especialidad}</td>
                  <td>{a.secciones.map(nombreSeccion).join(", ")}</td>
                  <td>{a.fuentes.length ? a.fuentes.map((id) => FUENTES.find((f) => f.id === id)?.organismo ?? id).filter((v, i, arr) => arr.indexOf(v) === i).join(", ") : "Autoevaluación"}</td>
                  <td>{a.responsabilidades.join(" · ")}</td>
                  <td><span className={`status status-${a.estado === "activo" ? "ok" : a.estado === "parcial" ? "gold" : "muted"}`}>{ESTADOS_AGENTE[a.estado]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3>Agentes transversales</h3>
        <ul className="report-check">{TRANSVERSALES.map((t) => <li key={t.id}><b>{t.nombre}:</b> <span>{t.funcion}</span></li>)}</ul>
      </section>

      <section className="card">
        <h2>Normativa laboral, previsional y de seguridad verificada</h2>
        <p className="panel-lead">El número de trabajadores del SII es un indicador orientativo: CORA informa obligaciones «potencialmente aplicables», nunca incumplimientos.</p>
        <div className="cora-table-wrap">
          <table className="cora-table">
            <thead><tr><th>Obligación</th><th>Condición</th><th>Fundamento</th><th>Acredita</th><th>Verificada</th></tr></thead>
            <tbody>
              {OBLIGACIONES_LABORALES.map((o) => (
                <tr key={o.id}>
                  <td><b>{o.nombre}</b><br /><small className="muted-line">{nombreSeccion(o.seccion)}</small></td>
                  <td>{o.condicion}</td>
                  <td><a href={o.fuente.url} target="_blank" rel="noopener noreferrer">{o.fundamento}</a></td>
                  <td>{o.acredita}</td>
                  <td>{fmt(o.fuente.verificada)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {isSupervisorRole(role) ? <InspectorFuentes presets={PRESETS.map((p) => ({ id: p.id, nombre: p.nombre }))} /> : null}
    </div>
  );
}
