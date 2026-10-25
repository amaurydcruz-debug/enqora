"use client";

import { useActionState, useEffect, useState } from "react";
import { updateCompanyAction } from "@/app/actions/companies";
import { Notice } from "@/components/auth-card";
import { CompanyFields } from "@/components/company-fields";
import { SubmitButton } from "@/components/submit-button";
import { REGIMES, type Company } from "@/lib/company-constants";
import { formatRut } from "@/lib/rut";

// Datos de la empresa: primero la ficha de lectura; el formulario aparece solo al pulsar
// «Editar datos» (y solo para propietarios y administradores).
export function CompanyDataPanel({ company, canEdit }: { company: Company; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState(updateCompanyAction, undefined);

  // Al guardar con éxito se vuelve a la ficha de lectura con los datos actualizados.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  const domicilio = [company.address, company.commune].filter(Boolean).join(", ");

  if (!editing) {
    return (
      <>
        {state?.ok ? <Notice kind="ok">{state.ok}</Notice> : null}
        <dl className="data-grid">
          <div><dt>RUT</dt><dd className="mono">{formatRut(company.rut)}</dd></div>
          <div><dt>Razón social</dt><dd>{company.legal_name}</dd></div>
          <div><dt>Nombre comercial</dt><dd>{company.trade_name || <span className="muted-line">Sin informar</span>}</dd></div>
          <div><dt>Giro o actividad</dt><dd>{company.activity || <span className="muted-line">Sin informar</span>}</dd></div>
          <div><dt>Régimen tributario</dt><dd>{REGIMES[company.tax_regime] ?? "Por definir"}</dd></div>
          <div><dt>Domicilio</dt><dd>{domicilio || <span className="muted-line">Sin informar</span>}</dd></div>
          <div>
            <dt>Verificación</dt>
            <dd>
              <span className={`status status-${company.rut_verified ? "ok" : "warn"}`}>
                {company.rut_verified ? "RUT verificado" : "RUT por verificar con el SII"}
              </span>
            </dd>
          </div>
        </dl>
        {canEdit ? (
          <div className="panel-actions">
            <button type="button" className="btn btn-gold btn-inline" onClick={() => setEditing(true)}>Editar datos</button>
          </div>
        ) : (
          <p className="muted-line">Solo el propietario o un administrador pueden modificar estos datos.</p>
        )}
      </>
    );
  }

  return (
    <form action={action} className="data-form">
      {state?.error ? <Notice kind="error">{state.error}</Notice> : null}
      <input type="hidden" name="company_id" value={company.id} />
      <CompanyFields company={company} rutEditable={false} withAddress />
      <div className="panel-actions">
        <SubmitButton pendingText="Guardando…" className="btn-inline" status={state?.error ? "error" : "idle"} errorText="Revisa los datos">
          Guardar cambios
        </SubmitButton>
        <button type="button" className="btn btn-ghost btn-inline" onClick={() => setEditing(false)}>Cancelar</button>
      </div>
    </form>
  );
}
