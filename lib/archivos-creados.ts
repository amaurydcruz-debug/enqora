// Identificadores de archivos creados en el computador (dentro de los resultados de la ejecución de código).
export function archivosCreados(bloques: unknown[]): string[] {
  const ids = new Set<string>();
  const visitar = (x: unknown, dentro: boolean) => {
    if (Array.isArray(x)) { x.forEach((y) => visitar(y, dentro)); return; }
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    const esResultado = dentro || (typeof o.type === "string" && /code_execution_tool_result$/.test(o.type));
    if (esResultado && typeof o.file_id === "string") ids.add(o.file_id);
    for (const v of Object.values(o)) if (v && typeof v === "object") visitar(v, esResultado);
  };
  visitar(bloques, false);
  return [...ids];
}
