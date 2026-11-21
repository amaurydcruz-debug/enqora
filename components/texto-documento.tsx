// Muestra el texto de un documento generado (# título, ## secciones, párrafos y viñetas «- »). Sin HTML del usuario.
export function TextoDocumento({ texto }: { texto: string }) {
  const bloques: React.ReactNode[] = [];
  let lista: string[] = [];
  const cerrarLista = (k: number) => {
    if (lista.length) bloques.push(<ul key={`l${k}`}>{lista.map((x, i) => <li key={i}>{x}</li>)}</ul>);
    lista = [];
  };
  texto.split("\n").forEach((linea, i) => {
    const l = linea.trimEnd();
    if (l.startsWith("- ")) { lista.push(l.slice(2)); return; }
    cerrarLista(i);
    if (!l.trim()) return;
    if (l.startsWith("## ")) bloques.push(<h2 key={i}>{l.slice(3)}</h2>);
    else if (l.startsWith("# ")) bloques.push(<h1 key={i}>{l.slice(2)}</h1>);
    else bloques.push(<p key={i}>{l}</p>);
  });
  cerrarLista(-1);
  return <article className="doc-texto">{bloques}</article>;
}
