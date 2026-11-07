"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { enviarCasoAction, type CasoState } from "@/app/actions/caso";
import { SubmitButton } from "@/components/submit-button";
import { DOCUMENTOS, nombreCategoria } from "@/lib/cora/caso";
import { escuchar, soporteVoz, useModoVoz } from "@/lib/voz/navegador";

// «Cuéntanos tu caso»: el cliente relata (escribiendo o dictando), elige cómo quiere la respuesta y recibe
// qué documentos tener a mano. El equipo responde con una cotización por el canal elegido.
export function CasoForm({ rut, razon, relato, setRelato }: { rut: string; razon: string; relato: string; setRelato: (v: string) => void }) {
  const [state, action] = useActionState<CasoState, FormData>(enviarCasoAction, null);
  const [canal, setCanal] = useState<"whatsapp" | "correo">("whatsapp");
  const [dictando, setDictando] = useState(false);
  const voz = useModoVoz();

  if (state?.ok) {
    const a = state.analisis;
    return (
      <section id="cora-caso" className="cora-caso cora-caso-ok" aria-live="polite">
        <span className="eyebrow">Recibimos tu caso</span>
        {a.resumen ? <b>{a.resumen}</b> : <b>Gracias por contarnos tu caso. Ya está en manos del equipo ENQORA.</b>}
        <span>Área: {a.categorias.map(nombreCategoria).join(" y ")}.</span>
        {a.documentos.length ? (
          <>
            <span>Para cotizar y resolver tu caso, ten a mano:</span>
            <ul>{a.documentos.map((d) => <li key={d}><b>{DOCUMENTOS[d].nombre}.</b> <span className="report-note">{DOCUMENTOS[d].como}</span></li>)}</ul>
          </>
        ) : null}
        <b>Un profesional ENQORA revisa tu caso y te envía la cotización por {state.canal === "correo" ? "correo" : "WhatsApp"} en un plazo de 24 horas hábiles.</b>
        <span className="report-note">
          Los documentos los subes de forma segura en tu espacio ENQORA, nunca por WhatsApp. ENQORA jamás te pedirá tu ClaveÚnica ni tu clave del SII.
        </span>
        <Link href={`/comenzar?servicio=${a.categorias[0] ?? "contabilidad"}`} className="btn btn-gold btn-inline btn-sm">Crear mi espacio ENQORA y subir documentos</Link>
      </section>
    );
  }

  async function dictar() {
    setDictando(true);
    const txt = await escuchar(20_000);
    setDictando(false);
    if (txt) setRelato(relato ? `${relato} ${txt}` : txt);
  }

  return (
    <form id="cora-caso" action={action} className="cora-caso">
      <span className="eyebrow">Cuéntanos tu caso</span>
      <b>¿Qué necesitas resolver? Cuéntalo con tus palabras: te respondemos con una cotización.</b>
      <input type="hidden" name="rut" value={rut} />
      <input type="hidden" name="razon_social" value={razon} />
      <label className="sr-only" htmlFor="caso-relato">Tu caso</label>
      <textarea id="caso-relato" name="relato" className="input" rows={4} maxLength={4000} required value={relato} onChange={(e) => setRelato(e.target.value)}
        placeholder="Ej.: tengo la renta del año pasado sin declarar y dos trabajadores sin contrato escrito. Quiero ponerme al día." />
      {soporteVoz().escuchar ? (
        <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => void dictar()} disabled={dictando || voz.escuchando}>
          {dictando ? "Te escucho…" : "Dictar mi caso por voz"}
        </button>
      ) : null}
      <div className="cora-caso-fila">
        <label className="cora-caso-campo">Tu nombre
          <input name="nombre" id="caso-nombre" className="input" required minLength={2} maxLength={120} autoComplete="name" />
        </label>
        <fieldset className="cora-caso-campo">
          <legend>¿Cómo quieres tu respuesta?</legend>
          <div className="natural-opts">
            <label className={`natural-opt${canal === "whatsapp" ? " is-on" : ""}`}><input type="radio" name="canal" value="whatsapp" checked={canal === "whatsapp"} onChange={() => setCanal("whatsapp")} /> WhatsApp</label>
            <label className={`natural-opt${canal === "correo" ? " is-on" : ""}`}><input type="radio" name="canal" value="correo" checked={canal === "correo"} onChange={() => setCanal("correo")} /> Correo</label>
          </div>
        </fieldset>
        <label className="cora-caso-campo">{canal === "correo" ? "Tu correo" : "Tu WhatsApp"}
          <input name="contacto" className="input" required inputMode={canal === "correo" ? "email" : "tel"} autoComplete={canal === "correo" ? "email" : "tel"}
            placeholder={canal === "correo" ? "nombre@empresa.cl" : "+56 9 1234 5678"} maxLength={160} />
        </label>
      </div>
      <label className="cora-caso-consent">
        <input type="checkbox" name="consentimiento" required /> <span>Autorizo a ENQORA a usar estos datos solo para responder mi solicitud (<Link href="/privacidad">privacidad</Link>).</span>
      </label>
      {state && !state.ok ? <p className="lookup-error" role="alert">{state.error}</p> : null}
      <SubmitButton className="btn-inline" pendingText="Enviando tu caso…">Enviar mi caso</SubmitButton>
      <span className="report-note">Te respondemos con una cotización en un plazo de 24 horas hábiles. Sin costo ni compromiso.</span>
    </form>
  );
}
