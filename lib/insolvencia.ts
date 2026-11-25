// Insolvencia (Ley 20.720, modificada por la Ley 21.563): detección de señales en el relato de un caso y
// orientación de rutas posibles PARA EL ABOGADO. Nada de esto llega al cliente sin que un abogado del equipo lo
// evalúe y lo apruebe. Requisitos verificados en superir.gob.cl y bcn.cl (2026-11-25). Funciones puras, sin red.

// Señales en el relato (caso o solicitud). Cada una con su etiqueta legible.
const SENALES: [RegExp, string][] = [
  [/\bno (?:puedo|podemos|alcanzo|alcanzamos|tengo como|tenemos como|me alcanza|nos alcanza) (?:a )?pagar\b/i, "Dice que no puede pagar"],
  [/\bno (?:tengo|tenemos|hay) (?:plata|dinero|fondos|liquidez|caja)\b/i, "Sin dinero o liquidez"],
  [/\bdeudas? (?:vencidas?|impagas?|atrasadas?|acumuladas?|morosas?)\b|\bmoros[oa]s?\b|\bmorosidad\b/i, "Deudas vencidas o morosidad"],
  [/\bsobreendeudad[oa]s?\b|\bsobre ?endeudamiento\b/i, "Sobreendeudamiento"],
  [/\bembarg(?:o|ar|aron|ado|ada)\b/i, "Embargo"],
  [/\bdemanda (?:ejecutiva|de cobro|de liquidaci[oó]n)\b|\bcobranza judicial\b|\bjuicio ejecutivo\b/i, "Cobranza judicial"],
  [/\bprotest(?:o|ado|ada)s?\b|\bdicom\b|\bbolet[ií]n comercial\b/i, "Protestos o registro de morosos"],
  [/\bquiebra\b|\binsolvencia\b|\bliquidaci[oó]n (?:voluntaria|forzosa|de la empresa)\b|\breorganizaci[oó]n judicial\b/i, "Menciona quiebra o insolvencia"],
  [/\bcerrar (?:la|mi|nuestra) empresa\b|\bcierre de la empresa\b/i, "Quiere cerrar la empresa"],
  [/\bcotizaciones (?:impagas|adeudadas|atrasadas|sin pagar)\b|\bno (?:he|hemos) pagado (?:las )?cotizaciones\b/i, "Cotizaciones impagas"],
  [/\btesorer[ií]a (?:me|nos) (?:cobra|est[aá] cobrando|embarg)|\bdeuda (?:con|en) (?:la )?tesorer[ií]a\b/i, "Deuda con Tesorería"],
];

export function senalesInsolvencia(texto: string | null | undefined): string[] {
  const t = (texto ?? "").slice(0, 20_000);
  return SENALES.filter(([re]) => re.test(t)).map(([, etiqueta]) => etiqueta);
}

// Hace falta más de una señal, o una inequívoca, para avisar al abogado (evita ruido).
export function ameritaRevision(senales: string[]): boolean {
  return senales.length >= 2 || senales.includes("Menciona quiebra o insolvencia") || senales.includes("Embargo") || senales.includes("Cobranza judicial");
}

// Tamaño según la Superir (reorganización simplificada): micro ≤ 2.400 UF y 1-9 trabajadores; pequeña > 2.400 y
// ≤ 25.000 UF y 10-49 trabajadores. Si ingresos y trabajadores apuntan a tamaños distintos, queda por verificar.
export type Tamano = "micro" | "pequena" | "mayor" | "por_verificar";
export function tamanoMipe(ingresosUF12m: number | null, trabajadores: number | null): Tamano {
  if (ingresosUF12m === null || !Number.isFinite(ingresosUF12m)) return "por_verificar";
  const porIngreso: Tamano = ingresosUF12m <= 2400 ? "micro" : ingresosUF12m <= 25_000 ? "pequena" : "mayor";
  if (trabajadores === null || !Number.isFinite(trabajadores)) return porIngreso === "mayor" ? "mayor" : "por_verificar";
  const porTrab: Tamano = trabajadores <= 9 ? "micro" : trabajadores <= 49 ? "pequena" : "mayor";
  return porIngreso === porTrab ? porIngreso : "por_verificar";
}

export type Deuda = { acreedor: string; montoUF: number; diasVencida: number };
export type EntradaRutas = {
  tipo: "empresa" | "persona";   // empresa deudora (persona jurídica, 1ª categoría o honorarios) o persona deudora
  ingresosUF12m?: number | null; trabajadores?: number | null;
  sigueOperando?: boolean | null; // ¿el negocio es viable si reprograma sus deudas?
  deudas?: Deuda[];
  notificadaDemandaLiquidacionOEjecutiva?: boolean | null;
};
export type Ruta = { ruta: string; estado: "probable" | "por_verificar" | "no_aplica"; motivos: string[]; fuente: string };

