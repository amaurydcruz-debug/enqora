import "server-only";
import { llamarHerramienta } from "@/lib/ai/gateway";
import { contextoAviso } from "@/lib/cora/avisos-sii";
import { type AnalisisCaso } from "@/lib/cora/caso";
import {
  armarFuentes, armarPrompt, HERRAMIENTA_INFORME, informePorReglas, lineaValida, sanear, SISTEMA_INFORME,
  type Entrada, type Paso, type PerfilPublico, type Publicacion, type ServicioCatalogo,
} from "@/lib/cora/informe-ingreso";
import { buscarNormativa } from "@/lib/conocimiento-server";
import { LINEAS } from "@/lib/lineas";
import { isNaturalPersonRut } from "@/lib/rut";
import { createClient } from "@/lib/supabase/server";

const CATEGORIA_DE_LINEA: Record<string, string> = {
  CON: "contabilidad", TRI: "tributario", CRE: "constitucion", FOR: "formalizacion", BRA: "marcas", LEG: "profesionales",
  LAB: "trabajador", GES: "gestion", CRC: "crecimiento",
};

type DatosSolicitud = { id: string; relato: string; analisis: Partial<AnalisisCaso>; rut: string | null; razon_social: string | null; linea: string | null; documentos: string[] };

// Arma y guarda una versión del informe de ingreso de una solicitud. Con `token` lo ejecuta el servidor
// (al llegar la solicitud o desde el cron); sin token, una persona del equipo con su sesión.
// Fuentes que consulta: normativa verificada de ENQORA, rutas de casos reales anonimizados, ENQORA Informa,
// datos abiertos del SII (solo si el RUT es de una empresa: nunca se busca a una persona por su RUT),
// catálogo con precios vigentes, nombres de los documentos enviados y las correcciones del equipo.
export async function generarInformeIngreso(solId: string, token: string | null): Promise<{ ok: boolean; version?: number; error?: string }> {
  const supabase = await createClient({ headers: { "x-enqora-client": "enqora-informe-ingreso" } });
  const { data: raw, error: e0 } = await supabase.rpc("solicitud_para_informe", { p_token: token, p_sol: solId });
  if (e0 || !raw) return { ok: false, error: e0?.message ?? "solicitud no encontrada" };
  const sol = raw as DatosSolicitud;
  const linea = lineaValida(sol.linea);
  const categoria = (sol.analisis?.categorias?.[0] as string | undefined) ?? CATEGORIA_DE_LINEA[linea] ?? null;
  const rutEmpresa = sol.rut && !isNaturalPersonRut(sol.rut) ? sol.rut : null;

  const [catRes, pubRes, perfilRes, lecRes] = await Promise.all([
    supabase.rpc("public_catalog"),
    categoria ? supabase.rpc("informa_publicaciones", { p_categoria: categoria, p_q: null, p_limit: 3 }) : Promise.resolve({ data: [], error: null }),
    rutEmpresa ? supabase.rpc("lookup_public_company", { p_rut: rutEmpresa }) : Promise.resolve({ data: null, error: null }),
    supabase.rpc("informe_lecciones", { p_token: token, p_linea: linea }),
  ]);
  const catalogo = ((catRes.data ?? []) as ServicioCatalogo[]);
  const publicaciones = ((pubRes.data ?? []) as Publicacion[]);
  const perfil = (perfilRes.data && typeof perfilRes.data === "object" ? perfilRes.data : null) as PerfilPublico | null;
  const lecciones = ((Array.isArray(lecRes.data) ? lecRes.data : []) as unknown[]).filter((x): x is string => typeof x === "string");

  // Buscador legal: la pregunta se anonimiza dentro de buscarNormativa. Si tarda o falla, el informe sigue sin él.
  const busqueda = await Promise.race([
    buscarNormativa(`${LINEAS[linea]}. ${sol.relato}`.slice(0, 480), 5, supabase, token),
    new Promise<null>((r) => setTimeout(() => r(null), 8_000)),
  ]).catch(() => null);
  const entrada: Entrada = {
    buscador: busqueda && !busqueda.error && busqueda.respaldo ? busqueda.resultados : [],
    relato: sol.relato, analisis: sol.analisis ?? {}, linea, razonSocial: sol.razon_social, perfil: perfil?.razon_social ? perfil : null,
    publicaciones, catalogo, documentosCliente: Array.isArray(sol.documentos) ? sol.documentos : [], lecciones, aviso: contextoAviso(sol.relato),
  };
  const fuentes = armarFuentes(entrada);
  const ia = await llamarHerramienta({
    system: SISTEMA_INFORME, prompt: armarPrompt(entrada, fuentes), tool: HERRAMIENTA_INFORME, datos: "privados", anonimizar: {},
    modulo: "informe_ingreso", maxTokens: 3000, timeoutMs: 50_000, validar: (x) => !!sanear(x, entrada, fuentes),
  });
  const limpio = ia.input ? sanear(ia.input, entrada, fuentes) : null;
  const informe = limpio?.informe ?? informePorReglas(entrada, fuentes);

  const cuenta = (tipo: string) => fuentes.filter((f) => f.tipo === tipo).length;
  const bitacora: Paso[] = [
    { agente: "CORA · Director", resultado: `clasificó la solicitud en la línea ${linea} (${LINEAS[linea]}) y activó a ${informe.especialista.toLowerCase()}.` },
    { agente: "Agente de la línea", resultado: `revisó ${cuenta("norma")} norma(s) verificada(s) y ${cuenta("ruta")} ruta(s) de casos reales de ENQORA.` },
    { agente: "Investigador", resultado: rutEmpresa ? (entrada.perfil ? "encontró la empresa en los datos abiertos del SII." : "no encontró la empresa en los datos abiertos del SII.") : sol.rut ? "no consultó registros: el RUT es de una persona natural." : "sin RUT: no consultó registros públicos." },
    { agente: "Vigilancia normativa", resultado: publicaciones.length ? `aportó ${publicaciones.length} publicación(es) verificada(s) de ENQORA Informa.` : "no hay publicaciones verificadas recientes para esta área." },
    { agente: "Catálogo y precios", resultado: informe.servicio ? `sugirió ${informe.servicio.codigo}${informe.servicio.precio_desde == null ? " (sin precio vigente: lo define el equipo)" : " con su precio vigente"}.` : `no hay un servicio activo que calce (${catalogo.length} activos en total).` },
    { agente: "Plazos", resultado: informe.urgencia ? "incluyó el plazo legal con texto fijo verificado (no lo redacta la IA)." : "no detectó plazos legales urgentes en el relato." },
    { agente: "Verificador de fuentes", resultado: limpio ? `aceptó solo afirmaciones con fuente de la lista${limpio.descartes ? `; descartó ${limpio.descartes} sin fuente válida` : ""}.` : "sin análisis del enjambre: informe por reglas." },
    { agente: "Conflicto de interés", resultado: "lo calcula la base de datos con las partes de los casos (no la IA)." },
    ...(lecciones.length ? [{ agente: "Aprendizaje", resultado: `consideró ${lecciones.length} corrección(es) reciente(s) del equipo en esta línea.` }] : []),
  ];

  const { data: version, error } = await supabase.rpc("solicitud_guardar_informe", {
    p_token: token, p_sol: sol.id, p_origen: limpio ? "enjambre" : "reglas", p_informe: informe,
    p_fuentes: fuentes, p_bitacora: bitacora, p_modelo: ia.modelo ?? (ia.motivo ? `sin IA: ${ia.motivo}` : "reglas"), p_contraparte: informe.contraparte,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, version: typeof version === "number" ? version : undefined };
}
