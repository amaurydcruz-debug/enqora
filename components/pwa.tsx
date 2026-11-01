"use client";

import { useEffect, useRef, useState } from "react";

// ENQORA Everywhere: registro del service worker, aviso de nueva versión y sugerencia de instalación.
// Solo guarda en el navegador la fecha en que se descartó la sugerencia (nada de la cuenta ni de empresas).

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const DISMISS_KEY = "enqora-instalar-descartado";
const DISMISS_DAYS = 30;
const SHOW_AFTER_MS = 15_000;

function dismissedRecently() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - t < DISMISS_DAYS * 86_400_000;
  } catch {
    return true; // sin almacenamiento disponible: no insistir
  }
}

function rememberDismiss() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // sin almacenamiento: la sugerencia simplemente no se recordará
  }
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

// iPhone/iPad en Safari: no existe el aviso automático del navegador, se explican los pasos.
function isIosSafari() {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function PwaClient() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [showInstall, setShowInstall] = useState(false);
  const reloading = useRef(false);

  // Service worker (solo en producción, para no interferir con el desarrollo)
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let reg: ServiceWorkerRegistration | undefined;
    const track = (r: ServiceWorkerRegistration) => {
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => {
        const sw = r.installing;
        sw?.addEventListener("statechange", () => {
          // «installed» con una versión ya activa = hay una nueva esperando
          if (sw.state === "installed" && navigator.serviceWorker.controller) setWaiting(sw);
        });
      });
    };
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => { reg = r; track(r); })
      .catch(() => { /* sin service worker ENQORA funciona igual, solo en línea */ });
    const onControl = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControl);
    // Al volver a la app se revisa si hay una versión nueva.
    const onVisible = () => { if (document.visibilityState === "visible") reg?.update().catch(() => {}); };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControl);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // Sugerencia de instalación: discreta, una vez, descartable por 30 días.
  useEffect(() => {
    if (isStandalone() || dismissedRecently()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
      timer = setTimeout(() => setShowInstall(true), SHOW_AFTER_MS);
    };
    const onInstalled = () => { setShowInstall(false); setInstall(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (isIosSafari()) {
      setIos(true);
      timer = setTimeout(() => setShowInstall(true), SHOW_AFTER_MS);
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  const dismiss = () => { rememberDismiss(); setShowInstall(false); };

  if (waiting) {
    return (
      <div className="pwa-toast" role="status">
        <span className="pwa-toast-text"><b>Nueva versión de ENQORA disponible</b>Actualiza para usar la versión más reciente.</span>
        <div className="pwa-toast-actions">
          <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => waiting.postMessage("ENQORA_ACTUALIZAR")}>Actualizar</button>
          <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => setWaiting(null)}>Más tarde</button>
        </div>
      </div>
    );
  }

  if (!showInstall || (!install && !ios)) return null;
  return (
    <div className="pwa-toast" role="dialog" aria-label="Instalar ENQORA">
      <img src="/brand/enqora-icon-192.png" alt="" width={40} height={40} className="pwa-toast-icon" />
      <span className="pwa-toast-text">
        <b>Instala ENQORA</b>
        {install
          ? "Ábrela desde tu pantalla de inicio o escritorio, como una aplicación."
          : <>En Safari toca <b className="pwa-inline">Compartir</b> y luego <b className="pwa-inline">Agregar a pantalla de inicio</b>.</>}
      </span>
      <div className="pwa-toast-actions">
        {install ? (
          <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={async () => {
            await install.prompt();
            const { outcome } = await install.userChoice;
            if (outcome === "dismissed") rememberDismiss();
            setInstall(null);
            setShowInstall(false);
          }}>Instalar</button>
        ) : null}
        <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={dismiss}>{install ? "Ahora no" : "Entendido"}</button>
      </div>
    </div>
  );
}

export function RetryButton() {
  return <button type="button" className="btn btn-gold" onClick={() => window.location.reload()}>Reintentar</button>;
}
