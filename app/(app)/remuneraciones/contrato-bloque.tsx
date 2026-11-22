import Link from "next/link";
import { anularContratoAction, guardarAnexoAction, guardarContratoAction } from "@/app/actions/contratos";
import { SubmitButton } from "@/components/submit-button";
import { TIPOS_ANEXO, type DatosContrato } from "@/lib/plantilla-contrato";

export type DocContrato = {
  id: string; trabajador_id: string; tipo: "contrato" | "anexo"; version: number; numero_anexo: number | null;
  estado: "en_revision" | "observado" | "aprobado" | "anulado"; datos: Partial<DatosContrato> & Record<string, unknown>; avisos: string[];
  observacion: string | null; creado: string;
};
const ESTADO: Record<DocContrato["estado"], string> = { en_revision: "en revisión del abogado", observado: "con observaciones", aprobado: "aprobado", anulado: "anulado" };

function Campo({ id, name, label, def, hint, type = "text", req = true, wide = false }: {
  id: string; name: string; label: string; def?: string; hint?: string; type?: string; req?: boolean; wide?: boolean;
}) {
  return (
    <div className={`field${wide ? " field-wide" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} className="input" required={req} defaultValue={def ?? ""} />
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

// Contrato de trabajo y anexos de un trabajador: borrador desde la ficha, revisión del abogado e impresión.
export function ContratoBloque({ t, docs, hoy, ciudad }: {
  t: { id: string; tipo_contrato: "indefinido" | "plazo_fijo" | "obra"; cargo: string | null }; docs: DocContrato[]; hoy: string; ciudad: string;
}) {
  const contratos = docs.filter((d) => d.tipo === "contrato");
  const vivo = contratos.find((d) => d.estado !== "anulado") ?? null;
  const anexos = docs.filter((d) => d.tipo === "anexo" && d.estado !== "anulado");
  const base = (vivo ?? contratos[0])?.datos ?? {};
  const v = (k: keyof DatosContrato, def = "") => String(base[k] ?? def);
  const p = `ct-${t.id}`;
  const resumen = vivo ? `contrato ${ESTADO[vivo.estado]}` : "sin contrato en ENQORA";
  return (
    <details className="ps-docs">
      <summary>Contrato y anexos · {resumen}{anexos.length ? ` · ${anexos.length} anexo(s)` : ""}</summary>
      <div className="rem-fin">
        {[...(vivo ? [vivo] : []), ...anexos].map((d) => (
          <div key={d.id} className="rem-ct-doc">
            <p>
              <b>{d.tipo === "contrato" ? "Contrato de trabajo" : `Anexo N° ${d.numero_anexo}`} · v{d.version} · {ESTADO[d.estado]}</b>
              {" "}· <Link className="ps-link" href={`/remuneraciones/contrato/${d.id}`}>{d.estado === "aprobado" ? "ver e imprimir" : "ver borrador"}</Link>
            </p>
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

        {vivo?.estado !== "aprobado" ? (
          <details className="ps-docs" open={!vivo || vivo.estado === "observado"}>
            <summary>{vivo ? "Preparar una versión nueva del contrato" : "Preparar contrato de trabajo"}</summary>
            <p className="muted-line">El sueldo, la jornada, las asignaciones, la gratificación, el tipo de contrato y la fecha de ingreso salen de la ficha: si algo cambió, edita la ficha primero. Debe quedar por escrito dentro de 15 días desde el ingreso (5 días si es por obra o de menos de 30 días).</p>
            <form action={guardarContratoAction} className="form-grid">
              <input type="hidden" name="trabajador" value={t.id} />
              <Campo id={`${p}-ci`} name="ciudad" label="Ciudad" def={v("ciudad", ciudad)} />
              <Campo id={`${p}-fe`} name="fecha" label="Fecha del contrato" type="date" def={v("fecha", hoy)} />
              <Campo id={`${p}-na`} name="nacionalidad" label="Nacionalidad del trabajador" def={v("nacionalidad", "chilena")} />
              <Campo id={`${p}-fn`} name="fecha_nacimiento" label="Fecha de nacimiento" type="date" def={v("fecha_nacimiento")} />
              <Campo id={`${p}-do`} name="domicilio_trabajador" label="Domicilio del trabajador" def={v("domicilio_trabajador")} wide />
              <Campo id={`${p}-em`} name="email_trabajador" label="Correo del trabajador (si tiene)" type="email" def={v("email_trabajador")} req={false} />
              <Campo id={`${p}-re`} name="representante" label="Representante legal" def={v("representante")} />
              <Campo id={`${p}-rr`} name="rut_representante" label="RUT del representante" def={v("rut_representante")} />
              <Campo id={`${p}-ee`} name="email_empleador" label="Correo del empleador" type="email" def={v("email_empleador")} req={false} />
              <div className="field field-wide">
                <label htmlFor={`${p}-fu`}>Funciones{t.cargo ? ` (cargo: ${t.cargo})` : ""}</label>
                <textarea id={`${p}-fu`} name="funciones" className="input" rows={3} required maxLength={600} defaultValue={v("funciones")} />
                <span className="hint">Pueden ser dos o más funciones específicas, alternativas o complementarias.</span>
              </div>
              <Campo id={`${p}-lu`} name="lugar" label="Lugar o ciudad donde trabaja" def={v("lugar")} wide />
              <Campo id={`${p}-di`} name="distribucion" label="Distribución de la jornada" def={v("distribucion")} wide hint="Ej.: de lunes a viernes, de 09:00 a 17:54 horas, con 30 minutos de colación no imputables a la jornada (42 horas)." />
              {t.tipo_contrato === "plazo_fijo" ? <Campo id={`${p}-ph`} name="plazo_hasta" label="Plazo fijo hasta" type="date" def={v("plazo_hasta")} /> : null}
              {t.tipo_contrato === "obra" ? <Campo id={`${p}-ob`} name="obra" label="Obra o faena" def={v("obra")} wide /> : null}
              <div className="field">
                <label htmlFor={`${p}-fp`}>Forma de pago</label>
                <select id={`${p}-fp`} name="forma_pago" className="input" defaultValue={v("forma_pago", "transferencia")}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <Campo id={`${p}-dp`} name="dia_pago" label="Día de pago" def={v("dia_pago", "el último día hábil de cada mes")} />
              <Campo id={`${p}-es`} name="especies" label="Beneficios en especie (si hay)" def={v("especies")} req={false} wide />
              <Campo id={`${p}-pr`} name="procedencia" label="Lugar de procedencia (si se le hizo cambiar de domicilio)" def={v("procedencia")} req={false} />
              <div className="field field-wide">
                <label htmlFor={`${p}-ot`}>Otros pactos (opcional)</label>
                <textarea id={`${p}-ot`} name="otros_pactos" className="input" rows={3} maxLength={1500} defaultValue={v("otros_pactos")} />
              </div>
              <div className="field"><label>&nbsp;</label><SubmitButton className="btn-inline btn-sm" pendingText="Preparando…">Enviar a revisión del abogado</SubmitButton></div>
            </form>
          </details>
        ) : null}

        <details className="ps-docs">
          <summary>Preparar anexo de contrato</summary>
          <form action={guardarAnexoAction} className="form-grid">
            <input type="hidden" name="trabajador" value={t.id} />
            <div className="field">
              <label htmlFor={`${p}-am`}>Qué se modifica</label>
              <select id={`${p}-am`} name="materia" className="input" defaultValue="remuneracion">
                {Object.entries(TIPOS_ANEXO).map(([k, x]) => <option key={k} value={k}>{x}</option>)}
              </select>
            </div>
            <Campo id={`${p}-ac`} name="ciudad" label="Ciudad" def={v("ciudad", ciudad)} />
            <Campo id={`${p}-af`} name="fecha" label="Fecha del anexo" type="date" def={hoy} />
            <Campo id={`${p}-av`} name="vigencia" label="Rige desde" type="date" def={hoy} />
            <Campo id={`${p}-ar`} name="representante" label="Representante legal" def={v("representante")} />
            {anexos.some((a) => a.estado === "observado") ? (
              <div className="field">
                <label htmlFor={`${p}-aw`}>Reemplaza al anexo observado</label>
                <select id={`${p}-aw`} name="reemplaza" className="input" defaultValue="">
                  <option value="">No, es un anexo nuevo</option>
                  {anexos.filter((a) => a.estado === "observado").map((a) => <option key={a.id} value={a.id}>Anexo N° {a.numero_anexo}</option>)}
                </select>
              </div>
            ) : null}
            <div className="field field-wide">
              <label htmlFor={`${p}-at`}>Texto de la modificación</label>
              <textarea id={`${p}-at`} name="texto" className="input" rows={4} required minLength={20} maxLength={3000} placeholder="Ej.: A contar de la fecha de vigencia, el sueldo base mensual será de $950.000." />
              <span className="hint">Si cambia el sueldo, la jornada o el cargo, actualiza también la ficha para que las liquidaciones lo reflejen.</span>
            </div>
            <div className="field"><label>&nbsp;</label><SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Preparando…">Enviar anexo a revisión</SubmitButton></div>
          </form>
        </details>
      </div>
    </details>
  );
}
