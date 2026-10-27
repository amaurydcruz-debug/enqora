/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { LEGAL, LEGAL_VERSION } from "@/lib/site";

// Marco común de las páginas legales públicas (Términos y Privacidad).
// Mientras NEXT_PUBLIC_LEGAL_REVIEWED no sea "si", se muestra que el texto es preliminar.
export function LegalPage({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  return (
    <div className="legal-shell">
      <header className="legal-top">
        <Link href="/" aria-label="ENQORA, inicio"><img src="/brand/enqora-logo.webp" alt="ENQORA" className="legal-logo" width={1200} height={500} /></Link>
        <nav className="legal-links" aria-label="Información legal">
          <Link href="/terminos">Términos del servicio</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
      </header>
      <main className="legal-main">
        <span className="eyebrow">Información legal</span>
        <h1>{title}</h1>
        <p className="legal-lead">{lead}</p>
        <p className="legal-meta">Versión del {LEGAL_VERSION}.</p>
        {!LEGAL.reviewed ? (
          <div className="alert alert-info" role="note">
            Versión preliminar en revisión legal. Puede cambiar antes de la apertura definitiva del servicio; avisaremos los cambios relevantes.
          </div>
        ) : null}
        <article className="legal-body">{children}</article>
      </main>
    </div>
  );
}

// Identificación de la empresa responsable (se completa con variables de Vercel).
export function LegalIdentity() {
  return (
    <ul className="legal-identity">
      <li><b>Responsable:</b> {LEGAL.name || "ENQORA"}{LEGAL.rut ? `, RUT ${LEGAL.rut}` : ""}</li>
      {LEGAL.address ? <li><b>Domicilio:</b> {LEGAL.address}</li> : null}
      {LEGAL.email ? <li><b>Contacto:</b> <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></li> : null}
    </ul>
  );
}

export const contactLine = () =>
  LEGAL.email ? <>escríbenos a <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></> : <>crea una solicitud de «Consulta general» desde tu cuenta ENQORA</>;
