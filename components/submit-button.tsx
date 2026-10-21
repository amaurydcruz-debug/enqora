"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingText = "Procesando…",
  variant = "gold",
  className = "",
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "gold" | "ghost" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variant} ${className}`} disabled={pending} aria-busy={pending}>
      {pending ? pendingText : children}
    </button>
  );
}
