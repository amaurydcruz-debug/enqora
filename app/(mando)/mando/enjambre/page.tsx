import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { catalogoHabilidades, computadorActivo } from "@/lib/computador";
import { HABILIDADES_ANTHROPIC, HABILIDADES_POR_AGENTE } from "@/lib/habilidades";
import { AGENTS, type AgentKey } from "@/lib/mirror";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { PanelSincronizar } from "./panel";

export const metadata: Metadata = { title: "Enjambre: computador y habilidades" };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Estado = { computadores_activos?: number; por_agente?: Record<string, number>; ejecuciones_30d?: number; habilidades?: { nombre: string; version: string | null; huella: string; actualizado: string }[] };

// Centro de Mando → Enjambre: el computador en la nube de cada agente y sus habilidades.
export default async function EnjambrePage() {
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  const { data } = await (await createClient()).rpc("enjambre_estado");
  const e = (data as Estado | null) ?? {};
  const subidas = new Map((e.habilidades ?? []).map((h) => [h.nombre, h]));
  const catalogo = catalogoHabilidades();
  const pendientes = catalogo.filter((c) => subidas.get(c.nombre)?.huella !== c.huella).length;
  const on = computadorActivo();

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Enjambre</span>
          <h1>Computador y habilidades de los agentes</h1>
          <p className="hero-lead">
            Cada agente trabaja en su propio computador Linux en la nube, uno por caso: Python, terminal y archivos, con los documentos del
            expediente, sus habilidades y lectura de páginas oficiales. No tiene acceso a internet ni a portales con clave. Lo que crea queda en el
            expediente como borrador interno, y todo sigue pasando por revisión humana.
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Computador</h2>
        <ul className="ref-list" role="list">
          <li>
            <span className="ref-main">
              <b>{on ? "Encendido" : "Apagado"}</b>
              <small className="muted-line">
                {on
                  ? "Contenedor de ejecución de código de la API de Claude (1 CPU, 5 GiB de memoria, 5 GiB de disco), vigente 30 días por caso y agente. Sin costo adicional cuando se usa junto a la búsqueda web; si no, 1.550 horas gratis al mes por organización y luego US$0,05 por hora."
                  : "Falta ANTHROPIC_API_KEY en Vercel, o ENQORA_COMPUTADOR=off. Los agentes trabajan sin computador."}
              </small>
            </span>
            <span className={`status status-${on ? "ok" : "muted"}`}>{on ? "Activo" : "Inactivo"}</span>
          </li>
          <li>
            <span className="ref-main">
              <b>{e.computadores_activos ?? 0} computadores vigentes</b>
              <small className="muted-line">
                {Object.entries(e.por_agente ?? {}).map(([k, n]) => `${AGENTS[k as AgentKey]?.name ?? k}: ${n}`).join(" · ") || "Aún no hay: se crean en la primera ejecución de cada agente en un caso."}
                {e.ejecuciones_30d ? ` · ${e.ejecuciones_30d} ejecuciones en 30 días` : ""}
              </small>
            </span>
          </li>
        </ul>
        <p className="muted-line">Para probar sin tocar clientes, usa la <Link href="/mando/pruebas">Sala de pruebas</Link>.</p>
      </section>

      <section className="card">
        <h2>Habilidades de ENQORA</h2>
        <p className="muted-line">
          Método, programas y plantillas que el agente carga en su computador. {pendientes ? `${pendientes} por subir o actualizar.` : "Todas al día."}
        </p>
        <ul className="ref-list" role="list">
          {catalogo.map((c) => {
            const s = subidas.get(c.nombre);
            const al_dia = s?.huella === c.huella;
            return (
              <li key={c.nombre}>
                <span className="ref-main">
                  <b>{c.nombre}</b>
                  <small className="muted-line">{c.descripcion} · {c.archivos} archivo(s){s ? ` · subida el ${new Date(s.actualizado).toLocaleDateString("es-CL")}` : ""}</small>
                </span>
                <span className={`status status-${al_dia ? "ok" : "warn"}`}>{al_dia ? "Al día" : s ? "Cambió" : "Sin subir"}</span>
              </li>
            );
          })}
        </ul>
        {isSupervisorRole(role) ? <PanelSincronizar /> : <p className="muted-line">Supervisión o administración las sube.</p>}
        <p className="muted-line">Además, todos los agentes cargan las habilidades de Anthropic: {HABILIDADES_ANTHROPIC.join(", ")} (Excel, Word y PDF).</p>
      </section>

      <section className="card">
        <h2>Habilidades por agente</h2>
        <ul className="ref-list" role="list">
          {(Object.keys(HABILIDADES_POR_AGENTE) as AgentKey[]).map((a) => (
            <li key={a}>
              <span className="ref-main">
                <b>{AGENTS[a]?.name ?? a}</b>
                <small className="muted-line">{HABILIDADES_POR_AGENTE[a].join(" · ")} · calculadoras: IVA, honorarios, multa, interés, finiquito, impuesto único</small>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
