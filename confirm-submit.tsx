"use client";

import { useFormStatus } from "react-dom";

// Botón de envío que pide confirmación antes de una acción irreversible.
export function ConfirmSubmit({
  children,
  message,
  variant = "danger",
  pendingText = "Procesando…",
}: {
  children: React.ReactNode;
  message: string;
  variant?: "gold" | "ghost" | "danger";
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`btn btn-${variant} btn-inline btn-sm`}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
