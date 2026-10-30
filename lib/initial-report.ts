import { salesTrancheLabel } from "@/lib/public-data";

// Informe inicial ENQORA a partir de la consulta pública por RUT (Fase 0 · diagnóstico).
// Reglas fijas sobre datos oficiales: distingue lo verificado, lo pendiente de comprobar y las
// necesidades posibles. Nunca afirma deudas, incumplimientos ni beneficios que los datos no prueban.

export type Catalog = { code: string; module: string; name: string; price_from: number | null; market_price?: number | null }[];

export type PublicProfileForReport = {
  estado: string;
  rut?: string;
  razon_social?: string;
  inicio_actividades?: string | null;
  termino_giro?: string | null;
  actividades?: { codigo: string; descripcion: string | null }[];
  total_actividades?: number;
  perfil?: { anio_comercial: number; tramo_ventas: string | null; trabajadores: number | null; rubro: string | null; region?: string | null } | null;
  senales?: { codigo: string; gravedad: "alta" | "media" | "baja"; fecha?: string; anio?: number }[];
  fuentes?: { nombre: string; url: string; publicada: string }[];
  carga_parcial?: boolean;
};

export type Recommendation = {
  id: string;
  prioridad: "alta" | "media" | "baja";
  titulo: string;
  observado: string; // qué se observó (con su fuente)
  importa: string; // por qué podría importar
  falta: string; // qué información falta para confirmarlo
  accion: string; // qué recomienda ENQORA
  servicio: { nombre: string; codigo: string | null; categoria: string; precio: number | null; mercado?: number | null };
  tipo: "verificado" | "posible"; // verificado = consta en la fuente · posible = necesidad a confirmar
};

export type InitialReport = {
  verificados: { etiqueta: string; valor: string }[];
  porComprobar: { tema: string; como: string }[];
  recomendaciones: Recommendation[];
  proximas: string[];
  completo: boolean; // false mientras falten nóminas por cargar
};

