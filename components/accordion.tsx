"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

// Panel de opciones inteligente (acordeón exclusivo) — componente oficial de ENQORA.
//
// - Una sola opción abierta por grupo: abrir otra cierra la anterior; tocar la abierta la cierra.
// - El estado vive en la interfaz (useState) y se refleja en la URL (#id) para enlaces directos
//   como /casos/123#autorizaciones; el botón Atrás del navegador sigue funcionando.
// - Variante "tiles": opciones en mosaico; el contenido se despliega a todo el ancho justo
//   debajo de la fila de la opción elegida. En teléfono se convierte en lista vertical.
// - Variante "list": lista vertical siempre.
// - El contenido permanece montado (los formularios no pierden lo escrito) pero inerte y oculto
//   cuando está cerrado. Transición de altura con grid-template-rows; sin animación si el
//   dispositivo pide reducir movimiento.

export type AccordionItem = {
  id: string;
  title: string;
  description?: string;
  emblem?: React.ReactNode;
  status?: React.ReactNode;
  tone?: "default" | "gold" | "risk";
  content: React.ReactNode;
};

export function Accordion({
  items,
  label,
  variant = "list",
  defaultOpen = null,
  syncHash = true,
}: {
  items: AccordionItem[];
  label: string;
  variant?: "list" | "tiles";
  defaultOpen?: string | null;
  syncHash?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen);
  const headers = useRef<Map<string, HTMLButtonElement>>(new Map());
  const uid = useId();
  const ids = new Set(items.map((i) => i.id));
  const idsKey = items.map((i) => i.id).join("|");

  // Abrir desde la URL al cargar y cuando cambia el #.
  useEffect(() => {
    if (!syncHash) return;
    const fromHash = () => {
      const h = decodeURIComponent(window.location.hash.slice(1));
      if (h && idsKey.split("|").includes(h)) {
        setOpen(h);
        requestAnimationFrame(() => reveal(headers.current.get(h)));
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [idsKey, syncHash]);

  const toggle = useCallback(
    (id: string) => {
      const next = open === id ? null : id;
      setOpen(next);
      if (syncHash) {
        const url = new URL(window.location.href);
        url.hash = next ?? "";
        window.history.replaceState(window.history.state, "", next ? url.toString() : url.pathname + url.search);
      }
      if (next) {
        // Tras abrir, que la opción quede a la vista (útil en teléfono).
        window.setTimeout(() => reveal(headers.current.get(next)), 60);
      }
    },
    [open, syncHash],
  );

  // Navegación con flechas entre opciones (patrón accesible de acordeón).
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (e.key in keys || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      const n = items.length;
      const target = e.key === "Home" ? 0 : e.key === "End" ? n - 1 : (index + keys[e.key] + n) % n;
      headers.current.get(items[target].id)?.focus();
    }
  };

  if (open && !ids.has(open)) setOpen(null);

  return (
    <div className={`acc acc-${variant}${open ? " has-open" : ""}`} role="group" aria-label={label}>
      {items.map((it, i) => {
        const isOpen = open === it.id;
        const hid = `${uid}-h-${it.id}`;
        const pid = `${uid}-p-${it.id}`;
        return (
          <div key={it.id} className="acc-slot" data-open={isOpen || undefined}>
            <h3 className="acc-h" id={it.id}>
              <button
                type="button"
                id={hid}
                ref={(el) => {
                  if (el) headers.current.set(it.id, el);
                  else headers.current.delete(it.id);
                }}
                className={`acc-option tone-${it.tone ?? "default"}${isOpen ? " is-open" : ""}`}
                aria-expanded={isOpen}
                aria-controls={pid}
                onClick={() => toggle(it.id)}
                onKeyDown={(e) => onKey(e, i)}
              >
                {it.emblem ? <span className="acc-emblem">{it.emblem}</span> : null}
                <span className="acc-text">
                  <span className="acc-title">{it.title}</span>
                  {it.description ? <span className="acc-desc">{it.description}</span> : null}
                </span>
                {it.status ? <span className="acc-status">{it.status}</span> : null}
                <span className="acc-chevron" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="16" height="16"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </button>
            </h3>
            <div id={pid} role="region" aria-labelledby={hid} className={`acc-panel${isOpen ? " is-open" : ""}`} inert={!isOpen}>
              <div className="acc-clip">
                <div className="acc-body">{it.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function reveal(el?: HTMLElement | null) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < 70 || r.top > window.innerHeight * 0.6) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }
}
