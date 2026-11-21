import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { nombreLinea } from "@/lib/lineas";

// Une documentos de un caso en un solo PDF numerado: portada con índice y huella SHA-256 de cada original,
// y pie «folio · documento n/N · página». Lo usa «Unir en PDF numerado» (app/actions/pdf-expediente.ts).

const A4: [number, number] = [595.28, 841.89];
const MARGEN = 42;
const ORO = rgb(0.61, 0.49, 0.27);
const GRIS = rgb(0.4, 0.42, 0.46);
const TINTA = rgb(0.08, 0.1, 0.16);

export type DocExpediente = { id: string; file_name: string; mime_type: string | null; created_at: string };
export type EntradaExpediente = { doc: DocExpediente; bytes: Uint8Array | null };
type Parte = { n: number; doc: DocExpediente; sha: string; paginas: number; nota: string | null };

// Las fuentes estándar del PDF solo admiten Latin-1: se reemplaza lo demás para que nunca falle.
const SUST: Record<string, string> = { "—": "-", "–": "-", "…": "...", "“": '"', "”": '"', "‘": "'", "’": "'" };
const t = (s: string) => s.normalize("NFC").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, (c) => SUST[c] ?? "?");

function envolver(texto: string, font: PDFFont, size: number, ancho: number): string[] {
  const out: string[] = [];
  let linea = "";
  for (const palabra of t(texto).split(/\s+/)) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) <= ancho) linea = prueba;
    else {
      if (linea) out.push(linea);
      linea = palabra;
    }
  }
  if (linea) out.push(linea);
  return out;
}

const fechaHora = (d: Date) =>
  new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeStyle: "short", timeZone: "America/Santiago" }).format(d);

