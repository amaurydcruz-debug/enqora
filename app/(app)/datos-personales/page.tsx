import Link from "next/link";
import type { Metadata } from "next";
import { generarPoliticaDatosAction } from "@/app/actions/laboral";
import { Notice } from "@/components/auth-card";
import { OperandoAviso } from "@/components/operando-aviso";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { booksCompany } from "@/lib/accounting-server";
import { messageForCode } from "@/lib/db-errors";
import { DESTINATARIOS, GRUPOS, type DatosPolitica, type Destinatario, type Grupo } from "@/lib/plantilla-datos";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Datos personales" };

type Doc = { id: string; version: number; estado: string; datos: DatosPolitica; creado: string; observacion: string | null };
const ESTADO: Record<string, string> = {
  en_revision: "En revisión del equipo legal", observado: "Con observaciones", aprobado: "✓ Aprobada", reemplazado: "Reemplazada",
  corregido: "Corregida por el equipo legal", anulado: "Anulada",
};

// Política de tratamiento de datos personales (Ley 21.719): ENQORA arma el borrador y un abogado lo aprueba.
export default async function DatosPersonalesPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string; mensaje?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany();
  if (!company) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">Tu empresa</span><h1>Datos personales</h1></div></header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          La política se prepara por empresa.
        </Callout>
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data: dRows }, { data: emp }, { count: nTrab }] = await Promise.all([
    supabase.from("documentos_laborales").select("id, version, estado, datos, creado, observacion").eq("company_id", company.id).eq("tipo", "politica_datos")
      .order("version", { ascending: false }).limit(10),
    supabase.from("companies").select("legal_name, rut, address, commune").eq("id", company.id).maybeSingle(),
    supabase.from("rem_trabajadores").select("id", { count: "exact", head: true }).eq("company_id", company.id),
  ]);
  const docs = (dRows ?? []) as Doc[];
  const e = emp as { legal_name: string; rut: string; address: string | null; commune: string | null } | null;
  const def: Partial<DatosPolitica> = docs[0]?.datos ?? {
    razon_social: e?.legal_name, rut: e?.rut?.replace(/\./g, ""), domicilio: [e?.address, e?.commune].filter(Boolean).join(", "),
    grupos: ["clientes", "proveedores", ...((nTrab ?? 0) > 0 ? ["trabajadores" as Grupo] : [])], destinatarios: ["contabilidad", "tecnologia", "publicos"],
  };
  const puede = company.role === "owner" || company.role === "admin" || company.role === null;
  const vigente = docs.find((d) => d.estado === "aprobado");

  return (
    <div className="page narrow ps">
      <OperandoAviso empresa={company} />
      {sp.aviso === "enviado" ? <Notice kind="ok">Política generada y enviada al equipo legal de ENQORA. Te avisaremos cuando esté aprobada.</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      {sp.mensaje ? <Notice kind="error">{sp.mensaje}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{company.name} · Tu empresa</span>
          <h1>Datos personales</h1>
          <p className="hero-lead">Con la Ley 21.719 toda empresa que trata datos de personas debe tener a disposición del público una política de tratamiento de datos. ENQORA la prepara con tus respuestas y un abogado la revisa antes de que la publiques.</p>
        </div>
      </header>
      <Callout kind="info" title="¿Desde cuándo rige?">
        La fecha legal vigente es el 1 de diciembre de 2026. El Congreso despachó el 17 de noviembre de 2026 la postergación al 15 de octubre de 2027, que rige cuando se publique en el Diario Oficial. Conviene tener la política lista en cualquier caso.
      </Callout>

      <section className="ps-card">
        <div className="ps-card-cab"><h2>Tu política</h2></div>
        {docs.length ? (
          <ul className="ps-filas">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id}>
                <span><b>Versión {d.version} · {ESTADO[d.estado] ?? d.estado}</b><small>{new Date(d.creado).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}{d.observacion ? ` · ${d.observacion}` : ""}</small></span>
                {d.estado === "aprobado" ? <Link className="btn btn-gold btn-inline btn-sm" href={`/laboral/${d.id}`}>Ver e imprimir</Link>
                  : d.estado !== "anulado" ? <Link className="ps-link" href={`/laboral/${d.id}`}>Ver borrador</Link> : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Aún no la has preparado.</p>}
        {vigente ? <p className="muted-line">Publícala en tu sitio web (o en un medio equivalente, como un aviso en tu local) y mantenla siempre disponible.</p> : null}
      </section>

      {puede ? (
        <section className="ps-card" aria-labelledby="dp-form">
          <div className="ps-card-cab"><h2 id="dp-form">Datos para preparar la política</h2></div>
          <form action={generarPoliticaDatosAction} className="form-grid">
            <input type="hidden" name="empresa" value={company.id} />
            <C id="razon_social" label="Razón social" def={def.razon_social} req />
            <C id="rut" label="RUT de la empresa" def={def.rut} ph="76086428-5" req />
            <C id="domicilio" label="Domicilio" def={def.domicilio} req wide />
            <C id="representante" label="Representante legal" def={def.representante} req />
            <C id="correo" label="Correo para ejercer derechos" def={def.correo} ph="privacidad@tuempresa.cl" req />
            <C id="sitio" label="Sitio web (si tienes)" def={def.sitio} ph="www.tuempresa.cl" />
            <C id="encargado" label="Encargado de datos (si existe)" def={def.encargado} />
            <div className="field field-wide">
              <span className="field-label">¿De quiénes guardas datos?</span>
              <div className="check-row">
                {(Object.keys(GRUPOS) as Grupo[]).map((g) => (
                  <label key={g} className="field-check"><input type="checkbox" name="grupos" value={g} defaultChecked={def.grupos?.includes(g)} /> {GRUPOS[g].nombre}</label>
                ))}
              </div>
            </div>
            <div className="field field-wide">
              <span className="field-label">¿Con quién los compartes?</span>
              <div className="check-stack">
                {(Object.keys(DESTINATARIOS) as Destinatario[]).map((k) => (
                  <label key={k} className="field-check"><input type="checkbox" name="destinatarios" value={k} defaultChecked={def.destinatarios?.includes(k)} /> {DESTINATARIOS[k]}</label>
                ))}
              </div>
            </div>
            <div className="field field-wide">
              <label htmlFor="dp-internacional">¿Guardas datos fuera de Chile? (ej.: correo o nube en Estados Unidos)</label>
              <input id="dp-internacional" name="internacional" className="input" maxLength={300} defaultValue={def.internacional ?? ""} placeholder="Déjalo en blanco si no. Ej.: correo y almacenamiento en la nube (Estados Unidos)" />
            </div>
            <div className="field">
              <label htmlFor="dp-auto">¿Decisiones automáticas sobre personas?</label>
              <select id="dp-auto" name="automatizadas" className="input" defaultValue={def.automatizadas ? "si" : "no"}><option value="no">No</option><option value="si">Sí</option></select>
            </div>
            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline" pendingText="Preparando…">Preparar y enviar a revisión</SubmitButton></div>
          </form>
        </section>
      ) : <Callout kind="info" title="Solo lectura">Prepara la política el propietario o el administrador de la empresa.</Callout>}
    </div>
  );
}

function C({ id, label, def, ph, wide, req }: { id: string; label: string; def?: string | null; ph?: string; wide?: boolean; req?: boolean }) {
  return (
    <div className={`field${wide ? " field-wide" : ""}`}>
      <label htmlFor={`dp-${id}`}>{label}</label>
      <input id={`dp-${id}`} name={id} className="input" required={req} defaultValue={def ?? ""} placeholder={ph} maxLength={200} />
    </div>
  );
}
