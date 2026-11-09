import type { SectionKey } from "@/lib/cora/secciones";

// CORA · Equipo de inteligencia empresarial. CORA (director) activa a los investigadores, que trabajan
// solo con sus fuentes autorizadas (lib/cora/fuentes.ts), entregan evidencia con fecha y certeza y registran
// lo que no pudieron verificar. Los agentes transversales verifican, cruzan y priorizan.
// «Activo» = produce resultados hoy. «Parcial» = trabaja con normativa o autoevaluación mientras su fuente
// directa se conecta. «Próxima etapa» = arquitectura lista, fuente aún no conectada (no produce resultados).

export type EstadoAgente = "activo" | "parcial" | "proxima_etapa";

export type Agente = {
  id: string;
  numero: string;
  nombre: string;
  especialidad: string;
  fuentes: string[]; // ids de FUENTES
  secciones: SectionKey[];
  responsabilidades: string[];
  estado: EstadoAgente;
};

export const ESTADOS_AGENTE: Record<EstadoAgente, string> = { activo: "Activo", parcial: "Parcial", proxima_etapa: "Próxima etapa" };

export const DIRECTOR = {
  nombre: "CORA · Director General de Inteligencia",
  responsabilidades: [
    "Activar a los investigadores según el tipo de empresa y los datos disponibles.",
    "Consolidar los resultados, eliminar duplicados y contrastar fuentes.",
    "Decidir qué falta verificar y qué necesita autorización, documentos o revisión profesional.",
    "Construir el expediente de 16 secciones y las 3 prioridades.",
    "Pedir intervención humana para conclusiones de alto impacto.",
  ],
};

