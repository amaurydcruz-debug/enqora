// Lectura de archivos tabulares en el navegador (CSV/TXT del SII y cartolas bancarias).

export function decodeText(bytes: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function detectDelimiter(line: string) {
  const cands = ["\t", ";", "|", ","];
  return cands.map((d) => [d, splitLine(line, d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
}

// Separa una línea respetando comillas dobles.
export function splitLine(line: string, d: string): string[] {
  if (!line.includes('"')) return line.split(d);
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === d && !q) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseDate(v: string | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/);
  if (m) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Montos chilenos: «1.234.567», «-1.234», «1234567», «1.234,50», «$ 12.000».
export function parseAmount(v: string | undefined): number | null {
  let s = (v ?? "").trim().replace(/\$|\s|CLP/gi, "");
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { neg = !neg; s = s.slice(1); }
  if (s.endsWith("-")) { neg = !neg; s = s.slice(0, -1); }
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(neg ? -n : n);
}

export async function readTextFile(file: File) {
  const buf = await file.arrayBuffer();
  const text = decodeText(new Uint8Array(buf));
  return text.split(/\r?\n/).filter((l) => l.trim().length);
}
