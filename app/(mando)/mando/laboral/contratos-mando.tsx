import { anularContratoAction, revisarContratoAction } from "@/app/actions/contratos";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";

type Fila = {
  id: string; tipo: "contrato" | "anexo" | "pacto_he" | "carta_termino"; version: number; numero_anexo: number | null; estado: string; contenido: string; avisos: string[]; creado: string;
  companies: { legal_name: string; rut: string } | null; rem_trabajadores: { nombre: string; rut: string } | null;
};

// Bandeja del abogado: contratos de trabajo y anexos que prepararon las empresas con la plantilla de ENQORA.
export async function ContratosMando({ puedeDecidir }: { puedeDecidir: boolean }) {
  const { data } = await (await createClient()).from("rem_contratos")
    .select("id, tipo, version, numero_anexo, estado, contenido, avisos, creado, companies(legal_name, rut), rem_trabajadores(nombre, rut)")
    .in("estado", ["en_revision", "aprobado"]).order("creado", { ascending: true }).limit(80);
  const filas = (data ?? []) as unknown as Fila[];
  const pendientes = filas.filter((f) => f.estado === "en_revision");
  const aprobados = filas.filter((f) => f.estado === "aprobado").slice(-10).reverse();
  const nombre = (f: Fila) => `${f.companies?.legal_name ?? "Empresa"} · ${f.rem_trabajadores?.nombre ?? ""} (${f.rem_trabajadores?.rut ?? ""}) · ${f.tipo === "contrato" ? "Contrato" : f.tipo === "anexo" ? `Anexo N° ${f.numero_anexo}` : f.tipo === "pacto_he" ? "Pacto de horas extraordinarias" : "Carta de aviso de término"} · v${f.version}`;
  return (
    <section className="card" id="contratos">
      <h2>Contratos, anexos, pactos y cartas de término por revisar ({pendientes.length})</h2>
      <p className="muted-line">Revisa las estipulaciones del art. 10 del Código del Trabajo, la jornada (máximo 42 horas desde el 26-04-2026), el ingreso mínimo, el plazo (art. 159 N° 4) y que los otros pactos no renuncien derechos. En los pactos de horas extra: necesidad temporal, vigencia de hasta tres meses, máximo 2 horas diarias y recargo de 50% (art. 32). En las cartas de término: causal correcta, hechos concretos y probables, plazos y forma de entrega, indemnizaciones y cotizaciones al día (art. 162); fuero y licencia médica. Si hay que corregir, observa: la empresa prepara una versión nueva.</p>
      {pendientes.length ? pendientes.map((f) => (
        <details key={f.id} className="ps-docs">
          <summary>{nombre(f)} · {new Date(f.creado).toLocaleDateString("es-CL", { timeZone: "America/Santiago" })}</summary>
          {f.avisos?.length ? <ul className="rem-adv">{f.avisos.map((a) => <li key={a}>{a}</li>)}</ul> : null}
          <pre className="doc-editor">{f.contenido}</pre>
          {puedeDecidir ? (
            <form action={revisarContratoAction} className="check-stack">
              <input type="hidden" name="id" value={f.id} />
              <input name="observacion" className="input" maxLength={2000} placeholder="Observación para la empresa (obligatoria si observas)" aria-label="Observación" />
              <label className="field-check"><input type="checkbox" name="confirmo" value="si" /> Revisé el documento completo y cumple la normativa vigente</label>
              <div className="upload-row">
                <SubmitButton name="decision" value="aprobar" className="btn-inline btn-sm" pendingText="…">Aprobar</SubmitButton>
                <SubmitButton name="decision" value="observar" variant="ghost" className="btn-inline btn-sm" pendingText="…">Observar</SubmitButton>
              </div>
            </form>
          ) : null}
        </details>
      )) : <p className="muted-line">No hay contratos ni anexos por revisar.</p>}
      {aprobados.length ? (
        <details className="ps-docs">
          <summary>Últimos aprobados</summary>
          <ul className="ps-filas">
            {aprobados.map((f) => (
              <li key={f.id}>
                <span><b>{nombre(f)}</b></span>
                {puedeDecidir ? (
                  <form action={anularContratoAction} className="upload-row">
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
  );
}
