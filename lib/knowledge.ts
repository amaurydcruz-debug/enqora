import type { AgentKey } from "@/lib/mirror";

// Base normativa de los agentes ENQORA (M15).
// Cada dato fue verificado en fuentes oficiales chilenas el 27-10-2026 (SII, BCN, ChileAtiende,
// Dirección del Trabajo). Las cifras que cambian (UF, UTM, tasa de interés del art. 53, sueldo
// mínimo) NO se escriben aquí: el agente debe pedirlas o verificarlas en la fuente oficial.
// Al cambiar una norma: actualizar este archivo, KNOWLEDGE_VERSION y docs/ENQORA-AGENTES.md.

export const KNOWLEDGE_VERSION = "2026-10-27";

export type Source = { titulo: string; articulo?: string; vigencia?: string; url?: string };
export type Rule = { tema: string; regla: string; fuente: Source };
export type Playbook = {
  id: string;
  caso: string;          // situación real típica
  senales: string[];      // cómo se reconoce en los antecedentes
  pasos: string[];        // ruta de trabajo
  normas: string[];       // claves de RULES que aplican
  preguntar: string[];    // datos que hay que pedir al cliente si faltan
  riesgo: "bajo" | "medio" | "alto";
};

const CT: Source = { titulo: "Código Tributario (DL 830)", url: "https://www.sii.cl/normativa_legislacion/codigo_tributario.pdf" };

// ---------------------------------------------------------------------
// Reglas verificadas (fuente oficial + artículo)
// ---------------------------------------------------------------------

