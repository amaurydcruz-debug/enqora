import Link from "next/link";
import { aprobarMiMesAction, observarMiMesAction } from "@/app/actions/mes";
import { SubmitButton } from "@/components/submit-button";
import { FALTA_TEXTO, PASOS_MES, pasoDe, type TuMes } from "@/lib/accounting";
import { clp } from "@/lib/pricing";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesDe = (iso: string) => {
  const [y, m] = iso.slice(0, 10).split("-").map(Number);
  return `${MESES[m - 1]} ${y}`;
};
const diaDe = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} de ${MESES[m - 1]}`;
};

// Tarjeta «Tu mes» del inicio del cliente: en qué paso va el cierre mensual, qué falta y, cuando el contador
// ya revisó, el resumen para aprobar. El cliente solo hace dos cosas: subir la cartola y aprobar.
export function TuMesCard({ mes, puedeAprobar }: { mes: TuMes; puedeAprobar: boolean }) {
  const paso = pasoDe(mes.etapa);
  const f = mes.f29;
  const ym = mes.periodo.slice(0, 7);
  return (
    <section className="ps-card tm" id="tu-mes" aria-labelledby="tm-t">
      <div className="ps-card-cab">
        <h2 id="tm-t">Tu mes · {mesDe(mes.periodo)}</h2>
        <span className="tm-cab-acc">
          <Link href="/gastos" className="btn btn-ghost btn-inline btn-sm">Registrar gasto</Link>
          <Link href={`/contabilidad/${ym}`} className="ps-link">Ver detalle</Link>
        </span>
      </div>

      <ol className="tm-pasos" aria-label="Pasos del cierre mensual">
        {PASOS_MES.map((p, i) => (
          <li key={p.titulo} className={i < paso ? "is-hecho" : i === paso ? "is-actual" : ""} aria-current={i === paso ? "step" : undefined}>
            <span className="tm-num" aria-hidden="true">{i < paso ? "✓" : i + 1}</span>
            <b>{p.titulo}</b>
            <small>{p.texto}</small>
          </li>
        ))}
      </ol>

      {mes.faltan.length && paso === 0 ? (
        <ul className="ps-filas">
          {mes.faltan.map((k) => (
            <li key={k}>
              <span><b>{FALTA_TEXTO[k]?.titulo ?? k}</b><small>{mes.mandato ? FALTA_TEXTO[k]?.conMandato : FALTA_TEXTO[k]?.sinMandato}</small></span>
              {k === "cartola" || !mes.mandato ? <Link href={`/contabilidad/${ym}`} className="btn btn-gold btn-inline btn-sm">Subir</Link> : <span className="badge badge-gold">ENQORA</span>}
            </li>
          ))}
        </ul>
      ) : null}
      {paso === 0 && !mes.mandato ? (
        <p className="muted-line">Con el Mandato Digital del SII, ENQORA trae tus ventas y compras sin que tengas que descargarlas. Nunca te pedimos tu clave.</p>
      ) : null}
      {paso === 1 ? <p className="muted-line">Estamos revisando tu mes. Te avisamos cuando esté listo para aprobar.</p> : null}

      {f && (mes.etapa === "por_aprobar" || mes.etapa === "aprobado_cliente" || mes.etapa === "presentado") ? (
        <div className="tm-resumen">
          <dl>
            <div><dt>Ventas registradas</dt><dd>{mes.ventas} documentos · IVA {clp(f.debito)}</dd></div>
            <div><dt>Compras registradas</dt><dd>{mes.compras} documentos · crédito {clp(f.credito)}</dd></div>
            {f.ppm ? <div><dt>PPM</dt><dd>{clp(f.ppm)}</dd></div> : null}
            {f.retenciones ? <div><dt>Retenciones</dt><dd>{clp(f.retenciones)}</dd></div> : null}
            <div className="tm-total"><dt>{f.remanente > 0 && !f.total ? "Remanente a favor" : "Total a pagar (referencial)"}</dt><dd>{clp(f.remanente > 0 && !f.total ? f.remanente : f.total)}</dd></div>
            <div><dt>Vence</dt><dd>{diaDe(mes.vence_20)} si declaras por internet como facturador electrónico; si no, {diaDe(mes.vence_12)}. Si cae en fin de semana o festivo, pasa al hábil siguiente.</dd></div>
          </dl>
          {mes.etapa === "por_aprobar" ? (
            puedeAprobar ? (
              <>
                <form action={aprobarMiMesAction} className="tm-aprobar">
                  <input type="hidden" name="return_id" value={f.id} />
                  <label className="check-inline"><input type="checkbox" name="confirmo" value="si" required /> Revisé el resumen y estoy de acuerdo.</label>
                  <SubmitButton variant="gold" className="btn-inline" pendingText="Aprobando…">Aprobar mi mes</SubmitButton>
                </form>
                <details className="ps-docs">
                  <summary>Tengo una observación</summary>
                  <form action={observarMiMesAction} className="mini-form">
                    <input type="hidden" name="return_id" value={f.id} />
                    <textarea name="nota" className="input" rows={2} minLength={5} maxLength={1000} required placeholder="Ej.: no reconozco la factura 554 de compras" aria-label="Tu observación" />
                    <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Enviando…">Enviar al contador</SubmitButton>
                  </form>
                </details>
              </>
            ) : <p className="muted-line">Listo para aprobar: lo aprueba el propietario o administrador de la empresa.</p>
          ) : null}
          {mes.etapa === "aprobado_cliente" ? <p className="muted-line">✓ Aprobaste tu mes. ENQORA presenta el F29 y te avisa con el folio del SII.</p> : null}
          {mes.etapa === "presentado" && f.folio ? <p className="muted-line">✓ F29 presentado{f.presentado ? ` el ${diaDe(f.presentado)}` : ""} · folio SII <span className="mono">{f.folio}</span>.</p> : null}
        </div>
      ) : null}
      {f?.observacion && mes.etapa === "revision" ? <p className="muted-line">Tu observación está con el contador: «{f.observacion}».</p> : null}
      <p className="tm-pie">{mes.plan ? `Plan ${mes.plan}. ` : ""}El resumen es preliminar hasta que el F29 se presenta; no reemplaza la propuesta del SII.</p>
    </section>
  );
}
