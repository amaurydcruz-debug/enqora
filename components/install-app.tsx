"use client";

import { useEffect, useState } from "react";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Instalar la app (PWA) en el teléfono, una sola vez. Android/Chrome: botón «Instalar». iPhone/Safari: instrucciones
// (Apple no permite el botón). Si ya está instalada y abierta como app, no muestra nada.
export function InstallApp({ nombre = "ENQORA Gestor" }: { nombre?: string }) {
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(!!standalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return <p className="alert alert-ok" role="status">App {nombre} instalada en este teléfono.</p>;
  return (
    <div className="install-app">
      <p><b>1. Instala la app {nombre}</b> (una sola vez). Queda como un ícono en tu pantalla de inicio.</p>
      {evt ? (
        <button type="button" className="btn btn-gold" onClick={async () => { await evt.prompt(); const r = await evt.userChoice; if (r.outcome === "accepted") setInstalled(true); setEvt(null); }}>
          Instalar {nombre}
        </button>
      ) : ios ? (
        <ol className="install-steps">
          <li>Abre este enlace en <b>Safari</b>.</li>
          <li>Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba).</li>
          <li>Elige <b>«Agregar a inicio»</b> y luego <b>«Agregar»</b>.</li>
        </ol>
      ) : (
        <ol className="install-steps">
          <li>Abre este enlace en <b>Chrome</b>.</li>
          <li>Toca el menú <b>⋮</b> (arriba a la derecha).</li>
          <li>Elige <b>«Instalar app»</b> o <b>«Agregar a pantalla principal»</b>.</li>
        </ol>
      )}
    </div>
  );
}