export const RULES: Record<string, Rule> = {
  multa_97_2: {
    tema: "Multa por declaración fuera de plazo con impuesto a pagar",
    regla: "Art. 97 N°2 CT: multa de 10% del impuesto si el atraso no supera 5 meses; desde el sexto mes aumenta 2% por cada mes o fracción, con tope de 30%. Si la declaración no tiene impuesto a pagar (sin movimiento, calzada o con devolución), la multa va de 1 UTM a 1 UTA.",
    fuente: { titulo: "SII · Preguntas frecuentes: multas e intereses por atraso", articulo: "Art. 97 N°2 CT", vigencia: "Vigente", url: "https://www.sii.cl/preguntas_frecuentes/renta/001_002_3095.htm" },
  },
  interes_53: {
    tema: "Interés por mora (desde el 1-1-2025)",
    regla: "Art. 53 CT modificado por la Ley 21.713: el interés penal es diario y variable. Tasa anual = tasa de interés corriente CMF (operaciones a un año o más, reajustables, hasta 2.000 UF) + 3,5 puntos, dividida por 360, aplicada por cada día de atraso sobre la deuda reajustada por IPC. El SII la fija en junio y diciembre para el semestre siguiente y rige la tasa vigente a la fecha de pago. YA NO es 1,5% mensual: nunca uses esa tasa para deudas pagadas desde 2025.",
    fuente: { titulo: "SII · Circular N° 1 de 2025 (interés moratorio)", articulo: "Arts. 3, 53 y 55 CT; art. 1° transitorio N°2 Ley 21.713", vigencia: "Desde 01-01-2025", url: "https://www.sii.cl/normativa_legislacion/circulares/2025/circu1.pdf" },
  },
  ley_21713: {
    tema: "Ley de Cumplimiento Tributario",
    regla: "Ley 21.713 (D.O. 24-10-2024): fortalece la fiscalización; bancos informan al SII cuentas con más de 50 abonos de distintas personas en un mes (o más de 100 en un semestre); fiscalización por grupos empresariales; precisa la norma general antielusiva; notificaciones preferentemente por correo electrónico; desde el 25-10-2025 las importaciones de cualquier valor pagan IVA.",
    fuente: { titulo: "Ley 21.713 sobre cumplimiento de las obligaciones tributarias", vigencia: "Publicada 24-10-2024", url: "https://www.bcn.cl/leychile/navegar?idNorma=1207746" },
  },
  inicio_actividades: {
    tema: "Inicio de actividades",
    regla: "Art. 68 CT: quien inicie negocios o labores susceptibles de producir rentas debe presentar declaración de inicio de actividades ante el SII dentro de los dos meses siguientes a aquel en que comience. Vender sin iniciar actividades expone a fiscalización y sanciones; con la Ley 21.713 aumenta la visibilidad de ventas informales por transferencias.",
    fuente: { ...CT, articulo: "Art. 68", vigencia: "Vigente" },
  },
  termino_giro: {
    tema: "Término de giro",
    regla: "Art. 69 CT: el aviso de término de giro (Formulario 2121, en línea) se presenta dentro de los dos meses siguientes al término de las actividades. Requiere no tener pendientes con el SII (documentos electrónicos, libros de los últimos tres años). El SII tiene hasta seis meses para resolver.",
    fuente: { titulo: "SII Educa · Término de giro", articulo: "Art. 69 CT; Circular SII N° 66 de 1998", vigencia: "Vigente", url: "https://www.sii.cl/siieduca/aprende-con-nosotros/termino-de-giro-que-es.html" },
  },
  prescripcion_200: {
    tema: "Plazo de revisión del SII",
    regla: "Art. 200 CT: el SII puede revisar, liquidar y girar dentro de 3 años desde la expiración del plazo legal de pago; el plazo es de 6 años si no se presentó la declaración o fue maliciosamente falsa. Verifica el texto vigente antes de afirmar que un período está prescrito.",
    fuente: { ...CT, articulo: "Art. 200", vigencia: "Vigente (verificar suspensiones e interrupciones)" },
  },
  f29_plazos: {
    tema: "Plazo del F29",
    regla: "El F29 (IVA, PPM y retenciones) se declara mensualmente. Plazo general: día 12 del mes siguiente. Hasta el día 20 pueden declarar y pagar en internet los contribuyentes de primera categoría que son facturadores electrónicos y los de segunda categoría que emiten boletas de honorarios electrónicas. Si el día vence en sábado, domingo o festivo, se traslada al hábil siguiente.",
    fuente: { titulo: "SII · ¿Quiénes pueden declarar el F29 hasta el día 20?", vigencia: "Vigente", url: "https://www.sii.cl/preguntas_frecuentes/impuestos_mensuales/001_130_4485.htm" },
  },
  iva_tasa: {
    tema: "Tasa del IVA",
    regla: "Art. 14 DL 825: tasa de 19% sobre la base imponible. Débito fiscal de ventas y servicios menos crédito fiscal de compras con derecho a crédito.",
    fuente: { titulo: "Ley sobre Impuesto a las Ventas y Servicios (DL 825)", articulo: "Art. 14", vigencia: "Vigente" },
  },
  iva_credito_24: {
    tema: "Crédito fiscal de documentos atrasados",
    regla: "Art. 24 DL 825: si las facturas, notas de crédito o de débito se reciben o registran con retraso, el crédito o el ajuste puede hacerse dentro de los dos períodos tributarios siguientes a aquel en que se originó.",
    fuente: { titulo: "SII · Oficio sobre art. 24 DL 825", articulo: "Art. 24 inciso 1° DL 825", vigencia: "Vigente", url: "https://www.sii.cl/pagina/jurisprudencia/adminis/2005/ventas/ja913.htm" },
  },
  iva_servicios: {
    tema: "IVA a los servicios (Ley 21.420)",
    regla: "Desde el 1-1-2023 los servicios en general están afectos a IVA. Quedan exentos, entre otros, los ingresos de sociedades de profesionales (art. 12 letra E N°8 DL 825) que cumplan: sociedad de personas, objeto exclusivo de servicios profesionales, prestados por socios que ejercen todos, profesiones afines y título habilitante (Circular SII N° 21 de 1991).",
    fuente: { titulo: "SII · Circular N° 50 de 2022", articulo: "Art. 2 N°2 y art. 12 E N°8 DL 825", vigencia: "Desde 01-01-2023", url: "https://www.sii.cl/normativa_legislacion/circulares/2022/circu50.pdf" },
  },
  pro_pyme: {
    tema: "Régimen Pro Pyme",
    regla: "Art. 14 letra D LIR. Requisitos de ingreso: capital efectivo inicial inferior a 85.000 UF y promedio de ingresos del giro de los últimos tres ejercicios inferior a 75.000 UF (además de otros requisitos legales). N°3 (Pro Pyme general): tasa de Primera Categoría 12,5% para rentas de 2025, 2026 y 2027 y 15% en 2028, SIEMPRE QUE al cierre de cada ejercicio la empresa cumpla con la cotización del art. 4° transitorio de la Ley 21.735 (1% en 2025, 3,5% en 2026, 4,25% en 2027, 5% en 2028); en esos años los PPM se reducen a la mitad. N°8 (Pro Pyme transparente): exento de Primera Categoría; los dueños tributan directamente.",
    fuente: { titulo: "SII · Circular N° 53 de 2025 (Ley 21.755)", articulo: "Art. 14 D N°3 y N°8 LIR; art. 25 Ley 21.755", vigencia: "Ejercicios 2025-2028", url: "https://www.sii.cl/normativa_legislacion/circulares/2025/circu53.pdf" },
  },
  retencion_honorarios: {
    tema: "Retención de boletas de honorarios",
    regla: "Tasa de retención: 14,5% en 2025; 15,25% en 2026; 16% en 2027; 17% desde 2028 (aumento gradual para cotizaciones de trabajadores independientes).",
    fuente: { titulo: "SII · Noticia 26-12-2025: retención de honorarios 2026", vigencia: "2026: 15,25%", url: "https://www.sii.cl/noticias/2025/261225noti01smn.htm" },
  },
  empresa_un_dia: {
    tema: "Constitución por el Registro de Empresas y Sociedades",
    regla: "Ley 20.659: régimen simplificado y electrónico para constituir, modificar y disolver sociedades (entre ellas SpA, EIRL y limitadas) mediante el Registro de Empresas y Sociedades, con firma electrónica de los constituyentes. Cada socio firma con sus propias credenciales: ENQORA prepara, nunca firma por el cliente ni recibe su ClaveÚnica.",
    fuente: { titulo: "BCN Ley Fácil · Procedimiento simple para crear empresas", articulo: "Ley 20.659", vigencia: "Vigente", url: "https://www.bcn.cl/portal/leyfacil/recurso/procedimiento-simple-para-crear-empresas" },
  },
  marcas: {
    tema: "Registro de marcas",
    regla: "Ley 19.039 (texto refundido DFL 4 de 2022). Ruta INAPI: solicitud en línea → examen de forma (30 días para corregir observaciones) → pago y publicación del extracto en el Diario Oficial (20 días hábiles) → examen de fondo y resolución (aprox. 6 meses) → pago de derechos finales dentro de 60 días → registro. La protección dura 10 años, renovables por períodos iguales. Los aranceles se verifican en el anexo vigente de INAPI.",
    fuente: { titulo: "ChileAtiende · Registro de marca (INAPI)", articulo: "Ley 19.039 (DFL 4 de 2022)", vigencia: "Vigente", url: "https://www.chileatiende.gob.cl/fichas/1633" },
  },
  propiedad_industrial: {
    tema: "Texto legal de propiedad industrial",
    regla: "Texto refundido, coordinado y sistematizado de la Ley 19.039 de Propiedad Industrial.",
    fuente: { titulo: "DFL 4 de 2022 (Ley 19.039 refundida)", vigencia: "Vigente", url: "https://www.bcn.cl/leychile/navegar?i=1179684" },
  },
  jornada_40h: {
    tema: "Reducción de jornada (Ley 21.561)",
    regla: "Límite de jornada ordinaria: 44 horas desde 26-04-2024; 42 horas desde 26-04-2026; 40 horas desde 26-04-2028. La Dirección del Trabajo indicó que la rebaja se acuerda por escrito; sin acuerdo, el empleador reduce proporcionalmente el término de la jornada.",
    fuente: { titulo: "Ley 21.561 y criterio de la Dirección del Trabajo (marzo 2026)", vigencia: "42 h desde 26-04-2026" },
  },
  ley_karin: {
    tema: "Ley Karin (Ley 21.643)",
    regla: "Vigente desde el 1-8-2024: todo empleador debe contar con un protocolo de prevención del acoso laboral, sexual y la violencia en el trabajo, un procedimiento de investigación y sanción incorporado al reglamento interno (o documento equivalente) y canales de denuncia. Verificar dictámenes vigentes de la Dirección del Trabajo.",
    fuente: { titulo: "Ley 21.643 (Ley Karin)", vigencia: "Desde 01-08-2024" },
  },
  datos_personales: {
    tema: "Protección de datos personales",
    regla: "Ley 21.719 modifica la Ley 19.628 y crea la Agencia de Protección de Datos Personales; entra en vigencia el 1-12-2026. Exige base de licitud, deber de información, derechos de acceso, rectificación, supresión, oposición y portabilidad, medidas de seguridad y régimen de sanciones.",
    fuente: { titulo: "Ley 21.719", vigencia: "Desde 01-12-2026", url: "https://www.bcn.cl/leychile/navegar?idNorma=1209272" },
  },
};

