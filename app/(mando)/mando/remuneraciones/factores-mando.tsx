import { guardarFactoresAction } from "@/app/actions/certificado6";
import { SubmitButton } from "@/components/submit-button";
import { anioPorDefecto, MESES_CERT } from "@/lib/certificado6";
import { todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

// Factores de actualización del SII para el Certificado N° 6 (año comercial). Sin ellos no se emiten certificados.
export async function FactoresMando({ role }: { role: string }) {
  const puede = ["enqora_admin", "ops_director", "accountant_pro"].includes(role);
  const hoyAnio = Number(todayCL().slice(0, 4));
  const anio = anioPorDefecto(todayCL());
  const { data } = await (await createClient()).from("rem_factores").select("anio, mes, factor, fuente").gte("anio", anio - 1).order("anio").order("mes");
  const filas = (data ?? []) as { anio: number; mes: number; factor: number; fuente: string }[];
  const de = (a: number) => filas.filter((f) => f.anio === a);
  return (
    <section className="card" id="factores" aria-labelledby="fx-tit">
      <h2 id="fx-tit">Factores de actualización (Certificado N° 6)</h2>
      <p className="muted-line">Los publica el SII para cada año comercial (normalmente en enero). Cópialos tal cual, con su fuente: los clientes no pueden emitir certificados de un año sin los factores de los meses con pagos.</p>
      {[anio - 1, anio, anio + 1].filter((a) => a <= hoyAnio).map((a) => (
        <p key={a} className="muted-line">
          {a}: {de(a).length ? de(a).map((f) => `${MESES_CERT[f.mes - 1].slice(0, 3)} ${String(f.factor).replace(".", ",")}`).join(" · ") : "sin factores"}
          {de(a)[0] ? ` · Fuente: ${de(a)[0].fuente}` : ""}
        </p>
      ))}
      {puede ? (
        <form action={guardarFactoresAction} className="form-grid">
          <div className="field">
            <label htmlFor="fx-anio">Año comercial</label>
            <input id="fx-anio" name="anio" className="input" inputMode="numeric" required defaultValue={String(anio)} />
          </div>
          {MESES_CERT.map((m, i) => (
            <div className="field" key={m}>
              <label htmlFor={`fx-${i + 1}`}>{m}</label>
              <input id={`fx-${i + 1}`} name={`f${i + 1}`} className="input" inputMode="decimal" placeholder="1,000" />
            </div>
          ))}
          <div className="field field-wide">
            <label htmlFor="fx-fuente">Fuente</label>
            <input id="fx-fuente" name="fuente" className="input" required minLength={3} maxLength={300} placeholder="SII, factores de actualización año tributario …" />
          </div>
          <div className="field"><label>&nbsp;</label><SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Guardar factores</SubmitButton></div>
        </form>
      ) : null}
    </section>
  );
}
