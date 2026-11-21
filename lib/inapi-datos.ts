import "server-only";
import { esDominioOficial } from "@/lib/dominios-oficiales";

// Datos abiertos de INAPI publicados en datos.gob.cl (CKAN, licencia CC0). Solo lectura, desde el servidor de ENQORA.
export const CKAN = "https://datos.gob.cl/api/3/action/package_show?id=";
export const CONJUNTOS_MARCAS = ["registros-de-marcas", "solicitudes-de-marcas"] as const;
const MAX_BYTES = 120 * 1024 * 1024;
const UA = "ENQORA/1.0 (datos abiertos INAPI; contacto: soporte ENQORA)";

export type Recurso = { id: string; nombre: string; url: string; formato: string; tamano: number | null; modificado: string | null };
export type Conjunto = { id: string; titulo: string; actualizado: string | null; licencia: string | null; recursos: Recurso[] };

export async function conjuntoInapi(id: string): Promise<Conjunto> {
  const res = await fetch(CKAN + encodeURIComponent(id), { headers: { "user-agent": UA, accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`datos.gob.cl respondió ${res.status}.`);
  const j = (await res.json()) as { success?: boolean; result?: Record<string, unknown> };
  if (!j.success || !j.result) throw new Error("La API de datos.gob.cl no devolvió el conjunto.");
  const r = j.result;
  const recursos = ((r.resources as Record<string, unknown>[]) ?? []).map((x) => ({
    id: String(x.id ?? ""), nombre: String(x.name ?? x.url ?? ""), url: String(x.url ?? ""), formato: String(x.format ?? "").toUpperCase(),
    tamano: typeof x.size === "number" ? x.size : null, modificado: (x.last_modified as string) ?? (x.metadata_modified as string) ?? null,
  })).filter((x) => esDominioOficial(x.url));
  return { id, titulo: String(r.title ?? id), actualizado: (r.metadata_modified as string) ?? null, licencia: (r.license_title as string) ?? null, recursos };
}

// Descarga un recurso (solo dominios oficiales, https, con límite de tamaño).
export async function descargarRecurso(url: string): Promise<Buffer> {
  if (!esDominioOficial(url)) throw new Error("La dirección no es de un dominio oficial.");
  const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(45_000) });
  if (!res.ok || !res.body) throw new Error(`La descarga respondió ${res.status}.`);
  if (!esDominioOficial(res.url)) throw new Error("La descarga redirigió fuera de un dominio oficial.");
  const largo = Number(res.headers.get("content-length") ?? 0);
  if (largo > MAX_BYTES) throw new Error(`El archivo pesa ${Math.round(largo / 1048576)} MB: supera el máximo de ${MAX_BYTES / 1048576} MB.`);
  const partes: Uint8Array[] = [];
  let total = 0;
  const lector = res.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) { await lector.cancel(); throw new Error(`El archivo supera ${MAX_BYTES / 1048576} MB.`); }
    partes.push(value);
  }
  return Buffer.concat(partes);
}
