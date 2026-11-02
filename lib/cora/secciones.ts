// CORA · Expediente empresarial ENQORA: las 16 secciones y los estados de cada hallazgo.

export type SectionKey =
  | "identidad" | "legal" | "tributacion" | "laboral" | "prevision" | "seguridad" | "permisos" | "marca"
  | "finanzas" | "gestion" | "clientes" | "marketing" | "tecnologia" | "mercado_publico" | "comercio_exterior" | "crecimiento";

export const SECCIONES: { key: SectionKey; nombre: string }[] = [
  { key: "identidad", nombre: "Identidad" },
  { key: "legal", nombre: "Constitución y legal" },
  { key: "tributacion", nombre: "Tributación" },
  { key: "laboral", nombre: "Laboral" },
  { key: "prevision", nombre: "Previsión" },
  { key: "seguridad", nombre: "Seguridad y salud ocupacional" },
  { key: "permisos", nombre: "Permisos y regulación" },
  { key: "marca", nombre: "Marca" },
  { key: "finanzas", nombre: "Finanzas" },
  { key: "gestion", nombre: "Gestión" },
  { key: "clientes", nombre: "Clientes y CRM" },
  { key: "marketing", nombre: "Marketing y presencia digital" },
  { key: "tecnologia", nombre: "Tecnología" },
  { key: "mercado_publico", nombre: "Mercado público" },
  { key: "comercio_exterior", nombre: "Comercio exterior" },
  { key: "crecimiento", nombre: "Crecimiento y oportunidades" },
];

// «No encontrado» nunca significa incumplimiento.
export type Estado =
  | "confirmado" | "parcial" | "no_encontrado" | "requiere_autorizacion" | "requiere_documentacion" | "requiere_profesional" | "fuente_no_disponible"
  | "declarado"; // lo informó el propio empresario en la autoevaluación

export const ESTADOS: Record<Estado, string> = {
  confirmado: "Confirmado",
  parcial: "Parcial",
  no_encontrado: "No encontrado",
  requiere_autorizacion: "Requiere autorización",
  requiere_documentacion: "Requiere documentación",
  requiere_profesional: "Requiere evaluación profesional",
  fuente_no_disponible: "Fuente no disponible",
  declarado: "Declarado por el empresario",
};

export const nombreSeccion = (k: SectionKey) => SECCIONES.find((s) => s.key === k)?.nombre ?? k;
