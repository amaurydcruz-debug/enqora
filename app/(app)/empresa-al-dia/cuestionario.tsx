"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { guardarDiagnosticoAction } from "@/app/actions/empresa-al-dia";
import { Notice } from "@/components/auth-card";
import { diagnosticar, NOMBRE_FRENTE, preguntasPara, type Frente, type Perfil, type Respuesta } from "@/lib/empresa-al-dia";

const SEMAFORO = { verde: "Al día", amarillo: "Revisar", rojo: "Urgente" } as const;
const RIESGO = { alto: "Riesgo alto", medio: "Riesgo medio", bajo: "Riesgo bajo" } as const;

// Cuestionario «Empresa al día»: primero el perfil (define qué se pregunta), luego Sí / No / No sé por obligación.
// El semáforo se ve en vivo; al guardar, el servidor recalcula con las mismas reglas y guarda una versión nueva.
export function Cuestionario({ companyId, inicialPerfil, inicialRespuestas, puedeGuardar }: {
  companyId: string; inicialPerfil: Perfil | null; inicialRespuestas: Record<string, Respuesta>; puedeGuardar: boolean;
}) {
  const router = useRouter();
  const [perfil, setPerfil] = useState<Perfil>(inicialPerfil ?? { tipo: "empresa", trabajadores: 0, local: false, rubro_regulado: false, vende_a_personas: true });
  const [resp, setResp] = useState<Record<string, Respuesta>>(inicialRespuestas);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const preguntas = useMemo(() => preguntasPara(perfil), [perfil]);
  const resultado = useMemo(() => diagnosticar(perfil, resp), [perfil, resp]);
  const respondidas = preguntas.filter((q) => resp[q.id]).length;
  const set = <K extends keyof Perfil>(k: K, v: Perfil[K]) => setPerfil((p) => ({ ...p, [k]: v }));
  const frentes = [...new Set(preguntas.map((q) => q.frente))] as Frente[];

  return (
    <div className="ead">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <section className="ps-card" aria-labelledby="ead-perfil">
        <h2 id="ead-perfil">1 · Tu empresa</h2>
        <div className="form-grid">
          <label className="field"><span>¿Cómo funcionas?</span>
            <select className="input" value={perfil.tipo} onChange={(e) => set("tipo", e.target.value === "persona" ? "persona" : "empresa")}>
              <option value="empresa">Empresa (sociedad)</option><option value="persona">Persona con giro</option>
            </select></label>
          <label className="field"><span>¿Cuántos trabajadores con contrato tienes?</span>
            <input className="input mono" type="number" min={0} max={100000} value={perfil.trabajadores} onChange={(e) => set("trabajadores", Math.max(0, Math.floor(Number(e.target.value) || 0)))} /></label>
        </div>
        <div className="ead-checks">
          <label className="check-inline"><input type="checkbox" checked={perfil.local} onChange={(e) => set("local", e.target.checked)} /> Atiendo en un local u oficina</label>
          <label className="check-inline"><input type="checkbox" checked={perfil.rubro_regulado} onChange={(e) => set("rubro_regulado", e.target.checked)} /> Mi rubro es de alimentos, salud, belleza u otro regulado</label>
          <label className="check-inline"><input type="checkbox" checked={perfil.vende_a_personas} onChange={(e) => set("vende_a_personas", e.target.checked)} /> Vendo a personas (consumidores)</label>
        </div>
      </section>

      <section className="ps-card" aria-labelledby="ead-preg">
        <h2 id="ead-preg">2 · ¿Cómo estás hoy? <small className="muted-line">{respondidas} de {preguntas.length}</small></h2>
        {frentes.map((f) => (
          <div key={f} className="ead-frente">
            <h3>{NOMBRE_FRENTE[f]}</h3>
            <ul className="ead-lista">
              {preguntas.filter((q) => q.frente === f).map((q) => (
                <li key={q.id}>
                  <span><b>{q.texto}</b><small>{q.ayuda}</small></span>
                  <span className="ead-opciones" role="radiogroup" aria-label={q.texto}>
                    {([["si", "Sí"], ["no", "No"], ["no_se", "No sé"]] as const).map(([v, t]) => (
                      <label key={v} className={`chip-opcion${resp[q.id] === v ? " is-on" : ""}`}>
                        <input type="radio" name={q.id} checked={resp[q.id] === v} onChange={() => setResp((r) => ({ ...r, [q.id]: v }))} /> {t}
                      </label>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="ps-card" aria-labelledby="ead-res">
        <div className="ps-card-cab"><h2 id="ead-res">3 · Tu semáforo</h2><b className="ead-puntaje">{resultado.puntaje}% al día</b></div>
        <ul className="ead-semaforo">
          {resultado.frentes.map((f) => (
            <li key={f.frente} className={`is-${f.semaforo}`}>
              <span className="ead-luz" aria-hidden="true" />
              <b>{f.nombre}</b>
              <small>{SEMAFORO[f.semaforo]}{f.pendientes ? ` · ${f.pendientes} pendiente(s)` : ""}</small>
            </li>
          ))}
        </ul>
        {resultado.pendientes.length ? (
          <>
            <h3>Lo primero que hay que resolver</h3>
            <ol className="ead-pend">
              {resultado.pendientes.slice(0, 12).map((i) => (
                <li key={i.id}>
                  <span>
                    <b>{i.texto.replace(/^¿|\?$/g, "")}</b>
                    <small>{i.estado === "falta" ? "Falta" : "Por confirmar"} · {RIESGO[i.riesgo]} · {i.ayuda}{i.fuente ? <> · <a href={i.fuente.url} target="_blank" rel="noopener noreferrer">{i.fuente.nombre}</a></> : null}</small>
                  </span>
                  {i.categoria ? <Link href={`/panel?tramite=${i.categoria}#tramites`} className="btn btn-ghost btn-inline btn-sm">Resolverlo con ENQORA</Link> : null}
                </li>
              ))}
            </ol>
          </>
        ) : respondidas ? <p className="muted-line">Todo lo que respondiste está al día.</p> : null}
        <p className="muted-line">Orientación general con reglas fijas y fuentes oficiales; no reemplaza la revisión de un profesional. Los plazos se revisan cada año.</p>
        {puedeGuardar ? (
          <button type="button" className={`btn btn-gold btn-inline${pending ? " is-busy" : ""}`} disabled={pending || !respondidas}
            onClick={() => start(async () => {
              const r = await guardarDiagnosticoAction(companyId, perfil, resp).catch(() => ({ error: "No se pudo guardar.", version: undefined }));
              setMsg(r.error ? { kind: "error", text: r.error } : { kind: "ok", text: `Diagnóstico guardado (versión ${r.version ?? ""}). Queda en el historial de tu empresa.` });
              if (!r.error) router.refresh();
            })}>
            {pending ? "Guardando…" : "Guardar diagnóstico"}
          </button>
        ) : <p className="muted-line">Guardan el diagnóstico el propietario, el administrador o el contador de la empresa.</p>}
      </section>
    </div>
  );
}
