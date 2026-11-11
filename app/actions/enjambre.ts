"use server";

import { unstable_cache } from "next/cache";
import { enjambrePersona, fuentesDe, type Revision } from "@/lib/cora/enjambre-persona";
import { PREGUNTAS_PERSONA, type PersonaAnswers } from "@/lib/cora/personas";
import { createClient } from "@/lib/supabase/server";

// CORA Personas · el enjambre trabajando en la consulta. Recibe SOLO las respuestas de la persona (nunca su
// RUT ni su nombre), ejecuta a los agentes sobre la normativa verificada y el Verificador comprueba en vivo
// que cada fuente oficial citada siga publicada. Nada se guarda. Cada fuente se comprueba como máximo una
// vez cada 6 horas (caché) para no cargar los sitios del Estado.

export type FuenteVerificada = { titulo: string; url: string; ok: boolean; estado: string; comprobada: string };
export type Novedad = { title: string; summary: string; institution: string | null; source_url: string; published_on: string | null };
export type EnjambreResult =
  | { ok: true; revisiones: Revision[]; fuentes: FuenteVerificada[]; novedades: Novedad[]; pasos: { agente: string; resultado: string }[] }
  | { ok: false };

const comprobar = unstable_cache(
  async (url: string): Promise<{ ok: boolean; estado: string; comprobada: string }> => {
    const comprobada = new Date().toISOString();
    try {
      const r = await fetch(url, {
        method: "GET", redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(6_000),
        headers: { "user-agent": "ENQORA-Verificador/1.0 (+https://enqora-nu.vercel.app)", accept: "text/html,application/pdf,*/*" },
      });
      // Solo interesa saber si la fuente sigue publicada: se descarta el contenido.
      await r.body?.cancel().catch(() => undefined);
      return { ok: r.ok, estado: r.ok ? "publicada" : `respondió ${r.status}`, comprobada };
    } catch (e) {
      const m = e instanceof Error && e.name === "TimeoutError" ? "no respondió a tiempo" : "sin conexión";
      return { ok: false, estado: m, comprobada };
    }
  },
  ["enjambre-fuente-v1"],
  { revalidate: 21_600 },
);

function validar(input: unknown): PersonaAnswers | null {
  if (!input || typeof input !== "object") return null;
  const a: Record<string, string> = {};
  for (const q of PREGUNTAS_PERSONA) {
    const v = (input as Record<string, unknown>)[q.key];
    if (typeof v === "string" && q.options.some(([o]) => o === v)) a[q.key] = v;
  }
  if (!a.venta) return null;
  return { contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no", ...a } as PersonaAnswers;
}

export async function enjambrePersonaAction(input: unknown): Promise<EnjambreResult> {
  try {
    const a = validar(input);
    if (!a) return { ok: false };
    const hoy = new Date();
    const revisiones = enjambrePersona(a, hoy);
    const lista = fuentesDe(revisiones);

    const instituciones = [
      "SII",
      ...(a.deudas === "si" || a.deudas === "no_se" ? ["Tesorer"] : []),
    ];
    const supabase = await createClient();
    const [verif, news] = await Promise.all([
      Promise.all(lista.map(async (f) => ({ ...f, ...(await comprobar(f.url)) }))),
      supabase.rpc("public_regulatory_news", { p_institutions: instituciones }).then(
        (r: { data: unknown; error: unknown }) => (r.error ? [] : ((r.data ?? []) as Novedad[])),
        () => [] as Novedad[],
      ),
    ]);

    // Bitácora: un paso por agente, con lo que realmente hizo.
    const porAgente = new Map<string, Revision[]>();
    for (const r of revisiones) porAgente.set(r.agente, [...(porAgente.get(r.agente) ?? []), r]);
    const pasos = [
      ...[...porAgente.entries()].map(([agente, rs]) => ({
        agente,
        resultado: `revisó ${rs.length} ${rs.length === 1 ? "norma" : "normas"} con tus respuestas: ${rs.map((x) => x.reviso.split(" (")[0].toLowerCase()).join("; ")}.`,
      })),
      { agente: "Vigilancia normativa", resultado: news.length ? `encontró ${news.length} novedad(es) verificada(s) por el equipo que te pueden afectar.` : "no hay novedades verificadas nuevas que te afecten." },
      { agente: "Verificador de fuentes", resultado: `comprobó en vivo ${verif.length} fuente(s) oficial(es): ${verif.filter((f) => f.ok).length} publicada(s)${verif.some((f) => !f.ok) ? `, ${verif.filter((f) => !f.ok).length} sin respuesta (se muestra como pendiente)` : ""}.` },
      { agente: "Privacidad", resultado: "no consultó ninguna fuente con tu RUT: todo se basa en lo que declaraste y nada se guardó." },
    ];
    return { ok: true, revisiones, fuentes: verif, novedades: news.slice(0, 5), pasos };
  } catch (e) {
    console.error("[ENQORA enjambre]", e instanceof Error ? e.message : e);
    return { ok: false };
  }
}
