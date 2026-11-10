// ENQORA Agent Operations: métricas de los agentes a partir de sus ejecuciones, propuestas y auditorías.
// Función pura (sin base de datos) para poder probarla. Lo que mide:
//   · producción: ejecuciones, fallas y tokens por agente;
//   · utilidad: cuántas propuestas acepta una persona (la medida de que el agente aporta);
//   · eficiencia: tokens por propuesta aceptada (detecta agentes que consumen mucho y aportan poco);
//   · control: decisiones del auditor independiente y propuestas que esperan revisión humana.
// Las alertas sugieren revisar; ninguna suspende ni cambia un agente por sí sola (eso lo decide una persona).

export type Run = { id: string; case_id: string; agent: string; status: "en_curso" | "completada" | "fallida"; model: string | null; input_tokens: number | null; output_tokens: number | null; error: string | null; created_at: string };
export type ProposalRow = { run_id: string; status: "pendiente" | "aceptada" | "descartada"; created_at: string };
export type AuditRow = { run_id: string; status: "completada" | "fallida"; decision: string | null; input_tokens: number | null; output_tokens: number | null; created_at: string };

export type MetricaAgente = {
  agente: string; ejecuciones: number; fallidas: number; en_curso: number; tokens_entrada: number; tokens_salida: number;
  propuestas: number; aceptadas: number; descartadas: number; pendientes: number;
  aceptacion: number | null; // aceptadas / decididas
  tokens_por_aceptada: number | null;
  auditorias: Record<string, number>;
};
export type Alerta = { nivel: "critica" | "atencion" | "info"; titulo: string; detalle: string; case_id?: string };
export type Operacion = {
  total: { ejecuciones: number; fallidas: number; tokens_entrada: number; tokens_salida: number; propuestas: number; aceptadas: number; pendientes: number; auditorias: number };
  agentes: MetricaAgente[];
  auditorias: Record<string, number>;
  alertas: Alerta[];
  incidentes: { case_id: string; agente: string; error: string; fecha: string }[];
};

const DIA = 86_400_000;

