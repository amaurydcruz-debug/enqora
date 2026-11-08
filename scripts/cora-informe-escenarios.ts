// Pruebas del informe ejecutivo de CORA (primer contacto). Ejecutar: npx tsx scripts/cora-informe-escenarios.ts
// Sin IA ni base de datos: comprueba que el informe cambia según la evidencia, que no repite recomendaciones,
// que ningún beneficio con requisitos no comprobados se ofrece automáticamente y que la falta de datos se dice.
import type { PublicCompany } from "@/app/actions/public";
import { identidadEmpresa, objetivosOrdenados } from "@/lib/cora/caso";
import { investigar } from "@/lib/cora/director";
import { evidenciasDe, parecidos, turnoReglas, validarTurno } from "@/lib/cora/estratega";
import { investigarPersona, type PersonaAnswers } from "@/lib/cora/personas";
import type { HallazgoWeb } from "@/lib/cora/web/hallazgos";
import type { Catalog, PublicProfileForReport } from "@/lib/initial-report";

const HOY = new Date("2026-11-07T12:00:00Z");
const catalog: Catalog = [{ code: "CON-04", module: "contabilidad", name: "Remuneraciones", price_from: 45000, market_price: null, welcome_pct: 40, welcome_months: 6 }];
const fuentes = [{ nombre: "Nómina de empresas (SII)", url: "https://www.sii.cl", publicada: "2026-08-15" }];
const base = (o: Partial<PublicProfileForReport>): PublicProfileForReport => ({
  estado: "encontrada", rut: "76086428-5", razon_social: "EMPRESA DE PRUEBA SPA", inicio_actividades: "2019-08-21", termino_giro: null,
  total_actividades: 1, perfil: { anio_comercial: 2024, tramo_ventas: "5", trabajadores: 0, rubro: "COMERCIO", region: "RM" }, senales: [], fuentes, ...o,
});
const web = (portal: HallazgoWeb["portal"], estado: HallazgoWeb["estado"], detalle: string, tabla: HallazgoWeb["tabla"] = null): HallazgoWeb =>
  ({ portal, estado, consultado: "2026-11-07T12:00:00Z", url: "https://www.chilecompra.cl", detalle, version: "api", coincidencias: estado === "encontrado" ? 1 : 0, tabla });

const casos: { nombre: string; p: PublicProfileForReport; web?: HallazgoWeb[] }[] = [
  { nombre: "1. Dos actividades económicas vigentes", p: base({ total_actividades: 2, actividades: [{ codigo: "479100", descripcion: "VENTA AL POR MENOR POR INTERNET" }, { codigo: "620200", descripcion: "CONSULTORES INFORMÁTICOS" }] } as Partial<PublicProfileForReport>) },
  { nombre: "2. Sin trabajadores confirmados", p: base({ perfil: null }) },
  { nombre: "3. Con marca registrada", p: base({}), web: [{ ...web("inapi", "encontrado", "1 registro", { headers: ["Marca", "Titular", "Estado"], rows: [["ANDES", "EMPRESA DE PRUEBA SPA", "Registrada"]] }), url: "https://www.inapi.cl" }] },
  { nombre: "4. Obligaciones tributarias verificadas (señal del SII)", p: base({ senales: [{ codigo: "sin_informacion_reciente", gravedad: "media", anio: 2021 }], perfil: { anio_comercial: 2021, tramo_ventas: "3", trabajadores: 12, rubro: "SERVICIOS", region: "RM" } }) },
  { nombre: "5. Proveedora en Mercado Público", p: base({}), web: [web("mercado_publico", "encontrado", "Proveedor registrado en Mercado Público.")] },
  { nombre: "6. Sin hallazgos relevantes", p: base({ perfil: { anio_comercial: 2024, tramo_ventas: "1", trabajadores: 0, rubro: "COMERCIO", region: "RM" } }) },
  { nombre: "7. Información pública insuficiente", p: base({ perfil: null, total_actividades: 0, inicio_actividades: null }) },
];