// ---------------------------------------------------------------------
// Casos de uso reales típicos (playbooks)
// ---------------------------------------------------------------------

export const PLAYBOOKS: Playbook[] = [
  {
    id: "f29_atrasado",
    caso: "Empresa con uno o más F29 sin declarar o declarados fuera de plazo",
    senales: ["carta o notificación del SII", "meses sin declarar IVA", "giros pendientes"],
    pasos: [
      "Identificar cada período omitido o atrasado y si tiene impuesto a pagar, está calzado o sin movimiento.",
      "Reconstruir débito y crédito de cada período con el Registro de Compras y Ventas (crédito atrasado solo dentro del art. 24 DL 825).",
      "Calcular multa por período con la herramienta calcular_multa_atraso (art. 97 N°2) y el interés con calcular_interes_mora usando la tasa diaria vigente publicada por el SII.",
      "Comparar costo de regularizar hoy versus esperar; evaluar convenio de pago o solicitud de condonación según la política vigente del SII (verificar).",
      "Proponer orden de presentación y tareas al cliente.",
    ],
    normas: ["f29_plazos", "multa_97_2", "interes_53", "iva_credito_24", "prescripcion_200"],
    preguntar: ["¿Qué meses no se declararon?", "¿Tienes el detalle del RCV de esos meses?", "¿Recibiste alguna notificación del SII? (fecha y número)"],
    riesgo: "alto",
  },
  {
    id: "ventas_informales",
    caso: "Persona o empresa que vende (redes sociales, transferencias) sin inicio de actividades",
    senales: ["vende por redes sociales", "recibe muchas transferencias", "sin RUT de empresa o sin giro"],
    pasos: [
      "Determinar desde cuándo vende y el volumen aproximado (sin pedir claves bancarias: solo cartolas o resúmenes que el cliente entregue).",
      "Evaluar si conviene operar como persona natural o constituir una empresa (ver caso constitución).",
      "Preparar inicio de actividades, giro y régimen; configurar emisión de documentos electrónicos.",
      "Advertir sobre la visibilidad de abonos por la Ley 21.713 sin exagerar el riesgo.",
    ],
    normas: ["inicio_actividades", "ley_21713", "pro_pyme"],
    preguntar: ["¿Desde qué mes vendes?", "¿Ventas mensuales aproximadas?", "¿Vendes productos, servicios o ambos?"],
    riesgo: "medio",
  },
  {
    id: "eleccion_regimen",
    caso: "Elegir o cambiar régimen tributario (Pro Pyme general, Pro Pyme transparente o semi integrado)",
    senales: ["régimen por definir", "empresa nueva", "socios que retiran utilidades"],
    pasos: [
      "Verificar requisitos de ingreso y capital en UF (pedir valor UF a la fecha).",
      "Comparar con números reales: tasa 12,5% Pro Pyme general (2025-2027, condicionada a la cotización de la Ley 21.735) versus transparencia (tributan los dueños).",
      "Considerar retiros esperados, reinversión, contabilidad simplificada y PPM reducido a la mitad.",
      "Presentar escenarios con supuestos explícitos; nunca un solo número sin supuestos.",
    ],
    normas: ["pro_pyme"],
    preguntar: ["Ingresos anuales aproximados de los últimos 3 años", "¿Cuánto retiran los dueños al año?", "¿La empresa cotiza por sus trabajadores?"],
    riesgo: "medio",
  },
  {
    id: "honorarios",
    caso: "Pagos o cobros con boletas de honorarios",
    senales: ["boletas de honorarios", "trabajadores independientes", "retenciones en el F29"],
    pasos: [
      "Confirmar quién retiene (la empresa que paga a un independiente retiene y declara en el F29).",
      "Calcular retención con calcular_retencion_honorarios según el año de emisión.",
      "Revisar que las retenciones estén declaradas y pagadas en el F29 del mes siguiente.",
    ],
    normas: ["retencion_honorarios", "f29_plazos"],
    preguntar: ["¿Montos brutos y fechas de las boletas?", "¿La retención la hizo la empresa o el profesional pagó el impuesto?"],
    riesgo: "bajo",
  },
  {
    id: "iva_servicios",
    caso: "Empresa de servicios que no sabe si debe cobrar IVA",
    senales: ["presta servicios", "emite boletas exentas", "sociedad de profesionales"],
    pasos: [
      "Determinar si el servicio está afecto desde 2023 (Ley 21.420) o si aplica una exención.",
      "Si es sociedad de profesionales, verificar uno a uno los requisitos de la Circular SII 21 de 1991.",
      "Corregir documentos y declaraciones si corresponde.",
    ],
    normas: ["iva_servicios", "iva_tasa"],
    preguntar: ["¿Qué servicio presta?", "¿Tipo de sociedad y profesión de cada socio?"],
    riesgo: "medio",
  },
  {
    id: "termino_giro",
    caso: "Cierre de una empresa o negocio",
    senales: ["cerrar la empresa", "dejó de operar", "término de giro"],
    pasos: [
      "Confirmar fecha real de término y que no haya documentos ni declaraciones pendientes de los últimos 3 años.",
      "Preparar balance y antecedentes según el régimen.",
      "Presentar Formulario 2121 dentro de los dos meses siguientes; planificar disolución societaria si corresponde.",
    ],
    normas: ["termino_giro", "prescripcion_200"],
    preguntar: ["¿Fecha en que dejó de operar?", "¿Tiene trabajadores, deudas o bienes?"],
    riesgo: "medio",
  },
  {
    id: "cuadratura_iva",
    caso: "El IVA declarado no cuadra con el Registro de Compras y Ventas",
    senales: ["diferencias en F29", "notas de crédito", "facturas rechazadas o reclamadas"],
    pasos: [
      "Cargar el RCV y la cartola en ENQORA CONTABILIDAD y conciliar.",
      "Listar diferencias por documento (notas de crédito no registradas, documentos fuera de plazo, facturas reclamadas).",
      "Determinar si corresponde rectificar y en qué período (art. 24 DL 825).",
    ],
    normas: ["iva_tasa", "iva_credito_24", "f29_plazos"],
    preguntar: ["¿Qué período presenta la diferencia?", "¿Tienes el F29 presentado y el detalle del RCV?"],
    riesgo: "medio",
  },
  {
    id: "abonos_sin_respaldo",
    caso: "Depósitos o transferencias en la cuenta sin factura o boleta que los respalde",
    senales: ["muchos abonos de personas", "cartola con ingresos no facturados"],
    pasos: [
      "Conciliar la cartola con documentos emitidos; clasificar abonos (ventas, préstamos, aportes, traspasos propios).",
      "Documentar el origen de los que no son ventas.",
      "Si son ventas sin documento: proponer regularización y emisión correcta en adelante.",
    ],
    normas: ["ley_21713", "inicio_actividades"],
    preguntar: ["¿Origen de los abonos sin documento?", "¿Cartolas del período?"],
    riesgo: "alto",
  },
  {
    id: "constitucion_spa",
    caso: "Constituir una SpA u otra sociedad",
    senales: ["crear empresa", "socios", "capital inicial"],
    pasos: [
      "Definir tipo societario, socios, capital, administración y objeto.",
      "Redactar estatutos en el Registro de Empresas y Sociedades; cada constituyente firma con sus propias credenciales.",
      "Obtener RUT, iniciar actividades y elegir régimen.",
    ],
    normas: ["empresa_un_dia", "inicio_actividades", "pro_pyme"],
    preguntar: ["¿Cuántos socios y qué porcentaje cada uno?", "¿Capital y cómo se pagará?", "¿Quién administrará?"],
    riesgo: "bajo",
  },
  {
    id: "registro_marca",
    caso: "Proteger el nombre o logotipo de la empresa",
    senales: ["marca", "logotipo", "nombre comercial", "INAPI"],
    pasos: [
      "Búsqueda de anterioridades en INAPI y análisis de riesgo de confusión.",
      "Definir clases de Niza según productos y servicios reales.",
      "Presentar solicitud, pagar publicación y seguir examen de fondo hasta el registro.",
    ],
    normas: ["marcas", "propiedad_industrial"],
    preguntar: ["¿Nombre exacto y logotipo?", "¿Qué productos o servicios distinguirá?", "¿Desde cuándo la usa?"],
    riesgo: "bajo",
  },
  {
    id: "jornada_karin",
    caso: "Empresa con trabajadores que debe ajustarse a la jornada de 42 horas y a la Ley Karin",
    senales: ["trabajadores", "contratos de trabajo", "reglamento interno"],
    pasos: [
      "Revisar contratos y distribución de jornada; acordar por escrito la rebaja a 42 horas o aplicarla proporcionalmente.",
      "Verificar protocolo de prevención, procedimiento de investigación y canales de denuncia (Ley Karin).",
      "Actualizar reglamento interno y anexos de contrato.",
    ],
    normas: ["jornada_40h", "ley_karin"],
    preguntar: ["¿Cuántos trabajadores y qué jornada tienen?", "¿Tiene reglamento interno y protocolo Ley Karin?"],
    riesgo: "medio",
  },
  {
    id: "datos_personales",
    caso: "Empresa que trata datos de clientes o trabajadores y debe adecuarse a la Ley 21.719",
    senales: ["base de clientes", "tienda en línea", "datos personales"],
    pasos: [
      "Inventariar qué datos trata, para qué y con qué proveedores.",
      "Definir base de licitud, política de privacidad y procedimiento para ejercer derechos.",
      "Revisar contratos con encargados y medidas de seguridad antes del 1-12-2026.",
    ],
    normas: ["datos_personales"],
    preguntar: ["¿Qué datos personales guarda y dónde?", "¿Usa proveedores externos (correo, nube, pagos)?"],
    riesgo: "medio",
  },
];

