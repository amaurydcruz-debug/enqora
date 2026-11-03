import type { Estado } from "@/lib/cora/secciones";
import type { ServiceOffer } from "@/lib/initial-report";

// CORA · Motor de Necesidades (compartido por CORA Empresas y CORA Personas).
// Convierte cada hallazgo en una necesidad con 8 elementos: evidencia, fuente y fecha, certeza, necesidad,
// consecuencia (solo con fundamento), beneficio de resolverla, solución y próximo paso.
// Prioriza por urgencia, impacto y evidencia. Nunca inventa problemas: si no hay hallazgo, no hay necesidad.

export type PlanKey = "regularizacion" | "laboral" | "formalizacion" | "gestion" | "crecimiento";

// Rutas externas oficiales (gratuitas o del propio organismo) para que la persona decida libremente.
export type RutaExterna = { nombre: string; url: string; nota: string };

export const RUTAS: Record<string, RutaExterna> = {
  sii: { nombre: "SII · trámites en línea", url: "https://www.sii.cl", nota: "Inicio de actividades, Carpeta Tributaria y declaraciones se hacen gratis en sii.cl con tu clave." },
  res: { nombre: "Registro de Empresas y Sociedades", url: "https://www.registrodeempresasysociedades.cl", nota: "Puedes constituir una EIRL o SpA en línea y sin costo de registro." },
  inapi: { nombre: "INAPI · buscador de marcas", url: "https://buscadormarcas.inapi.cl/Marca/BuscarMarca.aspx", nota: "La búsqueda es gratuita; la solicitud tiene tasas oficiales." },
  dt: { nombre: "Dirección del Trabajo", url: "https://www.dt.gob.cl", nota: "Modelos, orientación y el portal del Libro de Remuneraciones Electrónico." },
  isl: { nombre: "ISL o tu mutualidad", url: "https://www.isl.gob.cl/decreto-44/", nota: "Tu organismo administrador del seguro laboral orienta sobre el DS 44 para sus adheridos." },
  sercotec: { nombre: "Sercotec", url: "https://www.sercotec.cl", nota: "Convocatorias, asesoría y Centros de Negocios gratuitos." },
  municipio: { nombre: "Tu municipalidad", url: "https://www.chileatiende.gob.cl", nota: "La patente se tramita en el municipio de tu domicilio comercial." },
};

type Conocimiento = { necesidad: string; beneficio: string; documentos?: string; urgencia: 1 | 2 | 3; impacto: 1 | 2 | 3; plan: PlanKey; externa?: keyof typeof RUTAS };

