// Pruebas de escenarios de la Consulta Estratégica 360° (CORA). Ejecutar: npx tsx scripts/cora-escenarios.ts
// Comprueba, sin IA ni base de datos, que el motor distingue hechos de hipótesis, no repite las mismas
// recomendaciones para todos, no usa frases prohibidas y que el validador descarta salidas de IA sin evidencia.
import { investigar } from "@/lib/cora/director";
import { evidenciasDe, FORBIDDEN, informeReglas, turnoReglas, validarInforme, validarTurno } from "@/lib/cora/estratega";
import { investigarPersona, type PersonaAnswers } from "@/lib/cora/personas";
import type { Catalog, PublicProfileForReport } from "@/lib/initial-report";
import type { HallazgoWeb } from "@/lib/cora/web/hallazgos";

const HOY = new Date("2026-11-03T12:00:00Z");
const catalog: Catalog = [{ code: "CON-04", module: "contabilidad", name: "Remuneraciones", price_from: 45000, market_price: null, welcome_pct: 40, welcome_months: 6 }];
const fuentes = [{ nombre: "Nómina de empresas (SII)", url: "https://www.sii.cl", publicada: "2026-08-15" }];
const empresa = (o: Partial<PublicProfileForReport>): PublicProfileForReport => ({
  estado: "encontrada", rut: "76086428-5", razon_social: "EMPRESA DE PRUEBA SPA", inicio_actividades: "2018-05-02", termino_giro: null,
  total_actividades: 1, perfil: { anio_comercial: 2024, tramo_ventas: "5", trabajadores: 0, rubro: "COMERCIO", region: "RM" }, senales: [], fuentes, ...o,
});

type Res = { nombre: string; top: string[]; texto: string; detalle: string };
const out: Res[] = [];
const fallos: string[] = [];

// Empresas
const pj: [string, PublicProfileForReport][] = [
  ["Empresa con trabajadores", empresa({ perfil: { anio_comercial: 2024, tramo_ventas: "6", trabajadores: 30, rubro: "MANUFACTURA", region: "RM" } })],
  ["Empresa sin hallazgos públicos relevantes", empresa({ razon_social: "COMERCIAL ANDES", perfil: { anio_comercial: 2024, tramo_ventas: "1", trabajadores: 0, rubro: "COMERCIO", region: "RM" } })],
  ["Empresa con señal de ventas", empresa({ senales: [{ codigo: "sin_informacion_reciente", gravedad: "media", anio: 2021 }], perfil: { anio_comercial: 2021, tramo_ventas: "3", trabajadores: 4, rubro: "SERVICIOS", region: "RM" } })],
  ["Empresa con término de giro", empresa({ termino_giro: "2025-03-31", senales: [{ codigo: "termino_giro", gravedad: "alta", fecha: "2025-03-31" }] })],
];
// Resultados del bot (simulados con la forma real de research_public_findings) para demostrar el escenario de marca.
const webMarca: HallazgoWeb[] = [{ portal: "inapi", estado: "encontrado", consultado: "2026-11-03T15:00:00Z", url: "https://buscadormarcas.inapi.cl", detalle: "1 registro", version: "inapi-2026-11-03", coincidencias: 1, tabla: { headers: ["Marca", "Titular", "Estado"], rows: [["ANDES", "EMPRESA DE PRUEBA SPA", "Registrada"]] } }];
const webSinMarca: HallazgoWeb[] = [{ ...webMarca[0], estado: "sin_resultados", coincidencias: 0, tabla: null }];
const conWeb: Record<string, HallazgoWeb[]> = { "Empresa con marca registrada (resultado del bot)": webMarca, "Empresa sin marca localizada (resultado del bot)": webSinMarca };
pj.push(["Empresa con marca registrada (resultado del bot)", empresa({})], ["Empresa sin marca localizada (resultado del bot)", empresa({ perfil: { anio_comercial: 2024, tramo_ventas: "8", trabajadores: 60, rubro: "SERVICIOS", region: "RM" } })]);
for (const [nombre, p] of pj) {
  const exp = investigar(p, catalog, {}, HOY, conWeb[nombre] ?? []);
  const ev = evidenciasDe(exp, {});
  const inf = informeReglas(exp, ev);
  const turno = turnoReglas(exp, ev, {});
  const ids = new Set(ev.map((e) => e.id));
  for (const lista of [inf.hallazgos_verificados, inf.fortalezas, inf.necesidades_confirmadas, inf.riesgos, inf.oportunidades]) {
    for (const i of lista) if (!i.evidencias.every((e) => ids.has(e))) fallos.push(`${nombre}: afirmación sin evidencia válida`);
  }
  for (const s of [...exp.necesidades.map((n) => n.servicio), ...exp.prioridades]) if (s && s.disponible && s.codigo !== "CON-04" && s.precio !== 0) fallos.push(`${nombre}: servicio inactivo mostrado como disponible (${s.nombre})`);
  out.push({ nombre, top: inf.prioridades.map((x) => x.necesidad_id), texto: JSON.stringify({ inf, turno, h: exp.hallazgos }), detalle: `pregunta 1: ${turno.pregunta_id ?? "—"} · completitud ${exp.completitud.pct}%` });
}

