import Link from "next/link";
import { enviarNovedadesAction } from "@/app/actions/remuneraciones";
import { SubmitButton } from "@/components/submit-button";
import type { Pendiente } from "@/lib/pendientes-laborales";
import { clp } from "@/lib/pricing";
import type { Linea, Liquidacion } from "@/lib/remuneraciones";
import { PendientesLaborales } from "../empresa-al-dia/pendientes-laborales";

// Vista del cliente: Remuneraciones y Laboral son un servicio que presta ENQORA. La empresa informa las novedades del
// mes, pide trámites y recibe los documentos listos (revisados por el equipo) para pagar, firmar o entregar.

export type Novedad = { trabajador_id: string; datos: Record<string, unknown>; enviado: string };
export type DocListo = { trabajador_id: string; titulo: string; href: string };
type TrabC = { id: string; nombre: string; cargo: string | null; activo: boolean; fecha_baja: string | null };
type LiqC = { id: string; trabajador_id: string; estado: string; detalle: Liquidacion; liquido: number };

export const pedir = (asunto: string) => `/casos/nuevo?modulo=gestion&asunto=${encodeURIComponent(`Remuneraciones: ${asunto}`)}`;
const SOLICITUDES = [
  ["Contratar a una persona", "contratar a una persona nueva (ficha y contrato)"],
  ["Contrato o anexo", "contrato o anexo de contrato"],
  ["Pacto de horas extra", "pacto de horas extraordinarias"],
  ["Vacaciones", "registrar vacaciones"],
  ["Despedir o terminar un contrato", "término de contrato (carta de aviso y finiquito)"],
  ["Otra consulta laboral", "consulta laboral"],
] as const;

function Lineas({ titulo, lineas }: { titulo: string; lineas: Linea[] }) {
  if (!lineas?.length) return null;
  return (
    <>
      <tr className="rem-sub"><th colSpan={2}>{titulo}</th></tr>
      {lineas.map((l, i) => <tr key={i}><td>{l.concepto}</td><td className="mono">{clp(l.monto)}</td></tr>)}
    </>
  );
}

