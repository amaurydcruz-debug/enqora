import Link from "next/link";
import type { Metadata } from "next";
import { generarDocumentosLaboralesAction } from "@/app/actions/laboral";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { booksCompany } from "@/lib/accounting-server";
import { messageForCode } from "@/lib/db-errors";
import { recordatorios, TIPOS_DOC, type DatosDoc, type TipoDoc } from "@/lib/plantillas-laborales";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ley Karin" };

type Doc = { id: string; tipo: TipoDoc; version: number; estado: string; datos: DatosDoc; creado: string; revisado_at: string | null; observacion: string | null };
const ESTADO: Record<string, string> = {
  en_revision: "En revisión del equipo legal", observado: "Con observaciones", aprobado: "✓ Aprobado", reemplazado: "Reemplazado",
  corregido: "Corregido por el equipo legal", anulado: "Anulado",
};

// Ley Karin: protocolo de prevención y procedimiento de investigación y sanción, generados con los datos de la
// empresa y aprobados por un abogado de ENQORA antes de usarse.
export default async function LaboralPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string; mensaje?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany();
  if (!company) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">Tu equipo</span><h1>Ley Karin</h1></div></header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          Los documentos se preparan por empresa.
        </Callout>
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data: dRows }, { data: emp }, { count: nTrab }, { data: rem }] = await Promise.all([
    supabase.from("documentos_laborales").select("id, tipo, version, estado, datos, creado, revisado_at, observacion")
      .eq("company_id", company.id).order("version", { ascending: false }).limit(40),
    supabase.from("companies").select("legal_name, rut, address, commune, activity").eq("id", company.id).maybeSingle(),
    supabase.from("rem_trabajadores").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("activo", true),
    supabase.from("rem_empresa").select("mutual").eq("company_id", company.id).maybeSingle(),
  ]);
  const docs = (dRows ?? []) as Doc[];
  const e = emp as { legal_name: string; rut: string; address: string | null; commune: string | null; activity: string | null } | null;
  const ultimo = docs[0]?.datos;
  const def: Partial<DatosDoc> = ultimo ?? {
    razon_social: e?.legal_name, rut: e?.rut?.replace(/\./g, ""), domicilio: [e?.address, e?.commune].filter(Boolean).join(", "), rubro: e?.activity ?? "",
    trabajadores: nTrab ?? undefined, organismo: (rem as { mutual?: string } | null)?.mutual,
  };
  const puede = company.role === "owner" || company.role === "admin" || company.role === null;
  const porTipo = (t: TipoDoc) => docs.filter((d) => d.tipo === t);

  return (
    <div className="page narrow ps">
      {sp.aviso === "enviado" ? <Notice kind="ok">Documentos generados y enviados al equipo legal de ENQORA. Te avisaremos cuando estén aprobados.</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      {sp.mensaje ? <Notice kind="error">{sp.mensaje}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{company.name} · Tu equipo</span>
          <h1>Ley Karin</h1>
          <p className="hero-lead">Toda empresa con trabajadores debe tener un protocolo de prevención del acoso y la violencia en el trabajo y un procedimiento de investigación y sanción (Ley N°21.643). ENQORA los prepara con tus datos y un abogado los revisa antes de que los uses.</p>
        </div>
      </header>

      {(Object.keys(TIPOS_DOC) as TipoDoc[]).map((t) => {
        const lista = porTipo(t);
        const vigente = lista.find((d) => d.estado === "aprobado");
        const ult = lista[0];
        return (
          <section className="ps-card" key={t}>
            <div className="ps-card-cab"><h2>{TIPOS_DOC[t]}</h2></div>
            {ult ? (
              <ul className="ps-filas">
                {lista.slice(0, 4).map((d) => (
                  <li key={d.id}>
                    <span>
                      <b>Versión {d.version} · {ESTADO[d.estado] ?? d.estado}</b>
                      <small>{new Date(d.creado).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}{d.observacion ? ` · ${d.observacion}` : ""}</small>
                    </span>
                    {d.estado === "aprobado" ? <Link className="btn btn-gold btn-inline btn-sm" href={`/laboral/${d.id}`}>Ver e imprimir</Link>
                      : d.estado !== "anulado" ? <Link className="ps-link" href={`/laboral/${d.id}`}>Ver borrador</Link> : null}
                  </li>
                ))}
              </ul>
            ) : <p className="muted-line">Aún no lo has preparado.</p>}
            {!vigente && ult?.estado === "observado" ? <p className="gx-aviso">El equipo legal dejó observaciones: corrige los datos abajo y genera una versión nueva.</p> : null}
          </section>
        );
      })}

      {puede ? (
        <section className="ps-card" aria-labelledby="lk-datos">
          <div className="ps-card-cab"><h2 id="lk-datos">Datos para preparar los documentos</h2></div>
          <form action={generarDocumentosLaboralesAction} className="form-grid">
            <input type="hidden" name="empresa" value={company.id} />
            <C id="razon_social" label="Razón social" def={def.razon_social} />
            <C id="rut" label="RUT de la empresa" def={def.rut} ph="76086428-5" />
            <C id="domicilio" label="Domicilio" def={def.domicilio} wide />
            <C id="rubro" label="Rubro o actividad" def={def.rubro} />
            <C id="trabajadores" label="N° de personas trabajadoras" def={def.trabajadores != null ? String(def.trabajadores) : ""} num />
            <C id="representante" label="Quién firma (máxima autoridad)" def={def.representante} />
            <C id="cargo_representante" label="Su cargo" def={def.cargo_representante} ph="Gerente general" />
            <C id="canal_responsable" label="Quién recibe las denuncias (cargo)" def={def.canal_responsable} ph="Encargada de personas" />
            <C id="canal_correo" label="Correo para denuncias" def={def.canal_correo} ph="denuncias@tuempresa.cl" />
            <C id="organismo" label="Mutual o ISL" def={def.organismo} ph="ACHS, IST, Mutual de Seguridad o ISL" />
            <div className="field">
              <label htmlFor="lk-pub">¿Atiende público?</label>
              <select id="lk-pub" name="atiende_publico" className="input" defaultValue={def.atiende_publico ? "si" : "no"}><option value="si">Sí</option><option value="no">No</option></select>
            </div>
            <div className="field">
              <label htmlFor="lk-tele">¿Hay teletrabajo?</label>
              <select id="lk-tele" name="teletrabajo" className="input" defaultValue={def.teletrabajo ? "si" : "no"}><option value="si">Sí</option><option value="no">No</option></select>
            </div>
            <div className="field">
              <label htmlFor="lk-inv">¿Quién investiga las denuncias?</label>
              <select id="lk-inv" name="investigacion" className="input" defaultValue={def.investigacion ?? "interna"}>
                <option value="interna">La empresa (investigación interna)</option>
                <option value="inspeccion">La Inspección del Trabajo</option>
              </select>
            </div>
            <div className="field field-wide">
              <span className="field-label">Documentos</span>
              <div className="check-row">
                {(Object.keys(TIPOS_DOC) as TipoDoc[]).map((t) => (
                  <label key={t} className="field-check"><input type="checkbox" name="tipo" value={t} defaultChecked /> {TIPOS_DOC[t]}</label>
                ))}
              </div>
            </div>
            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline" pendingText="Preparando…">Preparar y enviar a revisión</SubmitButton></div>
          </form>
        </section>
      ) : <Callout kind="info" title="Solo lectura">Preparan estos documentos el propietario o el administrador de la empresa.</Callout>}

      {ultimo ? (
        <Callout kind="info" title="Después de la aprobación">
          <ul className="rem-adv">{recordatorios(ultimo).map((x) => <li key={x}>{x}</li>)}</ul>
        </Callout>
      ) : null}
    </div>
  );
}

function C({ id, label, def, ph, wide, num }: { id: string; label: string; def?: string | number | null; ph?: string; wide?: boolean; num?: boolean }) {
  return (
    <div className={`field${wide ? " field-wide" : ""}`}>
      <label htmlFor={`lk-${id}`}>{label}</label>
      <input id={`lk-${id}`} name={id} className="input" required defaultValue={def == null ? "" : String(def)} placeholder={ph} inputMode={num ? "numeric" : undefined} maxLength={200} />
    </div>
  );
}
