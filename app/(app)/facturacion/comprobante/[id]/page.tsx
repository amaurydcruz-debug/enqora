import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { PrintButton } from "@/components/print-button";
import { day, moment, PAYMENT_METHODS, type Charge, type Payment } from "@/lib/billing";
import { clp } from "@/lib/pricing";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Comprobante de pago" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Comprobante interno de un pago confirmado (imprimible o para guardar en PDF).
// No es un documento tributario: la boleta o factura electrónica se emite aparte.
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createClient();
  const { data: pRow } = await supabase.from("payments").select("*").eq("id", id).eq("status", "confirmado").maybeSingle();
  if (!pRow) notFound();
  const p = pRow as Payment;
  const [{ data: cRow }, { data: company }] = await Promise.all([
    supabase.from("charges").select("*").eq("id", p.charge_id).maybeSingle(),
    supabase.from("companies").select("legal_name, trade_name, rut").eq("id", p.company_id).maybeSingle(),
  ]);
  const c = cRow as Charge | null;
  const co = company as { legal_name: string; trade_name: string | null; rut: string } | null;
  if (!c) notFound();
  const number = `${c.folio}-${p.id.slice(0, 6).toUpperCase()}`;

  return (
    <div className="page narrow print-page">
      <div className="print-tools">
        <Link href="/facturacion#pagos" className="back-link"><span aria-hidden="true">←</span> Facturación</Link>
        <PrintButton />
      </div>
      <article className="receipt" aria-labelledby="receipt-title">
        <header className="print-head">
          <span className="print-brand"><EnqoraClock size={30} /> ENQ<em>ORA</em></span>
          <dl>
            <div><dt>N°</dt><dd className="mono">{number}</dd></div>
            <div><dt>Fecha</dt><dd>{moment(p.confirmed_at)}</dd></div>
          </dl>
        </header>
        <h1 id="receipt-title" className="receipt-title">Comprobante de pago</h1>
        <dl className="receipt-lines">
          <div><dt>Empresa</dt><dd>{co ? `${co.legal_name} · ${formatRut(co.rut)}` : "—"}</dd></div>
          <div><dt>Concepto</dt><dd>{c.description}</dd></div>
          <div><dt>Cobro</dt><dd className="mono">{c.folio}</dd></div>
          {c.period_start && c.period_end ? <div><dt>Período</dt><dd>{day(c.period_start)} al {day(c.period_end)}</dd></div> : null}
          <div><dt>Medio de pago</dt><dd>{PAYMENT_METHODS[p.method]}{p.media ? ` · ${p.media}` : ""}</dd></div>
          {p.provider_order ? <div><dt>Orden de la pasarela</dt><dd className="mono">{p.provider_order}</dd></div> : null}
          {p.reference ? <div><dt>Referencia</dt><dd className="mono">{p.reference}</dd></div> : null}
          {p.paid_on ? <div><dt>Fecha del pago</dt><dd>{day(p.paid_on)}</dd></div> : null}
          <div className="is-total"><dt>Monto pagado</dt><dd>{clp(p.amount)}</dd></div>
        </dl>
        <p className="diag-note">
          Comprobante interno de ENQORA que acredita la recepción del pago. No reemplaza la boleta ni la factura electrónica.
        </p>
      </article>
    </div>
  );
}
