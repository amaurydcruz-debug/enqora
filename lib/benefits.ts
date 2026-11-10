// Beneficios y ayudas estatales que podrían aplicar (M16). Verificados el 27-10-2026 en fuentes
// oficiales o en la ficha de ChileAtiende. Las convocatorias, montos y plazos cambian cada año:
// ENQORA nunca promete un beneficio; revisa las bases vigentes, comprueba requisitos y acompaña la
// postulación. El agente de vigilancia normativa propone actualizaciones al equipo.

export type Profile = "idea" | "pyme" | "enterprise";
export type Benefit = {
  id: string;
  nombre: string;
  institucion: string;     // clave de lib/institutions.ts
  para: string;            // a quién está dirigido
  entrega: string;         // qué entrega
  requisitos: string[];
  perfiles: Profile[];
  rubros?: string[];       // claves de onboarding.actividad; vacío = todos
  url: string;
  verificado: string;
  nota?: string;
};

export const BENEFITS: Benefit[] = [
  {
    id: "capital_semilla_emprende",
    nombre: "Capital Semilla Emprende",
    institucion: "sercotec",
    para: "Personas naturales con una idea de negocio que aún no inician actividades en primera categoría.",
    entrega: "Subsidio para el proyecto (en la convocatoria 2026, hasta $3.500.000 entre gestión e inversión).",
    requisitos: ["Persona natural mayor de 18 años", "Sin inicio de actividades en primera categoría", "Idea alineada con el foco regional de la convocatoria"],
    perfiles: ["idea"],
    url: "https://www.sercotec.cl",
    verificado: "2026-10-27",
    nota: "Existen variantes para mujeres (Capital Abeja Emprende) y rubros específicos. Convocatorias anuales por región.",
  },
  {
    id: "sercotec_crece",
    nombre: "Fondos Crece de Sercotec",
    institucion: "sercotec",
    para: "Micro y pequeñas empresas con inicio de actividades que quieren crecer.",
    entrega: "Subsidio no reembolsable para planes de trabajo de crecimiento, según bases regionales.",
    requisitos: ["Empresa con inicio de actividades", "Ventas dentro de los rangos de la convocatoria", "Bases regionales vigentes"],
    perfiles: ["pyme"],
    url: "https://www.sercotec.cl",
    verificado: "2026-10-27",
    nota: "Hay versión para empresas lideradas por mujeres (Crece Abeja).",
  },
  {
    id: "corfo_semilla_inicia",
    nombre: "Semilla Inicia (CORFO)",
    institucion: "corfo",
    para: "Emprendimientos innovadores y escalables, de personas o empresas sin ventas.",
    entrega: "Cofinanciamiento de hasta 75% del proyecto con tope de $15.000.000 (hasta $17.000.000 y 85% para emprendimientos liderados por mujeres).",
    requisitos: ["Prototipo o idea de rápida implementación", "Sin ventas a la apertura de la convocatoria", "No elegibles: reventa, solo importación o consultoría"],
    perfiles: ["idea"],
    rubros: ["tecnologia", "produccion", "servicios"],
    url: "https://www.chileatiende.gob.cl/fichas/67002",
    verificado: "2026-10-27",
  },
  {
    id: "fosis_emprendamos",
    nombre: "Programa Emprendamos (FOSIS)",
    institucion: "fosis",
    para: "Personas con un negocio en funcionamiento en los tramos de menores ingresos del Registro Social de Hogares.",
    entrega: "Capacitación, asesoría personalizada y financiamiento para el negocio.",
    requisitos: ["Mayor de 18 años", "Tramos de mayor vulnerabilidad del RSH", "Negocio funcionando con inicio de actividades", "Comuna donde opera el programa"],
    perfiles: ["pyme"],
    url: "https://www.chileatiende.gob.cl/fichas/9343-programa-emprendamos",
    verificado: "2026-10-27",
  },
  {
    id: "sence_franquicia",
    nombre: "Franquicia tributaria de capacitación (SENCE)",
    institucion: "sence",
    para: "Empresas de primera categoría con trabajadores.",
    entrega: "Descontar del impuesto a la renta parte del costo de capacitaciones autorizadas por SENCE. La Ley 21.850 (publicada el 17-10-2026) redujo el tope de 1% a 0,7% de la planilla anual y fijó copagos según la renta del trabajador (cobertura de 80% hasta 25 UTM, 50% entre 25 y 50 UTM y 15% sobre 50 UTM).",
    requisitos: ["Contribuyente de primera categoría", "Planilla de remuneraciones imponibles mayor a 35 UTM mensuales", "Cotizaciones previsionales pagadas"],
    perfiles: ["pyme", "enterprise"],
    url: "https://www.chileatiende.gob.cl/fichas/44808-franquicia-tributaria",
    verificado: "2026-11-09",
    nota: "Ley 21.850: confirmar en SENCE la fecha desde la que rigen el nuevo tope y los copagos antes de planificar la capacitación.",
  },
  {
    id: "pro_pyme_tasa",
    nombre: "Tasa reducida Pro Pyme 12,5% (Ley 21.755)",
    institucion: "sii",
    para: "Empresas del régimen Pro Pyme general (art. 14 D N°3 LIR).",
    entrega: "Impuesto de Primera Categoría de 12,5% en 2025, 2026 y 2027 (15% en 2028) y PPM a la mitad. Desde 2029 la tasa permanente baja a 23% (Ley 21.850).",
    requisitos: ["Régimen Pro Pyme general", "Cumplir al cierre del ejercicio la cotización del art. 4° transitorio de la Ley 21.735"],
    perfiles: ["pyme", "enterprise"],
    url: "https://www.sii.cl/normativa_legislacion/circulares/2025/circu53.pdf",
    verificado: "2026-10-27",
  },
  {
    id: "iva_camionetas",
    nombre: "IVA de camionetas, jeeps y furgones como crédito fiscal",
    institucion: "sii",
    para: "Empresas con ventas afectas a IVA que compran un vehículo para su negocio.",
    entrega: "El IVA pagado al comprar una camioneta, jeep o furgón que se usa directamente en el giro puede descontarse como crédito fiscal del IVA de las ventas, sin autorización previa del SII. Los automóviles y station wagons, en cambio, no dan este derecho.",
    requisitos: ["Ventas afectas a IVA", "Vehículo del tipo camioneta, jeep, furgón, minibús (u otros de la lista del SII)", "Uso directamente relacionado con el giro (art. 23 N°1 DL 825)", "Compra con factura a nombre de la empresa"],
    perfiles: ["pyme", "enterprise"],
    url: "https://www.sii.cl/normativa_legislacion/circulares/2018/circu5.pdf",
    verificado: "2026-11-06",
    nota: "SII, Circular N°5 de 2018, capítulo VI.A.2.2. El uso en el giro debe poder acreditarse; un profesional revisa cada caso.",
  },
  {
    id: "postergacion_iva",
    nombre: "Postergar el pago del IVA hasta dos meses",
    institucion: "sii",
    para: "Empresas con ingresos promedio de hasta 100.000 UF en los últimos tres años.",
    entrega: "Permite pagar el IVA de un mes hasta dos meses después del plazo normal, lo que da aire a la caja. La declaración mensual se sigue presentando a tiempo.",
    requisitos: ["Ingresos promedio anuales de hasta 100.000 UF en los últimos 3 años", "Notificaciones del SII por correo electrónico", "Sin morosidad reiterada en IVA o Renta (o con convenio vigente)", "F29 de los últimos 36 meses y Renta de los últimos 3 años presentados en tiempo y forma"],
    perfiles: ["pyme"],
    url: "https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_6628.htm",
    verificado: "2026-11-06",
    nota: "Art. 64 inciso tercero del DL 825. Se solicita dentro de los plazos legales del F29.",
  },
  {
    id: "chilecompra",
    nombre: "Vender al Estado (Mercado Público)",
    institucion: "chilecompra",
    para: "Empresas con inicio de actividades que quieren participar en compras públicas.",
    entrega: "ChileCompra entrega directamente la inscripción gratuita en Mercado Público, el buscador de licitaciones y Compra Ágil, y la acreditación pagada en el Registro de Proveedores. ENQORA aporta la inteligencia: qué organismos compran lo que vendes y cómo competir.",
    requisitos: ["Inicio de actividades en el SII", "Inscripción gratuita en Mercado Público", "Acreditación en el Registro de Proveedores cuando la licitación la exige (servicio pagado de ChileCompra, por 6 o 12 meses)"],
    perfiles: ["pyme", "enterprise"],
    url: "https://www.chileatiende.gob.cl/fichas/538",
    verificado: "2026-10-27",
    nota: "No es un subsidio: es una oportunidad comercial. ENQORA no cobra por la inscripción, que es gratuita en ChileCompra.",
  },
];

export const benefitsFor = (profile: Profile, rubro?: string) =>
  BENEFITS.filter((b) => b.perfiles.includes(profile) && (!rubro || !b.rubros || b.rubros.includes(rubro)));
