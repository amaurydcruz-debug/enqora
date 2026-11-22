// Oportunidades para el cliente (Inicio): beneficios tributarios, legales, de empleo, de ahorro, «empresa al día» y
// marcas. Contenido informativo con fuente oficial y fecha; las ventanas con plazo se ocultan solas al vencer.
// ENQORA informa lo que dice la ley y ofrece revisarlo con el equipo: no recomienda inversiones ni decide por el
// cliente (Ley 19.496: publicidad veraz; nada de promesas de ahorro garantizado).
// Base: informe «Oportunidades legales para clientes» del 22-11-2026.

export const OPORTUNIDADES_AL = "2026-11-22";

export type CategoriaOp = "tributarios" | "legales" | "empleo" | "ahorro" | "al_dia" | "marcas";
export const CATEGORIAS_OP: Record<CategoriaOp, { titulo: string; gancho: string }> = {
  tributarios: { titulo: "Beneficios tributarios", gancho: "Paga solo lo justo" },
  legales: { titulo: "Beneficios legales", gancho: "Deudas y plazos a tu favor" },
  empleo: { titulo: "Contratar y capacitar", gancho: "El Estado aporta" },
  ahorro: { titulo: "Ahorro e inversión", gancho: "Para ti como dueño" },
  al_dia: { titulo: "Empresa al día", gancho: "¿Cumples todo?" },
  marcas: { titulo: "Protege tu marca", gancho: "Que nadie la registre antes" },
};

export type Oportunidad = {
  id: string; categoria: CategoriaOp; titulo: string; resumen: string; puntos: string[];
  fuente: { texto: string; url: string }; vence?: string; cta: { texto: string; href: string };
};

export type ContextoOp = {
  regimen: string | null;       // companies.tax_regime
  tipo: "persona" | "empresa" | null;
  trabajadores: number;         // del diagnóstico o de Remuneraciones
  diagnostico: number | null;   // puntaje de «Empresa al día», si existe
  hoy: string;                  // AAAA-MM-DD
};

const pedir = (modulo: string, asunto: string) => `/casos/nuevo?modulo=${modulo}&asunto=${encodeURIComponent(asunto)}`;
const fecha = (iso: string) => iso.split("-").reverse().join("-");

type Regla = Oportunidad & { aplica: (c: ContextoOp) => boolean };

