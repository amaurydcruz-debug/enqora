import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { PrintButton } from "@/components/print-button";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Comprobante de feriado" };

const largo = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

// Comprobante de feriado para firmar en dos ejemplares (uno para cada parte).
export default async function ComprobanteFeriadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("rem_vacaciones").select("id, company_id, trabajador_id, tipo, desde, hasta, dias, estado, motivo_anulacion, creado").eq("id", id).maybeSingle();
  const v = data as { id: string; company_id: string; trabajador_id: string; tipo: string; desde: string; hasta: string | null; dias: number;
    estado: string; motivo_anulacion: string | null; creado: string } | null;
  if (!v || v.tipo !== "tomado" || !v.hasta) notFound();
  const [{ data: t }, { data: e }] = await Promise.all([
    supabase.from("rem_trabajadores").select("nombre, rut, cargo").eq("id", v.trabajador_id).maybeSingle(),
    supabase.from("companies").select("legal_name, rut").eq("id", v.company_id).maybeSingle(),
  ]);
  const trab = t as { nombre: string; rut: string; cargo: string | null } | null;
  const emp = e as { legal_name: string; rut: string } | null;
  const corridos = Math.round((new Date(`${v.hasta}T00:00:00Z`).getTime() - new Date(`${v.desde}T00:00:00Z`).getTime()) / 86400000) + 1;
  return (
    <div className="page narrow print-page">
      <div className="print-tools upload-row">
        <Link href={`/remuneraciones#t-${v.trabajador_id}`} className="ps-link">← Remuneraciones</Link>
        {v.estado === "vigente" ? <PrintButton /> : null}
      </div>
      {v.estado !== "vigente" ? <Callout kind="warn" title="Registro anulado">Este feriado fue anulado: {v.motivo_anulacion ?? ""}. No lo uses.</Callout> : null}
      <div className="doc-texto">
        <h1>Comprobante de feriado</h1>
        <p>Empleador: <b>{emp?.legal_name ?? ""}</b>, RUT {emp?.rut ?? ""}.</p>
        <p>Trabajador(a): <b>{trab?.nombre ?? ""}</b>, RUT {trab?.rut ?? ""}{trab?.cargo ? `, ${trab.cargo}` : ""}.</p>
        <p>
          Se deja constancia de que el trabajador hará uso de su feriado legal desde el <b>{largo(v.desde)}</b> hasta el <b>{largo(v.hasta)}</b>, ambos inclusive:
          {" "}<b>{Number(v.dias).toLocaleString("es-CL")} días hábiles</b> ({corridos} días corridos, contando el sábado como inhábil según el artículo 69 del Código del Trabajo).
          Se reintegra a sus labores el día laboral siguiente.
        </p>
        <p>Durante el feriado el trabajador recibe su remuneración íntegra (art. 71 del Código del Trabajo).</p>
        <p>Fecha: ____ de ____________ de ______</p>
        <p>Firma del empleador: ______________________________</p>
        <p>Firma del trabajador: ______________________________</p>
        <p className="muted-line">Se firma en dos ejemplares, uno para cada parte. Registro N° {v.id.slice(0, 8)} · ENQORA.</p>
      </div>
    </div>
  );
}
