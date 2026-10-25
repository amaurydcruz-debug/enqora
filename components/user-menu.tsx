"use client";

import { useEffect, useRef } from "react";

// Menú del perfil: se abre al tocar y se cierra al tocar fuera o con Escape.
export function UserMenu({ initial, children }: { initial: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details className="user-menu" ref={ref}>
      <summary aria-label="Menú de tu cuenta">
        <span className="avatar">{initial}</span>
      </summary>
      <div className="user-menu-panel">{children}</div>
    </details>
  );
}
