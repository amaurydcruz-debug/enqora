// Oportunidades legales (principio rector: «el cliente debe salir ganando»).
// Reglas deterministas sobre datos reales de la empresa (régimen declarado, tramo de ventas del SII, trabajadores).
// Cada oportunidad trae su fundamento, fuente oficial y fecha de verificación; las cifras son ejemplos calculados
// con tasas legales, nunca una estimación del impuesto real de la empresa. Ninguna se presenta como hecho:
// todas son «por evaluar» y un profesional de ENQORA las revisa antes de recomendarlas.
// Límite ético y legal: elegir entre alternativas que la ley permite es legítimo; simular operaciones o abusar de
// formas jurídicas puede caer en las normas antielusivas (arts. 4 bis, 4 ter y 4 quáter del Código Tributario).

import type { Regime } from "@/lib/company-constants";

export type EstadoOportunidad = "probable" | "por_confirmar";
export type Oportunidad = {
  id: string;
  titulo: string;
  resumen: string;            // una línea, para informes breves
  estado: EstadoOportunidad;
  por_que: string;            // por qué podría aplicar a esta empresa (con sus datos)
  beneficio: string;          // qué gana el cliente
  ejemplo?: string;           // cifra ilustrativa calculada con tasas legales
  confirmar: string[];        // qué falta confirmar antes de recomendarla
  plazo?: string;
  fuente: { titulo: string; url: string };
  verificado: string;         // AAAA-MM-DD
  accion: { modulo: "contabilidad" | "legal" | "crece"; asunto: string; servicio: string }; // servicio = código del catálogo
};

export type EntradaOportunidades = {
  regimen: Regime | string | null;
  tramo: string | null;       // tramo de ventas del SII ("1" a "13")
  trabajadores: number | null;
  termino_giro?: boolean;
  hoy?: Date;
};

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
// Tasas legales del Impuesto de Primera Categoría por año comercial (verificadas el 09-11-2026).
// Régimen general (14 A): Ley 21.850. Pro Pyme general (14 D N°3): tasa transitoria de la Ley 21.755.
export const TASA_GENERAL: Record<number, number> = { 2026: 0.27, 2027: 0.255, 2028: 0.24, 2029: 0.23 };
export const TASA_PRO_PYME: Record<number, number> = { 2025: 0.125, 2026: 0.125, 2027: 0.125, 2028: 0.15 };

// Fin del plazo de la Tesorería: 180 días corridos desde la publicación de la Ley 21.850 (17-10-2026).
export const FIN_PLAZO_TGR = "2027-04-15";

