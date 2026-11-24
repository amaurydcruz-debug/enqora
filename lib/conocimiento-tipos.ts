// Tipos y funciones del buscador legal que también usa el navegador (sin dependencias de servidor).

export type Origen = "regla" | "ruta" | "obligacion_laboral" | "informa";
export const ORIGENES: Record<Origen, string> = {
  regla: "Regla verificada", ruta: "Ruta de caso ENQORA", obligacion_laboral: "Obligación laboral", informa: "ENQORA Informa",
};

export type FragmentoVisible = {
  clave: string; origen: Origen; titulo: string; articulo: string | null; fuente: string | null; url: string | null;
  vigencia: string | null; verificado: string | null; departamento: string | null; texto: string;
};

// «relajada»: la coincidencia por palabras apareció solo al aceptar cualquiera de las palabras (no todas).
export type Resultado = FragmentoVisible & { coincidencia: "ambas" | "significado" | "palabras"; puntaje: number; similitud: number | null; relajada: boolean };

// ¿Alcanza el respaldo para responder? Sin resultados, o solo coincidencias débiles por palabras, la respuesta
// honesta es «no tengo fuente» y derivar al equipo.
export function respaldoSuficiente(r: Resultado[]): boolean {
  if (!r.length) return false;
  const top = r[0];
  if ((top.similitud ?? 0) >= 0.55) return true;
  return top.coincidencia !== "significado" && !top.relajada;
}

// Cita lista para pegar: «Art. 97 N°2 CT · SII · verificado 2026-10-27 · https://…»
export function cita(r: Pick<FragmentoVisible, "articulo" | "fuente" | "verificado" | "url">): string {
  return [r.articulo, r.fuente, r.verificado ? `verificado ${r.verificado}` : null, r.url].filter(Boolean).join(" · ");
}
