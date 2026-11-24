// Anonimizador de ENQORA (Ley 21.719): antes de mandar un texto a un modelo que NO está autorizado para datos
// privados, se reemplazan los datos personales por marcas ([RUT_1], [CORREO_1], [NOMBRE_1]…). La respuesta del
// modelo vuelve con esas marcas y aquí se restauran los valores originales, sin que el modelo los haya visto.
//
// Idea tomada de Microsoft Presidio (MIT) y GLiNER (Apache 2.0), escrita en TypeScript para correr dentro de
// ENQORA sin servidores extra. Es por reglas: detecta lo que tiene forma reconocible (RUT, correo, teléfono,
// tarjeta, cuenta bancaria, dirección con número) y los nombres que el módulo le entrega explícitamente.
// Lo que no reconoce no lo oculta: por eso, por defecto, ningún proveedor recibe datos anonimizados hasta que
// se autoriza en ENQORA_IA_ANONIMIZADOS. Funciones puras, sin red.

export type Tipo = "RUT" | "CORREO" | "TELEFONO" | "TARJETA" | "CUENTA" | "DIRECCION" | "NOMBRE";
export type Mapa = { marca: string; tipo: Tipo; valor: string }[];
export type Anonimizado = { texto: string; mapa: Mapa };

// Orden importante: primero lo más específico (correo antes que teléfono; tarjeta antes que cuenta).
const REGLAS: { tipo: Tipo; re: RegExp; grupo?: number }[] = [
  { tipo: "CORREO", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // RUT con o sin puntos, siempre con guion y dígito verificador: 12.345.678-5 · 12345678-K
  { tipo: "RUT", re: /\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g },
  // Tarjeta: 13 a 19 dígitos, en bloques de 4 o seguidos.
  { tipo: "TARJETA", re: /\b(?:\d{4}[ -]){3}\d{1,7}\b|\b\d{15,19}\b/g },
  // Teléfono chileno: +56 9 1234 5678 · 912345678 · (2) 2345 6789
  { tipo: "TELEFONO", re: /(?:\+?56[\s-]?)?(?:\(?\d\)?[\s-]?)?9[\s-]?\d{4}[\s-]?\d{4}\b|\+56[\s-]?\(?2\)?[\s-]?\d{4}[\s-]?\d{4}\b/g },
  // Cuenta bancaria: solo cuando viene rotulada («cuenta», «cta», «N° de cuenta»), para no confundirla con montos.
  { tipo: "CUENTA", re: /\b(?:cuenta(?:\s+(?:corriente|vista|rut|de\s+ahorro))?|cta\.?(?:\s*cte\.?)?)\s*(?:n[°º.]?\s*)?:?\s*([\d-]{6,20})\b/gi, grupo: 1 },
  // Dirección: calle o avenida seguida de nombre y número.
  { tipo: "DIRECCION", re: /\b(?:calle|avenida|avda\.?|av\.|pasaje|psje\.?|camino)\s+[A-ZÁÉÍÓÚÑa-záéíóúñ.\s]{2,40}?\s\d{1,5}(?:\s*(?:depto\.?|dpto\.?|of\.?|oficina|casa)\s*[\w-]{1,6})?/gi },
];

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function anonimizar(texto: string, opciones: { nombres?: string[] } = {}): Anonimizado {
  const mapa: Mapa = [];
  const cuenta: Partial<Record<Tipo, number>> = {};
  const marcaPara = (tipo: Tipo, valor: string) => {
    const ya = mapa.find((m) => m.tipo === tipo && m.valor === valor);
    if (ya) return ya.marca;
    cuenta[tipo] = (cuenta[tipo] ?? 0) + 1;
    const marca = `[${tipo}_${cuenta[tipo]}]`;
    mapa.push({ marca, tipo, valor });
    return marca;
  };

  let t = texto;
  // Nombres explícitos (los conoce el módulo: trabajador, representante, cliente). Los más largos primero.
  const nombres = [...new Set((opciones.nombres ?? []).map((n) => n.trim()).filter((n) => n.length >= 3))].sort((a, b) => b.length - a.length);
  for (const n of nombres) {
    t = t.replace(new RegExp(`(?<![\\p{L}\\d])${escapar(n)}(?![\\p{L}\\d])`, "giu"), (m) => marcaPara("NOMBRE", m));
  }
  for (const { tipo, re, grupo } of REGLAS) {
    t = t.replace(re, (completo: string, ...g: unknown[]) => {
      if (completo.startsWith("[") && completo.endsWith("]")) return completo;
      if (grupo) {
        const valor = String(g[grupo - 1] ?? "");
        return valor ? completo.replace(valor, marcaPara(tipo, valor)) : completo;
      }
      return marcaPara(tipo, completo);
    });
  }
  return { texto: t, mapa };
}

// Restaura las marcas en cualquier salida (texto, arreglos u objetos de la herramienta).
export function restaurar<T>(valor: T, mapa: Mapa): T {
  if (!mapa.length) return valor;
  if (typeof valor === "string") {
    let s: string = valor;
    for (const m of mapa) s = s.split(m.marca).join(m.valor);
    return s as T;
  }
  if (Array.isArray(valor)) return valor.map((v) => restaurar(v, mapa)) as T;
  if (valor && typeof valor === "object") {
    return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, restaurar(v, mapa)])) as T;
  }
  return valor;
}

// Resumen para la bitácora: qué se ocultó (cantidades por tipo), nunca los valores.
export function resumenAnonimizado(mapa: Mapa): string {
  const c: Record<string, number> = {};
  for (const m of mapa) c[m.tipo] = (c[m.tipo] ?? 0) + 1;
  return Object.entries(c).map(([k, v]) => `${k.toLowerCase()}:${v}`).join(" ") || "sin datos personales detectados";
}