export const AGENTES: Agente[] = [
  { id: "a01", numero: "01", nombre: "Identidad y sociedades", especialidad: "Quién es la empresa y cómo está constituida",
    fuentes: ["sii_nominas", "res_constituciones", "diario_oficial"], secciones: ["identidad", "legal"], estado: "activo",
    responsabilidades: ["Razón social, inicio, término de giro y actividades", "Tipo de sociedad", "Constitución y modificaciones (Etapa 2: Registro de Empresas y Sociedades)"] },
  { id: "a02", numero: "02", nombre: "Tributario", especialidad: "Situación tributaria pública y calendario",
    fuentes: ["sii_nominas", "sii_terceros", "sii_cte", "tgr"], secciones: ["tributacion"], estado: "activo",
    responsabilidades: ["Señales públicas del SII", "Calendario tributario aplicable", "Lo reservado: Carpeta Tributaria y deuda, solo con documentos de la empresa"] },
  { id: "a03", numero: "03", nombre: "Jurídico", especialidad: "Obligaciones societarias, contratos y registros",
    fuentes: ["res_constituciones", "diario_oficial"], secciones: ["legal"], estado: "parcial",
    responsabilidades: ["Deberes según el tipo de sociedad", "Estatutos, poderes y contratos (documentos)"] },
  { id: "a04", numero: "04", nombre: "Laboral", especialidad: "Obligaciones laborales aplicables",
    fuentes: ["dt_normativa", "dt_f30", "sii_nominas"], secciones: ["laboral"], estado: "parcial",
    responsabilidades: ["Obligaciones con fundamento legal según trabajadores (indicador SII)", "Qué documento acredita cada una"] },
  { id: "a05", numero: "05", nombre: "Previsional", especialidad: "Cotizaciones y seguro de cesantía",
    fuentes: ["previred", "afc", "dt_f30", "dt_normativa"], secciones: ["prevision"], estado: "parcial",
    responsabilidades: ["Obligaciones previsionales aplicables", "Verificación con certificados autorizados"] },
  { id: "a06", numero: "06", nombre: "Salud y seguridad", especialidad: "Ley 16.744 y DS 44",
    fuentes: ["suseso_ds44", "mutualidad"], secciones: ["seguridad"], estado: "parcial",
    responsabilidades: ["Organización preventiva exigible según tamaño", "Adhesión y antecedentes: con autorización"] },
  { id: "a07", numero: "07", nombre: "Financiero", especialidad: "Indicadores y documentación financiera",
    fuentes: ["sii_cte"], secciones: ["finanzas"], estado: "parcial",
    responsabilidades: ["Lo que declara el empresario", "Balance y resultados: solo con documentos (nunca se infieren deudas)"] },
  { id: "a08", numero: "08", nombre: "Comercial y gestión", especialidad: "Clientes, ventas, inventario y procesos",
    fuentes: [], secciones: ["clientes", "gestion"], estado: "parcial",
    responsabilidades: ["Control de clientes, ventas e inventario según la autoevaluación"] },
  { id: "a09", numero: "09", nombre: "Mercado público", especialidad: "ChileCompra y licitaciones",
    fuentes: ["mercado_publico_api"], secciones: ["mercado_publico"], estado: "proxima_etapa",
    responsabilidades: ["Registro como proveedor, licitaciones y órdenes de compra (Etapa 2, API oficial)"] },
  { id: "a10", numero: "10", nombre: "Propiedad intelectual", especialidad: "Marcas e INAPI",
    fuentes: ["inapi"], secciones: ["marca"], estado: "parcial",
    responsabilidades: ["Necesidad de protección", "Búsqueda en INAPI: manual, nunca se afirma disponibilidad sin buscar"] },
  { id: "a11", numero: "11", nombre: "Permisos y regulación", especialidad: "Patentes, autorizaciones sanitarias y sectoriales",
    fuentes: ["municipalidades", "seremi_salud"], secciones: ["permisos"], estado: "parcial",
    responsabilidades: ["Patente y permisos según actividad y comuna", "Vencimientos y renovaciones (documentos)"] },
  { id: "a12", numero: "12", nombre: "Medioambiente", especialidad: "SMA y SEA",
    fuentes: ["sma_sea"], secciones: ["permisos"], estado: "proxima_etapa",
    responsabilidades: ["Exigencias ambientales según rubro (fuente por investigar)"] },
  { id: "a13", numero: "13", nombre: "Comercio exterior", especialidad: "Aduanas e importaciones",
    fuentes: ["aduanas"], secciones: ["comercio_exterior"], estado: "proxima_etapa",
    responsabilidades: ["Requisitos de importación y exportación (fuente por investigar)"] },
  { id: "a14", numero: "14", nombre: "Reputación digital", especialidad: "Presencia web y señales públicas",
    fuentes: ["web_publica"], secciones: ["marketing"], estado: "parcial",
    responsabilidades: ["Hoy: autoevaluación", "Etapa 4: búsqueda web de la empresa con aprobación humana"] },
  { id: "a15", numero: "15", nombre: "Crecimiento", especialidad: "CORFO, Sercotec, SENCE y compras públicas",
    fuentes: ["beneficios_m16"], secciones: ["crecimiento"], estado: "activo",
    responsabilidades: ["Beneficios con criterios verificables", "Qué falta confirmar para postular"] },
  { id: "a16", numero: "16", nombre: "Tecnología y ciberseguridad", especialidad: "Madurez tecnológica y respaldos",
    fuentes: ["web_publica"], secciones: ["tecnologia"], estado: "parcial",
    responsabilidades: ["Sistemas y respaldos según la autoevaluación"] },
];

export const TRANSVERSALES = [
  { id: "verificador", nombre: "Verificador de fuentes y evidencias", funcion: "Descarta todo hallazgo sin una fuente del catálogo o sin fecha." },
  { id: "auditor", nombre: "Auditor de contradicciones y calidad", funcion: "Elimina duplicados y marca contradicciones entre fuentes y respuestas." },
  { id: "riesgos", nombre: "Analista de riesgos", funcion: "Prioriza solo riesgos con fundamento; la falta de datos nunca es incumplimiento." },
  { id: "oportunidades", nombre: "Analista de oportunidades", funcion: "Cruza tamaño, trabajadores y rubro con beneficios verificados." },
  { id: "planificador", nombre: "Planificador de acciones", funcion: "Define las 3 prioridades con servicio real y los próximos pasos." },
] as const;

export const agentePorSeccion = (s: SectionKey) => AGENTES.find((a) => a.secciones[0] === s) ?? AGENTES.find((a) => a.secciones.includes(s));
