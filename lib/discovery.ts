import type { ModuleKey } from "@/lib/cases";

// Galería de descubrimiento de la puerta de entrada (M08). Escalable: agregar una categoría
// es agregar un elemento aquí (y, si se quiere, su emblema en components/emblems.tsx).

export type Category = {
  key: string;
  title: string;
  lead: string; // una línea, visible en la galería
  detail: string; // se despliega al elegir la categoría
  solves: string[];
  module: ModuleKey; // módulo con el que se crea la solicitud
  emblem: string;
  services: { codes?: string[]; module?: string }; // qué servicios del catálogo mostrar
};

export const CATEGORIES: Category[] = [
  {
    key: "contabilidad",
    title: "Contabilidad",
    lead: "Tu contabilidad al día, sin sorpresas.",
    detail: "Registro de compras y ventas, conciliación, IVA, libros y renta, con profesionales que revisan y te explican cada paso.",
    solves: ["IVA y F29 que no cuadran", "Contabilidad atrasada", "Remuneraciones del mes", "Declaración anual de renta"],
    module: "contabilidad",
    emblem: "contabilidad",
    services: { module: "contabilidad" },
  },
  {
    key: "constitucion",
    title: "Constitución de empresas",
    lead: "Crea tu empresa con la estructura correcta.",
    detail: "Te ayudamos a elegir la forma jurídica, redactar los estatutos y constituir la empresa ante el Registro de Empresas y Sociedades.",
    solves: ["¿SpA, EIRL o limitada?", "Estatutos y socios", "Constitución en línea", "RUT de la empresa"],
    module: "create",
    emblem: "create",
    services: { module: "create" },
  },
  {
    key: "formalizacion",
    title: "Formalización",
    lead: "Inicio de actividades, patentes y permisos.",
    detail: "Ponemos tu empresa en regla: inicio de actividades ante el SII, patente municipal según tu comuna y los permisos de tu rubro.",
    solves: ["Inicio de actividades", "Patente municipal", "Permisos sanitarios o sectoriales", "Cambio de domicilio"],
    module: "formaliza",
    emblem: "formaliza",
    services: { module: "formaliza" },
  },
  {
    key: "marcas",
    title: "Registro de marcas",
    lead: "Protege el nombre de tu negocio.",
    detail: "Búsqueda preliminar de antecedentes y solicitud de marca ante INAPI. La concesión depende de INAPI y nunca la garantizamos.",
    solves: ["¿Mi marca está disponible?", "Solicitud ante INAPI", "Clases de productos y servicios", "Seguimiento del trámite"],
    module: "brand",
    emblem: "brand",
    services: { module: "brand" },
  },
  {
    key: "tributario",
    title: "Consultas tributarias",
    lead: "Respuestas claras con la normativa vigente.",
    detail: "Revisamos tu situación con la normativa tributaria chilena y te explicamos tus obligaciones, alternativas y riesgos, con su fuente.",
    solves: ["¿Qué régimen me conviene?", "Diferencias con el SII", "Multas y regularización", "Beneficios que podrían corresponder"],
    module: "contabilidad",
    emblem: "investigacion",
    services: { codes: ["CON-02", "CON-05", "GEN-01"] },
  },
  {
    key: "gestion",
    title: "Gestión empresarial",
    lead: "Clientes, caja, inventario y personas.",
    detail: "Ordena la operación de tu empresa: cobros y pagos, inventario, contratos y equipo, con indicadores que entiendes.",
    solves: ["Cobranza y flujo de caja", "Inventario", "Contratos con clientes y proveedores", "Indicadores del negocio"],
    module: "gestion",
    emblem: "gestion",
    services: { module: "gestion" },
  },
  {
    key: "profesionales",
    title: "Servicios profesionales",
    lead: "Contadores y abogados cuando lo necesitas.",
    detail: "Revisión de contratos, modificaciones societarias, regularizaciones y asesoría con profesionales autorizados.",
    solves: ["Revisión de contratos", "Modificar la sociedad", "Regularizar situaciones pendientes", "Hora con un profesional"],
    module: "legal",
    emblem: "legal",
    services: { codes: ["LEG-01", "GEN-01"], module: "legal" },
  },
  {
    key: "crecimiento",
    title: "Crecimiento y oportunidades",
    lead: "Financiamiento, fondos y expansión.",
    detail: "Identificamos fondos y programas públicos que podrían corresponder a tu empresa, con sus requisitos, y te acompañamos a postular.",
    solves: ["Fondos y programas públicos", "Financiamiento", "Nuevos mercados", "Exportación"],
    module: "crece",
    emblem: "crece",
    services: { module: "crece" },
  },
];

export const categoryByKey = (key: string | undefined | null) => CATEGORIES.find((c) => c.key === key) ?? null;

export const INTENT_COOKIE = "enqora_intent";
