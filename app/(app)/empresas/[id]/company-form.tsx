"use client";

import { useActionState } from "react";
import { updateCompanyAction } from "@/app/actions/companies";
import { Notice } from "@/components/auth-card";
import { CompanyFields } from "@/components/company-fields";
import { SubmitButton } from "@/components/submit-button";
import type { Company } from "@/lib/company-constants";

export function EditCompanyForm({ company }: { company: Company }) {
  const [state, action] = useActionState(updateCompanyAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      {state?.ok ? <Notice kind="ok">{state.ok}</Notice> : null}
      <input type="hidden" name="company_id" value={company.id} />
      <CompanyFields company={company} rutEditable={false} />
      <SubmitButton pendingText="Guardando…" className="btn-inline">Guardar cambios</SubmitButton>
    </form>
  );
}
