import Link from "next/link";
import type { Metadata } from "next";
import { emitirCertificadoAction } from "@/app/actions/certificado6";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { booksCompany } from "@/lib/accounting-server";
import { anioPorDefecto, MESES_CERT, type FilaResumen } from "@/lib/certificado6";
import { messageForCode } from "@/lib/db-errors";
import { clp, todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Resumen anual y certificados de sueldos" };

type Cert = { id: string; trabajador_id: string; numero: number; estado: string; emitido: string };

// Resumen anual por trabajador (para cuadrar la propuesta de la DJ 1887 que arma el SII) y Certificado N° 6.
export default async function AnualPage({ searchParams }: { searchParams: Promise<{ anio?: string; error?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany();
  if (!company?.canBook) {
    return (
      <div className="page narrow">
        <Callout kind="info" title="Acceso restringido">El resumen anual lo ven el propietario, el administrador y el contador de la empresa.</Callout>
      </div>
    );
  }
  const hoy = todayCL();
  const anioActual = Number(hoy.slice(0, 4));
  const pedido = Number(sp.anio);
  const anio = Number.isInteger(pedido) && pedido >= 2020 && pedido <= anioActual ? pedido : anioPorDefecto(hoy);
  const supabase = await createClient();
  const [{ data: res }, { data: cRows }] = await Promise.all([
    supabase.rpc("rem_resumen_anual", { p_company: company.id, p_anio: anio }),
    supabase.from("rem_certificados").select("id, trabajador_id, numero, estado, emitido").eq("company_id", company.id).eq("anio", anio).order("numero"),
  ]);
  const filas = (res ?? []) as FilaResumen[];
  const certs = (cRows ?? []) as Cert[];
  const vigente = (tid: string) => certs.find((c) => c.trabajador_id === tid && c.estado === "vigente");
  const cerrado = anio < anioActual;
  const faltan = [...new Set(filas.flatMap((f) => f.calculo.faltan_factores))].sort((a, b) => a - b);
  const suma = (k: "bruto" | "base" | "impuesto" | "no_gravada" | "base_act" | "impuesto_act") => filas.reduce((s, f) => s + Number(f.calculo.totales[k]), 0);

  return (
    <div className="page ps">
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{company.name} · Remuneraciones</span>
          <h1>Resumen anual y certificados de sueldos</h1>
          <p className="hero-lead">Lo pagado a cada trabajador en el año, mes a mes, con las liquidaciones aprobadas. Sirve para revisar la declaración de sueldos (DJ 1887) y para emitir el Certificado N° 6 de cada trabajador.</p>
        </div>
      </header>
      <div className="upload-row rem-periodo">
        <Link href="/remuneraciones" className="ps-link">← Remuneraciones</Link>
        <form method="get" className="upload-row">
          <label htmlFor="an-anio">Año</label>
          <select id="an-anio" name="anio" className="input input-sm" defaultValue={String(anio)}>
            {Array.from({ length: 4 }, (_, i) => anioActual - i).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button type="submit" className="btn btn-ghost btn-inline btn-sm">Ver</button>
        </form>
      </div>

      <Callout kind="info" title="Cómo se usa">
        Con la información del Libro de Remuneraciones Electrónico, el SII prepara una propuesta de la DJ 1887. Compárala con los totales de esta página antes de aceptarla; si no coincide, revisa con tu contador. Para el año tributario 2027 la DJ 1887 vence el 29 de marzo de 2027.
        {!cerrado ? ` El año ${anio} aún no termina: los certificados se emiten desde enero.` : ""}
      </Callout>
      {faltan.length ? (
        <Callout kind="warn" title="Faltan factores de actualización">
          El SII aún no publica, o el equipo ENQORA aún no carga, los factores de {faltan.map((m) => MESES_CERT[m - 1].toLowerCase()).join(", ")} de {anio}. Los montos actualizados quedan en cero hasta entonces.
        </Callout>
      ) : null}

      <section className="ps-card" aria-labelledby="an-tot">
        <div className="ps-card-cab"><h2 id="an-tot">Totales de la empresa en {anio}</h2></div>
        <dl className="gx-totales">
          <div><dt>Renta bruta</dt><dd>{clp(suma("bruto"))}</dd></div>
          <div><dt>Renta afecta al impuesto único</dt><dd>{clp(suma("base"))}</dd></div>
          <div><dt>Impuesto único retenido</dt><dd>{clp(suma("impuesto"))}</dd></div>
          <div><dt>Rentas no gravadas</dt><dd>{clp(suma("no_gravada"))}</dd></div>
        </dl>
        <p className="muted-line">Actualizados: renta afecta {clp(suma("base_act"))} · impuesto {clp(suma("impuesto_act"))}. {filas.length} trabajador(es) con pagos en el año.</p>
      </section>

      <section className="ps-card" aria-labelledby="an-trab">
        <div className="ps-card-cab"><h2 id="an-trab">Por trabajador</h2></div>
        {filas.length ? (
          <ul className="ps-filas rem-lista">
            {filas.map((f) => {
              const c = vigente(f.trabajador_id);
              const t = f.calculo.totales;
              return (
                <li key={f.trabajador_id}>
                  <span>
                    <b>{f.nombre}{f.calculo.finiquitado ? " · finiquitado en el año" : ""}</b>
                    <small>{f.rut} · {f.calculo.meses.length} mes(es) · bruta {clp(t.bruto)} · afecta {clp(t.base)} · impuesto {clp(t.impuesto)} · no gravada {clp(t.no_gravada)}</small>
                    <small>Actualizados: afecta {clp(t.base_act)} · impuesto {clp(t.impuesto_act)} · no gravada {clp(t.no_gravada_act)}</small>
                  </span>
                  <div className="upload-row">
                    {c ? <Link className="btn btn-ghost btn-inline btn-sm" href={`/remuneraciones/certificado/${c.id}`}>Certificado N° {c.numero}</Link> : null}
                    {cerrado ? (
                      <form action={emitirCertificadoAction}>
                        <input type="hidden" name="trabajador" value={f.trabajador_id} />
                        <input type="hidden" name="anio" value={anio} />
                        <SubmitButton variant={c ? "ghost" : undefined} className="btn-inline btn-sm" pendingText="Emitiendo…" disabled={f.calculo.faltan_factores.length > 0}>
                          {c ? "Emitir de nuevo" : "Emitir certificado"}
                        </SubmitButton>
                      </form>
                    ) : null}
                  </div>
                  <details className="ps-docs rem-acciones">
                    <summary>Detalle mensual</summary>
                    <table className="rem-tabla">
                      <thead>
                        <tr className="rem-sub"><th>Mes</th><th>Bruta</th><th>Cotizaciones</th><th>Afecta</th><th>Impuesto</th><th>No gravada</th><th>Factor</th></tr>
                      </thead>
                      <tbody>
                        {f.calculo.meses.map((m) => (
                          <tr key={m.mes}>
                            <td>{MESES_CERT[m.mes - 1]}</td><td className="mono">{clp(m.bruto)}</td><td className="mono">{clp(m.cotiz)}</td>
                            <td className="mono">{clp(m.base)}</td><td className="mono">{clp(m.impuesto)}</td><td className="mono">{clp(m.no_gravada)}</td>
                            <td className="mono">{m.factor == null ? "—" : String(m.factor).replace(".", ",")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted-line">No hay liquidaciones aprobadas en {anio}.</p>}
        {certs.some((c) => c.estado === "reemplazado") ? (
          <p className="muted-line">{certs.filter((c) => c.estado === "reemplazado").length} certificado(s) reemplazado(s) se conservan en el historial con su número.</p>
        ) : null}
      </section>
    </div>
  );
}
