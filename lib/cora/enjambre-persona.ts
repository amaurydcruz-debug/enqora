import { revisarPrescripcion, type PersonaAnswers } from "@/lib/cora/personas";
import { RULES, type Rule } from "@/lib/knowledge";

// CORA Personas · Enjambre de agentes. Cada agente revisa, con lo que la persona declaró, las reglas
// verificadas que le tocan (lib/knowledge.ts) y deja en la bitácora qué revisó, qué concluyó y con qué
// fuente. Regla de privacidad: con el RUT de una persona NO se consulta ninguna fuente sobre ella.
// Lo verificable sin datos personales es la normativa: el Verificador comprueba en vivo que cada fuente
// oficial citada siga publicada (ver app/actions/enjambre.ts).

export type EstadoRevision = "aplica" | "no_aplica" | "por_confirmar" | "informativo";
export type Revision = {
  agente: string;          // nombre del agente que la hizo
  reviso: string;          // qué revisó
  resultado: string;       // qué concluyó para ESTA persona
  estado: EstadoRevision;
  norma: string;           // clave de RULES
  fuente: { titulo: string; url?: string; articulo?: string; vigencia?: string };
};

const FIN_TGR = "2027-04-15";
const regla = (k: string): Rule => {
  const r = RULES[k];
  if (!r) throw new Error(`Regla inexistente: ${k}`);
  return r;
};
const rev = (agente: string, norma: string, reviso: string, resultado: string, estado: EstadoRevision): Revision => {
  const r = regla(norma);
  return { agente, reviso, resultado, estado, norma, fuente: { titulo: r.fuente.titulo, url: r.fuente.url, articulo: r.fuente.articulo, vigencia: r.fuente.vigencia } };
};
const dias = (desde: Date, hasta: string) => Math.ceil((Date.parse(`${hasta}T23:59:59-03:00`) - desde.getTime()) / 86_400_000);