export function oportunidades(e: EntradaOportunidades): Oportunidad[] {
  if (e.termino_giro) return [];
  const hoy = e.hoy ?? new Date();
  const t = e.tramo ? Number(e.tramo) : null;
  const tramoValido = t !== null && Number.isFinite(t) && t >= 2 && t <= 13;
  const mipyme = !tramoValido || (t as number) <= 9; // hasta 100.000 UF de ventas anuales
  const out: Oportunidad[] = [];

  // 1. Condonación de intereses y multas en la Tesorería (Ley 21.850): plazo acotado.
  if (mipyme && hoy.toISOString().slice(0, 10) <= FIN_PLAZO_TGR) {
    out.push({
      id: "tgr_condonacion",
      titulo: "Condonación de intereses y multas de deudas fiscales (Tesorería)",
      resumen: "Hasta 100% de intereses y 80% de multas condonados en deudas fiscales vencidas al 31-12-2025. Plazo: 15-04-2027.",
      estado: "por_confirmar",
      por_que: tramoValido ? "Por su tamaño de ventas, la empresa está dentro de las mipymes que pueden usar este beneficio." : "Aplica a personas naturales y mipymes.",
      beneficio: "Si la empresa tiene deudas fiscales vencidas al 31 de diciembre de 2025, puede pagarlas con condonación del 100% de los intereses y el 80% de las multas al contado, o del 95% y el 75% en un convenio de hasta 48 cuotas (pie mínimo del 10% del capital).",
      ejemplo: `Por cada ${clp(1_000_000)} de multas pagadas al contado se condonan ${clp(800_000)}.`,
      confirmar: ["Que existan deudas fiscales vencidas al 31 de diciembre de 2025 (certificado de deuda de la Tesorería, que obtiene la propia empresa)", "Si conviene pagar al contado o en convenio (si se atrasa una cuota, el beneficio se revoca)"],
      plazo: "Hasta el 15 de abril de 2027 (180 días corridos desde el 17 de octubre de 2026), sin prórroga.",
      fuente: { titulo: "TGR · Ley de Reconstrucción: facilidades de pago para MiPymes", url: "https://tgr.gob.cl/2026/10/19/ley-de-reconstruccion-tgr-aplica-facilidades-de-pago-a-deudores-cae-mipymes-y-personas-naturales/noticias/" },
      verificado: "2026-11-09",
      accion: { modulo: "contabilidad", asunto: "Evaluar la condonación de intereses y multas en la Tesorería (Ley 21.850)", servicio: "CON-06" },
    });
  }

  // 2. Régimen Pro Pyme: tasa de 12,5% frente a 25,5% del régimen general en 2027.
  if (e.regimen === "general_semi_integrado" && (!tramoValido || (t as number) <= 9)) {
    const anio = 2027;
    const dif = (TASA_GENERAL[anio] - TASA_PRO_PYME[anio]) * 10_000_000;
    const probable = tramoValido && (t as number) <= 8; // ventas anuales hasta 50.000 UF, bajo el promedio exigido
    out.push({
      id: "pro_pyme_cambio",
      titulo: "Evaluar el cambio al régimen Pro Pyme",
      resumen: "Impuesto de la empresa de 12,5% en vez de 25,5% en 2027, si cumple los requisitos del régimen Pro Pyme.",
      estado: probable ? "probable" : "por_confirmar",
      por_que: probable
        ? "La empresa declara el régimen general y sus ventas informadas al SII están bajo el límite del régimen Pro Pyme."
        : "La empresa declara el régimen general; hay que confirmar si su promedio de ingresos cumple el límite del régimen Pro Pyme.",
      beneficio: `En el año comercial ${anio}, el Impuesto de Primera Categoría del régimen Pro Pyme general es de 12,5%, frente a 25,5% del régimen general. Además tiene contabilidad simplificada y depreciación instantánea.`,
      ejemplo: `Por cada ${clp(10_000_000)} de renta líquida imponible, la empresa pagaría ${clp(dif)} menos de Impuesto de Primera Categoría en ${anio}. El efecto total para los dueños depende de los retiros: lo calcula un profesional.`,
      confirmar: ["Promedio de ingresos del giro de los últimos 3 años de hasta 75.000 UF (ningún año sobre 85.000 UF)", "Capital aportado al inicio de actividades de hasta 85.000 UF", "Ingresos pasivos de hasta el 35% de los ingresos del giro", "Mantener la tasa de 12,5% exige cumplir el requisito de cotización del art. 4° transitorio de la Ley 21.735"],
      plazo: "Las empresas existentes eligen el régimen entre el 1 de enero y el 30 de abril del año en que se incorporan.",
      fuente: { titulo: "SII · Requisitos para optar al Régimen Pro Pyme", url: "https://www.sii.cl/preguntas_frecuentes/declaracion_renta/001_140_7530.htm" },
      verificado: "2026-11-09",
      accion: { modulo: "contabilidad", asunto: "Evaluar el cambio al régimen Pro Pyme", servicio: "CON-07" },
    });
  }

  // 3. Ya en Pro Pyme: confirmar que conserva la tasa reducida.
  if (e.regimen === "pro_pyme_general") {
    out.push({
      id: "pro_pyme_tasa",
      titulo: "Asegurar la tasa reducida de 12,5% del régimen Pro Pyme",
      resumen: "Conservar la tasa de 12,5% cumpliendo al cierre del año el requisito de cotización.",
      estado: "por_confirmar",
      por_que: "La empresa declara el régimen Pro Pyme general.",
      beneficio: "La tasa transitoria de 12,5% (años comerciales 2025 a 2027; 15% en 2028) no es automática: depende de cumplir al cierre del ejercicio el requisito de cotización del art. 4° transitorio de la Ley 21.735.",
      ejemplo: `Frente a la tasa general de Pro Pyme, por cada ${clp(10_000_000)} de renta líquida imponible la diferencia es de ${clp(10_000_000 * (0.25 - 0.125))} en el año.`,
      confirmar: ["Cumplimiento del requisito de cotización al cierre del ejercicio"],
      fuente: { titulo: "SII · Circular N°53 de 2025 (Ley 21.755)", url: "https://www.sii.cl/normativa_legislacion/circulares/2025/circu53.pdf" },
      verificado: "2026-11-09",
      accion: { modulo: "contabilidad", asunto: "Revisar que la empresa conserve la tasa Pro Pyme de 12,5%", servicio: "CON-07" },
    });
  }

  // 4. Postergación del IVA (caja, no ahorro).
  // No aplica a quien solo emite boletas de honorarios ni a quien aún no inicia actividades: no declaran IVA.
  if (mipyme && !["renta_presunta", "honorarios", "sin_inicio"].includes(e.regimen ?? "")) {
    out.push({
      id: "postergacion_iva",
      titulo: "Postergar el pago del IVA hasta dos meses",
      resumen: "Pagar el IVA hasta dos meses después, sin multas ni intereses: más caja para operar.",
      estado: "por_confirmar",
      por_que: tramoValido ? "Las ventas informadas al SII están dentro del límite de 100.000 UF." : "Aplica a empresas con ingresos promedio de hasta 100.000 UF.",
      beneficio: "Da aire a la caja: el IVA de un mes se paga hasta dos meses después, sin multas ni intereses. La declaración se sigue presentando a tiempo.",
      confirmar: ["Ventas afectas a IVA", "Sin morosidad reiterada en IVA o Renta (o con convenio vigente)", "Declaraciones de los últimos 36 meses presentadas a tiempo", "Notificación por correo electrónico del SII"],
      fuente: { titulo: "SII · Postergación del IVA (art. 64 DL 825)", url: "https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_6628.htm" },
      verificado: "2026-11-06",
      accion: { modulo: "contabilidad", asunto: "Evaluar la postergación del pago del IVA", servicio: "CON-02" },
    });
  }

  // 5. Franquicia SENCE: con trabajadores.
  if (e.trabajadores !== null && e.trabajadores > 0) {
    out.push({
      id: "sence_franquicia",
      titulo: "Capacitar a los trabajadores con la franquicia tributaria SENCE",
      resumen: "Descontar del impuesto parte de la capacitación de tus trabajadores (tope de 0,7% de la planilla).",
      estado: "por_confirmar",
      por_que: `La empresa informa ${e.trabajadores} ${e.trabajadores === 1 ? "trabajador" : "trabajadores"} al SII.`,
      beneficio: "Permite descontar del impuesto a la renta parte del costo de capacitaciones autorizadas por SENCE. La Ley 21.850 redujo el tope a 0,7% de la planilla anual y estableció copagos según la renta del trabajador: cobertura de 80% hasta 25 UTM, 50% entre 25 y 50 UTM y 15% sobre 50 UTM.",
      confirmar: ["Planilla de remuneraciones imponibles mayor a 35 UTM mensuales", "Cotizaciones previsionales pagadas", "Fecha desde la que rigen el nuevo tope y los copagos"],
      fuente: { titulo: "ChileAtiende · Franquicia tributaria SENCE", url: "https://www.chileatiende.gob.cl/fichas/44808-franquicia-tributaria" },
      verificado: "2026-11-09",
      accion: { modulo: "crece", asunto: "Evaluar la franquicia SENCE para capacitar a los trabajadores", servicio: "CRC-01" },
    });
  }

  // 6. Sin régimen declarado: no se puede evaluar lo tributario.
  if (!e.regimen || e.regimen === "por_definir") {
    out.unshift({
      id: "confirmar_regimen",
      titulo: "Confirmar el régimen tributario de la empresa",
      resumen: "Tu régimen tributario define tu tasa de impuesto, tu contabilidad y tus beneficios.",
      estado: "probable",
      por_que: "La empresa no ha declarado su régimen tributario en ENQORA.",
      beneficio: "Es el punto de partida para evaluar las oportunidades tributarias: según el régimen cambian la tasa del impuesto, la contabilidad exigida y los beneficios disponibles.",
      confirmar: ["Régimen vigente según el SII (Carpeta Tributaria o certificado de situación tributaria)"],
      fuente: { titulo: "SII · Regímenes tributarios", url: "https://www.sii.cl/preguntas_frecuentes/declaracion_renta/001_140_7530.htm" },
      verificado: "2026-11-09",
      accion: { modulo: "contabilidad", asunto: "Confirmar el régimen tributario de mi empresa", servicio: "CON-07" },
    });
  }
  return out;
}
