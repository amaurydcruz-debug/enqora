// Registro de instituciones con las que trabaja ENQORA (M16).
// Solo dominios oficiales. ENQORA no asume que un organismo tenga integración digital: cada
// trámite lo realiza el cliente con sus credenciales, ENQORA con mandato verificado, o un profesional.

export type Institution = { key: string; sigla: string; nombre: string; competencia: string; url: string };

export const INSTITUTIONS: Record<string, Institution> = {
  sii: { key: "sii", sigla: "SII", nombre: "Servicio de Impuestos Internos", competencia: "RUT, inicio de actividades, IVA, F29, renta, documentos electrónicos, término de giro.", url: "https://www.sii.cl" },
  res: { key: "res", sigla: "RES", nombre: "Registro de Empresas y Sociedades (Tu Empresa en un Día)", competencia: "Constitución, modificación y disolución de sociedades.", url: "https://www.registrodeempresasysociedades.cl" },
  inapi: { key: "inapi", sigla: "INAPI", nombre: "Instituto Nacional de Propiedad Industrial", competencia: "Marcas, patentes de invención y diseños.", url: "https://www.inapi.cl" },
  nic: { key: "nic", sigla: "NIC Chile", nombre: "NIC Chile", competencia: "Dominios .cl (no reemplaza el registro de marca).", url: "https://www.nic.cl" },
  muni: { key: "muni", sigla: "Municipalidad", nombre: "Municipalidad de la comuna (Rentas y Patentes, DOM)", competencia: "Patente municipal, uso de suelo, permisos de obra, publicidad y ocupación de espacios.", url: "https://www.chileatiende.gob.cl" },
  seremi_salud: { key: "seremi_salud", sigla: "SEREMI de Salud", nombre: "Secretaría Regional Ministerial de Salud", competencia: "Autorizaciones sanitarias (alimentos y otros giros regulados).", url: "https://seremienlinea.minsal.cl" },
  dt: { key: "dt", sigla: "DT", nombre: "Dirección del Trabajo", competencia: "Contratos, jornada, registro electrónico laboral, Libro de Remuneraciones Electrónico, Ley Karin.", url: "https://www.dt.gob.cl" },
  previred: { key: "previred", sigla: "Previred", nombre: "Previred", competencia: "Declaración y pago de cotizaciones previsionales.", url: "https://www.previred.com" },
  tgr: { key: "tgr", sigla: "TGR", nombre: "Tesorería General de la República", competencia: "Pagos fiscales, deudas, convenios y devoluciones.", url: "https://www.tgr.cl" },
  sernac: { key: "sernac", sigla: "SERNAC", nombre: "Servicio Nacional del Consumidor", competencia: "Derechos de los consumidores y deberes del proveedor (Ley 19.496).", url: "https://www.sernac.cl" },
  sernatur: { key: "sernatur", sigla: "SERNATUR", nombre: "Servicio Nacional de Turismo", competencia: "Registro Nacional de Prestadores de Servicios Turísticos.", url: "https://www.sernatur.cl" },
  mtt: { key: "mtt", sigla: "MTT", nombre: "Ministerio de Transportes y Telecomunicaciones", competencia: "Registro Nacional de Servicios de Transporte de Pasajeros y transporte regulado.", url: "https://www.mtt.gob.cl" },
  sag: { key: "sag", sigla: "SAG", nombre: "Servicio Agrícola y Ganadero", competencia: "Productos agrícolas y pecuarios, importación y exportación.", url: "https://www.sag.gob.cl" },
  isp: { key: "isp", sigla: "ISP", nombre: "Instituto de Salud Pública", competencia: "Cosméticos, productos farmacéuticos, dispositivos médicos.", url: "https://www.ispch.cl" },
  sec: { key: "sec", sigla: "SEC", nombre: "Superintendencia de Electricidad y Combustibles", competencia: "Declaraciones e instalaciones eléctricas, de gas y combustibles.", url: "https://www.sec.cl" },
  aduana: { key: "aduana", sigla: "Aduanas", nombre: "Servicio Nacional de Aduanas", competencia: "Importación y exportación.", url: "https://www.aduana.cl" },
  chilecompra: { key: "chilecompra", sigla: "ChileCompra", nombre: "Dirección ChileCompra (Mercado Público)", competencia: "Registro de Proveedores del Estado y licitaciones.", url: "https://www.mercadopublico.cl" },
  datos: { key: "datos", sigla: "Ley 21.719", nombre: "Agencia de Protección de Datos Personales", competencia: "Fiscalización de la protección de datos personales desde la entrada en vigencia de la Ley 21.719.", url: "https://www.bcn.cl/leychile/navegar?idNorma=1209272" },
  sercotec: { key: "sercotec", sigla: "Sercotec", nombre: "Servicio de Cooperación Técnica", competencia: "Fondos y asesoría para emprendedores y micro y pequeñas empresas.", url: "https://www.sercotec.cl" },
  corfo: { key: "corfo", sigla: "CORFO", nombre: "Corporación de Fomento de la Producción", competencia: "Innovación, emprendimiento y financiamiento.", url: "https://www.corfo.cl" },
  fosis: { key: "fosis", sigla: "FOSIS", nombre: "Fondo de Solidaridad e Inversión Social", competencia: "Programas de emprendimiento para personas en situación de vulnerabilidad.", url: "https://www.fosis.gob.cl" },
  sence: { key: "sence", sigla: "SENCE", nombre: "Servicio Nacional de Capacitación y Empleo", competencia: "Capacitación y franquicia tributaria.", url: "https://sence.gob.cl" },
  prochile: { key: "prochile", sigla: "ProChile", nombre: "ProChile", competencia: "Apoyo a la exportación e internacionalización.", url: "https://www.prochile.gob.cl" },
};

export const institution = (k: string) => INSTITUTIONS[k] ?? null;
