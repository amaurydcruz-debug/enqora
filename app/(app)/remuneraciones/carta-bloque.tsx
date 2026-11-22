import Link from "next/link";
import { anularContratoAction, guardarCartaAction } from "@/app/actions/contratos";
import { SubmitButton } from "@/components/submit-button";
import { CAUSALES_CARTA } from "@/lib/plantilla-carta-termino";
import { CAUSALES } from "@/lib/rem-archivos";
import type { DocContrato } from "./contrato-bloque";

const ESTADO: Record<DocContrato["estado"], string> = { en_revision: "en revisión del abogado", observado: "con observaciones", aprobado: "aprobada", anulado: "anulada" };

// Carta de aviso de término de contrato (art. 162): borrador, revisión del abogado y entrega.
export function CartaBloque({ t, docs, hoy, ciudad, base, uf, domicilio, representante }: {
  t: { id: string; fecha_baja: string | null; causal_termino: number | null }; docs: DocContrato[]; hoy: string; ciudad: string;
  base: number; uf: number | null; domicilio: string; representante: string;
}) {
  const cartas = docs.filter((d) => d.tipo === "carta_termino" && d.estado !== "anulado");
  const ult = cartas[0]?.datos ?? {};
  const v = (k: string, def = "") => String((ult as Record<string, unknown>)[k] ?? def);
  const p = `cr-${t.id}`;
  const causalDef = t.causal_termino && (CAUSALES_CARTA as readonly number[]).includes(t.causal_termino) ? String(t.causal_termino) : v("causal", "18");
  return (
    <details className="ps-docs">
      <summary>Carta de aviso de término{cartas.length ? ` · ${ESTADO[cartas[0].estado]}` : ""}</summary>
      <div className="rem-fin">
        {cartas.map((d) => (
          <div key={d.id} className="rem-ct-doc">
            <p><b>Carta v{d.version} · {ESTADO[d.estado]}</b> · <Link className="ps-link" href={`/remuneraciones/contrato/${d.id}`}>{d.estado === "aprobado" ? "ver e imprimir" : "ver borrador"}</Link></p>
            {d.avisos?.length ? <ul className="rem-adv">{d.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}
            {d.observacion ? <p className="muted-line">Abogado: {d.observacion}</p> : null}
            <form action={anularContratoAction} className="upload-row">
              <input type="hidden" name="id" value={d.id} />
              <input type="hidden" name="trabajador" value={t.id} />
              <input name="motivo" className="input input-sm" required minLength={3} maxLength={300} placeholder="Motivo para anular" aria-label="Motivo" />
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular</SubmitButton>
            </form>
          </div>
        ))}
        <p className="muted-line">Se entrega personalmente o por carta certificada al domicilio del contrato; el correo electrónico no sirve. Con el art. 161, con 30 días de anticipación (o se paga un mes); con el art. 160 o el 159 N° 4 y 5, dentro de 3 días hábiles desde la separación (6 en caso fortuito). Además, se envía la copia en Mi DT y se hace el registro de término.</p>
        <form action={guardarCartaAction} className="form-grid">
          <input type="hidden" name="trabajador" value={t.id} />
          <div className="field field-wide">
            <label htmlFor={`${p}-ca`}>Causal</label>
            <select id={`${p}-ca`} name="causal" className="input" defaultValue={causalDef}>
              {CAUSALES_CARTA.map((c) => <option key={c} value={c}>{CAUSALES[c]}</option>)}
            </select>
          </div>
          <div className="field"><label htmlFor={`${p}-fc`}>Fecha de la carta</label><input id={`${p}-fc`} name="fecha_carta" type="date" className="input" required defaultValue={v("fecha_carta", hoy)} /></div>
          <div className="field"><label htmlFor={`${p}-ft`}>Fecha de término</label><input id={`${p}-ft`} name="fecha_termino" type="date" className="input" required defaultValue={v("fecha_termino", t.fecha_baja ?? "")} /></div>
          <div className="field"><label htmlFor={`${p}-ci`}>Ciudad</label><input id={`${p}-ci`} name="ciudad" className="input" required defaultValue={v("ciudad", ciudad)} /></div>
          <div className="field"><label htmlFor={`${p}-re`}>Representante legal</label><input id={`${p}-re`} name="representante" className="input" required defaultValue={v("representante", representante)} /></div>
          <div className="field field-wide">
            <label htmlFor={`${p}-he`}>Hechos en que se funda</label>
            <textarea id={`${p}-he`} name="hechos" className="input" rows={4} maxLength={3000} defaultValue={v("hechos")} placeholder="Qué pasó, cuándo y dónde. Con necesidades de la empresa: la reestructuración, baja de ventas o cambio que hace prescindible el cargo." />
            <span className="hint">No se exigen solo con el desahucio del art. 161 inc. 2. En un juicio, la empresa no puede alegar hechos distintos de los que pone aquí.</span>
          </div>
          <div className="field field-wide"><label htmlFor={`${p}-do`}>Domicilio del trabajador (el del contrato)</label><input id={`${p}-do`} name="domicilio" className="input" required maxLength={200} defaultValue={v("domicilio", domicilio)} /></div>
          <div className="field">
            <label htmlFor={`${p}-en`}>Entrega</label>
            <select id={`${p}-en`} name="entrega" className="input" defaultValue={v("entrega", "personal")}>
              <option value="personal">Personal, con firma de recepción</option>
              <option value="certificada">Carta certificada</option>
            </select>
          </div>
          <div className="field"><label htmlFor={`${p}-ba`}>Última remuneración mensual ($)</label><input id={`${p}-ba`} name="base_indemnizacion" className="input" inputMode="numeric" defaultValue={v("base_indemnizacion", String(base))} /><span className="hint">Solo para el art. 161 (art. 172, tope 90 UF).</span></div>
          <div className="field"><label htmlFor={`${p}-uf`}>Valor de la UF ($)</label><input id={`${p}-uf`} name="uf" className="input" inputMode="decimal" defaultValue={v("uf", uf ? String(uf).replace(".", ",") : "")} /></div>
          <div className="field">
            <label htmlFor={`${p}-co`}>Cotizaciones hasta el mes anterior</label>
            <select id={`${p}-co`} name="cotizaciones" className="input" defaultValue={v("cotizaciones", "al_dia")}>
              <option value="al_dia">Pagadas (adjunto los comprobantes)</option>
              <option value="pendientes">Hay cotizaciones pendientes</option>
            </select>
          </div>
          <div className="field field-wide"><label htmlFor={`${p}-dp`}>Si hay pendientes, cuáles</label><input id={`${p}-dp`} name="detalle_pendientes" className="input" maxLength={500} defaultValue={v("detalle_pendientes")} /></div>
          <div className="field">
            <label htmlFor={`${p}-fu`}>¿Tiene fuero?</label>
            <select id={`${p}-fu`} name="fuero" className="input" defaultValue={v("fuero") === "true" ? "si" : "no"}><option value="no">No</option><option value="si">Sí (maternal, sindical u otro)</option></select>
          </div>
          <div className="field">
            <label htmlFor={`${p}-li`}>¿Tiene licencia médica vigente?</label>
            <select id={`${p}-li`} name="licencia" className="input" defaultValue={v("licencia") === "true" ? "si" : "no"}><option value="no">No</option><option value="si">Sí</option></select>
          </div>
          {cartas.some((c) => c.estado === "observado") ? (
            <div className="field">
              <label htmlFor={`${p}-rw`}>Reemplaza a la carta observada</label>
              <select id={`${p}-rw`} name="reemplaza" className="input" defaultValue={cartas.find((c) => c.estado === "observado")?.id ?? ""}>
                <option value="">No, es una carta nueva</option>
                {cartas.filter((c) => c.estado === "observado").map((c) => <option key={c.id} value={c.id}>Carta v{c.version}</option>)}
              </select>
            </div>
          ) : null}
          <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Preparando…">Enviar carta a revisión del abogado</SubmitButton></div>
        </form>
      </div>
    </details>
  );
}
