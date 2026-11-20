"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { CasoForm, CategoriaEntrada } from "@/app/cora-caso";

export type Tramite = { key: string; titulo: string; texto: string; foto: string | null; necesidades: string[] };

// Trámites: el cliente abre la lista, elige UNA solución y solo ve la información de esa solución.
// Con su sesión iniciada no vuelve a escribir nombre ni correo; si no tiene empresa registrada, puede dejar su RUT.
export function Tramites({ tramites, cuenta, rut, razon, abierto = false, inicial = null }: {
  tramites: Tramite[]; cuenta: { nombre: string; correo: string }; rut: string; razon: string; abierto?: boolean;
  inicial?: string | null; // trámite ya elegido (enlace directo: /panel?tramite=contabilidad)
}) {
  const [abrir, setAbrir] = useState(abierto);
  const [elegido, setElegido] = useState<Tramite | null>(tramites.find((t) => t.key === inicial) ?? null);
  const [relato, setRelato] = useState("");

  if (elegido) {
    const opciones = elegido.necesidades.map((texto, i) => ({ id: `${elegido.key}-${i}`, texto, categoria: elegido.key, pista: /$^/ }));
    return (
      <div className="ps-elegido">
        <div className="ps-elegido-cab">
          {elegido.foto ? <img src={elegido.foto} alt="" className="ps-elegido-foto" /> : null}
          <div className="ps-elegido-txt">
            <span className="eyebrow">Tu trámite</span>
            <h3>{elegido.titulo}</h3>
            <p>{elegido.texto}</p>
          </div>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => { setElegido(null); setRelato(""); }}>Cambiar</button>
        </div>
        <CategoriaEntrada.Provider value={elegido.key}>
          <CasoForm rut={rut} razon={razon} relato={relato} setRelato={setRelato} objetivos={opciones} cuenta={cuenta} pedirRut={!rut}
            etiqueta={elegido.titulo} titulo="¿Qué necesitas que ENQORA te resuelva?" boton="Enviar solicitud"
            ayuda="Marca lo que te pasa y, si quieres, agrega el detalle. Un profesional te responde con la solución y su precio." />
        </CategoriaEntrada.Provider>
      </div>
    );
  }

  return (
    <div className="ps-tramites">
      <button type="button" className={`ps-abrir${abrir ? " is-open" : ""}`} aria-expanded={abrir} aria-controls="ps-lista" onClick={() => setAbrir(!abrir)}>
        <span>
          <b>Trámites</b>
          <small>Elige lo que necesitas y te decimos cómo lo resolvemos</small>
        </span>
        <span className="ps-abrir-icono" aria-hidden="true">{abrir ? "−" : "+"}</span>
      </button>
      {abrir ? (
        <ul id="ps-lista" className="ps-lista">
          {tramites.map((t) => (
            <li key={t.key}>
              <button type="button" className="ps-tile" onClick={() => setElegido(t)}>
                {t.foto ? <img src={t.foto} alt="" className="ps-tile-foto" loading="lazy" /> : null}
                <span className="ps-tile-txt"><b>{t.titulo}</b><small>{t.texto}</small></span>
                <span className="ps-tile-ir" aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