const REGLAS: Regla[] = [
  {
    id: "propyme", categoria: "tributarios", titulo: "Régimen Pro Pyme: 12,5% en vez de 27%",
    resumen: "Las pymes del régimen Pro Pyme General pagan 12,5% de impuesto de primera categoría en 2026 y 2027 (15% en 2028).",
    puntos: ["El régimen general paga 27% en 2026.", "Además: depreciación instantánea del activo fijo y sin corrección monetaria.", "Cambiar de régimen tiene requisitos y plazos del SII: lo revisamos contigo antes."],
    fuente: { texto: "SII, Circular 53 de 2025", url: "https://www.sii.cl/normativa_legislacion/circulares/2025/circu53.pdf" },
    cta: { texto: "Revisar mi régimen", href: pedir("contabilidad", "Revisar si me conviene el régimen Pro Pyme") },
    aplica: (c) => c.tipo !== "persona" && c.regimen !== "pro_pyme_general" && c.regimen !== "pro_pyme_transparente",
  },
  {
    id: "ppm", categoria: "tributarios", titulo: "PPM Pro Pyme más bajo: 0,23%",
    resumen: "Desde el 1 de noviembre de 2026 el pago provisional mensual de las pymes Pro Pyme baja de 0,25% a 0,23% (Ley 21.850).",
    puntos: ["Es más caja disponible cada mes.", "Tu contador debe aplicarlo en el F29."],
    fuente: { texto: "Ley 21.850", url: "https://www.bcn.cl/leychile/navegar?idLey=21850" },
    cta: { texto: "Confirmar con mi contador", href: pedir("contabilidad", "Aplicar PPM Pro Pyme de 0,23%") },
    aplica: (c) => c.regimen === "pro_pyme_general",
  },
  {
    id: "iva-postergar", categoria: "tributarios", titulo: "Paga el IVA hasta 2 meses después",
    resumen: "Si tus ingresos promedio no superan 100.000 UF y declaras el F29 a tiempo, puedes postergar el pago del IVA del mes hasta dos meses, sin intereses ni multas.",
    puntos: ["Debes estar inscrito para notificaciones por correo en el SII.", "No debes tener morosidad reiterada.", "Se elige al declarar el F29 en plazo."],
    fuente: { texto: "SII, postergación del IVA", url: "https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_6627.htm" },
    cta: { texto: "¿Califico?", href: pedir("contabilidad", "Postergar el pago del IVA") },
    aplica: (c) => c.tipo !== "persona",
  },
  {
    id: "id", categoria: "tributarios", titulo: "Crédito por investigación y desarrollo",
    resumen: "Si tu empresa desarrolla algo nuevo con un proyecto certificado por CORFO, el 35% de lo invertido se descuenta del impuesto (Ley 20.241, vigente hasta 2035).",
    puntos: ["El 65% restante se rebaja como gasto.", "Requiere certificación de CORFO del proyecto."],
    fuente: { texto: "Ley 20.241", url: "https://www.bcn.cl/leychile/navegar?idLey=20241" },
    cta: { texto: "Evaluar mi proyecto", href: pedir("crece", "Crédito tributario I+D (Ley 20.241)") },
    aplica: (c) => c.tipo !== "persona",
  },
  {
    id: "tgr", categoria: "legales", titulo: "Deudas con Tesorería: hasta 100% de intereses perdonados",
    resumen: "Mipymes y personas con deudas tributarias vencidas al 31-12-2025: al contado se condona el 100% de los intereses y el 80% de las multas; en hasta 24 cuotas con pie de 10%, el 95% y el 75%.",
    puntos: ["Plazo de 180 días desde el 17-10-2026 (Ley 21.850).", "Si se deja de pagar una cuota, el beneficio se pierde."],
    fuente: { texto: "Ley 21.850 y TGR", url: "https://www.tgr.cl" }, vence: "2027-04-15",
    cta: { texto: "Revisar mis deudas", href: pedir("legal", "Condonación de deudas con Tesorería (Ley 21.850)") },
    aplica: () => true,
  },
  {
    id: "municipal", categoria: "legales", titulo: "Deudas municipales: intereses y multas perdonados",
    resumen: "Patentes, permisos y derechos de aseo de los 3 años previos al 1-1-2026: condonación total de intereses y multas, pidiéndola dentro de 12 meses desde el 1-12-2026.",
    puntos: ["Se solicita en la municipalidad respectiva.", "Aplica a deudas municipales, no a las del SII."],
    fuente: { texto: "Ley 21.850", url: "https://www.bcn.cl/leychile/navegar?idLey=21850" }, vence: "2027-11-30",
    cta: { texto: "Revisar mi patente", href: pedir("formaliza", "Condonación de deudas municipales (Ley 21.850)") },
    aplica: (c) => c.tipo !== "persona",
  },
  {
    id: "reorganizacion", categoria: "legales", titulo: "Reorganizar deudas sin quebrar",
    resumen: "Las micro y pequeñas empresas pueden acordar con sus acreedores nuevos plazos y rebajas mediante un procedimiento simplificado, más barato y rápido (Ley 21.563).",
    puntos: ["Pensado para empresas viables con problemas de caja.", "Si no hay viabilidad, existe la liquidación simplificada."],
    fuente: { texto: "ChileAtiende, reorganización simplificada", url: "https://chileatiende.gob.cl/fichas/118460-reorganizacion-simplificada-de-las-deudas-de-una-micro-o-pequena-empresa" },
    cta: { texto: "Conversar mi caso", href: pedir("legal", "Reorganización simplificada de deudas (Ley 21.563)") },
    aplica: (c) => c.tipo !== "persona",
  },
  {
    id: "sue", categoria: "empleo", titulo: "Contrata y el Estado paga hasta el 20% del sueldo",
    resumen: "El Subsidio Unificado al Empleo (Ley 21.808) aporta al empleador hasta el 20% del sueldo, por 12 meses (15 con discapacidad), al contratar jóvenes de 18 a 24, mujeres de 25 a 54, personas de 55 a 64 o personas con discapacidad que cumplan los requisitos.",
    puntos: ["Hay que postular dentro de los 3 primeros meses del contrato.", "Sueldo bruto de hasta 2,25 ingresos mínimos.", "Requiere cotizaciones al día."],
    fuente: { texto: "Ministerio del Trabajo, SUE", url: "https://www.mintrab.gob.cl/subsidio-unificado-al-empleo/" },
    cta: { texto: "Postular mi contratación", href: pedir("gestion", "Subsidio Unificado al Empleo para un trabajador nuevo") },
    aplica: (c) => c.tipo !== "persona",
  },
  {
    id: "sence", categoria: "empleo", titulo: "Capacita a tu equipo con cargo al impuesto",
    resumen: "La franquicia SENCE permite descontar del impuesto la capacitación, hasta el 0,7% de la planilla anual (Ley 21.850), con copago según el sueldo de cada trabajador.",
    puntos: ["Planilla anual de remuneraciones sobre 35 UTM.", "Cursos autorizados por SENCE."],
    fuente: { texto: "SENCE, Franquicia Tributaria", url: "https://www.chileatiende.gob.cl/fichas/7849" },
    cta: { texto: "Planificar capacitación", href: pedir("gestion", "Franquicia tributaria SENCE") },
    aplica: (c) => c.trabajadores > 0,
  },
  {
    id: "apv", categoria: "ahorro", titulo: "APV: ahorra para tu pensión pagando menos impuesto",
    resumen: "Con el Ahorro Previsional Voluntario (art. 42 bis) eliges entre una bonificación del Estado del 15% (régimen A, tope 6 UTM al año) o rebajar tu base de impuesto (régimen B, hasta 50 UF al mes por planilla o 600 UF al año).",
    puntos: ["Cuál conviene depende de tu tasa de impuesto: lo revisa contigo una persona del equipo.", "El APV del año se hace antes del 31 de diciembre.", "Retirarlo antes de pensionarte tiene costo tributario."],
    fuente: { texto: "SII, art. 42 bis", url: "https://www.sii.cl/servicios_online/renta/2026/archivos/l23_instruccion.pdf" },
    cta: { texto: "Que me lo expliquen", href: pedir("contabilidad", "Conocer el APV (art. 42 bis) para el dueño") },
    aplica: () => true,
  },
  {
    id: "hipotecario", categoria: "ahorro", titulo: "Intereses del dividendo: devolución en la renta",
    resumen: "Si pagas un crédito hipotecario de vivienda, los intereses se rebajan de tu renta anual, con tope de 8 UTA (art. 55 bis), completo si ganas menos de 90 UTA y en forma decreciente hasta 150 UTA.",
    puntos: ["Se declara en la Operación Renta (línea 21 del F22).", "El banco entrega el certificado de intereses."],
    fuente: { texto: "SII, art. 55 bis", url: "https://www.sii.cl/servicios_online/renta/2026/archivos/l21_instruccion.pdf" },
    cta: { texto: "Revisar mi Operación Renta", href: pedir("contabilidad", "Rebaja de intereses hipotecarios (art. 55 bis)") },
    aplica: () => true,
  },
  {
    id: "sustitutivo", categoria: "ahorro", titulo: "Utilidades acumuladas con impuesto único de 10%",
    resumen: "Hasta el 17-6-2027, los dueños con utilidades acumuladas (FUR, STUT o retiros en exceso) pueden pagar un impuesto único sustitutivo de 10% (Ley 21.850).",
    puntos: ["Conviene compararlo con lo que pagarías al retirarlas normalmente.", "Tu contador revisa los registros de la empresa."],
    fuente: { texto: "Ley 21.850", url: "https://www.bcn.cl/leychile/navegar?idLey=21850" }, vence: "2027-06-17",
    cta: { texto: "Calcular mi caso", href: pedir("contabilidad", "Impuesto sustitutivo de utilidades acumuladas (Ley 21.850)") },
    aplica: (c) => c.tipo !== "persona",
  },
  {
    id: "donaciones", categoria: "ahorro", titulo: "Donaciones a tu familia con 50% menos de impuesto",
    resumen: "Las donaciones a herederos o cónyuge escrituradas dentro de un año desde el 1-12-2026 pagan la mitad del impuesto, una vez por donante (Ley 21.850).",
    puntos: ["Útil para ordenar la sucesión de la empresa o de bienes.", "Requiere escritura pública."],
    fuente: { texto: "Ley 21.850", url: "https://www.bcn.cl/leychile/navegar?idLey=21850" }, vence: "2027-11-30",
    cta: { texto: "Conversarlo", href: pedir("legal", "Rebaja del impuesto a las donaciones (Ley 21.850)") },
    aplica: () => true,
  },
];