// ---------------------------------------------------------------------
// Capacidades por agente: normas y casos que domina, y qué entrega
// ---------------------------------------------------------------------

export const AGENT_PROFILE: Record<AgentKey, { capacidades: string[]; reglas: string[]; casos: string[] }> = {
  tributario: {
    capacidades: [
      "Diagnosticar obligaciones tributarias (IVA, F29, PPM, retenciones, renta) con artículo y fuente.",
      "Cuantificar multas e intereses solo con las herramientas de cálculo y datos verificados.",
      "Comparar regímenes con escenarios y supuestos explícitos.",
    ],
    reglas: ["f29_plazos", "multa_97_2", "interes_53", "iva_tasa", "iva_credito_24", "iva_servicios", "pro_pyme", "retencion_honorarios", "inicio_actividades", "termino_giro", "prescripcion_200", "ley_21713"],
    casos: ["f29_atrasado", "ventas_informales", "eleccion_regimen", "honorarios", "iva_servicios", "termino_giro"],
  },
  contable: {
    capacidades: [
      "Cuadrar Registro de Compras y Ventas, cartola y F29 documento por documento.",
      "Detectar notas de crédito omitidas, documentos atrasados y abonos sin respaldo.",
      "Proponer asientos y correcciones con su período correcto.",
    ],
    reglas: ["iva_tasa", "iva_credito_24", "f29_plazos", "retencion_honorarios", "ley_21713"],
    casos: ["cuadratura_iva", "abonos_sin_respaldo", "honorarios", "f29_atrasado"],
  },
  legal: {
    capacidades: [
      "Ordenar la ruta societaria (constitución, modificación, disolución) y de marcas.",
      "Revisar cumplimiento laboral básico (jornada, Ley Karin) y de datos personales.",
      "Identificar qué requiere abogado y qué documentos firma el propio cliente.",
    ],
    reglas: ["empresa_un_dia", "marcas", "propiedad_industrial", "jornada_40h", "ley_karin", "datos_personales", "termino_giro"],
    casos: ["constitucion_spa", "registro_marca", "jornada_karin", "datos_personales", "termino_giro"],
  },
  financiero: {
    capacidades: [
      "Estimar costo total de regularizar (impuesto, multa, interés) con herramientas de cálculo.",
      "Construir escenarios de flujo y comparar alternativas con supuestos explícitos.",
      "Nunca inventar cifras: si falta un dato, lo pide.",
    ],
    reglas: ["multa_97_2", "interes_53", "pro_pyme", "retencion_honorarios"],
    casos: ["f29_atrasado", "eleccion_regimen"],
  },
  investigador: {
    capacidades: [
      "Verificar normas vigentes en fuentes oficiales (BCN, SII, DT, INAPI) con artículo, fecha y enlace.",
      "Jerarquía: ley > reglamento > circular o resolución del SII > oficio > jurisprudencia > doctrina.",
      "Señalar cuándo una norma cambió y desde qué fecha rige.",
    ],
    reglas: Object.keys(RULES),
    casos: [],
  },
  estrategico: {
    capacidades: [
      "Ordenar alternativas por impacto, urgencia y riesgo, en etapas.",
      "Proponer la ruta de trabajo y los servicios ENQORA que corresponden (sin fijar precios).",
    ],
    reglas: ["inicio_actividades", "pro_pyme", "ley_21713", "empresa_un_dia", "marcas", "datos_personales"],
    casos: ["ventas_informales", "eleccion_regimen", "constitucion_spa", "registro_marca", "datos_personales"],
  },
};

