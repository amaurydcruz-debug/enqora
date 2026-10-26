import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { lastPeriods, periodLabel, periodParam, VAT_STATUSES, type VatReturn } from "@/lib/accounting";
import { booksCompany } from "@/lib/accounting-server";
import { clp } from "@/lib/pricing";
import { formatRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Contabilidad" };

// ENQORA CONTABILIDAD: los últimos 12 meses de la empresa, con sus documentos y el estado de su F29.
export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ empresa?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany(sp.empresa);
  if (!company) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">ENQORA Contabilidad</span><h1>Contabilidad</h1></div><Emblem name="contabilidad" size="xl" /></header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          La contabilidad se lleva por empresa.
        </Callout>
      </div>
    );
  }

  const periods = lastPeriods(12);
  const supabase = await createClient();
  const [{ data: docRows }, { data: vatRows }, { data: bankRows }] = await Promise.all([
    supabase.from("acc_documents").select("period, book").eq("company_id", company.id).gte("period", periods[periods.length - 1]).limit(20000),
    supabase.from("vat_returns").select("period, status, total_pagar, remanente_siguiente").eq("company_id", company.id).neq("status", "anulado"),
    supabase.from("bank_movements").select("period").eq("company_id", company.id).gte("period", periods[periods.length - 1]).limit(20000),
  ]);
  const docs = (docRows ?? []) as { period: string; book: string }[];
  const vats = (vatRows ?? []) as Pick<VatReturn, "period" | "status" | "total_pagar" | "remanente_siguiente">[];
  const bank = (bankRows ?? []) as { period: string }[];
  const q = sp.empresa ? `?empresa=${company.id}` : "";

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">ENQORA Contabilidad · {company.name} · {formatRut(company.rut)}</span>
          <h1>Contabilidad mensual</h1>
          <p className="hero-lead">
            Carga el detalle de tu Registro de Compras y Ventas y tus cartolas: ENQORA ordena los documentos, concilia el banco y
            prepara el borrador del F29 para revisión profesional. Nunca te pedirá tu clave del SII.
          </p>
        </div>
        <Emblem name="contabilidad" size="xl" />
      </header>

      <div className="period-grid">
        {periods.map((p) => {
          const v = vats.find((x) => x.period === p);
          const compras = docs.filter((d) => d.period === p && d.book === "compra").length;
          const ventas = docs.filter((d) => d.period === p && d.book === "venta").length;
          const movs = bank.filter((b) => b.period === p).length;
          const empty = !compras && !ventas && !movs && !v;
          return (
            <Link key={p} href={`/contabilidad/${periodParam(p)}${q}`} className={`period-tile${empty ? " is-empty" : ""}`}>
              <b>{periodLabel(p)}</b>
              <small>{empty ? "Sin información cargada" : `${ventas} ventas · ${compras} compras · ${movs} movimientos`}</small>
              {v ? (
                <span className={`status status-${VAT_STATUSES[v.status].tone}`}>
                  F29 {VAT_STATUSES[v.status].label.toLowerCase()}
                  {v.total_pagar ? ` · ${clp(v.total_pagar)}` : v.remanente_siguiente ? ` · remanente ${clp(v.remanente_siguiente)}` : ""}
                </span>
              ) : (
                <span className="status status-muted">{empty ? "Por comenzar" : "F29 sin preparar"}</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