export function enjambrePersona(a: PersonaAnswers, hoy = new Date()): Revision[] {
  const out: Revision[] = [];
  const inicio = a.venta !== "sin_inicio";
  const inactivo = a.venta === "inactivo";
  const iva = a.venta === "facturas" || a.venta === "ambas" || inactivo;
  const hon = a.venta === "honorarios" || a.venta === "ambas";

  // 02 · Tributario
  if (!inicio) {
    out.push(rev("Tributario", "inicio_actividades", "Obligación de iniciar actividades",
      "Antes de vender debes iniciar actividades: dentro de los dos meses siguientes a cuando comiences.", "aplica"));
  }
  if (iva) {
    out.push(rev("Tributario", "f29_sin_movimiento", "F29 mensual",
      inactivo
        ? `Sin término de giro, el F29 sigue siendo obligatorio cada mes aunque no haya movimiento${a.declara === "no" ? ": los meses que dejaste de declarar están atrasados" : ""}. Si se presenta tarde y sin impuesto, la multa va de 1 UTM a 1 UTA por declaración.`
        : "El F29 se presenta todos los meses, aunque no vendas.",
      inactivo && a.declara !== "si" ? "aplica" : "informativo"));
  }
  if (hon) {
    out.push(rev("Tributario", "retencion_honorarios", "Retención de boletas de honorarios",
      `Tus boletas tienen la retención vigente de ${hoy.getFullYear()}; en abril se cruza con tu impuesto y tus cotizaciones.`, "informativo"));
  }

  // Renta anual: el F22 y, en Pro Pyme Transparente, la DJ 1947 antes (caso real ENQORA, nov-2026)
  if (inicio && a.venta !== "honorarios" && a.declara !== "si") {
    out.push(rev("Tributario", "dj_1947", "Renta anual: F22 y DJ 1947 (si tu negocio está en Pro Pyme Transparente)",
      "Además de los F29, cada año va la declaración de renta (F22). Si tu negocio está en el régimen Pro Pyme Transparente, antes del F22 se presenta la Declaración Jurada 1947, que calcula tu base imponible. Revisa en sii.cl si el F22 del último año está presentado: es común que falten los dos.",
      "por_confirmar"));
  }

  // Cierre del negocio (persona sin movimiento)
  if (inactivo) {
    const conDeuda = a.deudas === "si";
    out.push(rev("Tributario", "presuncion_termino_giro", "¿El SII puede cerrar el negocio por ti? (presunción de término de giro, Ley 21.713)",
      conDeuda
        ? "No en tu caso: la presunción exige no tener deudas tributarias vigentes. Mientras tengas deudas, el cierre lo tienes que hacer tú con el término de giro."
        : a.deudas === "no"
          ? "Podría aplicarse si llevas 6 o más meses sin F29 y no respondes al contacto del SII durante 6 meses. Pero el SII revisa antes que no haya impuestos pendientes: conviene cerrar tú, en orden."
          : "Depende de si tienes deudas: con deudas tributarias vigentes no aplica y el cierre lo haces tú.",
      conDeuda ? "no_aplica" : "por_confirmar"));
    if (a.declara !== "si") {
      out.push(rev("Jurídico", "termino_giro_sii", "Riesgo de citación del SII por declaraciones no presentadas",
        "Si llevas 18 meses o más sin declarar, el SII puede citarte, liquidar y girar los impuestos; con eso anota una observación en tu situación tributaria y su plazo de revisión se alarga un año. Revisa en MiSII si tienes citaciones o anotaciones.", "por_confirmar"));
    }
    if (a.futuro !== "retomar") {
      out.push(rev("Tributario", "termino_giro", "Cómo se cierra: aviso de término de giro",
        "Se presenta en línea (formulario 2121) y el SII tiene hasta 6 meses para resolver. Antes hay que dejar sin pendientes las declaraciones y los documentos.", "aplica"));
    }
  }

  // Tesorería
  if (inicio && (a.deudas === "si" || a.deudas === "no_se")) {
    const quedan = dias(hoy, FIN_TGR);
    out.push(rev("Tesorería", "tgr_condonacion", "Condonación de intereses y multas (Ley 21.850)",
      quedan > 0
        ? `Vigente: quedan ${quedan} días (hasta el 15 de abril de 2027). Al contado se condona 100% de los intereses y 80% de las multas; en convenio de hasta 48 cuotas, 95% y 75%. Solo deudas fiscales vencidas al 31 de diciembre de 2025.`
        : "El plazo de la condonación de la Ley 21.850 ya venció.",
      quedan > 0 ? (a.deudas === "si" ? "aplica" : "por_confirmar") : "no_aplica"));
    out.push(rev("Tesorería", "interes_53", "Cómo crecen las deudas mientras no se pagan",
      "Desde 2025 el interés por mora es diario y variable (tasa corriente CMF + 3,5 puntos), sobre la deuda reajustada por IPC.", "informativo"));
  }

  // 03 · Jurídico: prescripción
  if (revisarPrescripcion(a)) {
    out.push(rev("Jurídico", "prescripcion_tributaria", "Prescripción de las deudas (Código Tributario, arts. 200 y 201)",
      a.antiguedad === "antiguas"
        ? "Las deudas de más de 3 años (o 6 si no se declararon) podrían estar prescritas. Antes de pagar o firmar un convenio se revisa cada una: firmar las reconoce y puede hacer perder la prescripción."
        : "Hay que saber de cuándo son las deudas: las antiguas podrían estar prescritas y no conviene pagarlas sin revisarlo.",
      "por_confirmar"));
  }

  return out;
}

// Fuentes oficiales que citan las revisiones (sin repetir), para que el Verificador las compruebe en vivo.
export function fuentesDe(revisiones: Revision[]): { titulo: string; url: string }[] {
  const vistos = new Set<string>();
  const out: { titulo: string; url: string }[] = [];
  for (const r of revisiones) {
    const u = r.fuente.url;
    if (u && /^https:\/\//.test(u) && !vistos.has(u)) { vistos.add(u); out.push({ titulo: r.fuente.titulo, url: u }); }
  }
  return out;
}
