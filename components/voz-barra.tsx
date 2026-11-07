"use client";

import { activarModoVoz, useModoVoz } from "@/lib/voz/navegador";

// Barra flotante del modo voz: lo que CORA está diciendo (subtítulos), si está escuchando y lo que va entendiendo.
// «Pasar a texto» apaga la voz en cualquier momento; todo sigue disponible en pantalla.
export function VozBarra() {
  const v = useModoVoz();
  if (!v.activo) return null;
  return (
    <div className="voz-barra" role="status" aria-live="polite">
      <span className={`voz-orbe${v.escuchando ? " voz-orbe-escucha" : v.subtitulo ? " voz-orbe-habla" : ""}`} aria-hidden="true" />
      <span className="voz-texto">
        {v.escuchando ? <><b>Te escucho…</b> {v.parcial ? <span>«{v.parcial}»</span> : <span className="report-note">Habla ahora</span>}</>
          : v.subtitulo ? <><b>CORA:</b> {v.subtitulo}</> : <span className="report-note">CORA está pensando…</span>}
      </span>
      <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => activarModoVoz(false)}>Pasar a texto</button>
    </div>
  );
}