export function RemuneracionesCliente({ periodo, nombreMes, trabajadores, liqs, novedades, docs, pendientes, archivosListos }: {
  periodo: string; nombreMes: string; trabajadores: TrabC[]; liqs: LiqC[]; novedades: Novedad[]; docs: DocListo[];
  pendientes: Pendiente[]; archivosListos: boolean;
}) {
  const activos = trabajadores.filter((t) => t.activo);
  const aprobada = (tid: string) => liqs.find((l) => l.trabajador_id === tid && l.estado === "aprobada");
  const nov = (tid: string) => novedades.find((n) => n.trabajador_id === tid);
  const fecha = (s: string) => new Date(s).toLocaleDateString("es-CL", { timeZone: "America/Santiago" });
  return (
    <>
      <section className="ps-card" aria-labelledby="rc-pend">
        <div className="ps-card-cab"><h2 id="rc-pend">Lo que falta</h2></div>
        <PendientesLaborales items={pendientes} cliente />
      </section>

      <section className="ps-card" aria-labelledby="rc-nov">
        <div className="ps-card-cab"><h2 id="rc-nov">Novedades de {nombreMes}</h2></div>
        <p className="muted-line">Cuéntanos qué pasó en el mes con cada persona: días trabajados, horas extra, bonos, anticipos y licencias. Con eso el equipo ENQORA calcula y revisa las liquidaciones.</p>
        {activos.length ? (
          <ul className="ps-filas rem-lista">
            {activos.map((t) => {
              const n = nov(t.id)?.datos ?? {};
              const lic = (n.licencia ?? null) as { tipo?: string; desde?: string; hasta?: string } | null;
              const cerrada = !!aprobada(t.id);
              const v = (k: string, def: string) => String(n[k] ?? def);
              return (
                <li key={t.id} id={`t-${t.id}`}>
                  <span>
                    <b>{t.nombre}</b>
                    <small>{t.cargo ?? ""}{nov(t.id) ? ` · informado el ${fecha(nov(t.id)!.enviado)}` : " · sin informar"}{cerrada ? " · liquidación lista" : ""}</small>
                  </span>
                  {!cerrada ? (
                    <details className="ps-docs rem-acciones" open={!nov(t.id)}>
                      <summary>{nov(t.id) ? "Corregir novedades" : "Informar novedades"}</summary>
                      <form action={enviarNovedadesAction} className="form-grid">
                        <input type="hidden" name="trabajador" value={t.id} />
                        <input type="hidden" name="periodo" value={periodo} />
                        <N id={`nd-${t.id}`} name="dias" label="Días trabajados" def={v("dias_trabajados", "30")} />
                        <N id={`nh-${t.id}`} name="horas_extra" label="Horas extra" def={v("horas_extra", "0")} />
                        <N id={`nb-${t.id}`} name="bonos" label="Bonos ($)" def={v("bonos_imponibles", "0")} />
                        <N id={`na-${t.id}`} name="anticipos" label="Anticipos ($)" def={v("anticipos", "0")} />
                        <N id={`no-${t.id}`} name="otros" label="Otros descuentos ($)" def={v("otros_descuentos", "0")} />
                        <N id={`nl-${t.id}`} name="dias_licencia" label="Días con licencia médica" def={v("dias_licencia", "0")} />
                        <div className="field">
                          <label htmlFor={`nt-${t.id}`}>Tipo de licencia</label>
                          <select id={`nt-${t.id}`} name="licencia_tipo" className="input" defaultValue={lic?.tipo ?? "comun"}>
                            <option value="comun">Enfermedad o accidente común</option>
                            <option value="laboral">Accidente del trabajo</option>
                          </select>
                        </div>
                        <div className="field"><label htmlFor={`ns-${t.id}`}>Licencia desde</label><input id={`ns-${t.id}`} name="licencia_desde" type="date" className="input" defaultValue={lic?.desde ?? ""} /></div>
                        <div className="field"><label htmlFor={`nu-${t.id}`}>Licencia hasta</label><input id={`nu-${t.id}`} name="licencia_hasta" type="date" className="input" defaultValue={lic?.hasta ?? ""} /></div>
                        <div className="field field-wide"><label htmlFor={`nx-${t.id}`}>Algo más que debamos saber</label><input id={`nx-${t.id}`} name="nota" className="input" maxLength={500} defaultValue={v("nota", "")} /></div>
                        <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Enviando…">Enviar a ENQORA</SubmitButton></div>
                      </form>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : <p className="muted-line">Aún no hay trabajadores registrados. Pídele a ENQORA que incorpore a tu equipo.</p>}
      </section>

      <section className="ps-card" aria-labelledby="rc-liq">
        <div className="ps-card-cab"><h2 id="rc-liq">Liquidaciones de {nombreMes}</h2></div>
        {liqs.some((l) => l.estado === "aprobada") ? (
          <ul className="ps-filas rem-lista">
            {liqs.filter((l) => l.estado === "aprobada").map((l) => (
              <li key={l.id}>
                <span><b>{trabajadores.find((t) => t.id === l.trabajador_id)?.nombre ?? ""}</b><small>Líquido a pagar {clp(Number(l.liquido))}</small></span>
                <details className="ps-docs rem-acciones">
                  <summary>Ver liquidación</summary>
                  <table className="rem-tabla"><tbody>
                    <Lineas titulo="Haberes imponibles" lineas={l.detalle.haberes_imponibles} />
                    <Lineas titulo="Haberes no imponibles" lineas={l.detalle.haberes_no_imponibles} />
                    <Lineas titulo="Descuentos" lineas={l.detalle.descuentos} />
                    <tr className="rem-total"><td>Líquido a pagar</td><td className="mono">{clp(l.detalle.liquido)}</td></tr>
                    <Lineas titulo="Aportes de cargo del empleador" lineas={l.detalle.aportes_empleador} />
                    <tr className="rem-total"><td>Costo empresa</td><td className="mono">{clp(l.detalle.costo_empresa)}</td></tr>
                  </tbody></table>
                </details>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">El equipo ENQORA las prepara con las novedades que informes. Te avisamos cuando estén listas.</p>}
        {archivosListos ? (
          <div className="upload-row">
            <a className="btn btn-gold btn-inline btn-sm" href={`/remuneraciones/archivo?tipo=previred&periodo=${periodo}`}>Planilla Previred (.txt)</a>
            <a className="btn btn-ghost btn-inline btn-sm" href={`/remuneraciones/archivo?tipo=lre&periodo=${periodo}`}>Libro de Remuneraciones (.csv)</a>
          </div>
        ) : null}
      </section>

      <section className="ps-card" aria-labelledby="rc-docs">
        <div className="ps-card-cab"><h2 id="rc-docs">Documentos listos</h2></div>
        {docs.length ? (
          <ul className="ps-filas">
            {docs.map((d, i) => (
              <li key={i}>
                <span><b>{d.titulo}</b><small>{trabajadores.find((t) => t.id === d.trabajador_id)?.nombre ?? ""}</small></span>
                <Link className="btn btn-ghost btn-inline btn-sm" href={d.href}>Ver e imprimir</Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Aquí aparecen los contratos, anexos, cartas, finiquitos y certificados cuando el equipo los apruebe.</p>}
        <p className="muted-line"><Link href="/remuneraciones/anual" className="ps-link">Resumen anual y certificados de sueldos →</Link></p>
      </section>

      <section className="ps-card" aria-labelledby="rc-pedir">
        <div className="ps-card-cab"><h2 id="rc-pedir">Pide a ENQORA</h2></div>
        <div className="upload-row">
          {SOLICITUDES.map(([t, a]) => <Link key={t} href={pedir(a)} className="btn btn-ghost btn-inline btn-sm">{t}</Link>)}
        </div>
      </section>
    </>
  );
}

function N({ id, name, label, def }: { id: string; name: string; label: string; def: string }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} className="input" inputMode="decimal" defaultValue={def} />
    </div>
  );
}