// Qué necesidad representa cada hallazgo de CORA y qué gana la persona al resolverla.
export const CONOCIMIENTO: Record<string, Conocimiento> = {
  termino_giro: { necesidad: "Aclarar la situación del cierre de la empresa", beneficio: "Operar sin exposición a multas o cerrar ordenadamente, sin cargas pendientes.", documentos: "Aviso de término de giro y últimas declaraciones (Carpeta Tributaria).", urgencia: 3, impacto: 3, plan: "regularizacion", externa: "sii" },
  sin_ventas: { necesidad: "Confirmar que las declaraciones estén presentadas", beneficio: "Evitar que multas e intereses crezcan y tener la empresa en regla para créditos, licitaciones y fondos.", documentos: "Carpeta Tributaria Electrónica (gratis en sii.cl).", urgencia: 2, impacto: 3, plan: "regularizacion", externa: "sii" },
  declaraciones: { necesidad: "Poner al día las declaraciones de IVA y renta", beneficio: "Detener multas e intereses y poder emitir documentos, postular a fondos y acceder a crédito.", documentos: "Carpeta Tributaria Electrónica y libros de compras y ventas.", urgencia: 3, impacto: 3, plan: "regularizacion", externa: "sii" },
  laboral_potencial: { necesidad: "Verificar el cumplimiento laboral y previsional", beneficio: "Tranquilidad ante una fiscalización y trabajadores con sus cotizaciones al día.", documentos: "Contratos, liquidaciones, certificado de cotizaciones (Previred) o certificado F30.", urgencia: 2, impacto: 3, plan: "laboral", externa: "dt" },
  contratos: { necesidad: "Ordenar contratos y cotizaciones de tus trabajadores", beneficio: "Evitar deudas previsionales que se reajustan y multas por trabajador.", documentos: "Contratos, liquidaciones y certificado de cotizaciones.", urgencia: 3, impacto: 3, plan: "laboral", externa: "dt" },
  seguridad_potencial: { necesidad: "Implementar la organización preventiva del DS 44", beneficio: "Prevenir accidentes, cumplir la norma vigente desde 2025 y estar preparado ante una fiscalización.", documentos: "Certificado de adhesión a la mutualidad o al ISL y matriz de riesgos, si existe.", urgencia: 2, impacto: 2, plan: "laboral", externa: "isl" },
  patente: { necesidad: "Regularizar la patente municipal y los permisos del rubro", beneficio: "Funcionar sin riesgo de multas o clausura y poder abrir nuevos canales de venta.", documentos: "Patente municipal vigente y resoluciones sectoriales del rubro.", urgencia: 3, impacto: 2, plan: "formalizacion", externa: "municipio" },
  marca: { necesidad: "Proteger la marca del negocio", beneficio: "Asegurar el nombre en el que inviertes y evitar que un tercero lo registre.", documentos: "Nombre de la marca, logotipo y productos o servicios que identifica.", urgencia: 1, impacto: 2, plan: "formalizacion", externa: "inapi" },
  marca_pendiente: { necesidad: "Comprobar si la marca está protegida", beneficio: "Saber si el nombre del negocio es tuyo antes de seguir invirtiendo en él.", documentos: "Nombre de la marca y productos o servicios que identifica.", urgencia: 1, impacto: 2, plan: "formalizacion", externa: "inapi" },
  deber_societario: { necesidad: "Mantener al día los registros societarios", beneficio: "Tener la empresa lista para créditos, nuevos socios o la venta de acciones.", documentos: "Estatutos, registro de accionistas o actas.", urgencia: 1, impacto: 1, plan: "formalizacion" },
  cuentas: { necesidad: "Separar las finanzas del negocio de las personales", beneficio: "Saber si el negocio gana dinero y respaldar gastos ante el SII.", urgencia: 2, impacto: 2, plan: "gestion" },
  caja: { necesidad: "Controlar el flujo de caja mensual", beneficio: "Anticipar faltas de dinero para sueldos, impuestos y proveedores.", urgencia: 2, impacto: 2, plan: "gestion" },
  clientes: { necesidad: "Registrar clientes y el seguimiento de ventas", beneficio: "Vender más a quienes ya te compraron y saber qué clientes son rentables.", urgencia: 1, impacto: 2, plan: "gestion" },
  inventario: { necesidad: "Controlar inventario y proveedores", beneficio: "Menos quiebres de stock, mermas y compras de más.", urgencia: 1, impacto: 2, plan: "gestion" },
  digital: { necesidad: "Tener presencia digital", beneficio: "Que los clientes te encuentren cuando buscan lo que vendes.", urgencia: 1, impacto: 2, plan: "gestion" },
  respaldos: { necesidad: "Respaldar la información del negocio", beneficio: "No perder documentos que el SII puede pedir durante años.", urgencia: 2, impacto: 2, plan: "gestion" },
  sistema: { necesidad: "Administrar el negocio con un sistema", beneficio: "Información ordenada para decidir y cumplir a tiempo.", urgencia: 1, impacto: 2, plan: "gestion" },
  oportunidades: { necesidad: "Aprovechar programas públicos que podrían aplicar", beneficio: "Acceder a subsidios, beneficios tributarios o ventas al Estado.", urgencia: 1, impacto: 2, plan: "crecimiento", externa: "sercotec" },
  // CORA Personas
  p_inicio: { necesidad: "Iniciar actividades antes de vender", beneficio: "Emitir boletas o facturas, vender a empresas y evitar multas.", documentos: "Cédula de identidad, domicilio y descripción de la actividad.", urgencia: 3, impacto: 3, plan: "formalizacion", externa: "sii" },
  p_estructura: { necesidad: "Evaluar si te conviene una empresa (EIRL o SpA)", beneficio: "Separar tu patrimonio personal del negocio y prepararte para crecer o sumar socios.", documentos: "Descripción del negocio, socios (si los hay) y capital inicial.", urgencia: 1, impacto: 3, plan: "formalizacion", externa: "res" },
  p_impuestos: { necesidad: "Llevar tus impuestos con apoyo profesional", beneficio: "No olvidar un F29, rebajar los gastos que corresponden y evitar multas.", urgencia: 2, impacto: 2, plan: "regularizacion", externa: "sii" },
  p_renta: { necesidad: "Revisar tu declaración de renta con las retenciones de honorarios", beneficio: "Recuperar devoluciones que te correspondan y cumplir tus cotizaciones.", urgencia: 1, impacto: 2, plan: "regularizacion", externa: "sii" },
  p_trabajadores: { necesidad: "Cumplir tus obligaciones como empleador", beneficio: "Trabajadores protegidos y sin deudas previsionales que se acumulen.", documentos: "Contratos y liquidaciones de tus trabajadores.", urgencia: 2, impacto: 3, plan: "laboral", externa: "dt" },
  p_patente: { necesidad: "Obtener la patente de tu local", beneficio: "Funcionar sin riesgo de multas o clausura.", documentos: "Contrato o título del local y resolución sanitaria si el rubro la exige.", urgencia: 3, impacto: 2, plan: "formalizacion", externa: "municipio" },
  p_cuentas: { necesidad: "Separar tus finanzas personales de las del negocio", beneficio: "Saber cuánto gana realmente tu negocio y ordenar tus impuestos.", urgencia: 2, impacto: 2, plan: "gestion" },
  p_marca: { necesidad: "Proteger el nombre de tu negocio", beneficio: "Asegurar la marca en la que inviertes.", urgencia: 1, impacto: 2, plan: "formalizacion", externa: "inapi" },
  p_fondos: { necesidad: "Postular a programas para emprendedores", beneficio: "Financiar tu proyecto con subsidios no reembolsables.", urgencia: 1, impacto: 2, plan: "crecimiento", externa: "sercotec" },
};

