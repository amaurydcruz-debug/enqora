/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Notice } from "@/components/auth-card";
import { CALIDADES, ESTADOS_FIRMANTE, ESTADOS_SOLICITUD, NIVELES, codigoVerificacion, type Calidad } from "@/lib/firma";
import { messageForCode } from "@/lib/db-errors";
import { fechaCL } from "@/lib/informa";
import { markdownSeguro } from "@/lib/markdown-seguro";
import { createClient } from "@/lib/supabase/server";
import { FirmarPanel } from "./firmar-panel";

export const metadata: Metadata = { title: "Firmar documento", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Datos = {
  firmante: { id: string; nombre: string; calidad: Calidad; estado: string; leido_at: string | null; firmado_at: string | null; firma_hash: string | null; rechazo_motivo: string | null; metodo: string | null };
  solicitud: { id: string; folio: string; estado: string; nivel: string; mensaje: string | null; vence_at: string; vencida: boolean; secuencial: boolean; sello: string | null; completada_at: string | null };
  documento: { id: string; folio: string; titulo: string; clase: string; version: number; sha256: string; cuerpo: string | null; anulado: boolean; case_id: string | null };
  empresa: { nombre: string; rut: string } | null;
  turno: boolean;
  firmantes: { orden: number; nombre: string; calidad: Calidad; estado: string; firmado_at: string | null }[];
};

const AVISOS: Record<string, string> = {
  firmado: "Firmaste el documento. Tu firma y su evidencia quedaron guardadas en la Bóveda ENQORA.",
  rechazado: "Registramos que no firmas el documento y tu motivo. El equipo ENQORA lo revisará contigo.",
};

// ENQORA SIGN: el firmante lee el documento completo y firma con el código de su autenticador.
export default async function FirmarPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_documento", { p_signer: id });
  if (error || !data) notFound();
  const x = data as Datos;
  const { firmante: f, solicitud: s, documento: d } = x;
  const abierta = s.estado === "pendiente" && !s.vencida && !d.anulado && f.estado === "pendiente";
  const codigo = codigoVerificacion(s.sello);
  // ENQORA SIGN (0061): ¿tiene este firmante huella o Face ID registrados? Sin la 0061, solo código.
  const { count: llaves } = await supabase.from("signing_passkeys").select("id", { count: "exact", head: true }).is("revoked_at", null);

  return (
    <div className="page firma-page">
      <Link href="/firmas" className="back-link"><span aria-hidden="true">←</span> Mis firmas</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">ENQORA SIGN · {s.folio}</span>
          <h1>{d.titulo}</h1>
          <p className="hero-lead">
            <span className={`badge ${ESTADOS_SOLICITUD[s.estado]?.tono === "ok" ? "badge-ok" : ESTADOS_SOLICITUD[s.estado]?.tono === "muted" ? "badge-muted" : "badge-gold"}`}>{s.vencida && s.estado === "pendiente" ? "Plazo vencido" : ESTADOS_SOLICITUD[s.estado]?.texto ?? s.estado}</span>{" "}
            Firmas como <b>{CALIDADES[f.calidad] ?? f.calidad}</b> · {NIVELES[s.nivel] ?? s.nivel}
          </p>
        </div>
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}
      {s.mensaje ? <Notice kind="info">Mensaje del equipo ENQORA: {s.mensaje}</Notice> : null}

      <section className="card" aria-labelledby="partes-t">
        <h2 id="partes-t">Partes que firman</h2>
        <ol className="firma-partes">
          {x.firmantes.map((p) => (
            <li key={p.orden} className={p.estado === "firmado" ? "is-ok" : p.estado === "rechazado" ? "is-no" : undefined}>
              <b>{p.nombre}</b> <small>{CALIDADES[p.calidad] ?? p.calidad}</small>
              <span>{ESTADOS_FIRMANTE[p.estado] ?? p.estado}{p.firmado_at ? ` · ${fechaCL(p.firmado_at, "long")}` : ""}</span>
            </li>
          ))}
        </ol>
        <p className="muted-line">{s.secuencial ? "Se firma en este orden." : "Cada parte puede firmar en cualquier orden."} Plazo: hasta el {fechaCL(s.vence_at, "long")}.</p>
      </section>

      <article className="doc-hoja firma-hoja" aria-label={d.titulo}>
        <header className="doc-membrete">
          <img src="/brand/enqora-logo.webp" alt="ENQORA" width={180} height={57} />
          <dl>
            <div><dt>Folio</dt><dd>{d.folio}</dd></div>
            <div><dt>Versión</dt><dd>{d.version}</dd></div>
            {x.empresa ? <div><dt>Empresa</dt><dd>{x.empresa.nombre} · {x.empresa.rut}</dd></div> : null}
          </dl>
        </header>
        <div className="doc-cuerpo" dangerouslySetInnerHTML={{ __html: markdownSeguro(d.cuerpo ?? "") }} />
        <footer className="doc-pie">
          <span>Huella SHA-256 de esta versión: <code>{d.sha256}</code></span>
        </footer>
      </article>

      {abierta ? (
        x.turno ? <FirmarPanel signer={f.id} sha={d.sha256} leido={!!f.leido_at} conLlave={(llaves ?? 0) > 0} />
          : <Notice kind="info">Todavía no es tu turno: antes debe firmar otra de las partes. Te avisaremos cuando te toque.</Notice>
      ) : f.estado === "firmado" ? (
        <section className="card firma-ok" aria-labelledby="ok-t">
          <h2 id="ok-t">Firmaste este documento</h2>
          <dl className="kv">
            <div><dt>Fecha y hora</dt><dd>{f.firmado_at ? fechaCL(f.firmado_at, "long") : ""}</dd></div>
            <div><dt>Método</dt><dd>{x.firmante.metodo === "llave_acceso" ? "Cuenta ENQORA + huella o Face ID del dispositivo" : "Cuenta ENQORA + código del autenticador"}</dd></div>
            {f.firma_hash ? <div><dt>Huella de tu firma</dt><dd className="mono">{f.firma_hash}</dd></div> : null}
            {codigo ? <div><dt>Código de verificación</dt><dd className="mono">{s.folio} · {codigo}</dd></div> : <div><dt>Estado</dt><dd>Esperando la firma de las demás partes.</dd></div>}
          </dl>
          {codigo ? <p className="muted-line">Cualquier persona puede comprobar este documento en <Link href={`/verificar-firma?folio=${s.folio}&codigo=${codigo}`}>enqora.cl/verificar-firma</Link> con el folio y el código.</p> : null}
        </section>
      ) : f.estado === "rechazado" ? (
        <Notice kind="info">No firmaste este documento. Motivo registrado: {f.rechazo_motivo}</Notice>
      ) : (
        <Notice kind="info">{d.anulado || s.estado === "anulada" ? "Esta solicitud de firma fue anulada por el equipo ENQORA." : s.vencida ? "El plazo para firmar venció. Pide al equipo ENQORA una nueva solicitud." : "Esta solicitud de firma ya está cerrada."}</Notice>
      )}
    </div>
  );
}