const fallos: string[] = [];
const vistos: string[] = [];
for (const c of casos) {
  const exp = investigar(c.p, catalog, {}, HOY, c.web ?? []);
  const ev = evidenciasDe(exp, {});
  const t = turnoReglas(exp, ev, {});
  const id = identidadEmpresa(c.p as unknown as PublicCompany, exp);
  const titulos = t.descubrimientos.map((d) => d.titulo);
  // Ningún beneficio con requisitos no comprobados en datos públicos se ofrece automáticamente.
  for (const b of exp.beneficios) if (/vehículo|camioneta|Postergar el pago del IVA|Vender al Estado/i.test(b.nombre)) fallos.push(`${c.nombre}: beneficio automático no permitido (${b.nombre})`);
  // Sin repeticiones.
  for (let i = 0; i < t.descubrimientos.length; i++) for (let j = i + 1; j < t.descubrimientos.length; j++)
    if (parecidos(`${t.descubrimientos[i].titulo} ${t.descubrimientos[i].hallazgo ?? ""}`, `${t.descubrimientos[j].titulo} ${t.descubrimientos[j].hallazgo ?? ""}`)) fallos.push(`${c.nombre}: oportunidades repetidas`);
  if (t.descubrimientos.length > 3) fallos.push(`${c.nombre}: más de 3 oportunidades`);
  for (const d of t.descubrimientos) if (!d.evidencias.length) fallos.push(`${c.nombre}: oportunidad sin evidencia`);
  // Sin compras públicas como oportunidad confirmada sin datos de Mercado Público.
  if (!c.web?.some((w) => w.portal === "mercado_publico") && titulos.some((x) => /proveedor|Mercado Público|Estado/i.test(x))) fallos.push(`${c.nombre}: compras públicas sin evidencia`);
  vistos.push(titulos.join(" | "));
  console.log(`\n${c.nombre}\n  Identidad: ${id.map((d) => `${d.etiqueta}=${d.valor}`).join(" · ")}\n  Resumen: ${t.apertura}\n  Oportunidades: ${t.descubrimientos.map((d) => `[${d.tipo}] ${d.titulo}`).join(" | ") || "(ninguna)"}\n  Objetivos sugeridos primero: ${objetivosOrdenados(titulos).slice(0, 2).map((o) => o.texto).join(" · ")}`);
}
// Comprobaciones específicas por escenario.
const [c1, , c3, c4, c5, c6, c7] = vistos;
if (vistos.slice(1).every((v) => v === c1)) fallos.push("Las recomendaciones no cambian según la evidencia");
if (!/marca/i.test(c3)) fallos.push("Marca registrada: no aparece");
if (!/trabajador|DS 44|prevenci|seguridad/i.test(c4)) fallos.push("Con 12 trabajadores: no aparecen obligaciones laborales");
if (!/proveedor/i.test(c5)) fallos.push("Mercado Público: no aparece el hallazgo de proveedor");
void c6; void c7;
{
  const exp = investigar(casos[6].p, catalog, {}, HOY, []);
  if (!/limitada/.test(turnoReglas(exp, evidenciasDe(exp, {}), {}).apertura)) fallos.push("Información insuficiente: CORA no lo dice");
}
// Identidad: distingue constitución de inicio de actividades y muestra las dos actividades.
{
  const exp = investigar(casos[0].p, catalog, {}, HOY, []);
  const id = identidadEmpresa(casos[0].p as unknown as PublicCompany, exp);
  if (!id.some((d) => d.etiqueta === "Actividades vigentes (2)")) fallos.push("Identidad: no muestra las dos actividades");
  if (!id.some((d) => d.etiqueta === "Inicio de actividades")) fallos.push("Identidad: falta el inicio de actividades");
}
// Validador: descarta una IA que repite la misma oportunidad con otras palabras.
{
  const exp = investigar(casos[3].p, catalog, {}, HOY, []);
  const ev = evidenciasDe(exp, {});
  const e1 = ev[0].id;
  const v = validarTurno({ apertura: "Resumen de prueba con evidencia suficiente para el validador.", pregunta_id: "ninguna", descubrimientos: [
    { titulo: "Ordenar las declaraciones de IVA atrasadas", hallazgo: "El SII no muestra ventas recientes.", por_que_importa: "Sin declaraciones al día no puedes acceder a beneficios.", falta_confirmar: "Tus F29.", proximo_paso: "Revisar F29.", tipo: "hipotesis", evidencias: [e1] },
    { titulo: "Poner al día las declaraciones de IVA atrasadas", hallazgo: "El SII no muestra ventas recientes.", por_que_importa: "Es lo mismo dicho de otra forma.", falta_confirmar: "Tus F29.", proximo_paso: "Revisar F29.", tipo: "hipotesis", evidencias: [e1] },
  ] }, ev, []);
  if (!v || v.descubrimientos.length !== 1) fallos.push("Validador: no elimina la oportunidad repetida");
}
// CORA Personas: perfiles distintos reciben orientaciones distintas, con máximo 3 prioridades sin repetir.
{
  const perfiles: [string, PersonaAnswers][] = [
    ["Profesional con honorarios", { venta: "honorarios", trabajadores: "no", contador: "nadie", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" } as PersonaAnswers],
    ["Negocio con facturas y trabajadores", { venta: "facturas", trabajadores: "si", contador: "nadie", lugar: "local", cuentas: "no", crecer: "si", marca: "si" } as PersonaAnswers],
    ["Actividades mixtas", { venta: "ambas", trabajadores: "no", contador: "contador", lugar: "online", cuentas: "si", crecer: "no_se", marca: "no" } as PersonaAnswers],
    ["Sin inicio de actividades", { venta: "sin_inicio", trabajadores: "no", contador: "nadie", lugar: "casa", cuentas: "no", crecer: "si", marca: "no" } as PersonaAnswers],
  ];
  const firmas = new Set<string>();
  for (const [nombre, a] of perfiles) {
    const e = investigarPersona(a, catalog, HOY);
    if (e.prioridades.length > 3) fallos.push(`Personas · ${nombre}: más de 3 prioridades`);
    const svcs = e.prioridades.map((n) => n.servicio?.id ?? n.id);
    if (new Set(svcs).size !== svcs.length) fallos.push(`Personas · ${nombre}: prioridades repetidas`);
    if (e.situacion.some((x) => /incumpl|moros|infractor/i.test(x.detalle))) fallos.push(`Personas · ${nombre}: etiqueta de incumplimiento sin evidencia`);
    firmas.add(`${e.categoria}|${e.prioridades.map((n) => n.id).join(",")}`);
    console.log(`\nPersonas · ${nombre}\n  Perfil: ${e.categoria}\n  Situación: ${e.situacion.map((x) => `${x.tema}=${x.estado}`).join(" · ")}\n  Prioridades: ${e.prioridades.map((n) => n.necesidad).join(" | ")}\n  Impacto: ${e.impacto.map((i) => i.resultado).join(" | ") || "(sin ejemplo)"}`);
  }
  if (firmas.size !== perfiles.length) fallos.push("Personas: perfiles distintos reciben la misma orientación");
}
console.log(fallos.length ? `\n${fallos.length} FALLOS:\n- ${fallos.join("\n- ")}` : "\nTodas las comprobaciones del informe pasaron ✓");
if (fallos.length) process.exit(1);
