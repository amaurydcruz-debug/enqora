import Link from "next/link";
import type { Metadata } from "next";
import { generarReglamentoAction } from "@/app/actions/laboral";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { booksCompany } from "@/lib/accounting-server";
import { messageForCode } from "@/lib/db-errors";
import { avisosRIOHS, type DatosRIOHS } from "@/lib/plantilla-riohs";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reglamento interno" };

type Doc = { id: string; version: number; estado: string; datos: DatosRIOHS & { avisos?: string[] }; creado: string; observacion: string | null };
const ESTADO: Record<string, string> = {
  en_revision: "En revisión del equipo legal", observado: "Con observaciones", aprobado: "✓ Aprobado", reemplazado: "Reemplazado",
  corregido: "Corregido por el equipo legal", anulado: "Anulado",
};

// Reglamento Interno de Orden, Higiene y Seguridad: ENQORA arma el borrador con tus respuestas y un abogado lo aprueba.
export default async function ReglamentoPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string; mensaje?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany();
  if (!company) {
    return (
      <div className="page narrow">
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          El reglamento se prepara por empresa.
        </Callout>
      </div>
    );
  }
  const supabase = await createClient();
  const [{ data: dRows }, { data: emp }, { count: nTrab }, { data: mut }, { count: nKarin }] = await Promise.all([
    supabase.from("documentos_laborales").select("id, version, estado, datos, creado, observacion").eq("company_id", company.id).eq("tipo", "reglamento_interno")
      .order("version", { ascending: false }).limit(10),
    supabase.from("companies").select("legal_name, rut, address, commune, activity").eq("id", company.id).maybeSingle(),
    supabase.from("rem_trabajadores").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("activo", true),
    supabase.from("rem_empresa").select("mutual").eq("company_id", company.id).maybeSingle(),
    supabase.from("documentos_laborales").select("id", { count: "exact", head: true }).eq("company_id", company.id)
      .in("tipo", ["protocolo_karin", "procedimiento_karin"]).eq("estado", "aprobado"),
  ]);
  const docs = (dRows ?? []) as Doc[];
  const e = emp as { legal_name: string; rut: string; address: string | null; commune: string | null; activity: string | null } | null;
  const def: Partial<DatosRIOHS> = docs[0]?.datos ?? {
    razon_social: e?.legal_name, rut: e?.rut?.replace(/\./g, ""), domicilio: [e?.address, e?.commune].filter(Boolean).join(", "), giro: e?.activity ?? "",
    trabajadores: nTrab ?? 0, mutual: (mut as { mutual?: string } | null)?.mutual ?? "",
    dia_pago: "el último día hábil de cada mes", forma_pago: "transferencia electrónica a la cuenta que indique cada persona",
    instancia: (nTrab ?? 0) >= 25 ? "comite" : "ninguna",
  };
  const karin = (nKarin ?? 0) >= 2;
  const puede = company.role === "owner" || company.role === "admin" || company.role === null;
  const vigente = docs.find((d) => d.estado === "aprobado");
  const avisos = docs[0]?.datos?.avisos ?? avisosRIOHS({ ...(def as DatosRIOHS), trabajadores: Number(def.trabajadores ?? 0) || 1 }, karin);

  return (
    <div className="page narrow ps">
      {sp.aviso === "enviado" ? <Notice kind="ok">Reglamento preparado y enviado al equipo legal de ENQORA. Te avisaremos cuando esté aprobado.</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      {sp.mensaje ? <Notice kind="error">{sp.mensaje}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{company.name} · Laboral</span>
          <h1>Reglamento interno de orden, higiene y seguridad</h1>
          <p className="hero-lead">Obligatorio con 10 o más trabajadores (art. 153 del Código del Trabajo); el de higiene y seguridad lo exige la Ley 16.744 a toda empresa. ENQORA lo prepara con tus respuestas y la estructura del D.S. N° 44, y un abogado lo revisa antes de que lo publiques.</p>
        </div>
      </header>
      {!karin ? (
        <Callout kind="warn" title="Primero, la Ley Karin" action={<Link href="/laboral" className="btn btn-ghost btn-inline btn-sm">Ir a Ley Karin</Link>}>
          El reglamento debe incluir el protocolo de prevención y el procedimiento de investigación de la Ley Karin. Puedes preparar el reglamento ahora, pero conviene tener ambos aprobados.
        </Callout>
      ) : null}
      {avisos.length ? <ul className="rem-adv">{avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}

      <section className="ps-card">
        <div className="ps-card-cab"><h2>Tu reglamento</h2></div>
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
        ) : <p className="muted-line">Aún no lo has preparado.</p>}
        {vigente ? (
          <p className="muted-line">Antes de que rija: dalo a conocer al comité paritario o delegado, a los sindicatos y a las personas trabajadoras; publícalo en dos lugares visibles con 30 días de anticipación; entrega un ejemplar gratis a cada persona, con el protocolo y el procedimiento de la Ley Karin como anexos; y envíalo a la Seremi de Salud y a la Dirección del Trabajo.</p>
        ) : null}
      </section>

      {puede ? (
        <section className="ps-card" aria-labelledby="ri-form">
          <div className="ps-card-cab"><h2 id="ri-form">Datos para preparar el reglamento</h2></div>
          <form action={generarReglamentoAction} className="form-grid">
            <input type="hidden" name="empresa" value={company.id} />
            <C id="razon_social" label="Razón social" def={def.razon_social} req />
            <C id="rut" label="RUT de la empresa" def={def.rut} req />
            <C id="domicilio" label="Domicilio" def={def.domicilio} req wide />
            <C id="giro" label="Giro o actividad" def={def.giro} req />
            <C id="representante" label="Representante legal" def={def.representante} req />
            <C id="trabajadores" label="Trabajadores que tiene normalmente" def={def.trabajadores != null ? String(def.trabajadores) : ""} req />
            <C id="mutual" label="Mutual u organismo administrador" def={def.mutual} ph="ACHS, IST, Mutual de Seguridad o ISL" />
            <T id="horario" label="Horario de trabajo (y turnos, si hay)" def={def.horario} ph="De lunes a viernes de 09:00 a 17:54 horas. Turno tarde: de 14:00 a 22:24 horas." />
            <C id="descanso" label="Descanso para colación" def={def.descanso} ph="30 minutos, no imputables a la jornada, entre 13:00 y 15:00 horas" req wide />
            <C id="dia_pago" label="Cuándo se paga" def={def.dia_pago} req />
            <C id="forma_pago" label="Cómo se paga" def={def.forma_pago} req />
            <C id="reclamos" label="Quién recibe peticiones y reclamos" def={def.reclamos} ph="Gerencia de Personas" req />
            <C id="responsable_sst" label="Responsable de seguridad y salud" def={def.responsable_sst} ph="Jefe de operaciones" req />
            <div className="field">
              <label htmlFor="ri-instancia">Comité paritario o delegado</label>
              <select id="ri-instancia" name="instancia" className="input" defaultValue={def.instancia ?? "ninguna"}>
                <option value="comite">Comité Paritario de Higiene y Seguridad</option>
                <option value="delegado">Delegado de Seguridad y Salud en el Trabajo</option>
                <option value="ninguna">Ninguno por ahora</option>
              </select>
            </div>
            <T id="riesgos" label="Principales riesgos del trabajo y cómo se controlan" def={def.riesgos} ph="Caídas al mismo nivel en bodega: pisos despejados y calzado de seguridad. Manejo manual de carga: máximo 25 kg por persona y uso de carros. Trabajo con computador: pausas activas y sillas regulables." />
            <C id="emergencia" label="Emergencias: punto de encuentro y aviso" def={def.emergencia} ph="Punto de encuentro en el estacionamiento norte; aviso por timbre continuo; extintores en cada piso" req wide />
            <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline" pendingText="Preparando…">Preparar y enviar a revisión</SubmitButton></div>
          </form>
        </section>
      ) : <Callout kind="info" title="Solo lectura">Prepara el reglamento el propietario o el administrador de la empresa.</Callout>}
    </div>
  );
}

function C({ id, label, def, ph, wide, req }: { id: string; label: string; def?: string | null; ph?: string; wide?: boolean; req?: boolean }) {
  return (
    <div className={`field${wide ? " field-wide" : ""}`}>
      <label htmlFor={`ri-${id}`}>{label}</label>
      <input id={`ri-${id}`} name={id} className="input" required={req} defaultValue={def ?? ""} placeholder={ph} maxLength={200} />
    </div>
  );
}
function T({ id, label, def, ph }: { id: string; label: string; def?: string | null; ph?: string }) {
  return (
    <div className="field field-wide">
      <label htmlFor={`ri-${id}`}>{label}</label>
      <textarea id={`ri-${id}`} name={id} className="input" rows={3} required defaultValue={def ?? ""} placeholder={ph} maxLength={1000} />
    </div>
  );
}
