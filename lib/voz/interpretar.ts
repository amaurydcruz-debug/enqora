// Interpretación de voz para CORA (piloto con la voz del navegador). Funciones puras, sin dependencias del navegador:
// · rutDesdeVoz: entiende un RUT dictado («siete siete cero…», «setenta y siete millones…», «77.058.311 guion k»).
// · respuestaDesdeVoz: traduce lo que dice la persona a las respuestas de la consulta (sí, no, no sé, ayuda, no aplica).
// · paraVoz: adapta un texto para que la voz lo lea bien (montos, siglas, abreviaturas).
import type { Answer } from "@/lib/diagnostic-360";
import { isValidRut } from "@/lib/rut";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const UNIDADES: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26,
  veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600,
  setecientos: 700, ochocientos: 800, novecientos: 900,
};

// «setenta y siete millones cincuenta y ocho mil trescientos once» → 77058311. null si hay palabras que no son números.
function numeroEnPalabras(palabras: string[]): number | null {
  let total = 0, grupo = 0, alguno = false;
  for (const w of palabras) {
    if (w === "y") continue;
    if (w in UNIDADES) { grupo += UNIDADES[w]; alguno = true; continue; }
    if (w === "mil") { total += (grupo || 1) * 1000; grupo = 0; alguno = true; continue; }
    if (w === "millon" || w === "millones") { total += (grupo || 1) * 1_000_000; grupo = 0; alguno = true; continue; }
    if (/^\d+$/.test(w)) { grupo += Number(w); alguno = true; continue; }
    return null;
  }
  return alguno ? total + grupo : null;
}

const DV_K = /^(k|ka|ca|kappa)$/;

// Devuelve el RUT normalizado («77058311-K») solo si el dígito verificador es correcto; si no, null.
export function rutDesdeVoz(texto: string): string | null {
  const t = sinTildes(texto).replace(/[.,]/g, " ").replace(/-/g, " guion ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const candidatos: string[] = [];

  // 1) El reconocedor ya entregó cifras: «77058311 k», «77 058 311 guion k», «7 7 0 5 8 3 1 1 k».
  const compacto = t.replace(/\b(guion|raya|digito verificador|verificador|es|el|rut)\b/g, " ")
    .replace(/\b(ka|ca|kappa)\b/g, "k").replace(/[^0-9k]/g, "");
  if (/^\d{7,8}[0-9k]$/.test(compacto)) candidatos.push(`${compacto.slice(0, -1)}-${compacto.slice(-1)}`);

  // 2) Palabras: separar cuerpo y dígito verificador por «guion»/«raya» o tomar la última palabra como DV.
  const tokens = t.split(" ").filter((w) => !["rut", "el", "es", "mi", "numero", "de", "la", "empresa"].includes(w));
  const SEP = ["guion", "raya", "digito", "verificador"];
  const corte = tokens.findIndex((w) => SEP.includes(w));
  const cuerpoT = corte >= 0 ? tokens.slice(0, corte) : tokens.slice(0, -1);
  const dvT = (corte >= 0 ? tokens.slice(corte + 1) : tokens.slice(-1)).filter((w) => !SEP.includes(w));
  const dvW = dvT.join(" ");
  const dv = DV_K.test(dvW) ? "k" : dvW in UNIDADES && UNIDADES[dvW] <= 9 ? String(UNIDADES[dvW]) : /^\d$/.test(dvW) ? dvW : null;
  if (dv) {
    // a) dígito por dígito: cada palabra es un dígito.
    const digitos = cuerpoT.map((w) => (/^\d$/.test(w) ? w : w in UNIDADES && UNIDADES[w] <= 9 ? String(UNIDADES[w]) : null));
    if (digitos.every(Boolean) && (digitos.length === 7 || digitos.length === 8)) candidatos.push(`${digitos.join("")}-${dv}`);
    // b) como número: «setenta y siete millones…».
    const n = numeroEnPalabras(cuerpoT);
    if (n && n >= 1_000_000 && n < 100_000_000) candidatos.push(`${n}-${dv}`);
  }

  for (const c of candidatos) {
    const r = c.toUpperCase();
    if (isValidRut(r)) return r;
  }
  return null;
}

export type ComandoVoz = Answer | "informe" | "repetir" | "texto";

// Lo que dice la persona → respuesta. `noAplica` habilita «no aplica» (p. ej., «no tengo trabajadores»).
export function respuestaDesdeVoz(texto: string, noAplica?: string): ComandoVoz | null {
  const t = ` ${sinTildes(texto).replace(/[¡!¿?.,;:]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (!t.trim()) return null;
  if (/\b(informe|resultado|resumen)\b/.test(t)) return "informe";
  if (/\b(repite|repetir|otra vez|de nuevo)\b/.test(t)) return "repetir";
  if (/\b(escribir|leer|texto|pantalla)\b/.test(t)) return "texto";
  if (/\b(ayuda|ayudame|ayudar|no entiendo|explicame)\b/.test(t)) return "ayuda";
  if (noAplica) {
    const na = sinTildes(noAplica);
    if (t.includes(na) || /\bno aplica\b|\bno corresponde\b/.test(t) || (/\bno tengo\b/.test(t) && na.startsWith("no tengo") && t.includes(na.split(" ").slice(-1)[0]))) return "na";
  }
  if (/\b(no se|ni idea|no estoy seguro|no estoy segura|no lo se|no sabria|desconozco)\b/.test(t)) return "no_se";
  if (/^ (no|nop|negativo|para nada|todavia no|aun no|no todavia)\b/.test(t) || / no (tengo|tenemos|estan|esta|lo|las|los)\b/.test(t)) return "no";
  if (/\b(si|sí|claro|correcto|afirmativo|por supuesto|exacto|asi es|todo al dia|al dia|obvio|tenemos|tengo)\b/.test(t)) return "si";
  if (/^ no /.test(t)) return "no";
  return null;
}

// Monto en palabras simples para la voz: 3800000 → «3 millones 800 mil pesos».
export function pesosHablados(n: number): string {
  const v = Math.round(Math.abs(n));
  const mill = Math.floor(v / 1_000_000), miles = Math.floor((v % 1_000_000) / 1000), resto = v % 1000;
  const partes = [mill ? `${mill} ${mill === 1 ? "millón" : "millones"}` : "", miles ? `${miles} mil` : "", resto ? String(resto) : ""].filter(Boolean);
  return `${partes.join(" ") || "0"}${mill && !miles && !resto ? " de pesos" : " pesos"}`;
}

// Adapta el texto para leerlo en voz alta.
export function paraVoz(texto: string): string {
  return texto
    .replace(/\$\s?(\d{1,3}(?:\.\d{3})+|\d+)/g, (_, num: string) => pesosHablados(Number(num.replace(/\./g, ""))))
    .replace(/(\d{1,3}(?:\.\d{3})+)\s?UF\b/g, (_, num: string) => `${Number(num.replace(/\./g, "")).toLocaleString("es-CL")} U F`)
    .replace(/\bUF\b/g, "U F")
    .replace(/\bF29\b/g, "F 29")
    .replace(/\bSpA\b|\bSPA\b/g, "S P A")
    .replace(/\bEIRL\b|\bE\.I\.R\.L\./g, "E I R L")
    .replace(/\bN°\s?/g, "número ")
    .replace(/\bart\.\s?/gi, "artículo ")
    .replace(/\bDL\b/g, "decreto ley")
    .replace(/\bSII\b/g, "S I I")
    .replace(/→/g, ".")
    .replace(/\s+/g, " ")
    .trim();
}
