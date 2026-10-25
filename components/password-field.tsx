"use client";

import { useId, useState } from "react";
import { PASSWORD_MAX, PASSWORD_MIN, passwordLevel } from "@/lib/password";

const LABELS = ["", "Insuficiente", "Aceptable", "Robusta", "Excelente"];

export function PasswordField({
  name = "password",
  label = "Contraseña",
  withMeter = false,
  autoComplete = "new-password",
}: {
  name?: string;
  label?: string;
  withMeter?: boolean;
  autoComplete?: string;
}) {
  const id = useId();
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const level = passwordLevel(value);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="pw-wrap">
        <input
          id={id}
          name={name}
          type={show ? "text" : "password"}
          className="input pw-input"
          autoComplete={autoComplete}
          required
          minLength={withMeter ? PASSWORD_MIN : undefined}
          maxLength={PASSWORD_MAX}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={show}
          className="pw-toggle"
        >
          {show ? "Ocultar" : "Ver"}
        </button>
      </div>
      {withMeter ? (
        <>
          <div className="meter" data-level={level} aria-hidden="true">
            <span /><span /><span /><span />
          </div>
          <span className="hint">
            {value ? `${LABELS[level]} · ` : ""}Mínimo {PASSWORD_MIN} caracteres. Una frase larga es más segura que símbolos raros.
          </span>
        </>
      ) : null}
    </div>
  );
}
