"use client";

import { useActionState } from "react";
import { commentAction } from "@/app/actions/cases";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";

export function CommentForm({ caseId, canInternal }: { caseId: string; canInternal: boolean }) {
  const [state, action] = useActionState(commentAction, undefined);

  return (
    <form action={action} className="comment-form">
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="case_id" value={caseId} />
      <label htmlFor="body" className="sr-only">Mensaje</label>
      <textarea id="body" name="body" className="input" rows={3} maxLength={4000} required
        placeholder={canInternal ? "Escribe al cliente o deja una nota interna…" : "Escribe un mensaje al equipo ENQORA…"} />
      <div className="comment-actions">
        {canInternal ? (
          <label className="check-inline">
            <input type="checkbox" name="internal" /> Nota interna (el cliente no la ve)
          </label>
        ) : <span />}
        <SubmitButton pendingText="Enviando…" className="btn-inline btn-sm">Enviar</SubmitButton>
      </div>
    </form>
  );
}