export async function construirExpediente(o: {
  folio: string; titulo: string; cliente: string; preparo: string; entradas: EntradaExpediente[]; ahora?: Date;
}): Promise<{ bytes: Uint8Array; unidos: number; total: number }> {
  const c = { folio: o.folio, title: o.titulo };
  const cliente = o.cliente;
  const preparo = o.preparo;
  const pdf = await PDFDocument.create();
  pdf.setTitle(t(`Expediente ${c.folio}`));
  pdf.setAuthor("ENQORA");
  pdf.setCreator("ENQORA · Unir en PDF numerado");
  pdf.setProducer("ENQORA");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const negrita = await pdf.embedFont(StandardFonts.HelveticaBold);

  // 1) Contenido: cada documento en orden. Lo que no es PDF ni foto queda indicado en el índice.
  const partes: Parte[] = [];
  const paginasDe = new Map<PDFPage, number>();
  for (const [i, { doc: d, bytes }] of o.entradas.entries()) {
    const n = i + 1;
    if (!bytes) {
      partes.push({ n, doc: d, sha: "", paginas: 0, nota: "No se pudo leer el archivo." });
      continue;
    }
    const sha = createHash("sha256").update(bytes).digest("hex");
    const mime = (d.mime_type ?? "").toLowerCase();
    try {
      if (mime === "application/pdf") {
        const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
        const copias = await pdf.copyPages(src, src.getPageIndices());
        for (const p of copias) {
          pdf.addPage(p);
          paginasDe.set(p, n);
        }
        partes.push({ n, doc: d, sha, paginas: copias.length, nota: null });
      } else if (mime === "image/jpeg" || mime === "image/png") {
        const img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
        const page = pdf.addPage(A4);
        const [w, h] = A4;
        const esc = Math.min((w - MARGEN * 2) / img.width, (h - MARGEN * 2 - 20) / img.height, 1);
        const iw = img.width * esc;
        const ih = img.height * esc;
        page.drawImage(img, { x: (w - iw) / 2, y: (h - ih) / 2 + 10, width: iw, height: ih });
        paginasDe.set(page, n);
        partes.push({ n, doc: d, sha, paginas: 1, nota: null });
      } else {
        partes.push({ n, doc: d, sha, paginas: 0, nota: "Anexo no convertible a PDF: queda como original en la Bóveda." });
      }
    } catch {
      partes.push({ n, doc: d, sha, paginas: 0, nota: "El archivo está dañado o protegido: queda como original en la Bóveda." });
    }
  }
  const unidos = partes.filter((p) => p.paginas > 0).length;
  if (!unidos) return { bytes: new Uint8Array(), unidos: 0, total: partes.length };

  // 2) Portada con índice (se inserta al inicio; puede ocupar más de una página).
  const ahora = o.ahora ?? new Date();
  const portadas: PDFPage[] = [];
  let page = pdf.insertPage(0, A4);
  portadas.push(page);
  const [W, H] = A4;
  let y = H - MARGEN;
  const nuevaPortada = () => {
    page = pdf.insertPage(portadas.length, A4);
    portadas.push(page);
    y = H - MARGEN;
  };
  const linea = (txt: string, size = 10, f = font, color = TINTA, x = MARGEN) => {
    for (const l of envolver(txt, f, size, W - x - MARGEN)) {
      if (y < MARGEN + 30) nuevaPortada();
      page.drawText(l, { x, y, size, font: f, color });
      y -= size * 1.45;
    }
  };
  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: ORO });
  y -= 14;
  linea("ENQORA", 11, negrita, ORO);
  y -= 8;
  linea("Expediente unido y numerado", 20, negrita);
  y -= 6;
  linea(`Caso ${c.folio}${nombreLinea(c.folio) ? ` · ${nombreLinea(c.folio)}` : ""}`, 12, negrita);
  linea(c.title, 11);
  if (cliente) linea(`Cliente: ${cliente}`, 10, font, GRIS);
  linea(`Generado el ${fechaHora(ahora)} por ${preparo}`, 10, font, GRIS);
  linea(`${partes.length} ${partes.length === 1 ? "documento" : "documentos"} elegidos · ${unidos} unidos en este PDF`, 10, font, GRIS);
  y -= 10;
  linea("Índice", 13, negrita);
  y -= 2;
  let desde = 1;
  for (const p of partes) {
    const rango = p.paginas ? (p.paginas === 1 ? `pág. ${desde}` : `págs. ${desde}-${desde + p.paginas - 1}`) : "no incluido";
    linea(`${p.n}. ${p.doc.file_name}  —  ${rango}`, 10, negrita);
    linea(`Recibido el ${fechaHora(new Date(p.doc.created_at))}${p.sha ? ` · SHA-256 ${p.sha}` : ""}`, 8, font, GRIS, MARGEN + 14);
    if (p.nota) linea(p.nota, 8.5, font, ORO, MARGEN + 14);
    desde += p.paginas;
    y -= 3;
  }
  y -= 8;
  linea(
    "Trazabilidad: cada documento original se conserva sin cambios en la Bóveda del caso; la huella SHA-256 permite comprobar que la copia unida corresponde al original. Este PDF es una copia de trabajo interna del equipo ENQORA.",
    8.5, font, GRIS,
  );

  // 3) Pie numerado en todas las páginas del contenido (las de portada llevan su propio pie).
  const total = pdf.getPageCount() - portadas.length;
  pdf.getPages().forEach((p, idx) => {
    const { width } = p.getSize();
    const enPortada = idx < portadas.length;
    const n = paginasDe.get(p);
    const texto = enPortada
      ? `${c.folio} · Portada e índice ${idx + 1}/${portadas.length}`
      : `${c.folio} · Documento ${n ?? "?"}/${partes.length} · Página ${idx - portadas.length + 1} de ${total}`;
    const size = 8;
    const ancho = font.widthOfTextAtSize(t(texto), size);
    p.drawRectangle({ x: width / 2 - ancho / 2 - 8, y: 10, width: ancho + 16, height: 15, color: rgb(1, 1, 1), opacity: 0.85 });
    p.drawText(t(texto), { x: width / 2 - ancho / 2, y: 14.5, size, font, color: GRIS });
  });

  return { bytes: await pdf.save(), unidos, total: partes.length };
}
