// Bitácora del computador del enjambre (0097): qué hizo el agente en su contenedor durante una ejecución, para
// que el equipo pueda revisarlo (trazabilidad). Se arma desde los bloques de respuesta de la API: comandos de
// terminal, archivos creados o editados, páginas oficiales leídas, búsquedas y cálculos con las calculadoras.
// Función pura, sin red.

export type EntradaBitacora = { tipo: "comando" | "archivo" | "lectura" | "busqueda" | "calculo"; detalle: string; resultado?: string; ok?: boolean };

const corto = (s: unknown, n: number) => String(s ?? "").replace(/\s+$/g, "").slice(0, n);
const MAX_ENTRADAS = 80;

type Bloque = Record<string, unknown>;

export function bitacoraDeBloques(bloques: unknown[]): EntradaBitacora[] {
  const lista = bloques.filter((b): b is Bloque => !!b && typeof b === "object");
  const resultados = new Map<string, Bloque>();
  for (const b of lista) if (typeof b.tool_use_id === "string" && typeof b.type === "string" && b.type.endsWith("_tool_result")) resultados.set(b.tool_use_id, b);
  const out: EntradaBitacora[] = [];
  for (const b of lista) {
    if (out.length >= MAX_ENTRADAS) break;
    const input = (b.input && typeof b.input === "object" ? b.input : {}) as Bloque;
    const res = typeof b.id === "string" ? resultados.get(b.id) : undefined;
    const contenido = (res?.content && typeof res.content === "object" ? res.content : {}) as Bloque;
    if (b.type === "server_tool_use" && b.name === "bash_code_execution") {
      const rc = typeof contenido.return_code === "number" ? contenido.return_code : undefined;
      const salida = corto(rc === 0 ? contenido.stdout : (contenido.stderr || contenido.stdout), 400);
      out.push({ tipo: "comando", detalle: corto(input.command, 300), resultado: salida || undefined, ok: rc === undefined ? undefined : rc === 0 });
    } else if (b.type === "server_tool_use" && b.name === "text_editor_code_execution") {
      const cmd = String(input.command ?? "");
      if (cmd === "view") continue; // leer no cambia nada
      out.push({ tipo: "archivo", detalle: `${cmd === "create" ? "Creó" : "Editó"} ${corto(input.path, 200)}`, ok: !/error/.test(String(contenido.type ?? "")) });
    } else if (b.type === "server_tool_use" && b.name === "web_fetch") {
      out.push({ tipo: "lectura", detalle: corto(input.url, 300), ok: !/error/.test(String(contenido.type ?? "")) });
    } else if (b.type === "server_tool_use" && b.name === "web_search") {
      out.push({ tipo: "busqueda", detalle: corto(input.query, 200) });
    } else if (b.type === "tool_use" && typeof b.name === "string" && b.name.startsWith("calcular_")) {
      out.push({ tipo: "calculo", detalle: `${b.name} ${corto(JSON.stringify(input), 250)}` });
    }
  }
  return out;
}