const F_REORG = "Ley 20.720 (Ley 21.563) · superir.gob.cl/reorganizacion-simplificada";
const F_LIQ = "Ley 20.720 (Ley 21.563), art. 273 y ss. · superir.gob.cl/liquidacion-simplificada";
const F_RENEG = "Ley 20.720, Procedimiento Concursal de Renegociación de la Persona Deudora · superir.gob.cl";

// Orientación para el abogado: qué rutas revisar primero y qué falta verificar. No es una decisión.
export function rutasInsolvencia(e: EntradaRutas): Ruta[] {
  const out: Ruta[] = [];
  const deudas = e.deudas ?? [];
  if (e.tipo === "empresa") {
    const t = tamanoMipe(e.ingresosUF12m ?? null, e.trabajadores ?? null);
    const mipe = t === "micro" || t === "pequena";
    const tam = t === "micro" ? "microempresa" : t === "pequena" ? "pequeña empresa" : t === "mayor" ? "empresa mediana o grande" : "tamaño por verificar";
    out.push({
      ruta: "Reorganización simplificada", fuente: F_REORG,
      estado: !mipe ? (t === "mayor" ? "no_aplica" : "por_verificar") : e.sigueOperando === false ? "no_aplica" : e.sigueOperando ? "probable" : "por_verificar",
      motivos: [
        `Califica como ${tam} según ingresos de 12 meses y trabajadores.`,
        e.sigueOperando === false ? "El negocio no es viable: la reorganización supone seguir operando." : e.sigueOperando ? "El negocio sigue operando y podría pagar con nuevos plazos." : "Falta evaluar si el negocio es viable con nuevos plazos.",
        "Requiere patrocinio de abogado; da 40 días de protección financiera concursal, prorrogables dos veces por 30 días.",
      ],
    });
    out.push({
      ruta: "Liquidación voluntaria simplificada", fuente: F_LIQ,
      estado: !mipe ? (t === "mayor" ? "no_aplica" : "por_verificar") : e.sigueOperando === false ? "probable" : "por_verificar",
      motivos: [
        `Califica como ${tam}.`,
        "Cierre ordenado: los bienes se entregan para pagar a los acreedores. Revisar bienes, garantías personales de los socios y efectos para los trabajadores.",
        "Mala fe (ocultar bienes o dar antecedentes falsos) impide la extinción de las deudas.",
      ],
    });
    if (t === "mayor") out.push({ ruta: "Reorganización o liquidación ordinaria", fuente: "Ley 20.720, Capítulos III y IV", estado: "por_verificar", motivos: ["No califica como micro o pequeña empresa: corresponden los procedimientos ordinarios."] });
  } else {
    const vencidas = deudas.filter((d) => d.diasVencida > 90);
    const acreedores = new Set(vencidas.map((d) => d.acreedor.trim().toLowerCase()));
    const total = vencidas.reduce((s, d) => s + d.montoUF, 0);
    const cumple = vencidas.length >= 2 && acreedores.size >= 2 && total > 80;
    out.push({
      ruta: "Renegociación de la persona deudora (Superir)", fuente: F_RENEG,
      estado: !cumple ? (deudas.length ? "no_aplica" : "por_verificar") : e.notificadaDemandaLiquidacionOEjecutiva ? "no_aplica" : e.notificadaDemandaLiquidacionOEjecutiva === false ? "probable" : "por_verificar",
      motivos: [
        `${vencidas.length} obligación(es) vencidas por más de 90 días con ${acreedores.size} acreedor(es) distinto(s), por ${total.toFixed(1)} UF (se exigen dos o más, de obligaciones diversas, por más de 80 UF).`,
        e.notificadaDemandaLiquidacionOEjecutiva ? "Ya fue notificada de una demanda de liquidación o ejecutiva: revisar si aún procede." : "Verificar que no haya sido notificada de una demanda de liquidación o de cobro ejecutivo.",
        "Es un procedimiento administrativo y gratuito ante la Superir: ENQORA no cobra por lo que el Estado entrega sin costo.",
      ],
    });
    out.push({
      ruta: "Liquidación voluntaria simplificada (persona)", fuente: F_LIQ,
      estado: "por_verificar",
      motivos: ["Para quien no tiene ingresos suficientes o está en insolvencia profunda; se entregan los bienes no excluidos por ley.", "El trámite lo hace la propia persona con su ClaveÚnica: ENQORA nunca la pide."],
    });
  }
  return out;
}
