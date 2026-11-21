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
import { gastoDesdeTexto, validarGasto } from "@/lib/gastos";
import { alertaCruce, medioDePago, resumirPorDia } from "@/lib/pos";

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

console.log(`${ok} pruebas correctas${fallos.length ? `, ${fallos.length} fallidas` : ""}.`);
if (fallos.length) {
  console.log(fallos.join("\n"));
  process.exit(1);
}
