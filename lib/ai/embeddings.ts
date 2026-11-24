import "server-only";
import { registrarUsoIA } from "@/lib/ai/uso";

// Vectores de significado para el buscador legal (0090), con un modelo abierto en Hugging Face.
// Por defecto BAAI/bge-m3 (MIT, multilingüe, textos largos). Variables (solo en Vercel):
//   HF_TOKEN          el mismo del AI Gateway
//   HF_MODEL_EMBED    otro modelo de vectores, p. ej. intfloat/multilingual-e5-large (opcional)
// Solo se vectoriza conocimiento público ya verificado (leyes, reglas, publicaciones) y las preguntas del equipo.
// Si el modelo no responde, el buscador sigue funcionando por palabras: nunca bloquea.

export const modeloVectores = () => process.env.HF_MODEL_EMBED?.trim() || "BAAI/bge-m3";
export const vectoresDisponibles = () => !!process.env.HF_TOKEN;

const normalizar = (v: number[]) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => Math.round((x / n) * 1e6) / 1e6);
};

// La API devuelve un vector por texto; algunos modelos devuelven uno por palabra: se promedian.
function aVector(x: unknown): number[] | null {
  if (Array.isArray(x) && x.length && x.every((n) => typeof n === "number")) return x as number[];
  if (Array.isArray(x) && x.length && x.every((f) => Array.isArray(f) && f.every((n) => typeof n === "number"))) {
    const filas = x as number[][];
    return filas[0].map((_, i) => filas.reduce((s, f) => s + (f[i] ?? 0), 0) / filas.length);
  }
  return null;
}

export async function vectorizar(textos: string[]): Promise<{ vectores: (number[] | null)[]; modelo: string; motivo?: string }> {
  const modelo = modeloVectores();
  if (!vectoresDisponibles() || !textos.length) return { vectores: textos.map(() => null), modelo, motivo: "sin_token" };
  const t0 = Date.now();
  try {
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${modelo}/pipeline/feature-extraction`, {
      method: "POST", signal: AbortSignal.timeout(45_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${process.env.HF_TOKEN}` },
      body: JSON.stringify({ inputs: textos.map((t) => t.slice(0, 6000)) }),
    });
    const data = (await res.json().catch(() => null)) as unknown;
    if (!res.ok || !Array.isArray(data) || data.length !== textos.length) {
      const motivo = `http_${res.status}${data && typeof data === "object" && "error" in data ? `: ${String((data as { error: unknown }).error).slice(0, 120)}` : ""}`;
      await registrarUsoIA({ modulo: "buscador_legal", proveedor: "hf", modelo, ms: Date.now() - t0, ok: false, motivo });
      return { vectores: textos.map(() => null), modelo, motivo };
    }
    const vectores = data.map((d) => {
      const v = aVector(d);
      return v && v.length >= 256 && v.length <= 4096 && v.every(Number.isFinite) ? normalizar(v) : null;
    });
    // Todos del mismo largo (si el modelo cambió a mitad de camino, se descarta la tanda).
    const largo = vectores.find((v) => v)?.length;
    const ok = vectores.map((v) => (v && v.length === largo ? v : null));
    await registrarUsoIA({ modulo: "buscador_legal", proveedor: "hf", modelo, ms: Date.now() - t0, ok: ok.some(Boolean) });
    return { vectores: ok, modelo };
  } catch (e) {
    const motivo = e instanceof Error && e.name === "TimeoutError" ? "tiempo" : "red";
    await registrarUsoIA({ modulo: "buscador_legal", proveedor: "hf", modelo, ms: Date.now() - t0, ok: false, motivo });
    return { vectores: textos.map(() => null), modelo, motivo };
  }
}
