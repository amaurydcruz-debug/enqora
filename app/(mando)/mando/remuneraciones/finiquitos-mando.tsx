import Link from "next/link";
import { anularFiniquitoAction, guardarFeriadoAction, quitarFeriadoAction, revisarFiniquitoAction } from "@/app/actions/finiquito";
import { SubmitButton } from "@/components/submit-button";
import type { ResultadoFiniquito } from "@/lib/finiquito";
import { clp, todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

type FilaFin = {
  id: string; version: number; total: number; creado: string; estado: string; detalle: ResultadoFiniquito;
  companies: { legal_name: string } | null; rem_trabajadores: { nombre: string; rut: string } | null;
};

// Revisión de finiquitos (contador o abogado de ENQORA) y festivos que usa el cálculo del feriado proporcional.
export async function FiniquitosMando({ role }: { role: string }) {
  const puedeRevisar = ["enqora_admin", "accountant_pro", "lawyer_pro"].includes(role);
  const puedeFestivos = ["enqora_admin", "ops_director", "accountant_pro", "lawyer_pro"].includes(role);
  const supabase = await createClient();
  const [{ data: fRows }, { data: ferRows }] = await Promise.all([
    supabase.from("rem_finiquitos").select("id, version, total, creado, estado, detalle, companies(legal_name), rem_trabajadores(nombre, rut)")
      .in("estado", ["en_revision", "aprobado"]).order("creado", { ascending: true }).limit(60),
    supabase.from("rem_feriados").select("fecha, nombre, fuente").gte("fecha", todayCL()).order("fecha").limit(40),
  ]);
  const filas = (fRows ?? []) as unknown as FilaFin[];
  const pendientes = filas.filter((f) => f.estado === "en_revision");
  const aprobados = filas.filter((f) => f.estado === "aprobado").slice(-10).reverse();
  const festivos = (ferRows ?? []) as { fecha: string; nombre: string; fuente: string }[];
  const ultimo = festivos.at(-1)?.fecha;

  return (
    <>
      <section className="card" id="finiquitos" aria-labelledby="fin-rev">
        <h2 id="fin-rev">Finiquitos por revisar ({pendientes.length})</h2>
        <p className="muted-line">Revisa la causal, las fechas, la base del art. 172, el tope de 90 UF, los años, el aviso previo, el feriado y la imputación del seguro de cesantía. Solo una persona aprueba: nunca un agente.</p>
        {pendientes.length ? (
          <ul className="ps-filas">
            {pendientes.map((f) => (
              <li key={f.id}>
                <span>
                  <b>{f.companies?.legal_name ?? "Empresa"} · {f.rem_trabajadores?.nombre ?? ""} ({f.rem_trabajadores?.rut ?? ""}) · v{f.version}</b>
                  <small>
                    Total {clp(Number(f.total))} · IAS {clp(f.detalle?.ias ?? 0)} ({f.detalle?.anos_indemnizados ?? 0} años) · aviso {clp(f.detalle?.aviso ?? 0)} · feriado {clp(f.detalle?.feriado ?? 0)} ({f.detalle?.dias_corridos ?? 0} días corridos) · seguro de cesantía −{clp(f.detalle?.imputacion_afc ?? 0)}
                  </small>
                  {f.detalle?.advertencias?.length ? <small>Avisos: {f.detalle.advertencias.join(" ")}</small> : null}
                  <small><Link className="ps-link" href={`/remuneraciones/finiquito/${f.id}`}>Leer la propuesta completa</Link></small>
                </span>
                {puedeRevisar ? (
                  <form action={revisarFiniquitoAction} className="upload-row">
                    <input type="hidden" name="id" value={f.id} />
                    <input name="observacion" className="input input-sm" maxLength={2000} placeholder="Observación (obligatoria para observar)" aria-label="Observación" />
                    <label className="field-check"><input type="checkbox" name="confirmo" value="si" /> Revisé el cálculo y el texto</label>
                    <SubmitButton name="decision" value="aprobar" className="btn-inline btn-sm" pendingText="…">Aprobar</SubmitButton>
                    <SubmitButton name="decision" value="observar" variant="ghost" className="btn-inline btn-sm" pendingText="…">Observar</SubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">No hay finiquitos esperando revisión.</p>}
        {aprobados.length ? (
          <details className="ps-docs">
            <summary>Últimos aprobados</summary>
            <ul className="ps-filas">
              {aprobados.map((f) => (
                <li key={f.id}>
                  <span><b>{f.companies?.legal_name ?? ""} · {f.rem_trabajadores?.nombre ?? ""} · v{f.version}</b><small>Total {clp(Number(f.total))}</small></span>
                  {puedeRevisar ? (
                    <form action={anularFiniquitoAction} className="upload-row">
                      <input type="hidden" name="id" value={f.id} />
                      <input type="hidden" name="origen" value="mando" />
                      <input name="motivo" className="input input-sm" required minLength={3} maxLength={300} placeholder="Motivo" aria-label="Motivo de anulación" />
                      <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Anular</SubmitButton>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="card" aria-labelledby="fer-tit">
        <h2 id="fer-tit">Festivos nacionales</h2>
        <p className="muted-line">
          El feriado proporcional y el plazo de pago del finiquito saltan estos días. Cargados hasta el {ultimo ? ultimo.split("-").reverse().join("-") : "—"}: agrega el año siguiente con su ley cuando se publique.
        </p>
        <ul className="ps-filas">
          {festivos.map((f) => (
            <li key={f.fecha}>
              <span><b>{f.fecha.split("-").reverse().join("-")} · {f.nombre}</b><small>{f.fuente}</small></span>
              {puedeFestivos ? (
                <form action={quitarFeriadoAction} className="upload-row">
                  <input type="hidden" name="fecha" value={f.fecha} />
                  <input name="motivo" className="input input-sm" required minLength={3} maxLength={200} placeholder="Motivo para quitarlo" aria-label="Motivo" />
                  <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Quitar</SubmitButton>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {puedeFestivos ? (
          <form action={guardarFeriadoAction} className="form-grid">
            <div className="field"><label htmlFor="fer-f">Fecha</label><input id="fer-f" name="fecha" type="date" className="input" required /></div>
            <div className="field"><label htmlFor="fer-n">Nombre</label><input id="fer-n" name="nombre" className="input" required minLength={3} maxLength={120} /></div>
            <div className="field"><label htmlFor="fer-s">Fuente (ley o decreto)</label><input id="fer-s" name="fuente" className="input" required minLength={3} maxLength={300} /></div>
            <div className="field"><label>&nbsp;</label><SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Agregar festivo</SubmitButton></div>
          </form>
        ) : null}
      </section>
    </>
  );
}