const EVIDENCIA: Partial<Record<Estado, 1 | 2 | 3>> = { confirmado: 3, declarado: 2, parcial: 2 };

export type Necesidad = {
  id: string;
  necesidad: string;
  evidencia: string;
  fuente: string;
  fecha: string;
  certeza: Estado;
  consecuencia?: string;
  beneficio: string;
  servicio: ServiceOffer | null;
  externa: RutaExterna | null;
  documentos?: string;
  proximo: string;
  plan: PlanKey;
  urgencia: number;
  impacto: number;
  puntaje: number;
};

export type HallazgoBase = {
  id: string; encontro: string; fuente: string; fecha: string; estado: Estado; consecuencias?: string; hacer: string; servicio: ServiceOffer | null;
  prioridad: "alta" | "media" | "baja";
};

export function necesidadesDe(hallazgos: HallazgoBase[]): Necesidad[] {
  const out: Necesidad[] = [];
  for (const h of hallazgos) {
    const k = CONOCIMIENTO[h.id];
    if (!k) continue; // sin conocimiento verificado, no se convierte en necesidad
    const urg = h.prioridad === "alta" ? Math.max(k.urgencia, 3) : k.urgencia;
    const ev = EVIDENCIA[h.estado] ?? 1;
    out.push({
      id: h.id, necesidad: k.necesidad, evidencia: h.encontro, fuente: h.fuente, fecha: h.fecha, certeza: h.estado,
      consecuencia: h.consecuencias, beneficio: k.beneficio, documentos: k.documentos, servicio: h.servicio, externa: k.externa ? RUTAS[k.externa] : null,
      proximo: h.hacer, plan: k.plan, urgencia: urg, impacto: k.impacto, puntaje: urg * 3 + k.impacto * 2 + ev,
    });
  }
  return out.sort((a, b) => b.puntaje - a.puntaje);
}
