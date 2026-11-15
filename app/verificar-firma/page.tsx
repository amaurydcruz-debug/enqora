/* eslint-disable @next/next/no-img-element */
import type { Metadata } from "next";
import { EntradaPie, EntradaTop, Icono } from "@/app/entrada";
import { CALIDADES, ESTADOS_FIRMANTE, ESTADOS_SOLICITUD, FOLIO_RE, NIVELES, codigoVerificacion, normalizarCodigo, type Calidad } from "@/lib/firma";
import { fechaCL } from "@/lib/informa";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Verificar un documento firmado · ENQORA SIGN",
  description: "Comprueba si un documento firmado con ENQORA SIGN es auténtico e íntegro, con su folio y su código de verificación.",
};
export const dynamic = "force-dynamic";

type R = { encontrado: boolean; folio?: string; documento?: string; version?: number; estado?: string; nivel?: string; sha256?: string; sello?: string | null;
  completada_at?: string | null; documento_anulado?: boolean; firmas?: { calidad: Calidad; estado: string; firmado_at: string | null; metodo: string | null }[] };

// Portal público de verificación de ENQORA SIGN. Pide folio y código: sin ambos no muestra nada,
// y nunca muestra nombres ni contenido del documento (Ley 21.719).
export default async function VerificarFirmaPage({ searchParams }: { searchParams: Promise<{ folio?: string; codigo?: string }> }) {
  const sp = await searchParams;
  const folio = (sp.folio ?? "").trim().toUpperCase().slice(0, 20);
  const codigo = (sp.codigo ?? "").trim().slice(0, 90);
  let r: R | null = null;
  let invalido = false;
  if (folio || codigo) {
    if (!FOLIO_RE.test(folio) || normalizarCodigo(codigo).length < 16) invalido = true;
    else {
      const supabase = await createClient();
      const { data } = await supabase.rpc("sign_verificar", { p_folio: folio, p_codigo: codigo });
      r = (data as R | null) ?? { encontrado: false };
    }
  }
  const valido = r?.encontrado && r.estado === "completada" && !r.documento_anulado;

  return (
    <div className="entry">
      <EntradaTop />
      <main className="ent-main ent-cat">
        <section className="ent-cat-hero" aria-labelledby="vf-t">
          <img src="/entrada/servicios/profesionales.webp" alt="" className="ent-cat-foto" fetchPriority="high" />
          <div className="ent-cat-hero-text">
            <span className="ent-cat-n"><Icono nombre="constitucion" size={30} /> ENQORA SIGN</span>
            <h1 id="vf-t">Verificar un documento firmado</h1>
            <p className="ent-lead">Ingresa el folio y el código de verificación que aparecen al pie del documento. Te diremos si es auténtico, si está completo y cuándo se firmó.</p>
            <form className="vf-form" action="/verificar-firma">
              <input className="input" name="folio" defaultValue={folio} placeholder="Folio: FIR-2026-000123 o DOC-2026-000123" aria-label="Folio" required maxLength={20} autoCapitalize="characters" />
              <input className="input mono" name="codigo" defaultValue={codigo} placeholder="Código: XXXX-XXXX-XXXX-XXXX-XXXX" aria-label="Código de verificación o huella SHA-256" required maxLength={90} />
              <button className="btn btn-gold btn-inline" type="submit">Verificar</button>
            </form>
          </div>
        </section>

        {invalido ? <p className="alert alert-error vf-resultado" role="alert">Revisa los datos: el folio tiene la forma FIR-2026-000123 y el código, al menos 16 letras o números.</p> : null}
        {r && !r.encontrado ? (
          <section className="card vf-resultado is-no" aria-live="polite">
            <h2>No encontramos un documento firmado con esos datos</h2>
            <p>Revisa que el folio y el código estén bien escritos. Si están correctos, el documento no fue firmado con ENQORA SIGN o fue alterado.</p>
          </section>
        ) : null}
        {r?.encontrado ? (
          <section className={`card vf-resultado ${valido ? "is-ok" : "is-no"}`} aria-live="polite">
            <h2>{valido ? "Documento auténtico y firmado por todas las partes" : r.documento_anulado ? "El documento fue anulado por ENQORA" : ESTADOS_SOLICITUD[r.estado ?? ""]?.texto ?? "Firma en curso"}</h2>
            <dl className="kv">
              <div><dt>Solicitud de firma</dt><dd className="mono">{r.folio}</dd></div>
              <div><dt>Documento</dt><dd className="mono">{r.documento} · versión {r.version}</dd></div>
              <div><dt>Tipo de firma</dt><dd>{NIVELES[r.nivel ?? "simple"]}</dd></div>
              {r.completada_at ? <div><dt>Completada</dt><dd>{fechaCL(r.completada_at, "long")}</dd></div> : null}
              <div><dt>Huella del documento (SHA-256)</dt><dd className="mono vf-huella">{r.sha256}</dd></div>
              {r.sello ? <div><dt>Código de verificación</dt><dd className="mono">{codigoVerificacion(r.sello)}</dd></div> : null}
            </dl>
            <h3>Firmas</h3>
            <ul className="vf-firmas">
              {(r.firmas ?? []).map((f, i) => (
                <li key={i}>{CALIDADES[f.calidad] ?? f.calidad}: <b>{ESTADOS_FIRMANTE[f.estado] ?? f.estado}</b>{f.firmado_at ? ` el ${fechaCL(f.firmado_at, "long")}` : ""}{f.metodo === "codigo_autenticador" ? " · cuenta ENQORA con segundo factor" : ""}</li>
              ))}
            </ul>
            <p className="muted-line">Por privacidad no mostramos nombres ni contenido. Si tienes el documento, comprueba que su folio y su huella coincidan con estos datos.</p>
          </section>
        ) : null}

        <section className="vf-info" aria-label="Sobre ENQORA SIGN">
          <p>ENQORA SIGN usa firma electrónica simple (Ley 19.799): cada parte firma desde su cuenta ENQORA, después de leer el documento completo y con un código de su autenticador. Cada firma guarda su evidencia y la huella del documento; si alguien cambiara una sola letra, la huella dejaría de coincidir.</p>
        </section>
      </main>
      <EntradaPie />
    </div>
  );
}
