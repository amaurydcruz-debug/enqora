// Buscador legal de ENQORA (0090): arma el corpus a partir del conocimiento ya verificado (reglas con fuente y
// artículo, rutas de casos, obligaciones laborales y publicaciones de ENQORA Informa) en fragmentos con su cita.
// Nada se inventa aquí: cada fragmento sale de un texto que el equipo ya verificó. Funciones puras, sin red.

import { createHash } from "node:crypto";
import { KNOWLEDGE_VERSION, PLAYBOOKS, RULES } from "@/lib/knowledge";
import { OBLIGACIONES_LABORALES } from "@/lib/cora/normativa-laboral";
import type { Origen } from "@/lib/conocimiento-tipos";

export { cita, ORIGENES, respaldoSuficiente, type Origen, type Resultado } from "@/lib/conocimiento-tipos";

export type Fragmento = {
  clave: string; origen: Origen; titulo: string; articulo: string | null; fuente: string | null; url: string | null;
  vigencia: string | null; verificado: string | null; departamento: string | null; texto: string; huella: string;
};

const MAX = 1800; // caracteres por fragmento: cabe holgado en BGE-M3 y se lee completo en pantalla
const URL_OK = /^https:\/\/\S+$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const corto = (s: string | null | undefined, n: number) => (s ? s.trim().slice(0, n) || null : null);

export const huella = (f: Omit<Fragmento, "huella">) =>
  createHash("sha256").update(JSON.stringify([f.titulo, f.articulo, f.fuente, f.url, f.vigencia, f.verificado, f.departamento, f.texto])).digest("hex");

// Corta textos largos por párrafos o frases, sin partir palabras.
export function trocear(texto: string, max = MAX): string[] {
  const t = texto.replace(/\s+\n/g, "\n").trim();
  if (t.length <= max) return [t];
  const partes: string[] = [];
  let actual = "";
  for (const frase of t.split(/(?<=[.;:])\s+|\n+/)) {
    if ((actual + " " + frase).trim().length > max && actual) { partes.push(actual.trim()); actual = ""; }
    actual += (actual ? " " : "") + (frase.length > max ? frase.slice(0, max) : frase);
  }
  if (actual.trim()) partes.push(actual.trim());
  return partes;
}

function armar(base: Omit<Fragmento, "huella" | "texto" | "clave">, clave: string, texto: string): Fragmento[] {
  const trozos = trocear(texto);
  return trozos.map((tx, i) => {
    const f = {
      ...base, clave: trozos.length > 1 ? `${clave}.${i + 1}` : clave, texto: tx,
      titulo: trozos.length > 1 ? `${base.titulo} (parte ${i + 1} de ${trozos.length})`.slice(0, 300) : base.titulo.slice(0, 300),
      url: base.url && URL_OK.test(base.url) ? base.url.slice(0, 400) : null,
    };
    return { ...f, huella: huella(f) };
  });
}

const segura = (s: string) => s.replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 120);

// Corpus fijo (viene en el código de ENQORA, versionado con KNOWLEDGE_VERSION).
export function corpusBase(): Fragmento[] {
  const out: Fragmento[] = [];
  for (const [k, r] of Object.entries(RULES)) {
    out.push(...armar({
      origen: "regla", titulo: r.tema, articulo: corto(r.fuente.articulo, 200), fuente: corto(r.fuente.titulo, 300), url: r.fuente.url ?? null,
      vigencia: corto(r.fuente.vigencia, 120), verificado: KNOWLEDGE_VERSION, departamento: null,
    }, `regla:${segura(k)}`, r.regla));
  }
  for (const p of PLAYBOOKS) {
    const normas = p.normas.map((n) => RULES[n]?.fuente.articulo ?? RULES[n]?.fuente.titulo).filter(Boolean).join("; ");
    const texto = [`Caso: ${p.caso}.`, `Señales: ${p.senales.join("; ")}.`, `Ruta: ${p.pasos.join(" ")}`,
      p.origen?.aprendizajes.length ? `Aprendizajes: ${p.origen.aprendizajes.join(" ")}` : ""].filter(Boolean).join("\n");
    out.push(...armar({
      origen: "ruta", titulo: p.caso.slice(0, 280), articulo: corto(normas, 200), fuente: "Ruta de trabajo ENQORA (casos anonimizados)", url: null,
      vigencia: null, verificado: p.origen?.fecha && FECHA.test(p.origen.fecha) ? p.origen.fecha : KNOWLEDGE_VERSION, departamento: null,
    }, `ruta:${segura(p.id)}`, texto));
  }
  for (const o of OBLIGACIONES_LABORALES) {
    out.push(...armar({
      origen: "obligacion_laboral", titulo: o.nombre, articulo: corto(o.fundamento, 200), fuente: corto(o.fuente.nombre, 300), url: o.fuente.url,
      vigencia: null, verificado: FECHA.test(o.fuente.verificada) ? o.fuente.verificada : null, departamento: "laboral",
    }, `obligacion_laboral:${segura(o.id)}`, `${o.fundamento}. Cuándo aplica: ${o.condicion} Cómo se acredita: ${o.acredita}`));
  }
  return out;
}

// Publicación de ENQORA Informa ya publicada (verificada y revisada por el equipo).
export type FilaInforma = {
  id: string; title: string; summary: string; impact: string | null; institution: string | null; source_url: string;
  departamento: string | null; vigente_desde: string | null; fecha_consulta: string | null; published_on: string | null; kind: string;
};
export function fragmentosInforma(filas: FilaInforma[]): Fragmento[] {
  return filas.flatMap((r) => armar({
    origen: "informa", titulo: r.title, articulo: corto(`${r.kind}${r.published_on ? ` · ${r.published_on}` : ""}`, 200),
    fuente: corto(r.institution, 300), url: r.source_url, vigencia: r.vigente_desde ? `Desde ${r.vigente_desde}` : null,
    verificado: r.fecha_consulta && FECHA.test(r.fecha_consulta) ? r.fecha_consulta : null, departamento: corto(r.departamento, 40),
  }, `informa:${r.id}`, [r.summary, r.impact ? `Impacto: ${r.impact}` : ""].filter(Boolean).join("\n")));
}
