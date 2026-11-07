import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { estadoSolicitudAction } from "@/app/actions/caso";
import { SubmitButton } from "@/components/submit-button";
import { DOCUMENTOS, nombreCategoria, type AnalisisCaso } from "@/lib/cora/caso";
import { formatRut } from "@/lib/rut";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Solicitudes de clientes" };
export const dynamic = "force-dynamic";

type Solicitud = {
  id: string; creada: string; rut: string | null; razon_social: string | null; nombre: string; canal: "correo" | "whatsapp"; contacto: string;
  relato: string; analisis: Partial<AnalisisCaso>; estado: "nueva" | "en_revision" | "cotizada" | "cerrada"; nota: string | null;
};
const ESTADO: Record<Solicitud["estado"], string> = { nueva: "Nueva", en_revision: "En revisión", cotizada: "Cotizada", cerrada: "Cerrada" };
const TONO: Record<Solicitud["estado"], string> = { nueva: "gold", en_revision: "muted", cotizada: "ok", cerrada: "muted" };
const fecha = (d: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(d));
const horas = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 3_600_000);

// Centro de Mando → Solicitudes: los casos que cuentan los visitantes después de la consulta pública.
// Compromiso con el cliente: cotización en 24 horas hábiles por el canal que eligió.
export default async function SolicitudesPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  if (!(await myStaffRole())) notFound();
  const { estado } = await searchParams;
  const filtro = estado && estado in ESTADO ? estado : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("solicitudes_caso_listar", { p_estado: filtro });
  const lista = ((data ?? []) as Solicitud[]);

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Clientes</span>
          <h1>Solicitudes de clientes</h1>
          <p className="hero-lead">
            Casos que cuentan los visitantes después de la consulta pública. CORA ordena cada relato y sugiere qué documentos pedir.
            El compromiso con el cliente es enviar la cotización en un plazo de 24 horas hábiles por el canal que eligió.
          </p>
        </div>
      </header>

      <nav className="inline-form" aria-label="Filtrar por estado">
        <Link href="/mando/solicitudes" className={`btn btn-inline btn-sm ${filtro ? "btn-ghost" : "btn-gold"}`}>Todas</Link>
        {(Object.keys(ESTADO) as Solicitud["estado"][]).map((k) => (
          <Link key={k} href={`/mando/solicitudes?estado=${k}`} className={`btn btn-inline btn-sm ${filtro === k ? "btn-gold" : "btn-ghost"}`}>{ESTADO[k]}</Link>
        ))}
      </nav>

      {error ? <p className="lookup-error" role="alert">No pudimos cargar las solicitudes. ¿Ejecutaste la migración 0030 en Supabase?</p> : null}
      {!error && !lista.length ? <section className="card"><p className="muted-line">No hay solicitudes{filtro ? ` en estado «${ESTADO[filtro as Solicitud["estado"]]}»` : ""}.</p></section> : null}

      {lista.map((s) => {
        const digitos = s.contacto.replace(/[^\d]/g, "");
        const href = s.canal === "whatsapp" ? `https://wa.me/${digitos}` : `mailto:${s.contacto}`;
        const h = horas(s.creada);
        return (
          <section key={s.id} className="card">
            <div className="ref-main" style={{ gap: 6 }}>
              <span className="muted-line">
                {fecha(s.creada)} · <span className={`status status-${TONO[s.estado]}`}>{ESTADO[s.estado]}</span>
                {s.estado === "nueva" && h >= 20 ? <b className="status status-risk"> · {h} h sin respuesta</b> : null}
              </span>
              <h2 style={{ margin: 0 }}>{s.nombre}{s.razon_social ? ` · ${s.razon_social}` : ""}{s.rut ? <span className="mono muted-line"> {formatRut(s.rut)}</span> : null}</h2>
              <span>Responder por {s.canal === "whatsapp" ? "WhatsApp" : "correo"}: <a href={href} target="_blank" rel="noopener noreferrer">{s.contacto}</a></span>
              <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{s.relato}</p>
              {s.analisis?.resumen ? <span className="cora-enqora">CORA: {s.analisis.resumen}</span> : null}
              {s.analisis?.categorias?.length ? <span className="muted-line">Área sugerida: {s.analisis.categorias.map(nombreCategoria).join(" y ")}{s.analisis.origen === "reglas" ? " (por reglas)" : ""}</span> : null}
              {s.analisis?.documentos?.length ? <span className="muted-line">Documentos a pedir: {s.analisis.documentos.map((d) => DOCUMENTOS[d]?.nombre ?? d).join(" · ")}</span> : null}
              {s.nota ? <span className="muted-line">Nota del equipo: {s.nota}</span> : null}
            </div>
            <form action={estadoSolicitudAction} className="inline-form" style={{ flexWrap: "wrap", marginTop: 10 }}>
              <input type="hidden" name="id" value={s.id} />
              <select name="estado" className="input input-sm" defaultValue={s.estado} aria-label="Estado">
                {(Object.keys(ESTADO) as Solicitud["estado"][]).map((k) => <option key={k} value={k}>{ESTADO[k]}</option>)}
              </select>
              <input name="nota" className="input input-sm" placeholder="Nota interna (opcional)" maxLength={300} />
              <SubmitButton className="btn-inline btn-sm" pendingText="Guardando…">Guardar</SubmitButton>
            </form>
          </section>
        );
      })}
    </div>
  );
}
