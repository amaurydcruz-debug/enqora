import { PLAYBOOKS, RULES, type Playbook } from "@/lib/knowledge";

// Lector de avisos del SII. Cuando un cliente pega un correo o una notificación del SII, reconoce qué le piden
// (declaraciones juradas, F22, F29) y lo conecta con la ruta aprendida de casos reales (PLAYBOOKS). No guarda nada
// ni consulta fuentes con datos de la persona: solo lee el texto que ella entregó.

export type AvisoSII = {
  esAviso: boolean;
  djs: string[];               // números de DJ mencionados (p. ej. «1947»)
  anioTributario: number | null;
  menciona: { f22: boolean; f29: boolean; citacion: boolean };
  playbooks: Playbook[];       // rutas conocidas que aplican
  resumen: string[];           // líneas para la persona y para los agentes
};

// «Declaración(es) Jurada(s) N° 1947», «declaraciones juradas 1887 y 1879», «DJ 1947».
const DJ_RE = /declaraci[oó]n(?:\(?es\)?)?\s+jurada(?:\(?s\)?)?\s*(?:n[°ºo.]*\s*)?((?:\d{4}\s*(?:,|y|e)?\s*)+)/gi;

export function leerAvisoSII(texto: string): AvisoSII {
  const t = (texto ?? "").slice(0, 8000);
  const esAviso = /servicio de impuestos internos|\bsii\b/i.test(t) && /(oblig|present|declar|notific|citaci)/i.test(t);
  const djs = new Set<string>();
  for (const m of t.matchAll(DJ_RE)) for (const n of m[1].match(/\d{4}/g) ?? []) djs.add(n);
  for (const m of t.matchAll(/\bDJ\s*N?[°º]?\s*(\d{4})\b/gi)) djs.add(m[1]);
  const at = t.match(/\bA\.?\s?T\.?\s*(20\d{2})\b/i) ?? t.match(/a[ñn]o tributario\s*(20\d{2})/i);
  const menciona = {
    f22: /(formulario\s*22|\bF\s?22\b|declaraci[oó]n(?:es)? de renta)/i.test(t),
    f29: /(formulario\s*29|\bF\s?29\b|IVA mensual)/i.test(t),
    citacion: /citaci[oó]n|art[íi]culo\s*63/i.test(t),
  };
  const ids = new Set<string>();
  if (djs.has("1947")) ids.add("propyme_transparente_sin_renta");
  if (menciona.f29) ids.add("f29_atrasado");
  const playbooks = PLAYBOOKS.filter((p) => ids.has(p.id));

  const resumen: string[] = [];
  if (djs.size) resumen.push(`El SII indica que faltan la(s) Declaración(es) Jurada(s) ${[...djs].join(", ")}${at ? ` del año tributario ${at[1]}` : ""}.`);
  if (djs.has("1947")) {
    resumen.push(RULES.dj_1947.regla);
    resumen.push("Revisar también si el F22 de ese año está presentado: un aviso por la DJ 1947 suele esconder la renta sin declarar. Orden: primero la 1947, después el F22.");
  }
  if (menciona.f29) resumen.push("Menciona el F29: revisar cada período omitido o atrasado.");
  if (menciona.citacion) resumen.push("Menciona una citación: tiene plazo legal para responder; prioridad máxima y revisión de un profesional.");
  if (esAviso) resumen.push("El SII no envía enlaces ni pide claves por correo: verificar siempre entrando directo a sii.cl.");
  return { esAviso, djs: [...djs], anioTributario: at ? Number(at[1]) : null, menciona, playbooks, resumen };
}

// Texto para el modelo o los agentes: la ruta aprendida, si el relato es un aviso del SII.
export function contextoAviso(texto: string): string {
  const a = leerAvisoSII(texto);
  if (!a.esAviso || (!a.djs.length && !a.menciona.f29 && !a.menciona.citacion)) return "";
  return [
    "AVISO DEL SII DETECTADO EN EL RELATO:",
    ...a.resumen.map((x) => `- ${x}`),
    ...a.playbooks.map((p) => `Ruta conocida (${p.id}): ${p.pasos.join(" → ")}`),
  ].join("\n");
}
