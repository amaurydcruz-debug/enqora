"use client";

import { useActionState } from "react";
import { createCompanyAction } from "@/app/actions/companies";
import { Notice } from "@/components/auth-card";
import { CompanyFields } from "@/components/company-fields";
import { SubmitButton } from "@/components/submit-button";

export function NewCompanyForm() {
  const [state, action] = useActionState(createCompanyAction, undefined);

  return (
    <form action={action}>
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <CompanyFields rutEditable />
      <SubmitButton pendingText="Registrando…">Registrar empresa</SubmitButton>
    </form>
  );
}