// Filtra por perfil y por fecha (lo vencido no se muestra).
export function oportunidadesPara(c: ContextoOp): Oportunidad[] {
  return REGLAS.filter((r) => (!r.vence || r.vence >= c.hoy) && r.aplica(c))
    .map(({ aplica: _a, ...o }) => ({ ...o, resumen: o.vence ? `${o.resumen} Plazo: hasta el ${fecha(o.vence)}.` : o.resumen }));
}

// Tarjetas fijas que no dependen de una ley: diagnóstico y marca.
export function extrasPara(c: ContextoOp): Oportunidad[] {
  return [
    {
      id: "al-dia", categoria: "al_dia",
      titulo: c.diagnostico == null ? "¿Tu empresa está 100% al día?" : `Tu empresa está ${c.diagnostico}% al día`,
      resumen: "En 5 minutos revisas cómo está tu empresa ante el SII, la municipalidad, la Dirección del Trabajo, la previsión, la mutual y tus clientes, y qué resolver primero.",
      puntos: ["Semáforo por frente y lista de pendientes.", "Calendario con tus próximos vencimientos."],
      fuente: { texto: "Diagnóstico ENQORA", url: "/empresa-al-dia" },
      cta: { texto: c.diagnostico == null ? "Hacer el diagnóstico" : "Ver pendientes", href: "/empresa-al-dia" },
    },
    {
      id: "marca", categoria: "marcas", titulo: "¿Tu marca está registrada en INAPI?",
      resumen: "En Chile el derecho exclusivo sobre una marca nace de su registro en INAPI: usarla no basta. Si no está registrada, otra persona podría inscribirla antes.",
      puntos: ["Puedes buscar marcas parecidas en el buscador oficial de INAPI.", "ENQORA revisa los antecedentes y presenta la solicitud por ti."],
      fuente: { texto: "Buscador de marcas de INAPI", url: "https://www.inapi.cl" },
      cta: { texto: "Registrar mi marca", href: pedir("brand", "Registrar mi marca en INAPI") },
    },
  ];
}
