"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { CATEGORIES } from "@/lib/discovery";
import { ALERTAS, ETAPAS, FICHA_CAMPOS, fechaCL, type Publicacion } from "@/lib/informa";

// Fotografía ilustrativa de cada área (la misma de la galería de servicios).
const FOTO: Record<string, string> = {
  contabilidad: "/entrada/servicios/contabilidad.webp", constitucion: "/entrada/servicios/constitucion.webp",
  formalizacion: "/entrada/servicios/formalizacion.webp", marcas: "/entrada/servicios/marcas.webp",
  tributario: "/entrada/servicios/tributario.webp", gestion: "/entrada/servicios/gestion.webp",
  profesionales: "/entrada/servicios/profesionales.webp", crecimiento: "/entrada/servicios/crecimiento.webp",
  enterprise: "/entrada/servicios/enterprise.webp", trabajador: "/entrada/problema.webp", empleador: "/entrada/pyme.webp",
};
const VISTO = "enqora_informa_visto";
const nombreCat = (k?: string) => CATEGORIES.find((c) => c.key === k)?.title ?? "ENQORA Informa";
const leerVisto = () => { try { return localStorage.getItem(VISTO) ?? ""; } catch { return ""; } };
const guardarVisto = (v: string) => { try { localStorage.setItem(VISTO, v); } catch { /* sin almacenamiento: no pasa nada */ } };

