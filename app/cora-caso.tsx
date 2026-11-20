"use client";

import Link from "next/link";
import { createContext, useActionState, useContext, useState } from "react";
import { enviarCasoAction, type CasoState } from "@/app/actions/caso";
import { SubmitButton } from "@/components/submit-button";
import { DOCUMENTOS, nombreCategoria, type OBJETIVOS } from "@/lib/cora/caso";
import { escuchar, soporteVoz, useModoVoz } from "@/lib/voz/navegador";

// Categoría que la persona eligió en la portada (/explorar/<categoría>). Llega a CORA como pista; no la obliga.
export const CategoriaEntrada = createContext<string | null>(null);

// «Cuéntanos tu caso»: el cliente relata (escribiendo o dictando), elige cómo quiere la respuesta y recibe
// qué documentos tener a mano. El equipo responde con una cotización por el canal elegido.
export function CasoForm({ rut, razon, relato, setRelato, objetivos = [], titulo = "Conozcamos qué quieres conseguir con tu empresa.", ayuda, boton = "Enviar", etiqueta = "Siguiente paso", ejemplo = "Ej.: quiero ordenar la renta del año pasado y contratar a dos personas este semestre.", cuenta, pedirRut = false }: {
  rut: string; razon: string; relato: string; setRelato: (v: string) => void; objetivos?: typeof OBJETIVOS; titulo?: string;
  ayuda?: string; boton?: string; etiqueta?: string; ejemplo?: string;
  // Cliente con sesión iniciada: su nombre y correo ya se conocen (no se vuelven a pedir) y la respuesta llega a su panel.
  cuenta?: { nombre: string; correo: string };
  // Pide el RUT en el mismo formulario (cliente con sesión sin empresa registrada; opcional).
  pedirRut?: boolean;
}) {
  const [elegidos, setElegidos] = useState<string[]>([]);
  const [state, action] = useActionState<CasoState, FormData>(enviarCasoAction, null);
  const [canal, setCanal] = useState<"whatsapp" | "correo">("whatsapp");
  const [dictando, setDictando] = useState(false);
  const voz = useModoVoz();
  const categoria = useContext(CategoriaEntrada);

  if (state?.ok) {
    const a = state.analisis;
    return (
      <section id="cora-caso" className="cora-caso cora-caso-ok" aria-live="polite">
        <span className="eyebrow">Recibimos tu solicitud</span>
        {a.resumen ? <b>{a.resumen}</b> : <b>Gracias por contarnos tu caso. Ya está en manos del equipo ENQORA.</b>}
        <span>Área: {a.categorias.map(nombreCategoria).join(" y ")}.</span>
        {a.urgencia ? <p className="alert alert-info cora-urgencia" role="status">{a.urgencia}</p> : null}
        {a.documentos.length ? (
          <>
            <span>Para cotizar y resolver tu caso, ten a mano:</span>
            <ul>{a.documentos.map((d) => <li key={d}><b>{DOCUMENTOS[d].nombre}.</b> <span className="report-note">{DOCUMENTOS[d].como}</span></li>)}</ul>
          </>
        ) : null}
        <b>{cuenta ? "Un profesional ENQORA revisa tu solicitud y te responde en «Mis trámites» y por correo en un plazo de 24 horas hábiles." : `Un profesional ENQORA revisa tu caso y te envía la cotización por ${state.canal === "correo" ? "correo" : "WhatsApp"} en un plazo de 24 horas hábiles.`}</b>
        {state.codigo ? (
          <span>
            Tu código de solicitud: <b className="mono">{state.codigo}</b>.{" "}
            {state.canal === "correo"
              ? "Si creas tu cuenta ENQORA con este mismo correo, tu solicitud queda unida a tu cuenta y a tu caso automáticamente."
              : "Si creas tu cuenta ENQORA en este mismo dispositivo en las próximas 24 horas, tu solicitud se une sola. Igual guarda el código: el equipo lo usa para unirla a tu caso."}
          </span>
        ) : null}
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
      {categoria ? <input type="hidden" name="categoria" value={categoria} /> : null}
      <span className="eyebrow">{etiqueta}</span>
      <b>{titulo}</b>
      {objetivos.length ? (
        <div className="natural-opts" role="group" aria-label="Tus objetivos">
          {objetivos.map((o) => {
            const on = elegidos.includes(o.texto);
            return (
              <label key={o.id} className={`natural-opt${on ? " is-on" : ""}`}>
                <input type="checkbox" name="objetivos" value={o.texto} checked={on} onChange={() => setElegidos(on ? elegidos.filter((x) => x !== o.texto) : [...elegidos, o.texto])} /> {o.texto}
              </label>
            );
          })}
        </div>
      ) : null}
      <span className="report-note">{ayuda ?? "Elige uno o más y, si quieres, cuéntanos el detalle. Un profesional te responde con una propuesta."}</span>
      {pedirRut ? (
        <label className="cora-caso-campo">RUT de tu empresa o el tuyo (opcional)
          <input name="rut" className="input" inputMode="text" autoComplete="off" maxLength={12} placeholder="76.123.456-7" />
        </label>
      ) : <input type="hidden" name="rut" value={rut} />}
      <input type="hidden" name="razon_social" value={razon} />
      <label className="sr-only" htmlFor="caso-relato">Tu caso</label>
      <textarea id="caso-relato" name="relato" className="input" rows={3} maxLength={4000} required={!elegidos.length} value={relato} onChange={(e) => setRelato(e.target.value)}
        placeholder={ejemplo} />
      {soporteVoz().escuchar ? (
        <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => void dictar()} disabled={dictando || voz.escuchando}>
          {dictando ? "Te escucho…" : "Dictar por voz"}
        </button>
      ) : null}
      {cuenta ? (
        <>
          <input type="hidden" name="nombre" value={cuenta.nombre} />
          <input type="hidden" name="canal" value="correo" />
          <input type="hidden" name="contacto" value={cuenta.correo} />
        </>
      ) : (
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
      )}
      <label className="cora-caso-consent">
        <input type="checkbox" name="consentimiento" required /> <span>Autorizo a ENQORA a usar estos datos solo para responder mi solicitud (<Link href="/privacidad">privacidad</Link>).</span>
      </label>
      {state && !state.ok ? <p className="lookup-error" role="alert">{state.error}</p> : null}
      <SubmitButton className="btn-inline" pendingText="Enviando…">{boton}</SubmitButton>
      <span className="report-note">Te respondemos con una propuesta y su cotización en un plazo de 24 horas hábiles. Sin costo ni compromiso.</span>
    </form>
  );
}
