// Pruebas de los motores deterministas de ENQORA (sin base de datos ni IA).
// Ejecutar: npm run test:motores
// Cada prueba fija una regla legal o una definición de indicador: si alguien cambia una regla sin querer, falla aquí.

import assert from "node:assert/strict";
import { empresaHoy, proximoUmbral } from "@/lib/dashboard/empresa-hoy";
import { oportunidades, FIN_PLAZO_TGR, TASA_GENERAL, TASA_PRO_PYME } from "@/lib/cora/oportunidades";
import { ejecutivo } from "@/lib/mando/ejecutivo";
import { operacion, type Run } from "@/lib/agentes/operacion";
import { runCalculator } from "@/lib/tax-calc";
import { analizarReglas, urgenciaLaboral } from "@/lib/cora/caso";
import { planificar } from "@/lib/informa";
import { interpretarPedido, TIPOS } from "@/lib/boveda";
import { markdownSeguro } from "@/lib/markdown-seguro";
import { generateKeyPairSync, sign as firmarCripto } from "node:crypto";
import { b64u, sha256, verificarAsercion, verificarRegistro } from "@/lib/webauthn-verificar";
import { admiteFirma, codigoVerificacion, normalizarCodigo, FOLIO_RE } from "@/lib/firma";
import { knowledgeFor, PLAYBOOKS, RULES } from "@/lib/knowledge";
import { contextoAviso, leerAvisoSII } from "@/lib/cora/avisos-sii";
import { isNaturalPersonRut } from "@/lib/rut";
import { solucionPersona } from "@/lib/cora/solucion-persona";
import { enjambrePersona, fuentesDe } from "@/lib/cora/enjambre-persona";
import { investigarPersona, PREGUNTAS_PERSONA, preguntaVisible, type PersonaAnswers } from "@/lib/cora/personas";
import { estadoDocumento, renderPreview, resumenLegal, type CaseLegalStatus } from "@/lib/legal";
import { anonimizar, armarFuentes, informePorReglas, sanear, type Entrada } from "@/lib/cora/informe-ingreso";
import { lineaDeCategoria, lineaDeFolio, lineaDeModulo } from "@/lib/lineas";
import { pasoDe } from "@/lib/accounting";
import { diagnosticar, preguntasPara as preguntasEmpresa } from "@/lib/empresa-al-dia";
import { antiguedad, anosIndemnizacion, calcularFiniquito, diasCorridos, feriadoProporcional, plazoPago, textoFiniquito, validarDatosFiniquito, type DatosFiniquito } from "@/lib/finiquito";
import { anonimizar as anonimizarIA, restaurar, resumenAnonimizado } from "@/lib/ai/anonimizar";
import { decodificarXml, leerDte } from "@/lib/dte";
import { cruzarLecturas, gastoDesdeDte, type Gasto } from "@/lib/gastos";
import { corpusBase, fragmentosInforma, respaldoSuficiente, trocear, type Resultado } from "@/lib/conocimiento";
import { alertasGastos, proyeccionGasto, umbralAtipico, type GastoAlerta } from "@/lib/alertas-gastos";
import { calculateAFP as emissoAFP } from "./terceros/emisso-payroll/rules/afp";
import { calculateHealth as emissoSalud } from "./terceros/emisso-payroll/rules/health";
import { calculateUnemployment as emissoAFC } from "./terceros/emisso-payroll/rules/unemployment";
import { calculateGratification as emissoGrat } from "./terceros/emisso-payroll/rules/gratification";
import { calculateIncomeTax as emissoImpuesto } from "./terceros/emisso-payroll/rules/income-tax";
import { anioPorDefecto, leerFactores } from "@/lib/certificado6";
import { aniversarios, saldoVacaciones, type RegistroVacacion } from "@/lib/vacaciones";
import { avisosRIOHS, textoRIOHS, validarRIOHS, type DatosRIOHS } from "@/lib/plantilla-riohs";
import { pendientesLaborales, type DatosPendientes } from "@/lib/pendientes-laborales";
import { avisosCarta, mesAnteriorDespido, montosCarta, textoCarta, validarCarta, type DatosCarta } from "@/lib/plantilla-carta-termino";
import { avisosContrato, hastaMaximoPacto, pactoCubreMes, textoAnexo, textoContrato, textoPactoHE, validarAnexo, validarContrato, validarPactoHE, type DatosContrato, type DatosPactoHE, type FichaContrato } from "@/lib/plantilla-contrato";
import { archivoLre, archivoPrevired, encabezadoLre, esParcial, faltantesArchivo, type FilaArchivo } from "@/lib/rem-archivos";
import { generarDocumento, recordatorios, validarDatos } from "@/lib/plantillas-laborales";
import { generarPolitica, validarPolitica } from "@/lib/plantilla-datos";
import { esVigente, fechaExcel, normalizarMarca, prepararFilasMarcas } from "@/lib/marcas";
import { faltaMontoAF, impuestoUnico, leerNovedades, leerParametros, liquidar, mesAnterior, normalizarRut, type Parametros, type Trabajador } from "@/lib/remuneraciones";
import { tocaAvisar, vencimientos } from "@/lib/calendario-cumplimiento";
import { gastoDesdeTexto, validarGasto } from "@/lib/gastos";
import { alertaCruce, medioDePago, resumirPorDia } from "@/lib/pos";
import { CATEGORIA_DE_RESPUESTA, preguntasPara, proponer } from "@/lib/conciliador";

let ok = 0;
const fallos: string[] = [];
function prueba(nombre: string, fn: () => void) {
  try {
    fn();
    ok++;
  } catch (e) {
    fallos.push(`✗ ${nombre}: ${e instanceof Error ? e.message : e}`);
  }
}
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

// ---------- Motor contable ----------
prueba("IVA 19% desde el neto", () => {
  const r = runCalculator("calcular_iva", { neto: 847300 });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.resultado.total, 1008287);
});
prueba("Retención de honorarios 2026 = 15,25%", () => {
  const r = runCalculator("calcular_retencion_honorarios", { bruto: 350000, anio: 2026 });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.resultado.liquido, 296625);
});
prueba("Multa art. 97 N°2 con tope de 30%", () => {
  const r = runCalculator("calcular_multa_atraso", { impuesto: 750000, meses_atraso: 20 });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.resultado.multa, 225000);
});

// ---------- Tu empresa hoy: umbrales laborales ----------
prueba("Con 4 trabajadores, el siguiente umbral es 5 (Libro de Remuneraciones)", () => {
  const u = proximoUmbral(4);
  assert.equal(u?.desde, 5);
});
prueba("Con 9 trabajadores, el siguiente umbral es 10 (reglamento interno y delegado)", () => {
  assert.equal(proximoUmbral(9)?.desde, 10);
});
prueba("Con 12 trabajadores, el siguiente umbral es 26 (comité paritario)", () => {
  assert.equal(proximoUmbral(12)?.desde, 26);
});
prueba("Sin trabajadores no aplican obligaciones laborales", () => {
  const h = empresaHoy({ estado: "encontrada", perfil: { trabajadores: 0 } });
  assert.equal(h.laboral?.aplican.length, 0);
  assert.equal(h.preventivo?.desde, 1);
});
prueba("Término de giro: sin alertas de crecimiento", () => {
  const h = empresaHoy({ estado: "encontrada", termino_giro: "2023-01-10", perfil: { trabajadores: 3 } });
  assert.equal(h.preventivo, null);
});
prueba("Rango de la autoevaluación 6-20 muestra lo que aplica según cantidad", () => {
  const h = empresaHoy({ estado: "no_encontrada" }, "6_20");
  assert.equal(h.laboral?.origen, "autoevaluacion");
  assert.ok((h.laboral?.segun_cantidad.length ?? 0) > 0);
});

