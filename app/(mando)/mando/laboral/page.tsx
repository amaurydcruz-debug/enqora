import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revisarDocumentoLaboralAction } from "@/app/actions/laboral";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { TIPOS_DOC as KARIN } from "@/lib/plantillas-laborales";

const TIPOS_DOC: Record<string, string> = { ...KARIN, politica_datos: "Política de tratamiento de datos personales (Ley 21.719)", reglamento_interno: "Reglamento Interno de Orden, Higiene y Seguridad" };
type TipoDoc = string;
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { ContratosMando } from "./contratos-mando";

export const metadata: Metadata = { title: "Revisión de documentos" };

type Doc = { id: string; company_id: string; tipo: TipoDoc; version: number; estado: string; contenido: string; plantilla: string; creado: string; observacion: string | null; datos: { avisos?: string[] } | null };
const AVISOS: Record<string, string> = { aprobar: "Documento aprobado. La empresa ya puede imprimirlo.", observar: "Observaciones enviadas a la empresa.",
  contrato_aprobar: "Contrato o anexo aprobado. La empresa ya puede imprimirlo.", contrato_observar: "Observaciones enviadas a la empresa.", contrato_anulado: "Documento anulado con su motivo." };

// Bandeja del equipo legal: los borradores de la Ley Karin que generan las empresas. Aprueba un abogado (persona).
export default async function RevisionLaboralPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role || !["enqora_admin", "ops_director", "lawyer_pro"].includes(role)) notFound();
  const puedeDecidir = role === "enqora_admin" || role === "lawyer_pro";
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("documentos_laborales").select("id, company_id, tipo, version, estado, contenido, plantilla, creado, observacion, datos")
    .in("estado", ["en_revision", "observado", "aprobado"]).order("creado", { ascending: true }).limit(60);
  const docs = (data ?? []) as Doc[];
  const ids = [...new Set(docs.map((d) => d.company_id))];
  const { data: cRows } = ids.length ? await supabase.from("companies").select("id, legal_name, rut").in("id", ids) : { data: [] };
  const empresa = new Map(((cRows ?? []) as { id: string; legal_name: string; rut: string }[]).map((c) => [c.id, c]));
  const pendientes = docs.filter((d) => d.estado === "en_revision");
  const recientes = docs.filter((d) => d.estado !== "en_revision").slice(-15).reverse();

  return (
    <div className="page">
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Operación</span>
          <h1>Revisión de documentos para clientes</h1>
          <p className="hero-lead">Contratos de trabajo, anexos, protocolos de la Ley Karin y políticas de datos personales que prepararon las empresas con las plantillas de ENQORA. Nada llega al cliente como definitivo sin tu aprobación.</p>
        </div>
      </header>
      <Callout kind="warn" title="Qué revisar">
        Que los datos de la empresa sean coherentes. Ley Karin: plazos y sanciones de los artículos 211-A y siguientes del Código del Trabajo y contenidos mínimos de la SUSESO. Reglamento interno: art. 154 N° 1 a 13 del Código del Trabajo y arts. 58 a 61 del D.S. N° 44 de 2024 (multas hasta 25% de la remuneración diaria, procedimiento previo). Datos personales: información del artículo 14 ter de la Ley 19.628 (modificada por la Ley 21.719), plazos de conservación y fundamentos de cada tratamiento. Puedes corregir el texto antes de aprobar: se guarda como una versión nueva y la original queda en el historial.
      </Callout>

      <section className="card">
        <h2>Por revisar ({pendientes.length})</h2>
        {pendientes.length ? pendientes.map((d) => {
          const c = empresa.get(d.company_id);
          return (
            <details key={d.id} className="ps-docs">
              <summary>{c?.legal_name ?? "Empresa"} · {c?.rut} · {TIPOS_DOC[d.tipo]} · v{d.version} · {new Date(d.creado).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}</summary>
              {d.datos?.avisos?.length ? <ul className="rem-adv">{d.datos.avisos.map((x) => <li key={x}>{x}</li>)}</ul> : null}
              {puedeDecidir ? (
                <form action={revisarDocumentoLaboralAction} className="check-stack">
                  <input type="hidden" name="id" value={d.id} />
                  <label htmlFor={`txt-${d.id}`} className="field-label">Texto (puedes corregirlo antes de aprobar)</label>
                  <textarea id={`txt-${d.id}`} name="contenido" className="input doc-editor" defaultValue={d.contenido} maxLength={60000} />
                  <input name="observacion" className="input" maxLength={2000} placeholder="Observación para la empresa (obligatoria si observas)" aria-label="Observación" />
                  <label className="field-check"><input type="checkbox" name="confirmo" value="si" /> Revisé el documento completo y cumple la normativa vigente</label>
                  <div className="upload-row">
                    <SubmitButton name="decision" value="aprobar" className="btn-inline btn-sm" pendingText="…">Aprobar</SubmitButton>
                    <SubmitButton name="decision" value="observar" variant="ghost" className="btn-inline btn-sm" pendingText="…">Observar</SubmitButton>
                  </div>
                </form>
              ) : <pre className="doc-editor">{d.contenido}</pre>}
            </details>
          );
        }) : <p className="muted-line">No hay documentos por revisar.</p>}
      </section>

      <section className="card">
        <h2>Decididos recientemente</h2>
        {recientes.length ? (
          <ul className="ps-filas">
            {recientes.map((d) => (
              <li key={d.id}><span><b>{empresa.get(d.company_id)?.legal_name ?? "Empresa"} · {TIPOS_DOC[d.tipo]} · v{d.version}</b><small>{d.estado}{d.observacion ? ` · ${d.observacion}` : ""}</small></span></li>
            ))}
          </ul>
        ) : <p className="muted-line">Sin decisiones aún.</p>}
      </section>
      <ContratosMando puedeDecidir={puedeDecidir} />
    </div>
  );
}