const fmt = (d?: string | null) =>
  d ? new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`)) : "";

const yearsSince = (d?: string | null, today = new Date()) => {
  if (!d) return null;
  const start = new Date(`${d}T12:00:00Z`);
  return (today.getTime() - start.getTime()) / (365.25 * 86400000);
};

function service(catalog: Catalog, code: string, fallbackName: string, categoria: string) {
  const s = catalog.find((x) => x.code === code);
  return { nombre: s?.name ?? fallbackName, codigo: s ? s.code : null, categoria, precio: s?.price_from ?? null, mercado: s?.market_price ?? null };
}

export function buildInitialReport(p: PublicProfileForReport, catalog: Catalog, today = new Date()): InitialReport {
  const verificados: InitialReport["verificados"] = [];
  const recs: Recommendation[] = [];
  const nomina = "nómina de razón social del SII";

  verificados.push({ etiqueta: "Razón social", valor: p.razon_social ?? "—" });
  if (p.inicio_actividades) verificados.push({ etiqueta: "Inicio de actividades", valor: fmt(p.inicio_actividades) });
  verificados.push({ etiqueta: "Término de giro", valor: p.termino_giro ? `Sí, el ${fmt(p.termino_giro)}` : "No informado" });
  if (p.total_actividades != null && !p.carga_parcial) verificados.push({ etiqueta: "Actividades económicas vigentes", valor: String(p.total_actividades) });
  if (p.perfil) {
    verificados.push({ etiqueta: `Tamaño por ventas (${p.perfil.anio_comercial})`, valor: salesTrancheLabel(p.perfil.tramo_ventas) ?? "No informado" });
    if (p.perfil.trabajadores != null) verificados.push({ etiqueta: `Trabajadores informados (${p.perfil.anio_comercial})`, valor: String(p.perfil.trabajadores) });
    if (p.perfil.rubro) verificados.push({ etiqueta: "Rubro", valor: p.perfil.rubro });
  }

  // 1) Situaciones que constan en la fuente (señales)
  for (const s of p.senales ?? []) {
    if (s.codigo === "termino_giro") {
      recs.push({
        id: "termino_giro", prioridad: "alta", tipo: "verificado",
        titulo: "La empresa registra término de giro",
        observado: `Según la ${nomina}, terminó su giro el ${fmt(s.fecha)}.`,
        importa: "Operar o emitir documentos con término de giro puede generar sanciones; además, el cierre exige declaraciones finales.",
        falta: "Si la empresa sigue operando y si quedaron declaraciones o deudas del cierre.",
        accion: "Revisar el cierre y, si corresponde, regularizar o reactivar la actividad.",
        servicio: service(catalog, "GEN-01", "Consulta profesional", "profesionales"),
      });
    } else if (s.codigo === "sin_actividades") {
      recs.push({
        id: "sin_actividades", prioridad: "media", tipo: "verificado",
        titulo: "Sin actividades económicas vigentes publicadas",
        observado: "La nómina de actividades económicas del SII no muestra actividades vigentes para este RUT.",
        importa: "Sin actividades inscritas no se pueden emitir documentos ni declarar correctamente.",
        falta: "Confirmar la situación en el SII con la clave de la empresa.",
        accion: "Inscribir o actualizar las actividades económicas.",
        servicio: service(catalog, "FOR-01", "Inicio de actividades", "formalizacion"),
      });
    } else if (s.codigo === "sin_ventas_informadas" || s.codigo === "sin_informacion_reciente") {
      recs.push({
        id: s.codigo, prioridad: "media", tipo: "verificado",
        titulo: s.codigo === "sin_ventas_informadas" ? `Sin información de ventas en ${s.anio ?? "el último año informado"}` : `Última información comercial: año ${s.anio ?? "—"}`,
        observado: "Dato de la nómina de empresas personas jurídicas del SII.",
        importa: "Puede deberse a declaraciones faltantes o a falta de movimiento; en ambos casos conviene confirmarlo antes de una fiscalización.",
        falta: "Las declaraciones mensuales (F29) y anuales (F22) de la empresa: están en su Carpeta Tributaria.",
        accion: "Revisar las declaraciones y regularizar los períodos que falten.",
        servicio: service(catalog, "CON-03", "Regularización de contabilidad atrasada", "contabilidad"),
      });
    }
  }

  // 2) Obligaciones que aplican según los datos (no se afirma incumplimiento)
  const workers = p.perfil?.trabajadores ?? 0;
  if (!p.termino_giro && workers > 0) {
    recs.push({
      id: "trabajadores", prioridad: "media", tipo: "posible",
      titulo: `Obligaciones laborales por ${workers} trabajador(es) informado(s)`,
      observado: `La nómina de empresas del SII informa ${workers} trabajador(es) en ${p.perfil?.anio_comercial}.`,
      importa: "Con trabajadores aplican contratos, liquidaciones, cotizaciones previsionales (día 10, o 13 si se pagan en línea) y el Libro de Remuneraciones Electrónico.",
      falta: "Si las remuneraciones y cotizaciones están al día: no es información pública.",
      accion: "Verificar o externalizar el proceso mensual de remuneraciones.",
      servicio: service(catalog, "CON-04", "Remuneraciones", "contabilidad"),
    });
  }
  const age = yearsSince(p.inicio_actividades, today);
  if (!p.termino_giro && age != null && age < 1) {
    recs.push({
      id: "empresa_nueva", prioridad: "media", tipo: "posible",
      titulo: "Empresa con menos de un año de actividad",
      observado: `Inició actividades el ${fmt(p.inicio_actividades)}, según la ${nomina}.`,
      importa: "En el primer año se definen el régimen tributario, la patente municipal y los permisos del rubro; un error temprano se arrastra.",
      falta: "Régimen tributario elegido, patente municipal y permisos sectoriales.",
      accion: "Revisar la formalización completa del primer año.",
      servicio: service(catalog, "FOR-02", "Patente municipal", "formalizacion"),
    });
  }
  const tramo = Number(p.perfil?.tramo_ventas);
  if (!p.termino_giro && tramo >= 2 && tramo <= 9) {
    recs.push({
      id: "beneficios_pyme", prioridad: "baja", tipo: "posible",
      titulo: "Podría acceder a beneficios para micro, pequeñas y medianas empresas",
      observado: `Tamaño por ventas según el SII: ${salesTrancheLabel(p.perfil?.tramo_ventas)} (${p.perfil?.anio_comercial}).`,
      importa: "Según el tamaño existen el régimen Pro Pyme y fondos públicos (Sercotec, Corfo); cada uno tiene requisitos y plazos propios.",
      falta: "Régimen tributario actual, ventas recientes y requisitos de cada programa vigente.",
      accion: "Evaluar el régimen tributario y las convocatorias abiertas que calcen con la empresa.",
      servicio: service(catalog, "GEN-01", "Consulta profesional", "crecimiento"),
    });
  }

  // 3) Siempre: completar el diagnóstico con la información que no es pública
  recs.push({
    id: "hoja_de_vida", prioridad: recs.some((r) => r.prioridad === "alta") ? "media" : "alta", tipo: "posible",
    titulo: "Completar la hoja de vida tributaria",
    observado: "Las declaraciones de IVA y renta, las observaciones del SII y las deudas no son públicas.",
    importa: "Son las que revelan multas, intereses o devoluciones pendientes; sin ellas el diagnóstico es parcial.",
    falta: "La Carpeta Tributaria Electrónica de la empresa (gratuita, la genera la propia empresa en sii.cl).",
    accion: "Crear la cuenta ENQORA de la empresa, subir la Carpeta Tributaria y solicitar el diagnóstico gratuito.",
    servicio: { nombre: "Diagnóstico gratuito ENQORA", codigo: null, categoria: "contabilidad", precio: 0 },
  });

  const order = { alta: 0, media: 1, baja: 2 };
  recs.sort((a, b) => order[a.prioridad] - order[b.prioridad]);

  const porComprobar = [
    { tema: "Declaraciones de IVA (F29) y renta (F22)", como: "Carpeta Tributaria Electrónica de la empresa" },
    { tema: "Observaciones y anotaciones del SII", como: "Carpeta Tributaria o situación tributaria con la clave de la empresa" },
    { tema: "Deudas fiscales en Tesorería", como: "Certificado de deuda de la TGR (con la clave de la empresa)" },
    ...(workers > 0 ? [{ tema: "Cotizaciones previsionales al día", como: "Certificado de cotizaciones (Previred) o de la Dirección del Trabajo" }] : []),
    { tema: "Patente municipal y permisos del rubro", como: "Municipalidad del domicilio y organismos sectoriales" },
  ];
  if (p.carga_parcial) porComprobar.unshift({ tema: "Actividades, tamaño y señales del SII", como: "Se completan solos cuando termine la carga de las nóminas en ENQORA" });

  const proximas = [
    "Crear la cuenta ENQORA y registrar la empresa (2 minutos).",
    "Generar la Carpeta Tributaria Electrónica en sii.cl con la clave de la empresa y subirla a su hoja de vida.",
    "Recibir el diagnóstico gratuito: un profesional ENQORA confirma los hallazgos, el costo y los plazos antes de actuar.",
  ];

  return { verificados, porComprobar, recomendaciones: recs, proximas, completo: !p.carga_parcial };
}
