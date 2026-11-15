/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CLASES, ESTADOS } from "@/lib/boveda";
import { CALIDADES, NIVELES, codigoVerificacion, type Calidad } from "@/lib/firma";
import { fechaCL } from "@/lib/informa";
import { markdownSeguro } from "@/lib/markdown-seguro";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { Imprimir } from "./imprimir";

export const metadata: Metadata = { title: "Previsualización · Bóveda ENQORA", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Doc = { id: string; folio: string; titulo: string; clase: string; estado: string; case_id: string | null; company_id: string;
  version_actual: number; version_final: number | null; sha256: string | null; autorizado_at: string | null; origen: string };
type Ver = { version: number; cuerpo: string | null; sha256: string; created_at: string; autor_tipo: string; autor_agente: string | null };

// Previsualización de un documento de la Bóveda, en formato de hoja. Abrirla queda en la bitácora:
// el revisor debe haber visto la versión que aprueba (0059). El cliente solo ve la versión final enviada.
export default async function VistaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: d } = await supabase.from("vault_documents").select("id, folio, titulo, clase, estado, case_id, company_id, version_actual, version_final, sha256, autorizado_at, origen").eq("id", id).maybeSingle();
  if (!d) notFound();
  const doc = d as Doc;
  if (doc.origen !== "generado") notFound();
  const pedida = Number(sp.v);
  const version = Number.isInteger(pedida) && pedida > 0 ? pedida : doc.version_final ?? doc.version_actual;
  const [{ data: v }, { data: co }, { data: c }] = await Promise.all([
    supabase.from("vault_versions").select("version, cuerpo, sha256, created_at, autor_tipo, autor_agente").eq("document_id", id).eq("version", version).maybeSingle(),
    supabase.from("companies").select("legal_name, rut").eq("id", doc.company_id).maybeSingle(),
    doc.case_id ? supabase.from("cases").select("folio").eq("id", doc.case_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  if (!v) notFound();
  const ver = v as Ver;
  await supabase.rpc("vault_registrar_vista", { p_doc: id, p_version: version });
  const final = doc.version_final === version && doc.estado === "enviado";
  const empresa = co as { legal_name: string; rut: string } | null;
  const equipo = !!(await myStaffRole());
  // ENQORA SIGN (0060): firmas de esta versión. Si la 0060 no está pegada, la hoja se muestra sin firmas.
  const { data: fs } = final ? await supabase.rpc("sign_resumen_documento", { p_doc: id }) : { data: null };
  const firma = (Array.isArray(fs) ? fs : []).find((r: { estado: string; version: number }) => r.estado === "completada" && r.version === version) as
    { folio: string; nivel: string; sello: string; completada_at: string; firmantes: { nombre: string; calidad: Calidad; firmado_at: string; firma_hash: string }[] } | undefined;

  return (
    <div className="doc-pagina-fondo">
      <nav className="doc-barra no-imprimir" aria-label="Acciones">
        <Link href={equipo ? `/mando/boveda/${id}` : doc.case_id ? `/casos/${doc.case_id}#boveda` : "/panel"} className="btn btn-ghost btn-inline btn-sm">← Volver a la Bóveda</Link>
        <span>{doc.folio} · versión {version} · {ESTADOS[doc.estado]?.texto ?? doc.estado}</span>
        <Imprimir />
      </nav>
      <article className={`doc-hoja${final ? "" : " doc-borrador"}`} aria-label={doc.titulo}>
        {!final ? <div className="doc-marca" aria-hidden="true">BORRADOR · NO VÁLIDO</div> : null}
        <header className="doc-membrete">
          <img src="/brand/enqora-logo.webp" alt="ENQORA" width={180} height={57} />
          <dl>
            <div><dt>Folio</dt><dd>{doc.folio}</dd></div>
            <div><dt>Versión</dt><dd>{version}</dd></div>
            {c ? <div><dt>Caso</dt><dd>{(c as { folio: string }).folio}</dd></div> : null}
            {empresa ? <div><dt>Cliente</dt><dd>{empresa.legal_name} · {empresa.rut}</dd></div> : null}
            <div><dt>Clase</dt><dd>{CLASES[doc.clase] ?? doc.clase}</dd></div>
          </dl>
        </header>
        <div className="doc-cuerpo" dangerouslySetInnerHTML={{ __html: markdownSeguro(ver.cuerpo ?? "") }} />
        <footer className="doc-pie">
          <span>Huella SHA-256 de esta versión: <code>{ver.sha256}</code></span>
          <span>{final ? `Autorizado y emitido por ENQORA el ${fechaCL(doc.autorizado_at, "long")}.` : `Versión ${version} preparada el ${fechaCL(ver.created_at)} por ${ver.autor_tipo === "agente" ? `el ${ver.autor_agente ?? "agente"} de ENQORA` : "el equipo ENQORA"}. Pendiente de revisión y autorización.`}</span>
        </footer>
        {firma ? (
          <section className="doc-firmas" aria-label="Firmas electrónicas">
            <h2>Firmado electrónicamente</h2>
            <ul>
              {firma.firmantes.map((f) => (
                <li key={f.firma_hash}><b>{f.nombre}</b> · {CALIDADES[f.calidad] ?? f.calidad} · {fechaCL(f.firmado_at, "long")} · huella <code>{f.firma_hash.slice(0, 16)}…</code></li>
              ))}
            </ul>
            <p>{NIVELES[firma.nivel] ?? firma.nivel}, con cuenta ENQORA y código del autenticador. Solicitud {firma.folio}. Código de verificación: <b>{codigoVerificacion(firma.sello)}</b>. Compruébalo en enqora.cl/verificar-firma.</p>
          </section>
        ) : null}
      </article>
    </div>
  );
}
