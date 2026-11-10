// Pruebas de los motores deterministas de ENQORA (sin base de datos ni IA).
// Ejecutar: npm run test:motores
// Cada prueba fija una regla legal o una definición de indicador: si alguien cambia una regla sin querer, falla aquí.

import assert from "node:assert/strict";
import { empresaHoy, proximoUmbral } from "@/lib/dashboard/empresa-hoy";
import { oportunidades, FIN_PLAZO_TGR, TASA_GENERAL, TASA_PRO_PYME } from "@/lib/cora/oportunidades";
import { ejecutivo } from "@/lib/mando/ejecutivo";
import { operacion, type Run } from "@/lib/agentes/operacion";
import { runCalculator } from "@/lib/tax-calc";
import { analizarReglas } from "@/lib/cora/caso";
import { PLAYBOOKS, RULES } from "@/lib/knowledge";
import { estadoDocumento, renderPreview, resumenLegal, type CaseLegalStatus } from "@/lib/legal";

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

console.log(`${ok} pruebas correctas${fallos.length ? `, ${fallos.length} fallidas` : ""}.`);
if (fallos.length) {
  console.log(fallos.join("\n"));
  process.exit(1);
}
