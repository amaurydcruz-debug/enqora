import Link from "next/link";
import { anularVacacionAction, registrarVacacionAction } from "@/app/actions/vacaciones";
import { SubmitButton } from "@/components/submit-button";
import type { RegistroVacacion, SaldoVacaciones } from "@/lib/vacaciones";

const fmt = (n: number) => n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
const fecha = (s: string) => s.split("-").reverse().join("-");
const TIPO: Record<RegistroVacacion["tipo"], string> = { tomado: "Vacaciones", saldo_inicial: "Saldo inicial", progresivo: "Feriado progresivo" };

// Vacaciones de un trabajador activo: saldo, registros y formularios (días tomados, saldo inicial, progresivo).
export function VacacionesBloque({ t, saldo, registros, hoy }: {
  t: { id: string; fecha_ingreso: string }; saldo: SaldoVacaciones; registros: RegistroVacacion[]; hoy: string;
}) {
  const tieneInicial = registros.some((r) => r.tipo === "saldo_inicial" && r.estado === "vigente");
  return (
    <details className="ps-docs">
      <summary>Vacaciones · saldo {fmt(saldo.saldo)} días hábiles</summary>
      <div className="rem-fin">
        <p>
          Ganados {fmt(saldo.devengado)} · tomados {fmt(saldo.tomados)}{saldo.programados ? ` · programados ${fmt(saldo.programados)}` : ""} · <b>saldo {fmt(saldo.saldo)}</b>
          {saldo.proximo_aniversario ? ` · próximo período el ${fecha(saldo.proximo_aniversario)}` : ""} · proporcional en curso {fmt(saldo.proporcional)}
        </p>
        {saldo.advertencias.length ? <ul className="rem-adv">{saldo.advertencias.map((a) => <li key={a}>{a}</li>)}</ul> : null}
        {!tieneInicial ? (
          <p className="muted-line">Si este trabajador ya tenía vacaciones pendientes o tomadas antes de usar ENQORA, registra su saldo inicial a una fecha: desde ahí se cuentan los períodos nuevos.</p>
        ) : null}
        {registros.length ? (
          <ul className="rem-fin-lineas">
            {registros.map((r) => (
              <li key={r.id} className={r.estado === "anulado" ? "is-descartado" : ""}>
                {TIPO[r.tipo]}{r.tipo === "tomado" ? ` del ${fecha(r.desde)} al ${fecha(r.hasta ?? r.desde)}` : ` desde el ${fecha(r.desde)}`}: <b>{fmt(Number(r.dias))} días{r.tipo === "progresivo" ? " por año" : ""}</b>
                {r.nota ? ` · ${r.nota}` : ""}
                {r.estado === "anulado" ? ` · anulado: ${r.motivo_anulacion ?? ""}` : (
                  <>
                    {r.tipo === "tomado" ? <> · <Link className="ps-link" href={`/remuneraciones/vacaciones/${r.id}`}>comprobante</Link></> : null}
                    <form action={anularVacacionAction} className="upload-row rem-vac-anular">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="trabajador" value={t.id} />
                      <input name="motivo" className="input input-sm" required minLength={3} maxLength={300} placeholder="Motivo para anular" aria-label="Motivo" />
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular</SubmitButton>
                    </form>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <form action={registrarVacacionAction} className="form-grid">
          <input type="hidden" name="trabajador" value={t.id} />
          <input type="hidden" name="tipo" value="tomado" />
          <div className="field"><label htmlFor={`vd-${t.id}`}>Vacaciones desde</label><input id={`vd-${t.id}`} name="desde" type="date" className="input" required min={t.fecha_ingreso} defaultValue={hoy} /></div>
          <div className="field">
            <label htmlFor={`vh-${t.id}`}>Hasta (último día de vacaciones)</label>
            <input id={`vh-${t.id}`} name="hasta" type="date" className="input" required min={t.fecha_ingreso} />
            <span className="hint">ENQORA cuenta los días hábiles (lunes a viernes, sin festivos). Al menos 10 continuos; solo el exceso se fracciona de común acuerdo.</span>
          </div>
          <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Registrando…">Registrar y ver comprobante</SubmitButton></div>
        </form>
        <details className="ps-docs">
          <summary>Saldo inicial o feriado progresivo</summary>
          <form action={registrarVacacionAction} className="form-grid">
            <input type="hidden" name="trabajador" value={t.id} />
            <div className="field">
              <label htmlFor={`vt-${t.id}`}>Qué registras</label>
              <select id={`vt-${t.id}`} name="tipo" className="input" defaultValue={tieneInicial ? "progresivo" : "saldo_inicial"}>
                {!tieneInicial ? <option value="saldo_inicial">Saldo inicial a una fecha</option> : null}
                <option value="progresivo">Feriado progresivo (días extra por año)</option>
              </select>
            </div>
            <div className="field"><label htmlFor={`vf-${t.id}`}>Fecha</label><input id={`vf-${t.id}`} name="desde" type="date" className="input" required min={t.fecha_ingreso} defaultValue={hoy} /></div>
            <div className="field"><label htmlFor={`vn-${t.id}`}>Días hábiles</label><input id={`vn-${t.id}`} name="dias" className="input" inputMode="decimal" required /></div>
            <div className="field field-wide">
              <label htmlFor={`vx-${t.id}`}>Nota</label>
              <input id={`vx-${t.id}`} name="nota" className="input" maxLength={300} placeholder="Ej.: certificado de años cotizados con empleadores anteriores" />
              <span className="hint">El progresivo corresponde con 10 años de trabajo (se pueden hacer valer hasta 10 con empleadores anteriores) y suma un día por cada 3 años nuevos trabajados (art. 68). Indica cómo se acreditó.</span>
            </div>
            <div className="field"><label>&nbsp;</label><SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar</SubmitButton></div>
          </form>
        </details>
      </div>
    </details>
  );
}