// Registro de Empresas (datos abiertos): la constitución se informa con fecha, antigüedad y capital, y deja de figurar como pendiente.
{
  const webRes: HallazgoWeb[] = [{ portal: "res", estado: "encontrado", consultado: "2026-11-03T12:00:00Z", url: "https://datos.gob.cl/dataset/registro-de-empresas-y-sociedades", version: "datos-abiertos",
    detalle: "1 actuación(es) en el Registro de Empresas y Sociedades (datos abiertos).", coincidencias: 1,
    tabla: { headers: ["Fecha", "Actuación", "Tipo de sociedad", "Capital", "Comuna"], rows: [["2019-03-15", "CONSTITUCIÓN", "SpA", "$1.000.000", "SANTIAGO, Región Metropolitana"]] } }];
  const legal = investigar(empresa({}), catalog, {}, HOY, webRes).secciones.find((x) => x.key === "legal");
  const txt = JSON.stringify(legal);
  if (!txt.includes("Constituida el 15 de marzo de 2019 (hace 7 años) como SpA, con capital inicial de $1.000.000")) fallos.push("Registro: no informa la constitución desde los datos abiertos");
  if (txt.includes("Constitución y capital (Registro de Empresas")) fallos.push("Registro: la constitución sigue como pendiente aunque se obtuvo de la fuente");
}

// Personas
const base: PersonaAnswers = { venta: "facturas", trabajadores: "no", contador: "contador", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" };
const pn: [string, PersonaAnswers][] = [
  ["Persona sin inicio de actividades", { ...base, venta: "sin_inicio", contador: "nadie", crecer: "si" }],
  ["Profesional independiente", { ...base, venta: "honorarios", contador: "nadie", lugar: "online" }],
  ["Emprendedor con negocio establecido", { ...base, venta: "facturas", trabajadores: "si", lugar: "local", cuentas: "no", crecer: "si", marca: "si" }],
];
for (const [nombre, a] of pn) {
  const e = investigarPersona(a, catalog, HOY);
  out.push({ nombre, top: e.necesidades.slice(0, 3).map((n) => n.id), texto: JSON.stringify(e), detalle: `planes: ${e.propuesta.planes.map((p) => p.key).join(", ")}` });
}

// Diferenciación: las 3 prioridades no se repiten entre escenarios
for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
  if (out[i].top.length && out[i].top.join() === out[j].top.join()) fallos.push(`Mismas prioridades en «${out[i].nombre}» y «${out[j].nombre}»`);
}
// Lenguaje prohibido (montos inventados, «no tiene», garantías). Los costos de planes vienen de tarifas publicadas del catálogo.
for (const r of out) if (FORBIDDEN.test(r.texto.replace(/"precio":\d+|"mercado":\d+|"price_from":\d+|"costo":"[^"]*"/g, ""))) fallos.push(`${r.nombre}: lenguaje prohibido`);

// Validador de la IA: descarta evidencias inexistentes, montos, «no tiene» y necesidades fuera del listado
const exp0 = investigar(pj[0][1], catalog, {}, HOY);
const ev0 = evidenciasDe(exp0, {});
const malo = validarInforme({
  resumen_estrategico: "Tu empresa no tiene marca y te costará $500.000.", situacion: "x",
  hallazgos_verificados: [{ texto: "Hecho inventado", evidencias: ["E-999"] }], fortalezas: [], oportunidades: [], necesidades_confirmadas: [], riesgos: [], pendientes: [],
  prioridades: [{ necesidad_id: "servicio_inventado", por_que: "x" }],
}, ev0, exp0.necesidades.map((n) => n.id));
if (malo) fallos.push("El validador aceptó un informe con monto inventado y «no tiene»");
const turnoMalo = validarTurno({ apertura: "Encontramos algo.", descubrimientos: [{ titulo: "Sin evidencia", por_que_importa: "x", evidencias: ["E-999"] }], contexto: "", pregunta_id: "inventada" }, ev0, ["patente"]);
if (turnoMalo) fallos.push("El validador aceptó un turno sin evidencias válidas");

console.log("\nESCENARIOS CORA");
for (const r of out) console.log(`- ${r.nombre}: prioridades [${r.top.join(", ")}] · ${r.detalle}`);
console.log("- Proveedor del Estado: NO DEMOSTRABLE en E1 (Mercado Público se conecta en E2 con el ticket)");
console.log(fallos.length ? `\nFALLAS (${fallos.length}):\n${fallos.map((f) => `  ✗ ${f}`).join("\n")}` : "\nTodas las comprobaciones pasaron ✓");
if (fallos.length) process.exit(1);