// Texto que se entrega al agente en su instrucción de sistema.
export function knowledgeFor(agent: AgentKey): string {
  const p = AGENT_PROFILE[agent];
  const rules = p.reglas.map((k) => RULES[k]).filter(Boolean)
    .map((r) => `- ${r.tema}: ${r.regla} [Fuente: ${r.fuente.titulo}${r.fuente.articulo ? `, ${r.fuente.articulo}` : ""}${r.fuente.url ? `, ${r.fuente.url}` : ""}]`);
  const cases = PLAYBOOKS.filter((c) => p.casos.includes(c.id)).map((c) =>
    `- ${c.caso} (riesgo ${c.riesgo}). Señales: ${c.senales.join("; ")}. Ruta: ${c.pasos.join(" → ")} Preguntar si falta: ${c.preguntar.join(" / ")}`);
  return [
    `Base normativa ENQORA (verificada al ${KNOWLEDGE_VERSION}; si el caso es de otra fecha, confirma la norma vigente a esa fecha):`,
    ...rules,
    cases.length ? "Casos de uso que dominas:" : "",
    ...cases,
    "Tus capacidades:",
    ...p.capacidades.map((x) => `- ${x}`),
  ].filter(Boolean).join("\n");
}

// Bibliografía de referencia para el equipo profesional (no se cita en informes sin verificar
// la edición vigente; los agentes citan solo fuentes oficiales verificables).
export const BIBLIOGRAPHY = [
  "Aste Mejías, Christian. Curso sobre Derecho y Código Tributario. Legal Publishing.",
  "Matus Fuentes, Marcelo. Curso de Derecho Tributario chileno. Parte general y especial. Thomson Reuters, 2021.",
  "Zavala Ortiz, José Luis. Manual de Derecho Tributario. Editorial Puntolex.",
  "Figueroa V., Patricio. Manual de Derecho Tributario. Editorial Jurídica de Chile, 2ª ed., 2017.",
  "Thayer Arteaga, William y Novoa Fuenzalida, Patricio. Manual de Derecho del Trabajo. Editorial Jurídica de Chile.",
  "IFRS Foundation. NIIF para las PYMES (norma contable aplicable a pymes que llevan contabilidad completa).",
];
