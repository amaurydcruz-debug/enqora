// Markdown simple → HTML seguro para documentos de la Bóveda (sin HTML del autor: todo se escapa).
// Soporta: # ## ###, párrafos, **negrita**, *cursiva*, listas (- y 1.), --- y marcas [COMPLETAR: …].
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function enLinea(s: string): string {
  return esc(s)
    .replace(/\[COMPLETAR:?\s*([^\]]*)\]/g, (_m, t) => `<mark class="doc-completar">[COMPLETAR${t ? `: ${t}` : ""}]</mark>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}

export function markdownSeguro(md: string): string {
  const out: string[] = [];
  let lista: "ul" | "ol" | null = null;
  let parrafo: string[] = [];
  const cerrarParrafo = () => { if (parrafo.length) { out.push(`<p>${parrafo.map(enLinea).join("<br />")}</p>`); parrafo = []; } };
  const cerrarLista = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (const linea of md.replace(/\r\n?/g, "\n").split("\n")) {
    const l = linea.trimEnd();
    const h = /^(#{1,3})\s+(.+)$/.exec(l);
    const ul = /^\s*[-*•]\s+(.+)$/.exec(l);
    const ol = /^\s*\d+[.)]\s+(.+)$/.exec(l);
    if (!l.trim()) { cerrarParrafo(); cerrarLista(); continue; }
    if (/^-{3,}$/.test(l.trim())) { cerrarParrafo(); cerrarLista(); out.push("<hr />"); continue; }
    if (h) { cerrarParrafo(); cerrarLista(); out.push(`<h${h[1].length}>${enLinea(h[2])}</h${h[1].length}>`); continue; }
    if (ul || ol) {
      cerrarParrafo();
      const tipo = ul ? "ul" : "ol";
      if (lista !== tipo) { cerrarLista(); out.push(`<${tipo}>`); lista = tipo; }
      out.push(`<li>${enLinea((ul ?? ol)![1])}</li>`);
      continue;
    }
    cerrarLista();
    parrafo.push(l);
  }
  cerrarParrafo(); cerrarLista();
  return out.join("\n");
}