export function operacion(runs: Run[], proposals: ProposalRow[], audits: AuditRow[], ahora = Date.now()): Operacion {
  const porRun = new Map(runs.map((r) => [r.id, r]));
  const m = new Map<string, MetricaAgente>();
  const de = (agente: string) => {
    let x = m.get(agente);
    if (!x) {
      x = { agente, ejecuciones: 0, fallidas: 0, en_curso: 0, tokens_entrada: 0, tokens_salida: 0, propuestas: 0, aceptadas: 0, descartadas: 0, pendientes: 0, aceptacion: null, tokens_por_aceptada: null, auditorias: {} };
      m.set(agente, x);
    }
    return x;
  };
  for (const r of runs) {
    const x = de(r.agent);
    x.ejecuciones++;
    if (r.status === "fallida") x.fallidas++;
    if (r.status === "en_curso") x.en_curso++;
    x.tokens_entrada += r.input_tokens ?? 0;
    x.tokens_salida += r.output_tokens ?? 0;
  }
  const pendientesViejas: ProposalRow[] = [];
  for (const p of proposals) {
    const r = porRun.get(p.run_id);
    if (!r) continue;
    const x = de(r.agent);
    x.propuestas++;
    if (p.status === "aceptada") x.aceptadas++;
    else if (p.status === "descartada") x.descartadas++;
    else {
      x.pendientes++;
      if (ahora - new Date(p.created_at).getTime() > 7 * DIA) pendientesViejas.push(p);
    }
  }
  const auditorias: Record<string, number> = {};
  let tokAud = { e: 0, s: 0 };
  for (const a of audits) {
    const k = a.status === "fallida" ? "fallida" : a.decision ?? "sin_decision";
    auditorias[k] = (auditorias[k] ?? 0) + 1;
    tokAud = { e: tokAud.e + (a.input_tokens ?? 0), s: tokAud.s + (a.output_tokens ?? 0) };
    const r = porRun.get(a.run_id);
    if (r) {
      const x = de(r.agent);
      x.auditorias[k] = (x.auditorias[k] ?? 0) + 1;
    }
  }

  const agentes = [...m.values()].map((x) => {
    const decididas = x.aceptadas + x.descartadas;
    return {
      ...x,
      aceptacion: decididas ? x.aceptadas / decididas : null,
      tokens_por_aceptada: x.aceptadas ? Math.round((x.tokens_entrada + x.tokens_salida) / x.aceptadas) : null,
    };
  }).sort((a, b) => b.ejecuciones - a.ejecuciones);

  // Alertas: solo con muestra suficiente, para no sacar conclusiones de uno o dos casos.
  const alertas: Alerta[] = [];
  const mediana = (() => {
    const v = agentes.map((a) => a.tokens_por_aceptada).filter((n): n is number => n !== null).sort((a, b) => a - b);
    return v.length ? v[Math.floor((v.length - 1) / 2)] : null; // mediana baja: un agente ineficiente no infla la referencia
  })();
  for (const a of agentes) {
    if (a.ejecuciones >= 5 && a.fallidas / a.ejecuciones > 0.2) {
      alertas.push({ nivel: "critica", titulo: `${a.agente}: ${Math.round((a.fallidas / a.ejecuciones) * 100)}% de ejecuciones fallidas`, detalle: "Revisa los incidentes: puede ser el proveedor de IA, un límite de tiempo o un caso con datos incompletos." });
    }
    const decididas = a.aceptadas + a.descartadas;
    if (decididas >= 5 && a.aceptacion !== null && a.aceptacion < 0.3) {
      alertas.push({ nivel: "atencion", titulo: `${a.agente}: solo ${Math.round(a.aceptacion * 100)}% de sus propuestas se aceptan`, detalle: "Aporta poco en relación con lo que propone. Conviene revisar sus instrucciones o los aprendizajes que recibe." });
    }
    if (mediana && a.tokens_por_aceptada && a.aceptadas >= 3 && a.tokens_por_aceptada > mediana * 3) {
      alertas.push({ nivel: "atencion", titulo: `${a.agente}: consume ${(a.tokens_por_aceptada / mediana).toFixed(1).replace(".", ",")} veces más tokens por propuesta útil que la referencia del equipo`, detalle: "Candidato a cambiar de modelo o a acotar su instrucción." });
    }
  }
  const atascadas = runs.filter((r) => r.status === "en_curso" && ahora - new Date(r.created_at).getTime() > 15 * 60_000);
  if (atascadas.length) alertas.push({ nivel: "atencion", titulo: `${atascadas.length} ${atascadas.length === 1 ? "ejecución lleva" : "ejecuciones llevan"} más de 15 minutos en curso`, detalle: "Probablemente se cortaron: se pueden volver a lanzar desde el caso.", case_id: atascadas[0].case_id });
  if (pendientesViejas.length) {
    const r = porRun.get(pendientesViejas[0].run_id);
    alertas.push({ nivel: "info", titulo: `${pendientesViejas.length} ${pendientesViejas.length === 1 ? "propuesta espera" : "propuestas esperan"} revisión humana hace más de 7 días`, detalle: "Mientras nadie las revise, no llegan al cliente.", case_id: r?.case_id });
  }
  const escalar = auditorias.escalar ?? 0;
  if (escalar) alertas.push({ nivel: "critica", titulo: `El auditor pidió escalar ${escalar} ${escalar === 1 ? "caso" : "casos"} a un profesional`, detalle: "Revisa las auditorías con decisión «escalar» en cada caso." });
  const orden = { critica: 0, atencion: 1, info: 2 };
  alertas.sort((a, b) => orden[a.nivel] - orden[b.nivel]);

  const incidentes = runs.filter((r) => r.status === "fallida").sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10)
    .map((r) => ({ case_id: r.case_id, agente: r.agent, error: r.error ?? "Sin detalle", fecha: r.created_at }));

  return {
    total: {
      ejecuciones: runs.length, fallidas: runs.filter((r) => r.status === "fallida").length,
      tokens_entrada: agentes.reduce((s, a) => s + a.tokens_entrada, 0) + tokAud.e, tokens_salida: agentes.reduce((s, a) => s + a.tokens_salida, 0) + tokAud.s,
      propuestas: proposals.length, aceptadas: agentes.reduce((s, a) => s + a.aceptadas, 0), pendientes: agentes.reduce((s, a) => s + a.pendientes, 0), auditorias: audits.length,
    },
    agentes, auditorias, alertas, incidentes,
  };
}
