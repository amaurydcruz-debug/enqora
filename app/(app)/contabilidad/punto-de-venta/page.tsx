import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { revocarConectorAction } from "@/app/actions/pos";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { booksCompany } from "@/lib/accounting-server";
import { messageForCode } from "@/lib/db-errors";
import { publicSiteUrl } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { CrearConector } from "./crear-conector";

export const metadata: Metadata = { title: "Punto de venta" };

type Conector = { id: string; nombre: string; sistema: string; prefijo: string; creado: string; revocado: string | null; ultimo_uso: string | null };
const fecha = (d: string | null) => (d ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(new Date(d)) : "nunca");

// Contabilidad → Punto de venta: claves para que el POS (Vania POS primero) envíe las ventas de cada día a ENQORA.
export default async function PuntoDeVentaPage({ searchParams }: { searchParams: Promise<{ empresa?: string; aviso?: string; error?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany(sp.empresa);
  if (!company) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("pos_conectores", { p_company: company.id });
  const conectores = (Array.isArray(data) ? data : []) as Conector[];
  const dueno = company.role === "owner" || company.role === "admin";
  const api = `${publicSiteUrl()}/api/pos/ventas`;

  return (
    <div className="page narrow">
      <Link href="/contabilidad" className="back-link"><span aria-hidden="true">←</span> Contabilidad</Link>
      <header className="hero"><div className="hero-main">
        <span className="eyebrow">{company.name} · Contabilidad</span>
        <h1>Conectar mi punto de venta</h1>
        <p className="hero-lead">Tu punto de venta envía a ENQORA el resumen de ventas de cada día. Así cruzamos lo que vendiste con lo que declaras en el SII antes de presentar tu F29.</p>
      </div></header>
      {sp.aviso === "revocado" ? <Notice kind="ok">Conexión revocada: esa clave ya no funciona.</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}

      <section className="card">
        <h2>Conexiones</h2>
        {conectores.length ? (
          <ul className="ps-filas">
            {conectores.map((c) => (
              <li key={c.id} className={c.revocado ? "is-descartado" : ""}>
                <span><b>{c.nombre}</b><small>{c.sistema} · clave {c.prefijo}… · creada {fecha(c.creado)} · último envío {fecha(c.ultimo_uso)}{c.revocado ? ` · revocada ${fecha(c.revocado)}` : ""}</small></span>
                {!c.revocado && dueno ? (
                  <form action={revocarConectorAction}><input type="hidden" name="id" value={c.id} />
                    <ConfirmSubmit variant="ghost" message="¿Revocar esta conexión? El punto de venta dejará de enviar ventas hasta que pongas una clave nueva.">Revocar</ConfirmSubmit>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Aún no hay conexiones.</p>}
        {dueno ? <CrearConector companyId={company.id} /> : <p className="muted-line">Las conexiones las crea el propietario o administrador de la empresa.</p>}
      </section>

      <section className="card">
        <h2>Para el proveedor del punto de venta</h2>
        <p className="muted-line">El POS envía el resumen diario (no el detalle de cada cliente) a esta dirección, con la clave en el encabezado:</p>
        <pre className="pos-codigo">{`POST ${api}
Authorization: Bearer enq_pos_…
Content-Type: application/json

{ "dias": [ { "fecha": "2026-11-20", "n_ventas": 42, "total": 385900,
  "efectivo": 120000, "debito": 200000, "credito": 65900,
  "transferencia": 0, "otros": 0 } ] }`}</pre>
        <p className="muted-line">Hasta 62 días por envío y 60 envíos por hora. Reenviar un día lo reemplaza. Un mes ya aprobado o declarado no admite cambios. La clave debe guardarse en el servidor del POS, no en el navegador.</p>
        <Callout kind="info" title="¿Tu POS no se conecta?">Sube su exportación (CSV) en la contabilidad de cada mes, sección «Punto de venta».</Callout>
      </section>
    </div>
  );
}
