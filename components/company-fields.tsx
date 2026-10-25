"use client";

import { useState } from "react";
import { REGIMES, type Company } from "@/lib/company-constants";
import { formatRut, isValidRut } from "@/lib/rut";

// Campos del formulario de empresa (registro y edición).
export function CompanyFields({
  company,
  rutEditable,
  withAddress = false,
}: {
  company?: Company;
  rutEditable: boolean;
  withAddress?: boolean;
}) {
  const [rut, setRut] = useState(company ? formatRut(company.rut) : "");
  const rutState = !rut ? null : isValidRut(rut) ? "ok" : rut.replace(/[^0-9kK]/g, "").length >= 8 ? "bad" : null;

  return (
    <>
      <div className="field">
        <label htmlFor="rut">RUT de la empresa</label>
        <input
          id="rut" name="rut" className="input mono" inputMode="text" autoComplete="off" placeholder="76.123.456-7"
          required={rutEditable} readOnly={!rutEditable} maxLength={12}
          value={rut} onChange={(e) => setRut(formatRut(e.target.value))}
        />
        {rutEditable ? (
          <span className={`hint${rutState === "bad" ? " hint-bad" : ""}`}>
            {rutState === "ok" ? "RUT válido." : rutState === "bad" ? "El dígito verificador no coincide." : "Con o sin puntos y guion."}
          </span>
        ) : (
          <span className="hint">El RUT identifica a la empresa y no se puede cambiar.</span>
        )}
      </div>
      <div className="field">
        <label htmlFor="legal_name">Razón social</label>
        <input id="legal_name" name="legal_name" className="input" required minLength={2} maxLength={160}
          defaultValue={company?.legal_name ?? ""} placeholder="Comercial Ejemplo SpA" />
      </div>
      <div className="field">
        <label htmlFor="trade_name">Nombre de fantasía <span className="optional">(opcional)</span></label>
        <input id="trade_name" name="trade_name" className="input" maxLength={120} defaultValue={company?.trade_name ?? ""} />
      </div>
      <div className="field">
        <label htmlFor="activity">Giro o actividad principal <span className="optional">(opcional)</span></label>
        <input id="activity" name="activity" className="input" maxLength={200} defaultValue={company?.activity ?? ""}
          placeholder="Venta al por menor de alimentos" />
      </div>
      {withAddress ? (
        <div className="field-pair">
          <div className="field">
            <label htmlFor="address">Domicilio <span className="optional">(opcional)</span></label>
            <input id="address" name="address" className="input" maxLength={200} defaultValue={company?.address ?? ""}
              placeholder="Av. Providencia 1234, oficina 56" autoComplete="street-address" />
          </div>
          <div className="field">
            <label htmlFor="commune">Comuna <span className="optional">(opcional)</span></label>
            <input id="commune" name="commune" className="input" maxLength={80} defaultValue={company?.commune ?? ""}
              placeholder="Providencia" />
          </div>
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="tax_regime">Régimen tributario</label>
        <select id="tax_regime" name="tax_regime" className="input" defaultValue={company?.tax_regime ?? "por_definir"}>
          {Object.entries(REGIMES).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <span className="hint">Si no lo sabes, deja "Por definir". Lo confirmaremos en el diagnóstico inicial.</span>
      </div>
    </>
  );
}
