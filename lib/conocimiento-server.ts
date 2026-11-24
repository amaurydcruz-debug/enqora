import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { anonimizar } from "@/lib/ai/anonimizar";
import { vectorizar, vectoresDisponibles } from "@/lib/ai/embeddings";
import { hfRecibePrivados } from "@/lib/ai/gateway";
import { corpusBase, fragmentosInforma, respaldoSuficiente, type FilaInforma, type Fragmento, type Origen, type Resultado } from "@/lib/conocimiento";
import { createClient } from "@/lib/supabase/server";

type Supa = SupabaseClient;

// Buscar con la sesión de quien pregunta (solo el equipo ENQORA) o con el token del servidor (informe de ingreso).
// La pregunta puede traer datos de un cliente: siempre se anonimiza antes de buscar, y solo se envía al modelo de
// vectores (Hugging Face) si está autorizado para datos privados o anonimizados. Si no, busca solo por palabras.
export async function buscarNormativa(pregunta: string, k = 8, supabase?: Supa, token?: string | null): Promise<{ resultados: Resultado[]; respaldo: boolean; porSignificado: boolean; error?: string }> {
  const sb = supabase ?? (await createClient());
  const q = anonimizar(pregunta.trim().slice(0, 500)).texto.replace(/\[[A-Z]+_\d+\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  if (q.length < 3) return { resultados: [], respaldo: false, porSignificado: false };
  const puedeVectorizar = vectoresDisponibles() && hfRecibePrivados() !== "no";
  const { vectores } = puedeVectorizar ? await vectorizar([q]) : { vectores: [null] };
  const vector = vectores[0];
  const { data, error } = await sb.rpc("conocimiento_buscar", token
    ? { p_texto: q, p_vector: vector, p_k: k, p_token: token }
    : { p_texto: q, p_vector: vector, p_k: k });
  if (error) return { resultados: [], respaldo: false, porSignificado: false, error: error.message };
  const resultados = (data as Resultado[] | null) ?? [];
  return { resultados, respaldo: respaldoSuficiente(resultados), porSignificado: !!vector };
}

// Texto para darle a un agente: solo lo encontrado, numerado, con su cita. Si no hay respaldo, lo dice.
export function contextoParaAgente(r: Resultado[]): string {
  if (!r.length) return "BUSCADOR LEGAL: no se encontró respaldo en el conocimiento verificado de ENQORA. No afirmes normas sin fuente: dilo y deriva al equipo.";
  return ["BUSCADOR LEGAL (conocimiento verificado de ENQORA; cita la fuente [N] al usarlo y no afirmes nada que no esté aquí):",
    ...r.map((x, i) => `[${i + 1}] ${x.titulo}${x.articulo ? ` · ${x.articulo}` : ""}${x.fuente ? ` · ${x.fuente}` : ""}${x.verificado ? ` · verificado ${x.verificado}` : ""}${x.url ? ` · ${x.url}` : ""}\n${x.texto}`),
  ].join("\n\n");
}

export type ResultadoIndexar = { cargados: Record<string, unknown>[]; vectorizados: number; pendientes: number; motivo?: string; error?: string };

// Indexar (supervisión): carga el corpus por origen y luego calcula vectores por tandas, con un tope de tiempo.
// Se puede repetir: lo que no cambió no se toca y continúa donde quedó.
export async function indexarConocimiento(presupuestoMs = 40_000): Promise<ResultadoIndexar> {
  const sb = await createClient();
  const t0 = Date.now();
  const { data: filas } = await sb.from("regulatory_updates")
    .select("id, title, summary, impact, institution, source_url, departamento, vigente_desde, fecha_consulta, published_on, kind")
    .in("etapa", ["publicado", "actualizado", "rectificado"]).order("created_at", { ascending: false }).limit(400);

  const grupos: [Origen, Fragmento[]][] = [];
  const base = corpusBase();
  for (const o of ["regla", "ruta", "obligacion_laboral"] as Origen[]) grupos.push([o, base.filter((f) => f.origen === o)]);
  grupos.push(["informa", fragmentosInforma((filas as FilaInforma[] | null) ?? [])]);

  const cargados: Record<string, unknown>[] = [];
  for (const [origen, frag] of grupos) {
    const { data, error } = await sb.rpc("conocimiento_cargar", { p: frag.slice(0, 400), p_origenes: [origen] });
    if (error) return { cargados, vectorizados: 0, pendientes: 0, error: error.message };
    cargados.push({ origen, ...(data as Record<string, unknown>) });
  }

  let vectorizados = 0;
  let motivo: string | undefined;
  if (!vectoresDisponibles()) motivo = "sin_token";
  while (!motivo && Date.now() - t0 < presupuestoMs) {
    const { data } = await sb.rpc("conocimiento_sin_vector", { p_limite: 16 });
    const lote = (data as { clave: string; texto: string }[] | null) ?? [];
    if (!lote.length) break;
    const v = await vectorizar(lote.map((x) => x.texto));
    if (v.motivo || v.vectores.every((x) => !x)) { motivo = v.motivo ?? "sin_vectores"; break; }
    const p = lote.map((x, i) => ({ clave: x.clave, embedding: v.vectores[i] })).filter((x) => x.embedding);
    const { data: n, error } = await sb.rpc("conocimiento_guardar_vectores", { p, p_modelo: v.modelo });
    if (error) return { cargados, vectorizados, pendientes: 0, error: error.message };
    vectorizados += Number(n ?? 0);
    if (p.length < lote.length) { motivo = "vectores_incompletos"; break; }
  }
  const { data: est } = await sb.rpc("conocimiento_estado");
  const e = (est as { activos?: number; con_vector?: number } | null) ?? {};
  return { cargados, vectorizados, pendientes: Math.max(0, (e.activos ?? 0) - (e.con_vector ?? 0)), motivo };
}
