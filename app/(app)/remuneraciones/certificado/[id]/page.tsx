import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { PrintButton } from "@/components/print-button";
import { MESES_CERT, type CalculoCert } from "@/lib/certificado6";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Certificado N° 6" };

const n = (v: number) => v.toLocaleString("es-CL");

// Certificado N° 6 sobre sueldos y otras rentas similares (art. 101 LIR), con las columnas de las instrucciones del SII.
export default async function CertificadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data } = await (await createClient()).from("rem_certificados").select("id, anio, numero, estado, emitido, detalle, empresa, trabajador").eq("id", id).maybeSingle();
  const c = data as { id: string; anio: number; numero: number; estado: string; emitido: string; detalle: CalculoCert;
    empresa: { nombre: string; rut: string; direccion: string; giro: string | null }; trabajador: { nombre: string; rut: string } } | null;
  if (!c) notFound();
  const d = c.detalle;
  const tot = (k: keyof CalculoCert["meses"][number]) => d.meses.reduce((s, m) => s + Number(m[k] ?? 0), 0);
  const cols: [string, keyof CalculoCert["meses"][number]][] = [
    ["(2) Sueldo bruto", "bruto"], ["(3) Cotización previsional o de salud de cargo del trabajador", "cotiz"], ["(4) Renta imponible afecta al impuesto único", "base"],
    ["(5) Impuesto único retenido", "impuesto"], ["(6) Mayor retención solicitada art. 88 LIR", "mayor"], ["(7) Renta total exenta", "exenta"],
    ["(8) Renta total no gravada", "no_gravada"], ["(9) Rebaja por zonas extremas (D.L. 889)", "zona"],
  ];
  const act: [string, keyof CalculoCert["meses"][number]][] = [
    ["(11) Renta afecta", "base_act"], ["(12) Impuesto único", "impuesto_act"], ["(13) Mayor retención", "mayor_act"],
    ["(14) Renta exenta", "exenta_act"], ["(15) Renta no gravada", "no_gravada_act"], ["(16) Zonas extremas", "zona_act"],
  ];
  return (
    <div className="page print-page cert6">
      <div className="print-tools upload-row">
        <Link href={`/remuneraciones/anual?anio=${c.anio}`} className="ps-link">← Resumen anual</Link>
        {c.estado === "vigente" ? <PrintButton /> : null}
      </div>
      {c.estado !== "vigente" ? <Callout kind="warn" title="Certificado reemplazado">Hay un certificado más reciente para este trabajador y año. Este se conserva solo como historial.</Callout> : null}
      <div className="doc-texto">
        <h1>Certificado N° 6 sobre sueldos y otras rentas similares</h1>
        <p>Certificado N° {c.numero} · Fecha de emisión: {new Date(c.emitido).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}</p>
        <p>
          Empleador: <b>{c.empresa.nombre}</b> · RUT {c.empresa.rut}{c.empresa.direccion ? ` · ${c.empresa.direccion}` : ""}{c.empresa.giro ? ` · Giro: ${c.empresa.giro}` : ""}
        </p>
        <p>
          El empleador certifica que a don(ña) <b>{c.trabajador.nombre}</b>, RUT {c.trabajador.rut}, en su calidad de trabajador dependiente, durante el año {c.anio} se le pagaron las rentas que se indican y sobre las cuales se le practicaron las retenciones de impuesto que se señalan.
        </p>
      </div>
      <div className="cert6-tabla">
        <table className="rem-tabla">
          <thead>
            <tr className="rem-sub"><th>(1) Período</th>{cols.map(([t]) => <th key={t}>{t}</th>)}<th>(10) Factor de actualización</th></tr>
          </thead>
          <tbody>
            {d.meses.map((m) => (
              <tr key={m.mes}>
                <td>{MESES_CERT[m.mes - 1]}</td>
                {cols.map(([, k]) => <td key={k} className="mono">{n(Number(m[k] ?? 0))}</td>)}
                <td className="mono">{m.factor == null ? "—" : String(m.factor).replace(".", ",")}</td>
              </tr>
            ))}
            <tr className="rem-total"><td>Totales</td>{cols.map(([, k]) => <td key={k} className="mono">{n(tot(k))}</td>)}<td /></tr>
          </tbody>
        </table>
        <table className="rem-tabla">
          <thead>
            <tr className="rem-sub"><th>(1) Período</th>{act.map(([t]) => <th key={t}>Montos actualizados {t}</th>)}</tr>
          </thead>
          <tbody>
            {d.meses.map((m) => (
              <tr key={m.mes}><td>{MESES_CERT[m.mes - 1]}</td>{act.map(([, k]) => <td key={k} className="mono">{n(Number(m[k] ?? 0))}</td>)}</tr>
            ))}
            <tr className="rem-total"><td>Totales</td>{act.map(([, k]) => <td key={k} className="mono">{n(tot(k))}</td>)}</tr>
          </tbody>
        </table>
      </div>
      <div className="doc-texto">
        <p>Se extiende el presente certificado en cumplimiento de la normativa vigente (art. 101 de la Ley sobre Impuesto a la Renta).</p>
        <p>Nombre, RUT y firma del empleador o de su representante legal: ______________________________</p>
      </div>
    </div>
  );
}
