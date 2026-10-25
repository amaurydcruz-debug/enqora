"use client";

import { useFormStatus } from "react-dom";
import { EnqoraClock } from "@/components/brand/enqora-clock";

// Botón de envío ENQORA con sus siete estados:
// normal, hover y presionado (CSS), en ejecución (mientras la acción real está pendiente),
// deshabilitado, completado y error (según el resultado que entrega la acción).
export function SubmitButton({
  children,
  pendingText = "Procesando…",
  variant = "gold",
  className = "",
  status = "idle",
  doneText,
  errorText,
  disabled = false,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "gold" | "ghost" | "danger";
  className?: string;
  status?: "idle" | "done" | "error";
  doneText?: string;
  errorText?: string;
  disabled?: boolean;
  name?: string; // para formularios con más de una acción
  value?: string;
}) {
  const { pending } = useFormStatus();
  const state = pending ? "busy" : status;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={`btn btn-${variant} ${className}`}
      disabled={pending || disabled}
      aria-busy={pending}
      data-state={state === "idle" ? undefined : state}
    >
      {state === "busy" ? (
        <>
          <span className="btn-clock" aria-hidden="true"><EnqoraClock size={18} live /></span>
          {pendingText}
        </>
      ) : state === "done" ? (
        <>
          <svg className="btn-mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {doneText ?? children}
        </>
      ) : state === "error" ? (
        <>
          <svg className="btn-mark" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 7v6M12 16.5h.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          {errorText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