// ---------- Oportunidades legales ----------
const hoy = new Date("2026-11-10T12:00:00Z");
prueba("Tasas: régimen general 2027 = 25,5%; Pro Pyme 2027 = 12,5%", () => {
  assert.equal(TASA_GENERAL[2027], 0.255);
  assert.equal(TASA_PRO_PYME[2027], 0.125);
});
prueba("Plazo de la Tesorería: 180 días desde el 17-10-2026 = 15-04-2027", () => {
  const fin = new Date(Date.UTC(2026, 9, 17) + 180 * 86_400_000).toISOString().slice(0, 10);
  assert.equal(fin, FIN_PLAZO_TGR);
});
prueba("Régimen general, tramo 7: Pro Pyme probable y condonación TGR", () => {
  const o = oportunidades({ regimen: "general_semi_integrado", tramo: "7", trabajadores: 4, hoy });
  assert.ok(ids(o).includes("pro_pyme_cambio"));
  assert.equal(o.find((x) => x.id === "pro_pyme_cambio")?.estado, "probable");
  assert.ok(ids(o).includes("tgr_condonacion"));
});
prueba("Empresa grande (tramo 11): sin beneficios de pyme", () => {
  const o = oportunidades({ regimen: "general_semi_integrado", tramo: "11", trabajadores: 150, hoy });
  assert.deepEqual(ids(o), ["sence_franquicia"]);
});
prueba("Término de giro: ninguna oportunidad", () => {
  assert.equal(oportunidades({ regimen: "general_semi_integrado", tramo: "4", trabajadores: 1, termino_giro: true, hoy }).length, 0);
});
prueba("Después del 15-04-2027 desaparece la condonación TGR", () => {
  const o = oportunidades({ regimen: "pro_pyme_general", tramo: "5", trabajadores: 0, hoy: new Date("2027-04-16T12:00:00Z") });
  assert.ok(!ids(o).includes("tgr_condonacion"));
});
prueba("Toda oportunidad tiene fuente oficial, fecha y resumen", () => {
  for (const o of oportunidades({ regimen: "por_definir", tramo: "5", trabajadores: 3, hoy })) {
    assert.match(o.fuente.url, /^https:\/\//);
    assert.match(o.verificado, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(o.resumen.length > 20);
  }
});

// ---------- Casos piloto: clasificación, documentos y servicios ----------
prueba("Relato de deudas con la Tesorería → tributario y certificado de deuda", () => {
  const a = analizarReglas("Tengo deudas con la Tesorería y quiero saber si puedo pedir condonación");
  assert.ok(a.categorias.includes("tributario"));
  assert.equal(a.documentos[0], "certificado_deuda");
});
prueba("Relato de cierre de empresa → formalización", () => {
  assert.ok(analizarReglas("Quiero hacer el término de giro y cerrar mi empresa").categorias.includes("formalizacion"));
});
prueba("Relato de datos personales → profesionales y lista de datos", () => {
  const a = analizarReglas("Necesito adecuarme a la ley de datos personales");
  assert.ok(a.categorias.includes("profesionales"));
  assert.ok(a.documentos.includes("datos_personales"));
});
prueba("Cada oportunidad apunta a un servicio del catálogo", () => {
  const validos = ["CON-02", "CON-06", "CON-07", "CRC-01"];
  for (const o of oportunidades({ regimen: "general_semi_integrado", tramo: "5", trabajadores: 3, hoy })) assert.ok(validos.includes(o.accion.servicio), o.id);
});
prueba("Ruta de trabajo de la condonación con normas existentes", () => {
  const p = PLAYBOOKS.find((x) => x.id === "tgr_condonacion");
  assert.ok(p);
  for (const n of p!.normas) assert.ok(RULES[n], n);
});

// ---------- Persona natural ----------
prueba("RUT menor a 50 millones = persona natural; 76.xxx = empresa", () => {
  assert.equal(isNaturalPersonRut("11.111.111-1"), true);
  assert.equal(isNaturalPersonRut("76.086.428-5"), false);
  assert.equal(isNaturalPersonRut("11.111.111-2"), false);
});
prueba("Honorarios o sin inicio de actividades: sin postergación de IVA, con condonación TGR", () => {
  for (const regimen of ["honorarios", "sin_inicio"]) {
    const o = ids(oportunidades({ regimen, tramo: null, trabajadores: 0, hoy }));
    assert.ok(!o.includes("postergacion_iva"), regimen);
    assert.ok(o.includes("tgr_condonacion"), regimen);
    assert.ok(!o.includes("confirmar_regimen"), regimen);
  }
});

prueba("Persona sin movimiento: solo pregunta lo que aplica", () => {
  const a: Partial<PersonaAnswers> = { venta: "inactivo" };
  const keys = PREGUNTAS_PERSONA.filter((q) => preguntaVisible(q.key, a)).map((q) => q.key);
  assert.deepEqual(keys, ["venta", "declara", "futuro", "deudas"]);
});
prueba("Persona sin movimiento con deuda TGR que quiere cerrar: condonación, declaraciones y término de giro", () => {
  const cat = [
    { code: "CON-06", module: "contabilidad", name: "Condonación", price_from: 10000, market_price: null, welcome_pct: null, welcome_months: null },
    { code: "CON-03", module: "contabilidad", name: "Regularización", price_from: 10000, market_price: null, welcome_pct: null, welcome_months: null },
    { code: "FOR-03", module: "formaliza", name: "Término de giro", price_from: 10000, market_price: null, welcome_pct: null, welcome_months: null },
  ];
  const a = { venta: "inactivo", declara: "no", futuro: "cerrar", deudas: "si", antiguedad: "recientes", contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" } as PersonaAnswers;
  const e = investigarPersona(a, cat as never, hoy);
  const codigos = e.prioridades.map((n) => n.servicio?.codigo);
  assert.deepEqual([...codigos].sort(), ["CON-03", "CON-06", "FOR-03"]);
  assert.ok(e.impacto.some((i) => i.titulo.includes("Ley 21.850")));
  assert.ok(e.obligaciones.some((o) => o.cuando === "15 de abril de 2027"));
  const sol = solucionPersona(a, e, hoy)!;
  assert.match(sol.titulo, /^Cerrar tu negocio pagando tu deuda/);
  assert.deepEqual(sol.pasos.map((p) => p.quien), ["tu", "enqora", "enqora", "ambos", "enqora"]);
  assert.equal(sol.plazo?.fecha, "15 de abril de 2027");
  assert.match(sol.costo, /^Desde \$30\.000/);
  assert.match(sol.relato, /término de giro/);
  // Si quiere retomar, el último paso es la contabilidad mensual y no el término de giro.
  const ret = solucionPersona({ ...a, futuro: "retomar" }, investigarPersona({ ...a, futuro: "retomar" }, cat as never, hoy), hoy)!;
  assert.ok(!ret.pasos.some((p) => /término de giro/i.test(p.titulo)));
});

prueba("Deudas de más de 3 años: revisar la prescripción ANTES de pagar con la condonación", () => {
  const a = { venta: "inactivo", declara: "no", futuro: "cerrar", deudas: "si", antiguedad: "antiguas", contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" } as PersonaAnswers;
  assert.ok(PREGUNTAS_PERSONA.filter((q) => preguntaVisible(q.key, a)).some((q) => q.key === "antiguedad"));
  const e = investigarPersona(a, [], hoy);
  assert.ok(e.necesidades.some((n) => n.id === "p_prescripcion"));
  const sol = solucionPersona(a, e, hoy)!;
  const t = sol.pasos.map((p) => p.titulo);
  const iPresc = t.findIndex((x) => /prescritas/.test(x));
  const iPago = t.findIndex((x) => /^Pagas solo lo que no prescribió/.test(x));
  assert.ok(iPresc > 0 && iPago > iPresc, t.join(" | "));
  assert.match(sol.relato, /prescritas antes de pagar/);
  // Con deudas recientes no se agrega la revisión de prescripción.
  const r = { ...a, antiguedad: "recientes" } as PersonaAnswers;
  assert.ok(!investigarPersona(r, [], hoy).necesidades.some((n) => n.id === "p_prescripcion"));
});
prueba("Condonación TGR (empresas) advierte revisar la prescripción", () => {
  const o = oportunidades({ regimen: "pro_pyme_general", tramo: "5", trabajadores: 0, hoy }).find((x) => x.id === "tgr_condonacion");
  assert.ok(o?.confirmar.some((c) => /prescritas/.test(c)));
});

prueba("Enjambre: persona sin movimiento con deudas antiguas", () => {
  const a = { venta: "inactivo", declara: "no", futuro: "cerrar", deudas: "si", antiguedad: "antiguas", contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" } as PersonaAnswers;
  const r = enjambrePersona(a, hoy);
  const por = (n: string) => r.find((x) => x.norma === n);
  assert.equal(por("presuncion_termino_giro")?.estado, "no_aplica");
  assert.equal(por("prescripcion_tributaria")?.estado, "por_confirmar");
  assert.equal(por("tgr_condonacion")?.estado, "aplica");
  assert.match(por("tgr_condonacion")!.resultado, /quedan 157 días/);
  assert.ok(por("f29_sin_movimiento") && por("termino_giro_sii") && por("termino_giro"));
  const f = fuentesDe(r);
  assert.equal(new Set(f.map((x) => x.url)).size, f.length);
  assert.ok(f.every((x) => x.url.startsWith("https://")));
});
prueba("Enjambre: toda revisión cita una regla con fuente", () => {
  for (const venta of ["facturas", "honorarios", "ambas", "sin_inicio", "inactivo"] as const) {
    const r = enjambrePersona({ venta, declara: "no_se", futuro: "no_se", deudas: "no_se", contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" } as PersonaAnswers, hoy);
    assert.ok(r.length > 0, venta);
    for (const x of r) assert.ok(x.fuente.titulo.length > 5, x.norma);
  }
});

// ---------- Documentos legales ----------
prueba("Documento sin versión aprobada: en revisión jurídica, no se puede firmar", () => {
  assert.equal(estadoDocumento({ code: "DOC-CONTRATO", scope: "empresa", title: "Contrato", document_id: null, version: null, firma: null }), "sin_aprobar");
});
prueba("Resumen legal: listo solo cuando no falta nada", () => {
  const s: CaseLegalStatus = {
    faltan: ["DOC-VERACIDAD"],
    documentos: [
      { code: "DOC-CONTRATO", scope: "empresa", title: "Contrato", document_id: "a", version: 1, firma: { id: "f", fecha: "2026-11-10", firmante: "María" } },
      { code: "DOC-VERACIDAD", scope: "caso", title: "Veracidad", document_id: "b", version: 1, firma: null },
    ],
    fichas: [],
  };
  const r = resumenLegal(s);
  assert.equal(r.listo, false);
  assert.equal(r.porFirmar, 1);
  assert.equal(r.texto, "1 por firmar");
  assert.equal(resumenLegal({ ...s, faltan: [] }).listo, true);
});
prueba("Vista previa: datos de la empresa sí, datos de quien firma quedan por completar", () => {
  const t = renderPreview("{{EMPRESA}} RUT {{RUT_EMPRESA}} firma {{FIRMANTE}}", { empresa: "Pyme SpA", rut: "76.123.456-0" });
  assert.equal(t, "Pyme SpA RUT 76.123.456-0 firma [tu nombre]");
});

// ---------- Command Center ----------
prueba("Ejecutivo: resueltos en el período, mediana, cobros y satisfacción", () => {
  const ahora = Date.parse("2026-11-09T12:00:00Z");
  const d = (n: number) => new Date(ahora - n * 86_400_000).toISOString();
  const e = ejecutivo(
    [
      { id: "a", module: "contabilidad", status: "cerrado", created_at: d(20), closed_at: d(10), due_date: null, responsible_id: "u" },
      { id: "b", module: "contabilidad", status: "cerrado", created_at: d(40), closed_at: d(5), due_date: null, responsible_id: "u" },
      { id: "c", module: "legal", status: "en_ejecucion", created_at: d(3), closed_at: null, due_date: "2026-11-01", responsible_id: null },
      { id: "e", module: "legal", status: "cerrado", created_at: d(100), closed_at: d(60), due_date: null, responsible_id: "u" },
    ],
    [{ amount: 100000, status: "pagado", due_date: "2026-11-01", paid_at: d(2) }, { amount: 30000, status: "pendiente", due_date: "2026-10-30", paid_at: null }],
    [{ case_id: "a", resuelto: "si", satisfaccion: 5, created_at: d(9) }, { case_id: "b", resuelto: "no", satisfaccion: 2, created_at: d(4) }],
    [{ monto: 120000, estado: "verificado" }, { monto: 9, estado: "propuesto" }],
    30, ahora,
  );
  assert.equal(e.casos.resueltos, 2);
  assert.equal(e.casos.mediana_dias, 22.5);
  assert.equal(e.casos.atrasados, 1);
  assert.equal(e.finanzas.cobrado, 100000);
  assert.equal(e.finanzas.vencido, 30000);
  assert.equal(e.experiencia.satisfaccion, 3.5);
  assert.equal(e.ahorro.verificado, 120000);
});

// ---------- Operación de agentes ----------
prueba("Agentes: alerta por fallas y por baja aceptación", () => {
  const ahora = Date.now();
  const runs: Run[] = Array.from({ length: 10 }, (_, i) => ({
    id: `r${i}`, case_id: "c", agent: "legal", status: i < 4 ? "fallida" : "completada", model: "claude",
    input_tokens: 1000, output_tokens: 200, error: i < 4 ? "http_529" : null, created_at: new Date(ahora - i * 3600_000).toISOString(),
  }));
  const props = [
    { run_id: "r5", status: "aceptada" as const, created_at: new Date(ahora).toISOString() },
    ...Array.from({ length: 6 }, () => ({ run_id: "r6", status: "descartada" as const, created_at: new Date(ahora).toISOString() })),
  ];
  const op = operacion(runs, props, [], ahora);
  const titulos = op.alertas.map((a) => a.titulo).join(" | ");
  assert.match(titulos, /40% de ejecuciones fallidas/);
  assert.match(titulos, /solo 14% de sus propuestas/);
});

// ---------- Lector de avisos del SII (caso real DJ 1947) ----------
prueba("Aviso SII: reconoce la DJ 1947 y la conecta con la ruta aprendida", () => {
  const aviso = `Junto con saludar, le informamos que como usted desarrolla actividades de primera categoría, debe dar cumplimiento a diferentes obligaciones tributarias, por lo que se encuentra obligado a presentar la(s) Declaración(es) Jurada(s) N° 1947 del AT 2026, y no la(s) ha presentado. Atentamente, Servicio de Impuestos Internos`;
  const a = leerAvisoSII(aviso);
  assert.equal(a.esAviso, true);
  assert.deepEqual(a.djs, ["1947"]);
  assert.equal(a.anioTributario, 2026);
  assert.equal(a.playbooks[0]?.id, "propyme_transparente_sin_renta");
  assert.match(contextoAviso(aviso), /primero la 1947, después el F22/);
  assert.equal(contextoAviso("Quiero abrir una cafetería en Ñuñoa"), "");
});

prueba("Base de conocimiento: el caso real llega a los agentes con sus aprendizajes", () => {
  const k = knowledgeFor("tributario");
  assert.match(k, /DJ 1947/);
  assert.match(k, /Aprendido de un caso real ENQORA/);
  const caso = PLAYBOOKS.find((p) => p.id === "propyme_transparente_sin_renta");
  assert.ok(caso?.origen?.aprendizajes.length);
  for (const n of caso!.normas) assert.ok(RULES[n], `norma inexistente: ${n}`);
});

prueba("Enjambre: persona con negocio que no declara recibe la revisión de renta y DJ 1947", () => {
  const rs = enjambrePersona({ venta: "facturas", declara: "no", deudas: "no", contador: "nadie", trabajadores: "no", lugar: "casa", cuentas: "si", crecer: "no", marca: "no" } as never, new Date("2026-11-13T12:00:00-03:00"));
  assert.ok(rs.some((r) => r.norma === "dj_1947"));
});

prueba("Laboral: el trabajador despedido va a Soluciones laborales con aviso de plazo (art. 168)", () => {
  const a = analizarReglas("Me despidieron la semana pasada y creo que fue injustificado, mi jefe no me pagó el finiquito");
  assert.equal(a.categorias[0], "trabajador");
  assert.ok(!a.categorias.includes("profesionales"));
  assert.ok(a.documentos.includes("carta_despido"));
  assert.match(urgenciaLaboral("me despidieron ayer", a.categorias) ?? "", /60 días hábiles.*90 días hábiles/);
});

prueba("Laboral: el empleador demandado va a Defensa laboral empresarial, nunca al lado del trabajador", () => {
  const a = analizarReglas("Un trabajador me demandó por despido injustificado, ¿cómo defiendo mi empresa?");
  assert.deepEqual(a.categorias.filter((c) => c === "trabajador" || c === "empleador"), ["empleador"]);
  assert.ok(a.documentos.includes("demanda"));
  assert.match(urgenciaLaboral("me notificaron la demanda", ["empleador"]) ?? "", /notificación/);
});

prueba("Laboral: las reglas de plazos existen con fuente oficial y llegan al agente legal", () => {
  for (const r of ["despido_plazo_168", "tutela_486_489", "prescripcion_laboral_510"]) assert.ok(RULES[r]?.fuente?.url, r);
  assert.match(knowledgeFor("legal"), /despido injustificado/);
});

prueba("Informa: el Director IA toma primero lo pedido y luego los departamentos más atrasados, sin repetir", () => {
  const plan = planificar({
    pedidas: [{ id: "m1", departamento: "laboral", tema: "Ley 40 horas" }, { id: "m2", departamento: "laboral", tema: "Otra" }],
    ultimas: { tributario: "2026-11-10", contable: "2026-11-01", legal: null, laboral: "2026-11-12", empresas: "2026-11-11", marcas: "2026-11-09", financiero: "2026-11-08", municipal: "2026-11-07" },
  });
  assert.deepEqual(plan.map((m) => [m.departamento, m.origen]), [["laboral", "demanda"], ["legal", "programada"]]);
  assert.equal(plan[0].id, "m1");
});

prueba("Informa: sin pedidos, investiga los dos departamentos que llevan más tiempo sin revisar", () => {
  const plan = planificar({ pedidas: [], ultimas: { tributario: "2026-11-10", contable: "2026-11-01", legal: "2026-11-02", laboral: "2026-11-12", empresas: "2026-11-11", marcas: "2026-11-09", financiero: "2026-11-08", municipal: "2026-11-07" } });
  assert.deepEqual(plan.map((m) => m.departamento), ["contable", "legal"]);
});

prueba("Bóveda: el documento se muestra sin HTML del autor y resalta lo que falta", () => {
  const h = markdownSeguro("# Poder\n<script>alert(1)</script>\nTitular: **Marcas SpA**, RUT [COMPLETAR: RUT del titular]\n- uno\n- dos");
  assert.ok(!h.includes("<script>"));
  assert.match(h, /&lt;script&gt;/);
  assert.match(h, /<h1>Poder<\/h1>/);
  assert.match(h, /<mark class="doc-completar">\[COMPLETAR: RUT del titular\]<\/mark>/);
  assert.match(h, /<ul>\n<li>uno<\/li>/);
});

prueba("Bóveda: el Archivero reconoce el pedido y el catálogo solo cita reglas que existen", () => {
  assert.equal(interpretarPedido("Necesito el documento para registrar mi marca en INAPI").key, "antecedentes_marca");
  assert.equal(interpretarPedido("Hay que preparar el finiquito de Juan").key, "finiquito");
  assert.equal(interpretarPedido("Quiero pedir convenio y condonación en Tesorería").key, "solicitud_condonacion");
  assert.equal(interpretarPedido("algo que no calza").key, "otro");
  for (const t of TIPOS) for (const k of t.normas) assert.ok(RULES[k], `${t.key} cita ${k}`);
});

prueba("ENQORA SIGN: mapa de firma y código de verificación", () => {
  assert.equal(admiteFirma("contrato_trabajo", "contrato").ok, true);
  assert.equal(admiteFirma("finiquito", "contrato").ok, false);
  assert.equal(admiteFirma("x", "respaldo_laboral").ok, false);
  for (const t of TIPOS) if (t.key !== "finiquito") assert.equal(admiteFirma(t.key, t.clase).ok, true, t.key);
  const sello = "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdefabcdef";
  assert.equal(codigoVerificacion(sello), "A1B2-C3D4-E5F6-0718-293A");
  assert.equal(normalizarCodigo("A1B2-C3D4-E5F6-0718-293A"), sello.slice(0, 20));
  assert.ok(FOLIO_RE.test("FIR-2026-000123") && FOLIO_RE.test("DOC-2026-000001") && !FOLIO_RE.test("FIR-26-1"));
});

prueba("ENQORA SIGN: verificación de llave de acceso (WebAuthn ES256 y EdDSA)", () => {
  const rpId = "enqora.cl", origin = "https://enqora.cl", desafio = b64u(sha256("doc|firmante"));
  const authData = (flags: number, contador: number) => { const b = Buffer.alloc(37); sha256(rpId).copy(b, 0); b[32] = flags; b.writeUInt32BE(contador, 33); return b; };
  const cd = (type: string, ch = desafio, o = origin) => Buffer.from(JSON.stringify({ type, challenge: ch, origin: o }));
  for (const [tipo, alg] of [["ec", -7], ["ed25519", -8]] as const) {
    const { publicKey, privateKey } = tipo === "ec" ? generateKeyPairSync("ec", { namedCurve: "P-256" }) : generateKeyPairSync("ed25519");
    const spki = b64u(publicKey.export({ format: "der", type: "spki" }));
    verificarRegistro({ credentialId: "credencial-de-prueba-123", clientDataJSON: b64u(cd("webauthn.create")), authenticatorData: b64u(authData(0x05, 0)), publicKey: spki, alg }, desafio, rpId, origin);
    assert.throws(() => verificarRegistro({ credentialId: "credencial-de-prueba-123", clientDataJSON: b64u(cd("webauthn.create")), authenticatorData: b64u(authData(0x01, 0)), publicKey: spki, alg }, desafio, rpId, origin), /uv/);
    const ad = authData(0x05, 7), cdj = cd("webauthn.get");
    const datos = Buffer.concat([ad, sha256(cdj)]);
    const sig = alg === -8 ? firmarCripto(null, datos, privateKey) : firmarCripto("sha256", datos, { key: privateKey, dsaEncoding: "der" });
    const as = { credentialId: "credencial-de-prueba-123", clientDataJSON: b64u(cdj), authenticatorData: b64u(ad), signature: b64u(sig) };
    assert.equal(verificarAsercion(as, { public_key: spki, alg }, desafio, rpId, origin).contador, 7);
    assert.throws(() => verificarAsercion(as, { public_key: spki, alg }, b64u(sha256("otro documento")), rpId, origin), /desafio/);
    assert.throws(() => verificarAsercion(as, { public_key: spki, alg }, desafio, "phishing.cl", origin), /rpId/);
    assert.throws(() => verificarAsercion({ ...as, signature: b64u(Buffer.from(sig).reverse()) }, { public_key: spki, alg }, desafio, rpId, origin));
  }
});

prueba("CORA: recepción final antes de la patente del local", () => {
  const base = { venta: "facturas", deudas: "no", contador: "contador", trabajadores: "no", lugar: "local", cuentas: "si", crecer: "no", marca: "no" } as const;
  const hoy = new Date("2026-11-17T12:00:00-03:00");
  const ids = (x: object) => investigarPersona({ ...base, ...x } as PersonaAnswers, [], hoy).necesidades.map((n) => n.servicio?.id ?? "");
  assert.ok(preguntaVisible("recepcion", { venta: "facturas", lugar: "local" }));
  assert.ok(!preguntaVisible("recepcion", { venta: "facturas", lugar: "casa" }));
  assert.ok(ids({ recepcion: "si" }).includes("patente") && !ids({ recepcion: "si" }).includes("recepcion_patente"));
  assert.ok(ids({ recepcion: "no" }).includes("recepcion_patente") && !ids({ recepcion: "no" }).includes("patente"));
  assert.ok(ids({ recepcion: "no_se" }).includes("recepcion_patente"));
});

prueba("Líneas de servicio: folio y código de solicitud", () => {
  assert.equal(lineaDeFolio("LAB-2026-00031"), "LAB");
  assert.equal(lineaDeFolio("SOL-TRI-7KQ2XA"), "TRI");
  assert.equal(lineaDeFolio("ENQ-2026-00015"), null);
  assert.equal(lineaDeModulo("brand"), "BRA");
  assert.equal(lineaDeCategoria("empleador"), "LAB");
  assert.equal(lineaDeCategoria("enterprise"), null);
});

prueba("Informe de ingreso: solo fuentes de la lista, plazo fijo y precio del catálogo", () => {
  const relato = "Me despidieron hace dos semanas sin carta de aviso y no me pagaron las horas extra.";
  const e: Entrada = {
    relato, analisis: { resumen: "Despido sin aviso", categorias: ["trabajador"], urgencia: urgenciaLaboral(relato, ["trabajador"]) }, linea: "LAB",
    razonSocial: null, perfil: null, publicaciones: [], documentosCliente: ["carta.jpg"], lecciones: [], aviso: "",
    catalogo: [{ code: "LEG-01", module: "legal", name: "Defensa del trabajador", summary: null, unit: "caso", price_from: null }, { code: "CON-01", module: "contabilidad", name: "Contabilidad", summary: null, unit: "mes", price_from: 50000 }],
  };
  const fuentes = armarFuentes(e);
  const plazo = fuentes.find((f) => f.tipo === "plazo");
  assert.ok(plazo && /60 días hábiles/.test(plazo.texto));
  assert.ok(fuentes.some((f) => f.tipo === "documento"));
  const norma = fuentes.find((f) => f.tipo === "norma")!;
  const r = sanear({
    pide: "Defensa por despido sin aviso", confianza: "media", documentos: ["carta_despido", "inventado"], faltantes: [], preguntas: [], mensaje_cliente: "Hola",
    hechos: [{ texto: "Fue despedido", fuente: "relato", certeza: "alta" }, { texto: "Norma inventada", fuente: "F999", certeza: "alta" }],
    ruta: [{ texto: "Revisar plazo", fuente: norma.id, certeza: "alta" }], riesgos: [], servicio: "CON-01", contraparte: "Comercial Sur",
  }, e, fuentes);
  assert.ok(r);
  assert.equal(r.descartes, 1);
  assert.equal(r.informe.hechos.length, 1);
  assert.equal(r.informe.hechos[0].certeza, "media");
  assert.deepEqual(r.informe.documentos, ["carta_despido"]);
  assert.equal(r.informe.servicio, null);
  assert.equal(r.informe.urgencia?.texto, plazo.texto);
  assert.equal(r.informe.contraparte, "Comercial Sur");
  assert.equal(sanear({ pide: "" }, e, fuentes), null);
  const reglas = informePorReglas(e, fuentes);
  assert.equal(reglas.confianza, "baja");
  assert.equal(reglas.servicio, null);
  assert.equal(anonimizar("RUT 12.345.678-5, correo a@b.cl"), "RUT [RUT], correo [correo]");
});

prueba("Tu mes: cada etapa cae en su paso", () => {
  assert.equal(pasoDe("esperando_datos"), 0);
  assert.equal(pasoDe("datos"), 0);
  assert.equal(pasoDe("revision"), 1);
  assert.equal(pasoDe("por_aprobar"), 2);
  assert.equal(pasoDe("aprobado_cliente"), 3);
  assert.equal(pasoDe("presentado"), 3);
});

prueba("Registrar gasto: lectura de voz y validación de la IA", () => {
  const hoy = "2026-11-20";
  const a = gastoDesdeTexto("gasté 15.990 en bencina con boleta", hoy)!;
  assert.equal(a.monto, 15990); assert.equal(a.categoria, "combustible"); assert.equal(a.documento, "boleta"); assert.equal(a.fecha, hoy);
  const b = gastoDesdeTexto("ayer pagué 45 mil de arriendo de bodega, sin boleta", hoy)!;
  assert.equal(b.monto, 45000); assert.equal(b.documento, "sin_documento"); assert.equal(b.fecha, "2026-11-19"); assert.equal(b.categoria, "arriendo");
  assert.equal(gastoDesdeTexto("el 12 de noviembre compré bolsas por 3.500 con factura", hoy)!.monto, 3500);
  assert.equal(gastoDesdeTexto("compré bolsas", hoy), null);
  assert.equal(validarGasto({ monto: 0, descripcion: "x", categoria: "otros", documento: "boleta", confianza: "alta" }, hoy), null);
  assert.equal(validarGasto({ monto: 5000, es_comprobante: false }, hoy), null);
  const v = validarGasto({ monto: 11900, iva: 1900, fecha: "2027-01-01", descripcion: "Resmas", categoria: "inventada", documento: "factura", confianza: "alta" }, hoy)!;
  assert.equal(v.fecha, hoy); assert.equal(v.categoria, "otros"); assert.equal(v.iva, 1900);
});

prueba("Punto de venta: resumen por día, medios de pago y cruce con el RCV", () => {
  assert.equal(medioDePago("Redcompra"), "debito");
  assert.equal(medioDePago("Tarjeta de Crédito VISA"), "credito");
  assert.equal(medioDePago("EFECTIVO"), "efectivo");
  assert.equal(medioDePago("MercadoPago"), "transferencia");
  assert.equal(medioDePago("fiado"), "otros");
  const r = resumirPorDia([
    { fecha: "2026-11-20", total: 1000, medio: "efectivo" }, { fecha: "2026-11-20", total: 2500, medio: "débito" },
    { fecha: "2026-11-19", total: 500, medio: "transferencia", iva: 80 }, { fecha: null, total: 9 }, { fecha: "2026-11-19", total: null },
  ]);
  assert.equal(r.descartadas, 2);
  assert.equal(r.dias.length, 2);
  assert.equal(r.dias[0].fecha, "2026-11-19"); assert.equal(r.dias[0].iva, 80); assert.equal(r.dias[1].iva, null);
  assert.equal(r.dias[1].total, 3500); assert.equal(r.dias[1].n_ventas, 2); assert.equal(r.dias[1].debito, 2500);
  assert.equal(alertaCruce(0, 100), "sin_datos");
  assert.equal(alertaCruce(100000, 99000), "cuadra");
  assert.equal(alertaCruce(100000, 80000), "pos_mayor");
  assert.equal(alertaCruce(100000, 130000), "revisar");
});

prueba("Conciliador: propone (no aplica) y pregunta lo que no puede explicar", () => {
  const m = (id: string, fecha: string, glosa: string, monto: number) => ({ id, movement_date: fecha, description: glosa, amount: monto });
  const movs = [
    m("a", "2026-10-05", "PAGO FACT 1234 PROVEEDOR 76086428", -119000),
    m("b", "2026-10-31", "COMISION MANTENCION CUENTA", -4990),
    m("c", "2026-10-15", "PAGO PREVIRED", -210000),
    m("d", "2026-10-21", "ABONO TRANSBANK", 196000),
    m("e", "2026-10-12", "TRANSF A JUAN PEREZ", -150000),
    m("f", "2026-10-13", "COMPRA MENOR", -3500),
  ];
  const p = proponer(movs, [{ movement_id: "a", document_id: "doc1", score: 4, days: 2 }], [{ fecha: "2026-10-20", tarjetas: 200000 }]);
  const de = (id: string) => p.find((x) => x.movement_id === id);
  assert.equal(de("a")?.tipo, "documento"); assert.equal(de("a")?.certeza, "alta");
  const cat = (id: string) => { const x = de(id); return x?.tipo === "categoria" ? x.categoria : null; };
  assert.equal(cat("b"), "comision_bancaria");
  assert.equal(cat("c"), "remuneraciones");
  assert.equal(de("d")?.certeza, "alta");
  assert.equal(de("e"), undefined);
  const q = preguntasPara(movs, p);
  assert.equal(q.length, 1);
  assert.equal(q[0].movement_id, "e");
  assert.ok(q[0].opciones.includes("Retiro personal"));
  assert.equal(CATEGORIA_DE_RESPUESTA["No lo reconozco"], null);
});

prueba("Empresa al día: preguntas por tamaño y semáforo por riesgo", () => {
  const solo = { tipo: "persona" as const, trabajadores: 0, local: false, rubro_regulado: false, vende_a_personas: true };
  const ids = (p: typeof solo) => preguntasEmpresa(p).map((q) => q.id);
  assert.ok(!ids(solo).includes("contratos"));
  assert.ok(ids({ ...solo, trabajadores: 1 }).includes("karin"));
  assert.ok(!ids({ ...solo, trabajadores: 4 }).includes("lre"));
  assert.ok(ids({ ...solo, trabajadores: 5 }).includes("lre"));
  assert.ok(ids({ ...solo, trabajadores: 12 }).includes("delegado"));
  assert.ok(!ids({ ...solo, trabajadores: 30 }).includes("delegado"));
  assert.ok(ids({ ...solo, trabajadores: 30 }).includes("comite"));
  assert.ok(ids({ ...solo, local: true }).includes("recepcion"));
  const todoSi = Object.fromEntries(preguntasEmpresa(solo).map((q) => [q.id, "si" as const]));
  const r1 = diagnosticar(solo, todoSi);
  assert.equal(r1.puntaje, 100);
  assert.ok(r1.frentes.every((f) => f.semaforo === "verde"));
  const r2 = diagnosticar(solo, { ...todoSi, f29: "no", marca: "no_se" });
  assert.equal(r2.frentes.find((f) => f.frente === "sii")?.semaforo, "rojo");
  assert.equal(r2.frentes.find((f) => f.frente === "municipal")?.semaforo, "amarillo");
  assert.equal(r2.pendientes[0].id, "f29");
});

prueba("Calendario de cumplimiento: vencimientos según el perfil y avisos 7 y 1 día antes", () => {
  const base = { tipo: "empresa" as const, trabajadores: 0, local: true, rubro_regulado: false, vende_a_personas: true };
  const sin = vencimientos(base, "2026-12-20", 60).map((v) => v.clave);
  assert.ok(sin.includes("f29:2027-01-12"));
  assert.ok(sin.includes("patente:2027-01-31"));
  assert.ok(!sin.some((c) => c.startsWith("previred")));
  const con = vencimientos({ ...base, trabajadores: 6 }, "2026-12-20", 60).map((v) => v.clave);
  assert.ok(con.includes("previred:2027-01-13"));
  assert.ok(con.includes("lre:2027-01-15"));
  assert.ok(!con.some((c) => c.startsWith("inclusion")));
  const abril = vencimientos(base, "2027-04-01", 40).map((v) => v.clave);
  assert.ok(abril.includes("f22:2027-04-30"));
  const f29 = vencimientos(base, "2026-12-05", 10).find((v) => v.clave === "f29:2026-12-12")!;
  assert.ok(tocaAvisar("2026-12-05", f29));
  assert.ok(tocaAvisar("2026-12-11", f29));
  assert.ok(!tocaAvisar("2026-12-08", f29));
  const fechas = vencimientos({ ...base, trabajadores: 6 }, "2026-12-20", 60).map((v) => v.fecha);
  assert.deepEqual(fechas, [...fechas].sort());
});

prueba("Remuneraciones: liquidación, topes, impuesto único y validaciones", () => {
  // Valores de PRUEBA (no son los oficiales del mes): solo verifican la aritmética del motor.
  const p: Parametros = { uf: 40000, utm: 72000, imm: 539000, tope_afp_uf: 90, tope_afc_uf: 135.2, afp: { Modelo: 10.58 }, sis: 1.62,
    aporte_ci: 0.1, aporte_ev: 0.5, aporte_rp: 0.4, afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7 };
  const t: Trabajador = { id: "t", nombre: "Ana", tipo_contrato: "indefinido", sueldo_base: 800000, jornada_horas: 42, afp: "Modelo", salud: "fonasa",
    plan_isapre_uf: null, colacion: 50000, movilizacion: 0, gratificacion: "art50" };
  const n = leerNovedades({})!;
  const l = liquidar(t, n, p, 0.93);
  assert.equal(l.total_imponible, 1000000); // 800.000 + gratificación 25% (200.000, bajo el tope 213.354)
  assert.equal(l.base_tributable, 818200);
  assert.equal(l.descuentos.find((d) => d.concepto.startsWith("Impuesto")), undefined); // 11,4 UTM: exento
  assert.equal(l.liquido, 868200);
  assert.equal(l.costo_empresa, 1109500);
  assert.equal(impuestoUnico(2000000, 72000), 41120);
  assert.equal(impuestoUnico(10000000, 72000), 1820960);
  assert.equal(impuestoUnico(972000, 72000), 0);
  const alto = liquidar({ ...t, sueldo_base: 5000000, gratificacion: "ninguna", colacion: 0 }, n, p, 0.93);
  assert.equal(alto.descuentos[0].monto, Math.round(3600000 * 0.1058)); // AFP sobre el tope de 90 UF
  assert.ok(alto.advertencias.some((a) => a.includes("tope")));
  const plazo = liquidar({ ...t, tipo_contrato: "plazo_fijo" }, n, p, 0.93);
  assert.ok(!plazo.descuentos.some((d) => d.concepto.startsWith("Seguro")));
  assert.equal(plazo.aportes_empleador[0].monto, 30000);
  const isapre = liquidar({ ...t, salud: "isapre", plan_isapre_uf: 3 }, n, p, 0.93);
  assert.equal(isapre.descuentos[1].monto, 120000); // plan 3 UF > 7%
  assert.equal(isapre.base_tributable, 818200); // rebaja solo el 7% legal
  const medio = liquidar(t, { ...n, dias_trabajados: 15 }, p, 0.93);
  assert.equal(medio.haberes_imponibles[0].monto, 400000);
  assert.equal(normalizarRut("12.345.678-5"), "12345678-5");
  assert.equal(normalizarRut("12345678-K"), null);
  assert.equal(leerParametros({ ...p, uf: "40000" }), null);
  assert.equal(leerParametros({ ...p, afp: {} }), null);
  assert.equal(leerNovedades({ dias_trabajados: 31 }), null);
});

prueba("Remuneraciones: archivos de Previred (105 campos) y LRE", () => {
  const p: Parametros = { uf: 40000, utm: 72000, imm: 539000, tope_afp_uf: 90, tope_afc_uf: 135.2, afp: { Uno: 10.46 }, sis: 1.5,
    aporte_ci: 0.1, aporte_ev: 1, aporte_rp: 0.9, afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7 };
  const t: Trabajador = { id: "t", nombre: "Ana", tipo_contrato: "indefinido", sueldo_base: 800000, jornada_horas: 42, afp: "Uno", salud: "fonasa",
    plan_isapre_uf: null, colacion: 50000, movilizacion: 0, gratificacion: "art50" };
  const liq = liquidar(t, leerNovedades({})!, p, 0.93);
  const ficha = { rut: "12345678-5", apellido_paterno: "Pérez", apellido_materno: "Soto", nombres: "Ana", sexo: "F" as const, extranjero: false,
    fecha_ingreso: "2026-11-03", fecha_baja: null, causal_termino: null, tipo_contrato: "indefinido" as const, jornada_horas: 42, jornada_lre: 101,
    afp: "Uno", salud: "fonasa" as const, isapre: null, fun: null, plan_isapre_uf: null, comuna: 13101, nombre: "Ana Pérez Soto" };
  const fila: FilaArchivo = { ficha, dias: 30, montos: liq.montos };
  const emp = { mutual: "ACHS", tasa_mutual: 0.93, mutual_sucursal: 1, ccaf: 0 };
  assert.deepEqual(faltantesArchivo(fila, emp), []);
  assert.ok(faltantesArchivo({ ...fila, ficha: { ...ficha, comuna: null } }, emp).includes("comuna donde presta servicios"));
  assert.ok(faltantesArchivo(fila, { ...emp, ccaf: 1 }).some((x) => x.includes("CCAF")));
  const c = ["", ...archivoPrevired([fila], emp, "2026-11").trim().split(";")];
  assert.equal(c.length, 106);
  assert.equal(c[1], "12345678"); assert.equal(c[2], "5"); assert.equal(c[9], "112026"); assert.equal(c[15], "1"); assert.equal(c[16], "03-11-2026");
  assert.equal(c[26], "35"); assert.equal(c[27], "1000000");
  assert.equal(c[28], String(104600 + 1000)); // 10,46% del trabajador + 0,1% de capitalización individual
  assert.equal(c[29], "15000"); assert.equal(c[70], "70000"); assert.equal(c[75], "07"); assert.equal(c[93], "1");
  assert.equal(c[94], "10000"); assert.equal(c[95], "9000"); assert.equal(c[96], "01"); assert.equal(c[98], "9300"); assert.equal(c[101], "6000");
  const lre = archivoLre([fila], emp, "2026-11").trim().split("\r\n");
  const cab = encabezadoLre().split(";");
  const val = lre[1].split(";");
  assert.equal(cab.length, val.length);
  const v = (cod: number) => val[cab.findIndex((h) => h.endsWith(`(${cod})`))];
  assert.equal(v(1101), "12345678-5"); assert.equal(v(1102), "03/11/2026"); assert.equal(v(1105), "13"); assert.equal(v(1141), "19");
  assert.equal(v(1143), "102"); assert.equal(v(5501), String(liq.liquido)); assert.equal(v(5210), String(liq.total_imponible));
  assert.equal(v(4155), String(15000 + 1000 + 10000 + 9000));
  assert.ok(esParcial(28, "2026-11") && !esParcial(30, "2026-11") && esParcial(29, "2026-03"));
});

prueba("Ley Karin: validación de datos y borradores del protocolo y del procedimiento", () => {
  const base = { razon_social: "Andes SpA", rut: "76086428-5", domicilio: "Av. Siempre Viva 123, Santiago", representante: "Ana Pérez",
    cargo_representante: "Gerente general", rubro: "Comercio minorista", trabajadores: "6", atiende_publico: "si", teletrabajo: "no",
    canal_correo: "denuncias@andes.cl", canal_responsable: "Encargada de personas", investigacion: "interna", organismo: "ACHS" };
  assert.equal(typeof validarDatos({ ...base, rut: "76.086.428-5" }), "string");
  assert.equal(typeof validarDatos({ ...base, canal_correo: "no-es-correo" }), "string");
  const d = validarDatos(base);
  assert.ok(typeof d !== "string");
  if (typeof d === "string") return;
  const p = generarDocumento("protocolo_karin", d, "21-11-2026");
  assert.ok(p.includes("Anexo N°54") && p.includes("clientes o usuarios agresivos") && p.includes("al firmar su contrato"));
  assert.ok(!p.includes("<"));
  const p10 = generarDocumento("protocolo_karin", { ...d, trabajadores: 25, atiende_publico: false }, "21-11-2026");
  assert.ok(p10.includes("CEAL-SM/SUSESO") && p10.includes("art. 154 N°12") && !p10.includes("agresivos"));
  const pr = generarDocumento("procedimiento_karin", d, "21-11-2026");
  assert.ok(pr.includes("3 días") && pr.includes("30 días") && pr.includes("15 días") && pr.includes("25%"));
  assert.ok(recordatorios({ ...d, trabajadores: 25 }).some((x) => x.includes("SEREMI")));
  assert.ok(recordatorios(d).some((x) => x.includes("al firmar cada contrato")));
});

prueba("Política de datos personales: validación y contenido del art. 14 ter", () => {
  const base = { razon_social: "Andes SpA", rut: "76086428-5", domicilio: "Av. Siempre Viva 123, Santiago", representante: "Ana Pérez",
    correo: "privacidad@andes.cl", sitio: "", encargado: "", internacional: "", automatizadas: "no" };
  assert.equal(typeof validarPolitica({ ...base, grupos: [] }), "string");
  assert.equal(typeof validarPolitica({ ...base, correo: "x", grupos: ["clientes"] }), "string");
  const d = validarPolitica({ ...base, grupos: ["clientes", "trabajadores", "inventado"], destinatarios: ["contabilidad", "publicos"] });
  assert.ok(typeof d !== "string");
  if (typeof d === "string") return;
  assert.deepEqual(d.grupos, ["clientes", "trabajadores"]);
  const p = generarPolitica(d, "21-11-2026");
  for (const x of ["Andes SpA", "privacidad@andes.cl", "Clientes:", "Personas trabajadoras:", "portabilidad", "30 días corridos", "Agencia de Protección de Datos Personales", "No transferimos datos personales fuera de Chile"]) assert.ok(p.includes(x), x);
  assert.ok(!p.includes("Postulantes"));
  const p2 = generarPolitica({ ...d, internacional: "nube en Estados Unidos", automatizadas: true }, "21-11-2026");
  assert.ok(p2.includes("nube en Estados Unidos") && p2.includes("lógica aplicada"));
});

prueba("Marcas INAPI: encabezados, fechas de Excel, vigencia y normalización", () => {
  const H = ["ApplicationType","ApplicationSeq","ApplicationSerie","ApplicationNumber","RegistrationNumber","NizaClasses","VienaClasses","Regions","Applicants","Representatives","LocationApplicants","StateApplicants","LocationRepresentatives","StateRepresentatives","FilingDate","PublicationDate","RegistrationDate","ExpirationDate","BrandName","Translation","LabelDescription","ProtectionDescription","SignType","TypeName","SubtypeName","Status","IMAGE","LastUpdatedDate"];
  const fila = (o: Record<string, string>) => H.map((h) => o[h] ?? "");
  const filas = [[""], H,
    fila({ ApplicationType: "M", ApplicationSeq: "A", ApplicationSerie: "1", ApplicationNumber: "1314225", RegistrationNumber: "1495402", NizaClasses: "7", Applicants: "(IT) Trelleborg", FilingDate: "43502", RegistrationDate: "46147", ExpirationDate: "49800", BrandName: "vulcan", SignType: "Mixta", Status: "Registrada", IMAGE: "https://buscadormarcas.inapi.cl/etiqueta/?s=1314225", LastUpdatedDate: "46347.27" }),
    fila({ ApplicationType: "M", ApplicationSeq: "A", ApplicationSerie: "1", ApplicationNumber: "1653980", NizaClasses: "45", BrandName: "DefiéndeTE", Status: "Denegada", FilingDate: "46023" }),
    fila({ ApplicationType: "M", ApplicationSeq: "A", ApplicationSerie: "1", ApplicationNumber: "1286963", RegistrationNumber: "1", NizaClasses: "1 ,12 ,16 ,2", BrandName: "RENOLIT", Status: "Registrada", ExpirationDate: "40000" }),
    fila({ ApplicationNumber: "total" }),
  ];
  const r = prepararFilasMarcas(filas, new Date("2026-11-21T12:00:00Z"));
  assert.ok(!("error" in r));
  if ("error" in r) return;
  assert.equal(r.filas.length, 3);
  const [v, d, x] = r.filas;
  assert.equal(v.clave, "M-A-1-1314225"); assert.equal(v.presentada, "2019-02-06"); assert.equal(v.vence, "2036-05-05"); assert.ok(v.vigente);
  assert.equal(v.etiqueta, "https://buscadormarcas.inapi.cl/etiqueta/?s=1314225");
  assert.ok(!d.vigente); assert.equal(d.nombre_norm, "defiendete");
  assert.deepEqual(x.clases, [1, 12, 16, 2]); assert.ok(!x.vigente); // vencida en 2009
  assert.equal(fechaExcel("46347.27"), "2026-11-21"); assert.equal(fechaExcel("45658"), "2025-01-01");
  assert.ok(esVigente("Registrada", "2026-08-01", new Date("2026-11-21")) && !esVigente("Registrada", "2026-03-01", new Date("2026-11-21")));
  assert.ok(esVigente("En trámite", null, new Date()) && !esVigente("Caducada", null, new Date()));
  assert.equal(normalizarMarca("  Café & Ñandú—Plus "), "cafe nandu plus"); assert.equal(normalizarMarca("ŠKODA"), "skoda");
  assert.ok("error" in prepararFilasMarcas([["a", "b"]], new Date()));
});

prueba("Remuneraciones: APV régimen A y B (art. 42 bis) en el cálculo y en los archivos", () => {
  const p: Parametros = { uf: 40000, utm: 72000, imm: 539000, tope_afp_uf: 90, tope_afc_uf: 135.2, afp: { Uno: 10.46 }, sis: 1.5,
    aporte_ci: 0.1, aporte_ev: 1, aporte_rp: 0.9, afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7 };
  const t: Trabajador = { id: "t", nombre: "Ana", tipo_contrato: "indefinido", sueldo_base: 2000000, jornada_horas: 42, afp: "Uno", salud: "fonasa",
    plan_isapre_uf: null, colacion: 0, movilizacion: 0, gratificacion: "ninguna" };
  const n = leerNovedades({})!;
  const sin = liquidar(t, n, p, 0.93);
  const b = liquidar({ ...t, apv_regimen: "B", apv_monto: 100000 }, n, p, 0.93);
  const a = liquidar({ ...t, apv_regimen: "A", apv_monto: 100000 }, n, p, 0.93);
  assert.equal(b.base_tributable, sin.base_tributable - 100000);
  assert.ok(b.montos.impuesto < sin.montos.impuesto);
  assert.equal(a.base_tributable, sin.base_tributable); // el régimen A no rebaja la base
  assert.equal(a.liquido, sin.liquido - 100000);
  assert.equal(b.liquido, sin.liquido - 100000 + (sin.montos.impuesto - b.montos.impuesto));
  const tope = liquidar({ ...t, apv_regimen: "B", apv_monto: 3000000 }, n, p, 0.93);
  assert.equal(tope.base_tributable, Math.max(0, sin.base_tributable - 2000000)); // 50 UF = $2.000.000
  assert.ok(tope.advertencias.some((x) => x.includes("50 UF")));
  const ficha = { rut: "12345678-5", apellido_paterno: "Pérez", apellido_materno: "", nombres: "Ana", sexo: "F" as const, extranjero: false,
    fecha_ingreso: "2025-01-01", fecha_baja: null, causal_termino: null, tipo_contrato: "indefinido" as const, jornada_horas: 42, jornada_lre: 101,
    afp: "Uno", salud: "fonasa" as const, isapre: null, fun: null, plan_isapre_uf: null, comuna: 13101, nombre: "Ana Pérez",
    apv_regimen: "B" as const, apv_afp: "Habitat", apv_contrato: "C-9", apv_forma: 2 };
  const emp = { mutual: "ACHS", tasa_mutual: 0.93, mutual_sucursal: 1, ccaf: 0 };
  const fila: FilaArchivo = { ficha, dias: 30, montos: b.montos };
  assert.deepEqual(faltantesArchivo(fila, emp), []);
  assert.ok(faltantesArchivo({ ...fila, ficha: { ...ficha, apv_afp: null } }, emp).some((x) => x.includes("APV")));
  const c = ["", ...archivoPrevired([fila], emp, "2026-11").trim().split(";")];
  assert.equal(c[40], "005"); assert.equal(c[41], "C-9"); assert.equal(c[42], "2"); assert.equal(c[43], "100000");
  const cab = encabezadoLre().split(";");
  const val = archivoLre([fila], emp, "2026-11").trim().split("\r\n")[1].split(";");
  const v = (cod: number) => val[cab.findIndex((h) => h.endsWith(`(${cod})`))];
  assert.equal(v(3155), "0"); assert.equal(v(3156), "100000"); assert.equal(v(5501), String(b.liquido));
});

prueba("Remuneraciones: asignación familiar y licencias médicas (RIMA) en el cálculo y en los archivos", () => {
  // Montos de tramo de PRUEBA, del mismo orden que los vigentes: solo verifican la aritmética.
  const p: Parametros = { uf: 40000, utm: 72000, imm: 539000, tope_afp_uf: 90, tope_afc_uf: 135.2, afp: { Uno: 10.46 }, sis: 1.5,
    aporte_ci: 0.1, aporte_ev: 1, aporte_rp: 0.9, afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7,
    af_a: 22000, af_b: 13000, af_c: 4000 };
  const t: Trabajador = { id: "t", nombre: "Ana", tipo_contrato: "indefinido", sueldo_base: 600000, jornada_horas: 42, afp: "Uno", salud: "fonasa",
    plan_isapre_uf: null, colacion: 0, movilizacion: 0, gratificacion: "ninguna", tramo_af: "A", cargas_simples: 2, cargas_maternales: 0, cargas_invalidez: 1 };
  const sin = liquidar({ ...t, tramo_af: null, cargas_simples: 0, cargas_invalidez: 0 }, leerNovedades({})!, p, 0.93);
  const con = liquidar(t, leerNovedades({})!, p, 0.93);
  assert.equal(con.montos.asig_familiar, 88000); // 2 simples + 1 invalidez (doble) = 4 × 22.000
  assert.equal(con.total_imponible, sin.total_imponible); // no es imponible
  assert.equal(con.montos.impuesto, sin.montos.impuesto); // ni tributable
  assert.equal(con.liquido, sin.liquido + 88000);
  assert.equal(con.costo_empresa, sin.costo_empresa); // la recupera al pagar cotizaciones
  assert.equal(liquidar({ ...t, tramo_af: "D" }, leerNovedades({})!, p, 0.93).montos.asig_familiar, 0);
  assert.equal(faltaMontoAF(t, { ...p, af_a: undefined }), "monto de la asignación familiar del tramo A");
  assert.equal(faltaMontoAF({ ...t, tramo_af: "D" }, { ...p, af_a: undefined }), null);
  assert.equal(leerParametros({ ...p, af_b: "x" }), null);
  assert.equal(leerParametros(p)!.af_c, 4000);

  // Licencia de 20 días: SIS y expectativa de vida sobre RI de 10 días + RIMA de 20; CI y rentabilidad protegida solo días trabajados.
  assert.equal(leerNovedades({ dias_trabajados: 20, dias_licencia: 15 }), null); // 35 días
  assert.equal(leerNovedades({ dias_trabajados: 10, dias_licencia: 20 }), null); // sin fechas
  const n = leerNovedades({ dias_trabajados: 10, dias_licencia: 20, rima: 600000, licencia: { tipo: "comun", desde: "2026-11-11", hasta: "2026-11-30" } })!;
  assert.equal(mesAnterior("2026-11-11"), "2026-10"); assert.equal(mesAnterior("2027-01-03"), "2026-12");
  const lic = liquidar(t, n, p, 0.93);
  assert.equal(lic.montos.base_afp, 200000);
  assert.equal(lic.montos.rima, 400000);
  assert.equal(lic.montos.sis, 9000); // 1,5% × 600.000
  assert.equal(lic.montos.aporte_ev, 6000);
  assert.equal(lic.montos.aporte_ci, 200);
  assert.equal(lic.montos.aporte_rp, 1800);
  assert.equal(lic.montos.asig_familiar, 29333); // 88.000 × 10/30
  assert.equal(lic.montos.dias_licencia, 20);

  const ficha = { rut: "12345678-5", apellido_paterno: "Pérez", apellido_materno: "", nombres: "Ana", sexo: "F" as const, extranjero: false,
    fecha_ingreso: "2025-01-01", fecha_baja: null, causal_termino: null, tipo_contrato: "indefinido" as const, jornada_horas: 42, jornada_lre: 101,
    afp: "Uno", salud: "fonasa" as const, isapre: null, fun: null, plan_isapre_uf: null, comuna: 13101, nombre: "Ana Pérez" };
  const emp = { mutual: "ACHS", tasa_mutual: 0.93, mutual_sucursal: 1, ccaf: 0 };
  const fila: FilaArchivo = { ficha, dias: 10, montos: lic.montos, licencia: n.licencia };
  assert.deepEqual(faltantesArchivo(fila, emp, "2026-11"), []);
  assert.ok(faltantesArchivo({ ...fila, licencia: null }, emp, "2026-11").some((x) => x.includes("licencia")));
  assert.ok(faltantesArchivo({ ...fila, ficha: { ...ficha, fecha_ingreso: "2026-11-01" } }, emp, "2026-11").some((x) => x.includes("línea adicional")));
  const c = ["", ...archivoPrevired([fila], emp, "2026-11").trim().split(";")];
  assert.equal(c[13], "10"); assert.equal(c[15], "3"); assert.equal(c[16], "11-11-2026"); assert.equal(c[17], "30-11-2026");
  assert.equal(c[18], "A"); assert.equal(c[19], "2"); assert.equal(c[20], "0"); assert.equal(c[21], "1"); assert.equal(c[22], "29333");
  assert.equal(c[27], "200000"); assert.equal(c[29], "9000"); assert.equal(c[92], "400000"); assert.equal(c[94], "6000");
  const laboral = ["", ...archivoPrevired([{ ...fila, licencia: { ...n.licencia!, tipo: "laboral" } }], emp, "2026-11").trim().split(";")];
  assert.equal(laboral[15], "6");
  const cab = encabezadoLre().split(";");
  const val = archivoLre([fila], emp, "2026-11").trim().split("\r\n")[1].split(";");
  const v = (cod: number) => val[cab.findIndex((h) => h.endsWith(`(${cod})`))];
  assert.equal(v(1111), "2"); assert.equal(v(1113), "1"); assert.equal(v(1114), "A"); assert.equal(v(1116), "20"); assert.equal(v(2311), "29333");
  assert.equal(v(5501), String(lic.liquido));
});

prueba("Finiquito: antigüedad, años, feriado proporcional proyectado, topes, aviso, seguro de cesantía y LRE", () => {
  assert.deepEqual(antiguedad("2020-03-01", "2026-11-20"), { anos: 6, meses: 8, dias: 20 });
  assert.equal(anosIndemnizacion({ anos: 6, meses: 8, dias: 20 }), 7); // fracción superior a 6 meses
  assert.equal(anosIndemnizacion({ anos: 6, meses: 6, dias: 0 }), 6); // 6 meses justos no suman
  assert.equal(anosIndemnizacion({ anos: 0, meses: 11, dias: 29 }), 0); // menos de un año
  assert.equal(anosIndemnizacion({ anos: 15, meses: 0, dias: 0 }), 11); // tope de 11 años
  // Ejemplo de la Dirección del Trabajo: 8 meses y 2 días = 10,08 días hábiles.
  assert.equal(Math.round(feriadoProporcional("2026-01-01", "2026-09-02", 15) * 100) / 100, 10.08);
  const festivos = new Set(["2026-12-08", "2026-12-25", "2027-01-01"]);
  // Término viernes 20-11-2026; 10,8333 hábiles + 2 pendientes cruzan el 8 de diciembre (festivo).
  assert.equal(Math.round(diasCorridos("2026-11-20", 10 + 25 / 30, festivos) * 10000) / 10000, 16.8333);
  assert.equal(Math.round(diasCorridos("2026-11-20", 12 + 25 / 30, festivos) * 10000) / 10000, 19.8333);
  assert.equal(diasCorridos("2026-11-20", 0, festivos), 0);
  assert.equal(diasCorridos("2026-11-20", 5, festivos), 7); // sábado y domingo se suman antes del primer hábil
  assert.equal(plazoPago("2026-11-20", festivos), "2026-12-02");

  const base = { fecha_ingreso: "2020-03-01", fecha_termino: "2026-11-20", causal: 18, base_indemnizacion: 1000000, base_feriado: 900000,
    aviso_dado: false, feriado_anual: 15, dias_pendientes: 2, uf: 40000, aporte_afc: 800000, otros_haberes: 0, otros_descuentos: 0, detalle_otros: "" };
  const d = validarDatosFiniquito(base) as DatosFiniquito;
  assert.equal(typeof d, "object");
  const x = calcularFiniquito(d, festivos);
  assert.equal(x.anos_indemnizados, 7); assert.equal(x.ias, 7000000); assert.equal(x.aviso, 1000000);
  assert.equal(x.imputacion_afc, 800000); assert.equal(x.feriado, 595000); assert.equal(x.total, 7795000);
  assert.equal(calcularFiniquito({ ...d, aviso_dado: true }, festivos).aviso, 0);
  const alto = calcularFiniquito({ ...d, base_indemnizacion: 5000000, fecha_ingreso: "2014-01-01" }, festivos);
  assert.equal(alto.base_tope, 3600000); assert.equal(alto.anos_indemnizados, 11); assert.ok(alto.tope_aplicado);
  const renuncia = calcularFiniquito({ ...d, causal: 4 }, festivos);
  assert.equal(renuncia.ias, 0); assert.equal(renuncia.aviso, 0); assert.equal(renuncia.imputacion_afc, 0); assert.equal(renuncia.total, 595000);
  assert.ok(renuncia.advertencias.some((a) => a.includes("art. 161")));
  const concursal = calcularFiniquito({ ...d, causal: 20, aviso_dado: true }, festivos);
  assert.equal(concursal.aviso, 1000000); assert.equal(concursal.imputacion_afc, 0);
  assert.equal(typeof validarDatosFiniquito({ ...base, otros_descuentos: 5000 }), "string"); // sin detalle
  assert.equal(typeof validarDatosFiniquito({ ...base, fecha_termino: "2019-01-01" }), "string");
  assert.ok(!x.advertencias.some((a) => a.includes("festivos"))); // los festivos cargados cubren la proyección
  assert.ok(calcularFiniquito(d, new Set(["2026-12-01"])).advertencias.some((a) => a.includes("festivos"))); // no la cubren
  const texto = textoFiniquito({ empresa: "Andes SpA", rut_empresa: "76086428-5", domicilio: "Av. Uno 1, Santiago", trabajador: "Ana Pérez",
    rut_trabajador: "12345678-5", cargo: "Vendedora", causal_texto: "Art. 161 inc. 1: necesidades de la empresa" }, d, x);
  assert.ok(texto.includes("$7.795.000") && texto.includes("ministro de fe") && texto.includes("artículo 162"));

  // LRE: la fila del último mes lleva las indemnizaciones (no imponibles ni tributables) y la imputación del seguro.
  const p: Parametros = { uf: 40000, utm: 72000, imm: 539000, tope_afp_uf: 90, tope_afc_uf: 135.2, afp: { Uno: 10.46 }, sis: 1.5,
    aporte_ci: 0.1, aporte_ev: 1, aporte_rp: 0.9, afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7 };
  const t: Trabajador = { id: "t", nombre: "Ana", tipo_contrato: "indefinido", sueldo_base: 1000000, jornada_horas: 42, afp: "Uno", salud: "fonasa",
    plan_isapre_uf: null, colacion: 0, movilizacion: 0, gratificacion: "ninguna" };
  const liq = liquidar(t, leerNovedades({ dias_trabajados: 20 })!, p, 0.93);
  const ficha = { rut: "12345678-5", apellido_paterno: "Pérez", apellido_materno: "", nombres: "Ana", sexo: "F" as const, extranjero: false,
    fecha_ingreso: "2020-03-01", fecha_baja: "2026-11-20", causal_termino: 18, tipo_contrato: "indefinido" as const, jornada_horas: 42, jornada_lre: 101,
    afp: "Uno", salud: "fonasa" as const, isapre: null, fun: null, plan_isapre_uf: null, comuna: 13101, nombre: "Ana Pérez" };
  const emp = { mutual: "ACHS", tasa_mutual: 0.93, mutual_sucursal: 1, ccaf: 0 };
  const fila: FilaArchivo = { ficha, dias: 20, montos: liq.montos, finiquito: { ias: x.ias, aviso: x.aviso, feriado: x.feriado, imputacion_afc: x.imputacion_afc } };
  const cab = encabezadoLre().split(";");
  const val = archivoLre([fila], emp, "2026-11").trim().split("\r\n")[1].split(";");
  const v = (cod: number) => val[cab.findIndex((h) => h.endsWith(`(${cod})`))];
  assert.equal(v(2313), "595000"); assert.equal(v(2314), "7000000"); assert.equal(v(2315), "1000000"); assert.equal(v(5502), "8595000");
  assert.equal(v(3185), "800000"); assert.equal(v(5210), String(liq.total_imponible));
  assert.equal(v(5501), String(liq.liquido + 8595000 - 800000));
  const otroMes = archivoLre([fila], emp, "2026-10").trim().split("\r\n")[1].split(";");
  assert.equal(otroMes[cab.findIndex((h) => h.endsWith("(2314)"))], "0"); // solo en el mes del término
});

prueba("Certificado N° 6: año por defecto y lectura de factores del SII", () => {
  assert.equal(anioPorDefecto("2027-03-10"), 2026); // operación renta: se certifica el año anterior
  assert.equal(anioPorDefecto("2026-11-22"), 2026);
  assert.deepEqual(leerFactores({ 1: "1,045", 2: " 1.0412 ", 3: "" }), { "1": 1.045, "2": 1.041 });
  assert.equal(leerFactores({ 1: "3" }), null); // fuera de rango
  assert.equal(leerFactores({ 1: "abc" }), null);
  assert.equal(leerFactores({ 1: "" }), null); // nada que guardar
});

prueba("Vacaciones: períodos ganados, saldo inicial, progresivo, tomados y programados", () => {
  assert.deepEqual(aniversarios("2020-03-01", "2022-03-01"), ["2021-03-01", "2022-03-01"]);
  assert.deepEqual(aniversarios("2020-02-29", "2021-03-01"), ["2021-02-28"]);
  const reg = (x: Partial<RegistroVacacion>): RegistroVacacion => ({ id: Math.random().toString(), trabajador_id: "t", tipo: "tomado", desde: "2026-01-05",
    hasta: "2026-01-16", dias: 10, nota: null, estado: "vigente", creado: "", motivo_anulacion: null, ...x });
  // Sin registros: 15 por año cumplido (6 aniversarios al 22-11-2026).
  assert.equal(saldoVacaciones("2020-03-01", "2026-11-22", "2026-11-22", []).saldo, 90);
  assert.ok(saldoVacaciones("2020-03-01", "2026-11-22", "2026-11-22", []).advertencias.some((a) => a.includes("dos períodos")));
  // Saldo inicial de 12 al 01-01-2026 + período del 01-03-2026 (15) − 10 tomados − 5 programados.
  const regs = [reg({ tipo: "saldo_inicial", desde: "2026-01-01", hasta: null, dias: 12 }), reg({ desde: "2026-01-05", dias: 10 }),
    reg({ desde: "2026-12-14", hasta: "2026-12-18", dias: 5 }), reg({ desde: "2025-12-01", dias: 8 }), reg({ desde: "2026-02-02", dias: 3, estado: "anulado" })];
  const s1 = saldoVacaciones("2020-03-01", "2026-11-22", "2026-11-22", regs);
  assert.equal(s1.devengado, 27); assert.equal(s1.tomados, 10); assert.equal(s1.programados, 5); assert.equal(s1.saldo, 12);
  assert.equal(s1.proximo_aniversario, "2027-03-01");
  assert.equal(s1.proporcional, 10.92); // 8 meses y 22 días: 10 + 22 × 1,25 / 30
  // Progresivo de 1 día por año desde el 01-01-2026: suma en el aniversario del 01-03-2026.
  assert.equal(saldoVacaciones("2020-03-01", "2026-11-22", "2026-11-22", [...regs, reg({ tipo: "progresivo", desde: "2026-01-01", hasta: null, dias: 1 })]).saldo, 13);
  assert.ok(saldoVacaciones("2026-01-01", "2026-11-22", "2026-11-22", [reg({ desde: "2026-06-01", dias: 5 })]).advertencias.some((a) => a.includes("adelantado")));
});

prueba("Contrato de trabajo: estipulaciones del art. 10, avisos de jornada, ingreso mínimo, plazo y escrituración; anexo", () => {
  const f: FichaContrato = { nombre: "Ana Pérez", rut: "12345678-5", cargo: "Vendedora", fecha_ingreso: "2026-11-02", tipo_contrato: "plazo_fijo",
    sueldo_base: 600000, jornada_horas: 42, colacion: 40000, movilizacion: 30000, gratificacion: "art50" };
  const e = { nombre: "Andes SpA", rut: "76086428-5", domicilio: "Av. Uno 1, Santiago" };
  const base = { ciudad: "Santiago", fecha: "2026-11-05", nacionalidad: "chilena", fecha_nacimiento: "1995-04-10", domicilio_trabajador: "Calle Dos 2, Ñuñoa",
    email_trabajador: "ana@correo.cl", representante: "Juan Soto", rut_representante: "11.111.111-1", email_empleador: "", funciones: "Atención y venta a clientes en sala",
    lugar: "Tienda de Av. Uno 1, Santiago", distribucion: "lunes a viernes de 09:00 a 17:54 horas con 30 minutos de colación", plazo_hasta: "2027-02-01",
    obra: "", forma_pago: "transferencia", dia_pago: "el último día hábil de cada mes", especies: "", procedencia: "", otros_pactos: "" };
  const d = validarContrato(base, f) as DatosContrato;
  assert.equal(typeof d, "object");
  const t = textoContrato(d, f, e);
  for (const x of ["Santiago", "chilena", "Calle Dos 2", "Atención y venta", "42 horas", "$600.000", "artículo 50", "plazo fijo", "1 de febrero de 2027", "Ley 21.643", "Ley 19.628"])
    assert.ok(t.includes(x), x);
  assert.equal(typeof validarContrato({ ...base, plazo_hasta: "" }, f), "string");
  assert.equal(typeof validarContrato({ ...base, rut_representante: "abc" }, f), "string");
  assert.equal(typeof validarContrato({ ...base, email_trabajador: "x@" }, f), "string");
  assert.deepEqual(avisosContrato(d, f, 539000), []);
  const malos = avisosContrato({ ...d, plazo_hasta: "2028-01-01", fecha: "2026-12-01" }, { ...f, jornada_horas: 44, sueldo_base: 400000 }, 539000);
  assert.equal(malos.length, 4); // jornada, ingreso mínimo, plazo > 1 año, escrito después de 15 días
  assert.deepEqual(avisosContrato(d, { ...f, jornada_horas: 30, sueldo_base: 385000 }, 539000), []); // 539.000 × 30/42 = 385.000
  const an = validarAnexo({ ciudad: "Santiago", fecha: "2026-12-01", materia: "remuneracion", vigencia: "2027-01-01", texto: "El sueldo base mensual será de $650.000.", representante: "Juan Soto" });
  assert.equal(typeof an, "object");
  const ta = textoAnexo(an as Exclude<typeof an, string>, f, e, 2);
  assert.ok(ta.includes("Anexo N° 2") && ta.includes("$650.000") && ta.includes("1 de enero de 2027") && ta.includes("art. 11"));
  assert.equal(typeof validarAnexo({ ciudad: "Santiago", fecha: "2026-12-01", materia: "x", vigencia: "2027-01-01", texto: "corto", representante: "Juan Soto" }), "string");
});

prueba("Pacto de horas extraordinarias: tres meses, 2 horas diarias, necesidad temporal, cobertura del mes y aviso en la liquidación", () => {
  assert.equal(hastaMaximoPacto("2026-12-01"), "2027-02-28");
  assert.equal(hastaMaximoPacto("2026-11-30"), "2027-02-27"); // 30-11 + 3 meses = 28-02; un día antes
  const base = { ciudad: "Santiago", fecha: "2026-11-25", desde: "2026-12-01", hasta: "2027-02-28", horas_dia: "2", motivo: "Inventario anual y ventas de fin de año",
    compensacion: "pago", representante: "Juan Soto" };
  const d = validarPactoHE(base, "2026-01-01") as DatosPactoHE;
  assert.equal(typeof d, "object");
  assert.equal(typeof validarPactoHE({ ...base, hasta: "2027-03-01" }, "2026-01-01"), "string");
  assert.equal(typeof validarPactoHE({ ...base, horas_dia: "3" }, "2026-01-01"), "string");
  assert.equal(typeof validarPactoHE({ ...base, motivo: "porque sí" }, "2026-01-01"), "string");
  assert.equal(typeof validarPactoHE(base, "2027-01-01"), "string"); // antes del ingreso
  const f: FichaContrato = { nombre: "Ana Pérez", rut: "12345678-5", cargo: null, fecha_ingreso: "2026-01-01", tipo_contrato: "indefinido",
    sueldo_base: 600000, jornada_horas: 42, colacion: 0, movilizacion: 0, gratificacion: "ninguna" };
  const t = textoPactoHE(d, f, { nombre: "Andes SpA", rut: "76086428-5", domicilio: "" });
  assert.ok(t.includes("artículo 32") && t.includes("Inventario anual") && t.includes("28 de febrero de 2027") && t.includes("50%"));
  assert.ok(textoPactoHE({ ...d, compensacion: "feriado" }, f, { nombre: "A", rut: "1-9", domicilio: "" }).includes("cinco días hábiles"));
  const pactos = [{ desde: "2026-12-01", hasta: "2027-02-28" }];
  assert.ok(pactoCubreMes(pactos, "2026-12") && pactoCubreMes(pactos, "2027-02"));
  assert.ok(!pactoCubreMes(pactos, "2026-11") && !pactoCubreMes(pactos, "2027-03"));
  // Más de 2 horas extra por día trabajado: advertencia del motor.
  const p: Parametros = { uf: 40000, utm: 72000, imm: 539000, tope_afp_uf: 90, tope_afc_uf: 135.2, afp: { Uno: 10.46 }, sis: 1.5,
    aporte_ci: 0.1, aporte_ev: 1, aporte_rp: 0.9, afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7 };
  const tr: Trabajador = { id: "t", nombre: "Ana", tipo_contrato: "indefinido", sueldo_base: 600000, jornada_horas: 42, afp: "Uno", salud: "fonasa",
    plan_isapre_uf: null, colacion: 0, movilizacion: 0, gratificacion: "ninguna" };
  assert.ok(liquidar(tr, leerNovedades({ dias_trabajados: 10, horas_extra: 21 })!, p, 0.93).advertencias.some((a) => a.includes("2 horas")));
  assert.ok(!liquidar(tr, leerNovedades({ dias_trabajados: 30, horas_extra: 20 })!, p, 0.93).advertencias.some((a) => a.includes("2 horas")));
});

prueba("Reglamento interno: contenidos del art. 154 y del D.S. 44, avisos por dotación y Ley Karin, tamaño de los datos", () => {
  const base = { razon_social: "Andes SpA", rut: "76.086.428-5", domicilio: "Av. Uno 1, Santiago", giro: "Comercio al por menor", representante: "Juan Soto",
    trabajadores: "12", mutual: "ACHS", horario: "De lunes a viernes de 09:00 a 17:54 horas", descanso: "30 minutos de colación", dia_pago: "el último día hábil de cada mes",
    forma_pago: "transferencia", reclamos: "Gerencia de Personas", responsable_sst: "Jefe de operaciones",
    riesgos: "Caídas en bodega: pisos despejados y calzado de seguridad.", emergencia: "Punto de encuentro en el estacionamiento", instancia: "delegado" };
  const d = validarRIOHS(base) as DatosRIOHS;
  assert.equal(typeof d, "object");
  const t = textoRIOHS(d, "22-11-2026");
  for (const x of ["Preámbulo", "art. 154 N° 1 y 2", "154 N° 13", "30 días", "D.S. N° 44", "art. 59", "art. 60", "negligencia inexcusable", "art. 154 N° 12",
    "25% de la remuneración diaria", "art. 157", "dos sitios visibles", "Delegado de Seguridad y Salud", "ACHS", "Caídas en bodega"])
    assert.ok(t.includes(x), x);
  assert.equal(typeof validarRIOHS({ ...base, rut: "76086428" }), "string");
  assert.equal(typeof validarRIOHS({ ...base, riesgos: "pocos" }), "string");
  assert.equal(typeof validarRIOHS({ ...base, trabajadores: "0" }), "string");
  assert.deepEqual(avisosRIOHS(d, true), []);
  assert.equal(avisosRIOHS({ ...d, trabajadores: 5 }, false).length, 2); // menos de 10 y sin Ley Karin
  assert.equal(avisosRIOHS({ ...d, trabajadores: 250, instancia: "delegado" }, true).length, 3); // comité, departamento y registro de cargos
  // Los datos caben en el límite de 8.000 bytes de doc_laboral_generar aun con todos los campos al máximo.
  const largo = validarRIOHS({ ...base, horario: "á".repeat(900), riesgos: "é".repeat(2000), emergencia: "í".repeat(900), giro: "ó".repeat(300),
    domicilio: "ú".repeat(300), razon_social: "ñ".repeat(300), representante: "a".repeat(300), reclamos: "b".repeat(300), responsable_sst: "c".repeat(300),
    descanso: "d".repeat(300), dia_pago: "e".repeat(300), forma_pago: "f".repeat(300), mutual: "g".repeat(300) }) as DatosRIOHS;
  const bytes = Buffer.byteLength(JSON.stringify({ ...largo, avisos: avisosRIOHS({ ...largo, trabajadores: 250 }, false) }), "utf8");
  assert.ok(bytes <= 8000, `datos: ${bytes} bytes`);
});

prueba("Carta de aviso de término: causales, hechos, plazos del art. 162, indemnizaciones del art. 161 y cotizaciones", () => {
  const base = { ciudad: "Santiago", fecha_carta: "2026-11-30", fecha_termino: "2026-12-31", causal: "18", hechos: "Cierre de la sucursal de Ñuñoa por baja sostenida de ventas durante 2026.",
    entrega: "personal", domicilio: "Calle Dos 2, Ñuñoa", representante: "Juan Soto", base_indemnizacion: "1000000", uf: "40.000", cotizaciones: "al_dia", detalle_pendientes: "", fuero: "no", licencia: "no" };
  const d = validarCarta(base, "2020-03-01") as DatosCarta;
  assert.equal(typeof d, "object");
  assert.equal(d.uf, 40000);
  const m = montosCarta(d, "2020-03-01");
  assert.equal(m.anos, 7); assert.equal(m.ias, 7000000); assert.equal(m.aviso, 0); assert.ok(m.aviso_dado); // 31 días de anticipación
  const sinAviso = montosCarta({ ...d, fecha_carta: "2026-12-15" }, "2020-03-01");
  assert.equal(sinAviso.aviso, 1000000);
  const t = textoCarta(d, { nombre: "Ana Pérez", rut: "12345678-5", cargo: "Vendedora" }, { nombre: "Andes SpA", rut: "76086428-5", domicilio: "" }, m);
  for (const x of ["Art. 161 inc. 1", "Cierre de la sucursal", "$7.000.000", "30 días de anticipación", "noviembre de 2026", "comprobantes", "Inspección del Trabajo", "Recibí copia"])
    assert.ok(t.includes(x), x);
  assert.equal(mesAnteriorDespido("2027-01-10"), "2026-12");
  assert.equal(typeof validarCarta({ ...base, causal: "4" }, "2020-03-01"), "string"); // renuncia: no lleva carta del empleador
  assert.equal(typeof validarCarta({ ...base, hechos: "corto" }, "2020-03-01"), "string");
  assert.equal(typeof validarCarta({ ...base, causal: "19", hechos: "" }, "2020-03-01"), "object"); // desahucio: sin hechos
  assert.equal(typeof validarCarta({ ...base, fecha_carta: "2027-01-05" }, "2020-03-01"), "string"); // 161: después del término
  // Art. 160: carta desde la separación y dentro de 3 días hábiles (lunes a sábado, sin festivos).
  const disc = validarCarta({ ...base, causal: "16", fecha_termino: "2026-12-04", fecha_carta: "2026-12-10" }, "2020-03-01") as DatosCarta;
  assert.equal(typeof disc, "object");
  const av = avisosCarta(disc, new Set(["2026-12-08"]), []);
  assert.ok(av.some((a) => a.includes("3 días hábiles") && a.includes("09-12-2026"))); // 5 y 7 hábiles, 8 festivo, 9 = tercero
  assert.ok(av.some((a) => a.includes("disciplinaria")));
  assert.ok(textoCarta(disc, { nombre: "A", rut: "1-9", cargo: null }, { nombre: "E", rut: "2-7", domicilio: "" }, montosCarta(disc, "2020-03-01")).includes("no corresponden indemnizaciones"));
  const malas = avisosCarta({ ...d, cotizaciones: "pendientes", detalle_pendientes: "octubre", fuero: true, licencia: true, fecha_carta: "2026-12-20" }, new Set(), ["2026-09"]);
  assert.equal(malas.length, 5); // sustitutiva, cotizaciones, fuero, licencia y mes sin liquidación
});

prueba("Pendientes laborales: finiquito, liquidaciones, horas extra sin pacto, Ley Karin, reglamento, contratos, vacaciones y certificados", () => {
  const base: DatosPendientes = {
    hoy: "2026-12-05", trabajadores: [], contratos: [], documentos: [], liquidaciones: [], finiquitos: [], vacaciones: [], certificados: [], festivos: new Set(["2026-12-08"]),
  };
  assert.deepEqual(pendientesLaborales(base), []);
  const tr = (id: string, extra = {}) => ({ id, nombre: `T${id}`, activo: true, fecha_ingreso: "2025-01-01", fecha_baja: null, ...extra });
  const d: DatosPendientes = {
    ...base,
    trabajadores: [tr("1"), tr("2", { activo: false, fecha_baja: "2026-11-28" }), tr("3", { fecha_ingreso: "2026-11-25" }), ...Array.from({ length: 8 }, (_, k) => tr(`x${k}`))],
    contratos: [{ trabajador_id: "1", tipo: "contrato", estado: "aprobado", datos: {} }, { trabajador_id: "1", tipo: "anexo", estado: "observado", datos: {} }],
    liquidaciones: [{ trabajador_id: "1", periodo: "2026-11", estado: "aprobada", horas_extra: 10 }],
  };
  const p = pendientesLaborales(d);
  const clave = (k: string) => p.find((x) => x.clave === k);
  assert.equal(p[0].nivel, "urgente");
  assert.ok(clave("fin-2")?.detalle.includes("11-12-2026")); // 28-11 + 10 hábiles (lunes a sábado, sin el 8-12)
  assert.equal(clave("fin-2")?.nivel, "urgente");
  assert.ok(clave("liq-anterior")?.detalle.includes("9 trabajadores")); // los 10 activos menos el 1, que ya tiene la de noviembre aprobada
  assert.ok(clave("he-sin-pacto")?.detalle.includes("T1"));
  assert.ok(clave("karin") && clave("riohs")); // 10 activos
  assert.equal(clave("ct-3")?.nivel, "importante"); // ingresó el 25-11: plazo al 10-12
  assert.ok(clave("ct-antiguos")?.titulo.startsWith("8 trabajadores"));
  assert.ok(clave("observados"));
  // Con pacto aprobado que cubre noviembre, desaparece el aviso de horas extra; si vence pronto, aparece el aviso del pacto.
  const conPacto = pendientesLaborales({ ...d, contratos: [...d.contratos, { trabajador_id: "1", tipo: "pacto_he", estado: "aprobado", datos: { desde: "2026-10-01", hasta: "2026-12-15" } }] });
  assert.ok(!conPacto.some((x) => x.clave === "he-sin-pacto"));
  assert.ok(conPacto.some((x) => x.clave === "pacto-1"));
  // Pasado el día 13 no se avisa de Previred; finiquito aprobado no aparece.
  const tarde = pendientesLaborales({ ...d, hoy: "2026-12-20", finiquitos: [{ trabajador_id: "2", estado: "aprobado" }] });
  assert.ok(!tarde.some((x) => x.clave === "liq-anterior" || x.clave === "fin-2"));
  // Certificados N° 6 entre enero y marzo.
  const enero = pendientesLaborales({ ...d, hoy: "2027-01-20", liquidaciones: [{ trabajador_id: "1", periodo: "2026-06", estado: "aprobada", horas_extra: 0 }] });
  assert.ok(enero.some((x) => x.clave === "cert6" && x.detalle.includes("1 certificado")));
});


prueba("Anonimizador: oculta RUT, correo, teléfono, tarjeta, cuenta, dirección y nombres, y restaura", () => {
  const t = "Juan Pérez (12.345.678-5, juan.perez@correo.cl, +56 9 8765 4321) pagó 150.000 con tarjeta 4111 1111 1111 1111 a la cuenta corriente N° 00-123-45678-9; vive en Avenida Los Leones 1234 depto 52. Juan Pérez trabaja en 77123456-9.";
  const a = anonimizarIA(t, { nombres: ["Juan Pérez"] });
  for (const v of ["12.345.678-5", "juan.perez@correo.cl", "8765 4321", "4111 1111", "00-123-45678-9", "Los Leones 1234", "Juan Pérez", "77123456-9"]) assert.ok(!a.texto.includes(v), v);
  assert.ok(a.texto.includes("150.000")); // los montos no se tocan
  assert.equal(a.texto.match(/\[NOMBRE_1\]/g)?.length, 2); // mismo valor, misma marca
  assert.ok(a.texto.includes("[RUT_2]"));
  const salida = { resumen: "Pago de [NOMBRE_1] desde [CUENTA_1]", rut: "[RUT_1]", lista: ["[CORREO_1]"] };
  assert.deepEqual(restaurar(salida, a.mapa), { resumen: "Pago de Juan Pérez desde 00-123-45678-9", rut: "12.345.678-5", lista: ["juan.perez@correo.cl"] });
  assert.ok(resumenAnonimizado(a.mapa).includes("rut:2"));
  assert.equal(anonimizarIA("Compra de bencina por 15.990 el 12-11-2026").mapa.length, 0);
});

const DTE_XML = `<?xml version="1.0" encoding="ISO-8859-1"?>
<EnvioDTE xmlns="http://www.sii.cl/SiiDte"><SetDTE><DTE version="1.0"><Documento ID="F33T120">
<Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>120</Folio><FchEmis>2026-11-10</FchEmis></IdDoc>
<Emisor><RUTEmisor>76086428-5</RUTEmisor><RznSoc>Ferretería &amp; Materiales Ñuble SpA</RznSoc><GiroEmis>Venta de materiales de construcción</GiroEmis></Emisor>
<Receptor><RUTRecep>77123456-9</RUTRecep><RznSocRecep>Cliente Demo SpA</RznSocRecep></Receptor>
<Totales><MntNeto>100000</MntNeto><TasaIVA>19</TasaIVA><IVA>19000</IVA><MntTotal>119000</MntTotal></Totales></Encabezado>
<Detalle><NroLinDet>1</NroLinDet><NmbItem>Cemento 25 kg</NmbItem><MontoItem>100000</MontoItem></Detalle>
<TED version="1.0"><DD></DD></TED></Documento></DTE></SetDTE></EnvioDTE>`;

prueba("DTE en XML: lee y verifica factura (RUT, IVA, total, timbre) y la convierte en gasto", () => {
  const bytes = Uint8Array.from(Buffer.from(DTE_XML, "latin1"));
  const r = leerDte(decodificarXml(bytes));
  assert.ok("dte" in r);
  if (!("dte" in r)) return;
  assert.equal(r.dte.tipo, 33);
  assert.equal(r.dte.folio, 120);
  assert.equal(r.dte.emisor.razon, "Ferretería & Materiales Ñuble SpA");
  assert.equal(r.dte.emisor.rut, "76.086.428-5");
  assert.ok(r.dte.revisiones.every((x) => x.ok), JSON.stringify(r.dte.revisiones.filter((x) => !x.ok)));
  const g = gastoDesdeDte(r.dte, "77.123.456-9", "2026-11-24");
  assert.ok("gasto" in g);
  if (!("gasto" in g)) return;
  assert.equal(g.gasto.monto, 119000);
  assert.equal(g.gasto.iva, 19000);
  assert.equal(g.gasto.documento, "factura");
  assert.equal(g.gasto.categoria, "insumos"); // «materiales»
  assert.equal(g.gasto.confianza, "alta");
  // A nombre de otra empresa: sin crédito de IVA y con aviso.
  const otra = gastoDesdeDte(r.dte, "96.790.240-3", "2026-11-24");
  assert.ok("gasto" in otra && otra.gasto.iva === null && otra.gasto.dudas[0].includes("no está emitido a nombre de tu empresa"));
});

prueba("DTE en XML: detecta errores (DV, IVA, total) y rechaza notas de crédito y entidades", () => {
  const malo = leerDte(DTE_XML.replace("76086428-5", "76086428-4").replace("<IVA>19000</IVA>", "<IVA>18000</IVA>"));
  assert.ok("dte" in malo);
  if (!("dte" in malo)) return;
  const fallas = malo.dte.revisiones.filter((x) => !x.ok).map((x) => x.texto).join(" | ");
  assert.ok(fallas.includes("dígito verificador incorrecto") && fallas.includes("no es el 19%") && fallas.includes("no coincide"));
  assert.ok("error" in gastoDesdeDte(malo.dte, null, "2026-11-24")); // DV malo es grave: no se registra
  const nc = leerDte(DTE_XML.replace("<TipoDTE>33</TipoDTE>", "<TipoDTE>61</TipoDTE>"));
  assert.ok("dte" in nc && "error" in gastoDesdeDte(nc.dte, null, "2026-11-24"));
  assert.ok("error" in leerDte(`<!DOCTYPE x [<!ENTITY a "b">]>${DTE_XML}`));
  assert.ok("error" in leerDte("<x>hola</x>"));
  // Con prefijo de espacio de nombres y en UTF-8.
  const pref = leerDte(DTE_XML.replace(/<(\/?)(?!\?)/g, "<$1sii:").replace("<sii:?xml", "<?xml"));
  assert.ok("dte" in pref && pref.dte.total === 119000);
});

prueba("Doble lectura: coincide → mantiene; difiere → confianza baja y diferencia anotada", () => {
  const a: Gasto = { fecha: "2026-11-10", monto: 15990, iva: null, descripcion: "Bencina", categoria: "combustible", documento: "boleta", proveedor: "Copec", folio: null, confianza: "alta", dudas: [] };
  const igual = cruzarLecturas(a, { ...a, descripcion: "Combustible" });
  assert.equal(igual.confianza, "alta");
  assert.ok(igual.dudas.some((d) => d.includes("coinciden")));
  const distinto = cruzarLecturas(a, { ...a, monto: 19590 });
  assert.equal(distinto.confianza, "baja");
  assert.ok(distinto.dudas[0].includes("15.990") && distinto.dudas[0].includes("19.590"));
  assert.equal(distinto.monto, 15990);
});


prueba("Buscador legal: corpus válido para la base (claves únicas, textos, citas) y criterio de respaldo", () => {
  const c = corpusBase();
  assert.ok(c.length >= 30, `corpus ${c.length}`);
  assert.equal(new Set(c.map((f) => f.clave)).size, c.length);
  for (const f of c) {
    assert.match(f.clave, /^[a-z_]+:[A-Za-z0-9_.:-]{1,120}$/, f.clave);
    assert.ok(f.titulo.length >= 3 && f.titulo.length <= 300, f.clave);
    assert.ok(f.texto.length >= 10 && f.texto.length <= 6000, f.clave);
    assert.ok(!f.url || /^https:\/\/\S+$/.test(f.url), f.clave);
    assert.match(f.huella, /^[0-9a-f]{64}$/);
  }
  assert.ok(c.some((f) => f.origen === "regla" && f.articulo === "Art. 97 N°2 CT"));
  assert.ok(c.some((f) => f.origen === "obligacion_laboral" && f.clave === "obligacion_laboral:karin"));
  // Misma entrada, misma huella (no se recalcula lo que no cambió).
  assert.equal(corpusBase()[0].huella, c[0].huella);
  const largo = "Primera frase del texto. ".repeat(200);
  const partes = trocear(largo);
  assert.ok(partes.length > 1 && partes.every((p) => p.length <= 1800));
  const inf = fragmentosInforma([{ id: "0b6c7d2e-1111-4222-8333-944455556666", title: "Nueva circular del SII", summary: "Resumen verificado de la circular.", impact: null,
    institution: "SII", source_url: "https://www.sii.cl/c.pdf", departamento: "tributario", vigente_desde: "2026-12-01", fecha_consulta: "2026-11-20", published_on: "2026-11-19", kind: "circular" }]);
  assert.equal(inf[0].clave, "informa:0b6c7d2e-1111-4222-8333-944455556666");
  const r = (x: Partial<Resultado>): Resultado => ({ clave: "regla:x", origen: "regla", titulo: "t", articulo: null, fuente: null, url: null, vigencia: null, verificado: null, departamento: null, texto: "t", coincidencia: "palabras", puntaje: 0.01, similitud: null, relajada: false, ...x });
  assert.equal(respaldoSuficiente([]), false);
  assert.equal(respaldoSuficiente([r({})]), true);
  assert.equal(respaldoSuficiente([r({ relajada: true })]), false);
  assert.equal(respaldoSuficiente([r({ coincidencia: "significado", similitud: 0.41 })]), false);
  assert.equal(respaldoSuficiente([r({ coincidencia: "significado", similitud: 0.71 })]), true);
});


prueba("Alertas de gastos: duplicados, atípicos (mediana y MAD), sin documento, factura sin IVA y proyección", () => {
  const g = (id: string, x: Partial<GastoAlerta>): GastoAlerta => ({ id, fecha: "2026-11-05", period: "2026-11-01", monto: 15000, iva: null, categoria: "combustible", documento: "boleta", proveedor: "Copec", folio: null, descripcion: "Bencina", estado: "registrado", ...x });
  const hist = [10, 9, 8, 7, 6, 5].map((m, i) => g(`h${i}`, { period: `2026-${String(m).padStart(2, "0")}-01`, fecha: `2026-${String(m).padStart(2, "0")}-10`, monto: 14000 + i * 1000 }));
  const mes = [
    g("a", { folio: "120" }), g("b", { folio: "120", fecha: "2026-11-06" }), // mismo folio y comercio
    g("c", { monto: 98000, fecha: "2026-11-20" }), // atípico para combustible
    g("d", { documento: "sin_documento", monto: 60000, categoria: "otros", proveedor: null, descripcion: "Arreglo" }),
    g("e", { documento: "factura", categoria: "insumos", proveedor: "Ferretería", monto: 11900 }),
    g("f", { folio: "120", estado: "descartado" }),
  ];
  const a = alertasGastos(mes, hist, { combustible: "Combustible" });
  const de = (id: string) => a.filter((x) => x.id === id).map((x) => x.tipo);
  assert.deepEqual(de("a"), []);
  assert.deepEqual(de("b"), ["duplicado"]);
  assert.deepEqual(de("c"), ["atipico"]);
  assert.ok(a.find((x) => x.id === "c")?.texto.includes("Combustible"));
  assert.deepEqual(de("d"), ["sin_documento"]);
  assert.deepEqual(de("e"), ["factura_sin_iva"]);
  assert.deepEqual(de("f"), []);
  assert.equal(umbralAtipico([1, 2, 3, 4]), null); // con menos de 5 datos no se juzga
  const p = proyeccionGasto(hist, "2026-11-01");
  assert.equal(p?.monto, 15000); // últimos 3 meses: 14000, 15000, 16000
  assert.equal(proyeccionGasto(hist.slice(0, 2), "2026-11-01"), null);
});


// Segunda opinión independiente: el motor de remuneraciones de ENQORA contra emisso-payroll (MIT, copia en
// scripts/terceros). Mismos parámetros de prueba; el tope AFP se alinea a 81,6 UF, que emisso trae fijo.
prueba("Remuneraciones: segunda opinión con emisso-payroll (MIT) en 48 trabajadores ficticios", () => {
  const UF = 39_500, UTM = 69_000, IMM = 539_000;
  const comision: Record<string, number> = { Habitat: 1.27, Modelo: 0.58, Uno: 0.49, Provida: 1.45 };
  const p: Parametros = { uf: UF, utm: UTM, imm: IMM, tope_afp_uf: 81.6, tope_afc_uf: 122.6,
    afp: Object.fromEntries(Object.entries(comision).map(([k, v]) => [k, 10 + v])), sis: 1.54, aporte_ci: 0.1, aporte_ev: 0.9, aporte_rp: 0,
    afc_indefinido_trab: 0.6, afc_indefinido_emp: 2.4, afc_plazo_emp: 3, salud_legal: 7 };
  const tasasEmisso = Object.fromEntries(Object.entries(comision).map(([k, v]) => [k.toLowerCase(), { commissionRate: v, sisRate: 1.54 }]));
  const tablaEmisso = [[0, 13.5, 0, 0], [13.5, 30, 4, 0.54], [30, 50, 8, 1.74], [50, 70, 13.5, 4.49], [70, 90, 23, 11.14], [90, 120, 30.4, 17.8], [120, 310, 35.5, 23.92], [310, null, 40, 37.87]]
    .map(([from, to, rate, deduction]) => ({ from: from as number, to: to as number | null, rate: rate as number, deduction: deduction as number }));
  const n = leerNovedades({})!;
  let casos = 0;
  for (const sueldo of [539_000, 650_000, 900_000, 1_250_000, 1_800_000, 2_400_000])
    for (const afp of Object.keys(comision))
      for (const gratificacion of ["art50", "ninguna"] as const) {
        const t: Trabajador = { id: "x", nombre: "Ficticio", tipo_contrato: "indefinido", sueldo_base: sueldo, jornada_horas: 42, afp, salud: "fonasa",
          plan_isapre_uf: null, colacion: 0, movilizacion: 0, gratificacion };
        const nuestro = liquidar(t, n, p, 0.93);
        const grat = emissoGrat(sueldo, gratificacion === "art50" ? "legal" : "none", 0, IMM);
        const imp = sueldo + grat;
        const afpE = emissoAFP(imp, afp.toLowerCase(), tasasEmisso, UF);
        const saludE = emissoSalud(imp, "fonasa", 0, UF);
        const afcE = emissoAFC(imp, "indefinido").employee;
        const impuestoE = emissoImpuesto(imp - afpE - saludE - afcE, tablaEmisso, UTM);
        const id = `${sueldo} ${afp} ${gratificacion}`;
        assert.equal(nuestro.montos.gratificacion, grat, `gratificación ${id}`);
        assert.equal(nuestro.total_imponible, imp, `imponible ${id}`);
        assert.equal(nuestro.montos.afp, afpE, `AFP ${id}`);
        assert.equal(nuestro.montos.salud_legal, saludE, `salud ${id}`);
        assert.equal(nuestro.montos.afc_trab, afcE, `AFC ${id}`);
        // Bajo 120 UTM ambas tablas coinciden; se acepta $1 por redondeo.
        assert.ok(Math.abs(nuestro.montos.impuesto - impuestoE) <= 1, `impuesto ${id}: ${nuestro.montos.impuesto} vs ${impuestoE}`);
        assert.ok(Math.abs(nuestro.liquido - (imp - afpE - saludE - afcE - impuestoE)) <= 1, `líquido ${id}`);
        casos++;
      }
  assert.equal(casos, 48);

  // Diferencias conocidas, donde ENQORA sigue la norma y emisso no (se dejan fijas para que nadie «corrija» hacia atrás):
  const base: Trabajador = { id: "x", nombre: "Ficticio", tipo_contrato: "indefinido", sueldo_base: 900_000, jornada_horas: 42, afp: "Uno", salud: "fonasa",
    plan_isapre_uf: null, colacion: 0, movilizacion: 0, gratificacion: "art50" };
  // 1) Plazo fijo y obra: el trabajador no cotiza seguro de cesantía; solo el empleador, 3% (Ley 19.728, art. 5).
  assert.equal(liquidar({ ...base, tipo_contrato: "plazo_fijo" }, n, p, 0.93).montos.afc_trab, 0);
  assert.ok(emissoAFC(900_000, "plazo_fijo").employee > 0);
  // 2) La gratificación del art. 50 se calcula sobre lo devengado en el mes, incluidas horas extra y bonos; emisso usa solo el sueldo base.
  const conBono = liquidar({ ...base, sueldo_base: 600_000 }, { ...n, bonos_imponibles: 100_000 }, p, 0.93);
  assert.equal(conBono.montos.gratificacion, Math.min(Math.round(700_000 * 0.25), Math.round((4.75 * IMM) / 12)));
  assert.equal(emissoGrat(600_000, "legal", 0, IMM), Math.round(600_000 * 0.25) > Math.round((4.75 * IMM) / 12) ? Math.round((4.75 * IMM) / 12) : 150_000);
  // 3) El 7% de salud tiene el mismo tope imponible que la AFP; emisso lo calcula sin tope.
  const alto = liquidar({ ...base, sueldo_base: 5_000_000, gratificacion: "ninguna" }, n, p, 0.93);
  assert.equal(alto.montos.salud_legal, Math.round((Math.round(81.6 * UF) * 7) / 100));
  assert.ok(emissoSalud(5_000_000, "fonasa", 0, UF) > alto.montos.salud_legal);
  // 4) Tramos altos del impuesto único (SII, Circular N° 42 de 2026): 120 a 310 UTM, factor 35% y rebaja 23,32 UTM;
  //    310 UTM y más, 40% y rebaja 38,82 UTM. emisso trae 35,5%/23,92 y 40%/37,87. Bajo 120 UTM ambos coinciden.
  assert.equal(impuestoUnico(200 * UTM, UTM), Math.round((200 * 0.35 - 23.32) * UTM));
  assert.equal(impuestoUnico(400 * UTM, UTM), Math.round((400 * 0.40 - 38.82) * UTM));
  assert.notEqual(emissoImpuesto(200 * UTM, tablaEmisso, UTM), impuestoUnico(200 * UTM, UTM));
  for (let b = 0; b < 120 * UTM; b += 7_000) assert.ok(Math.abs(impuestoUnico(b, UTM) - emissoImpuesto(b, tablaEmisso, UTM)) <= 1, `base ${b}`);
});

console.log(`${ok} pruebas correctas${fallos.length ? `, ${fallos.length} fallidas` : ""}.`);
if (fallos.length) {
  console.log(fallos.join("\n"));
  process.exit(1);
}