// ENQORA Informa como ventana inteligente: una pestaña de vidrio en el costado que se despliega en una galería
// horizontal. Solo muestra lo investigado por el enjambre y publicado por el equipo (fuente, revisión y verificación).
export function InformaFlotante() {
  const [pubs, setPubs] = useState<Publicacion[] | null>(null);
  const [abierta, setAbierta] = useState(false);
  const [sel, setSel] = useState<Publicacion | null>(null);
  const [nuevo, setNuevo] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const pestana = useRef<HTMLButtonElement>(null);
  const reciente = pubs?.reduce((m, p) => ((p.verificado_at ?? "") > m ? p.verificado_at ?? "" : m), "") ?? "";

  useEffect(() => {
    let vivo = true;
    fetch("/api/informa").then((r) => r.json()).then((d: { publicaciones?: Publicacion[] }) => {
      if (vivo) setPubs(Array.isArray(d.publicaciones) ? d.publicaciones : []);
    }).catch(() => { if (vivo) setPubs([]); });
    return () => { vivo = false; };
  }, []);
  useEffect(() => { if (reciente) setNuevo(reciente > leerVisto()); }, [reciente]);

  const cerrar = useCallback(() => { setAbierta(false); setSel(null); pestana.current?.focus(); }, []);
  const abrir = () => {
    setAbierta(true);
    if (reciente) { guardarVisto(reciente); setNuevo(false); }
    requestAnimationFrame(() => panel.current?.focus());
  };
  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") { if (sel) setSel(null); else cerrar(); } };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierta, sel, cerrar]);

  return (
    <div className={`infx${abierta ? " is-abierta" : ""}`}>
      <button ref={pestana} type="button" className="infx-pestana" onClick={abierta ? cerrar : abrir} aria-expanded={abierta} aria-controls="infx-panel"
        aria-label={`ENQORA Informa${nuevo ? ": hay información nueva" : ""}`}>
        <span className="infx-reloj"><EnqoraClock size={34} /></span>
        <span className="infx-etiqueta">ENQORA Informa</span>
        {nuevo ? <span className="infx-senal" aria-hidden="true" /> : null}
      </button>

      <div id="infx-panel" ref={panel} className="infx-panel" role="dialog" aria-modal="false" aria-label="ENQORA Informa" tabIndex={-1} hidden={!abierta}>
        <header className="infx-cabeza">
          <EnqoraClock size={30} />
          <div><b>ENQORA <span>Informa</span></b><small>Investigado por el enjambre · verificado por el equipo</small></div>
          <button type="button" className="infx-cerrar" onClick={cerrar} aria-label="Cerrar ENQORA Informa">×</button>
        </header>

        {/* La galería no se desmonta al abrir una ficha: al volver, la persona sigue donde estaba. */}
        <div className="infx-galeria" hidden={!!sel}>
          {pubs === null ? <p className="infx-vacio">Cargando lo último verificado…</p> : null}
          {pubs && !pubs.length ? (
            <p className="infx-vacio">Aún no hay publicaciones verificadas. El enjambre investiga las fuentes oficiales y cada hallazgo aparece aquí solo cuando el equipo lo verifica en su fuente.</p>
          ) : null}
          {pubs?.length ? (
            <ul className="infx-carrusel" aria-label="Publicaciones verificadas">
              {pubs.map((p, i) => {
                const cat = p.categorias[0];
                return (
                  <li key={p.id} className={`infx-card infx-card-${i % 3 === 0 ? "ancha" : i % 3 === 1 ? "alta" : "base"}`}>
                    <button type="button" onClick={() => setSel(p)} aria-label={`Abrir: ${p.titulo}`}>
                      <span className="infx-foto"><img src={FOTO[cat] ?? "/entrada/hero.webp"} alt="" loading="lazy" /></span>
                      <span className="infx-card-txt">
                        <span className="infx-chips">
                          {p.alerta !== "informativa" ? <em className={`inf-alerta ${ALERTAS[p.alerta]?.clase ?? ""}`}>{ALERTAS[p.alerta]?.texto}</em> : null}
                          <em className="infx-cat">{nombreCat(cat)}</em>
                        </span>
                        <b>{p.titulo}</b>
                        <small>{p.institucion ?? "Fuente oficial"} · {fechaCL(p.publicado ?? p.consultado)}</small>
                        <small className="infx-ok">✓ Verificado{p.revision_profesional ? " · revisión profesional" : ""}</small>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          <Link href="/informa" className="infx-todo" onClick={() => setAbierta(false)}>Ver todo ENQORA Informa →</Link>
        </div>

        {sel ? <Ficha p={sel} volver={() => setSel(null)} /> : null}
      </div>
    </div>
  );
}

function Ficha({ p, volver }: { p: Publicacion; volver: () => void }) {
  const cat = p.categorias[0];
  const analisis = FICHA_CAMPOS.filter((f) => p.ficha?.[f.key]);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <article ref={ref} className="infx-ficha" tabIndex={-1} aria-label={p.titulo}>
      <button type="button" className="infx-volver" onClick={volver}>← Volver a la galería</button>
      <div className="infx-ficha-foto"><img src={FOTO[cat] ?? "/entrada/hero.webp"} alt="" /></div>
      <span className="infx-chips">
        {p.alerta !== "informativa" ? <em className={`inf-alerta ${ALERTAS[p.alerta]?.clase ?? ""}`}>{ALERTAS[p.alerta]?.texto}</em> : null}
        <em className="infx-cat">{nombreCat(cat)}</em>
      </span>
      <h3>{p.titulo}</h3>
      <p>{p.resumen}</p>
      {analisis.length ? (
        <section className="infx-analisis" aria-label="Análisis de CORA">
          <h4>Análisis de CORA</h4>
          <dl>{analisis.map((f) => <div key={f.key}><dt>{f.titulo}</dt><dd>{p.ficha[f.key]}</dd></div>)}</dl>
        </section>
      ) : null}
      <dl className="infx-datos">
        <div><dt>Fuente oficial</dt><dd><a href={p.fuente} target="_blank" rel="noopener noreferrer">{p.institucion ?? "Abrir documento"} ↗</a></dd></div>
        <div><dt>Revisado por ENQORA</dt><dd>{fechaCL(p.consultado)}</dd></div>
        <div><dt>Vigencia</dt><dd>{p.vigente_desde || p.vigente_hasta ? `${p.vigente_desde ? `desde ${fechaCL(p.vigente_desde)}` : ""}${p.vigente_hasta ? ` hasta ${fechaCL(p.vigente_hasta)}` : ""}` : "Según la fuente"}</dd></div>
        <div><dt>Verificación</dt><dd>{ETAPAS[p.etapa]?.texto ?? p.etapa}{p.revision_profesional ? " · revisión profesional" : ""}</dd></div>
      </dl>
      <div className="infx-acciones">
        <Link href={`/informa/${p.id}`} className="btn btn-ghost btn-inline btn-sm">Ficha completa</Link>
        {cat ? <Link href={`/explorar/${cat}#consulta`} className="btn btn-gold btn-inline btn-sm">Pregúntale a CORA</Link> : null}
      </div>
      <small className="infx-nota">Información general verificada en la fuente; no reemplaza la asesoría para tu caso.</small>
    </article>
  );
}
