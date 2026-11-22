"use client";

import Link from "next/link";
import { useState } from "react";
import { CATEGORIAS_OP, type CategoriaOp, type Oportunidad } from "@/lib/oportunidades";

type Empresa = { nombre: string; rut: string; giro: string | null; regimen: string | null; trabajadores: number };

// Inicio del cliente: datos de su empresa y tarjetas de oportunidades que se abren al tocarlas.
export function OportunidadesEmpresa({ empresa, items, al }: { empresa: Empresa; items: Oportunidad[]; al: string }) {
  const cats = (Object.keys(CATEGORIAS_OP) as CategoriaOp[]).filter((c) => items.some((i) => i.categoria === c));
  const [abierta, setAbierta] = useState<CategoriaOp | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const beneficios = items.filter((i) => i.categoria !== "al_dia" && i.categoria !== "marcas").length;
  const lista = abierta ? items.filter((i) => i.categoria === abierta) : [];

  return (
    <section className="ps-card op" aria-labelledby="op-t">
      <div className="op-empresa">
        <div>
          <span className="eyebrow">Tu empresa</span>
          <h2 id="op-t">{empresa.nombre}</h2>
          <p className="muted-line">RUT {empresa.rut}{empresa.giro ? ` · ${empresa.giro}` : ""}{empresa.regimen ? ` · ${empresa.regimen}` : ""}{empresa.trabajadores ? ` · ${empresa.trabajadores} trabajador(es)` : ""}</p>
        </div>
      </div>
      <p className="op-aviso">
        <b>Encontramos {beneficios} beneficio(s) que podrían aplicar a tu empresa.</b> Revísalos: algunos tienen plazo y otros pueden bajar lo que pagas. Así tu empresa queda optimizada al 100%.
      </p>
      <div className="op-tarjetas" role="tablist" aria-label="Oportunidades para tu empresa">
        {cats.map((c) => {
          const n = items.filter((i) => i.categoria === c).length;
          const urgente = items.some((i) => i.categoria === c && i.resumen.includes("Plazo:"));
          return (
            <button key={c} type="button" role="tab" aria-selected={abierta === c} aria-controls="op-panel"
              className={`op-tarjeta op-${c}${abierta === c ? " is-abierta" : ""}`} onClick={() => { setAbierta(abierta === c ? null : c); setVista(null); }}>
              <span className="op-n">{n}</span>
              <b>{CATEGORIAS_OP[c].titulo}</b>
              <small>{CATEGORIAS_OP[c].gancho}</small>
              {urgente ? <span className="op-plazo">Con plazo</span> : null}
            </button>
          );
        })}
      </div>
      {abierta ? (
        <div id="op-panel" role="tabpanel" className="op-panel">
          {lista.map((o) => (
            <article key={o.id} className={`op-item${vista === o.id ? " is-abierto" : ""}`}>
              <button type="button" className="op-item-cab" aria-expanded={vista === o.id} onClick={() => setVista(vista === o.id ? null : o.id)}>
                <b>{o.titulo}</b>
                <span aria-hidden="true">{vista === o.id ? "−" : "+"}</span>
              </button>
              {vista === o.id ? (
                <div className="op-item-cuerpo">
                  <p>{o.resumen}</p>
                  <ul>{o.puntos.map((p) => <li key={p}>{p}</li>)}</ul>
                  <div className="op-item-pie">
                    <Link href={o.cta.href} className="btn btn-gold btn-inline btn-sm">{o.cta.texto}</Link>
                    <a href={o.fuente.url} target={o.fuente.url.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="ps-link">Fuente: {o.fuente.texto}</a>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
      <p className="muted-line op-nota">Información general según la ley vigente al {al.split("-").reverse().join("-")}. No es asesoría de inversión: una persona del equipo ENQORA revisa tu caso antes de cualquier decisión.</p>
    </section>
  );
}
