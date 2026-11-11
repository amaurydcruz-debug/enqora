import { revisarPrescripcion, type ExpedientePersona, type PersonaAnswers } from "@/lib/cora/personas";
import type { ServiceOffer } from "@/lib/initial-report";

// CORA Personas · Tu solución. Convierte el diagnóstico en UNA ruta concreta para el caso de esta persona:
// el resultado que va a conseguir, los pasos en orden, quién hace cada uno (la persona, ENQORA o ambos),
// lo que la persona obtiene gratis en los portales oficiales, el plazo que manda y el costo.
// Reglas: ENQORA nunca pide claves, no paga ni firma convenios por el cliente, y no promete resultados que
// dependen de un organismo. El costo solo se muestra con tarifas publicadas.

export type Quien = "tu" | "enqora" | "ambos";
export type PasoSolucion = { titulo: string; quien: Quien; detalle: string; servicio?: ServiceOffer | null; gratis?: boolean };
export type SolucionPersona = {
  titulo: string;          // el resultado, en palabras de la persona
  resultado: string;       // cómo queda al terminar
  plazo?: { fecha: string; texto: string };
  pasos: PasoSolucion[];
  tuTraes: string[];       // documentos que obtiene gratis, con su clave
  costo: string;
  relato: string;          // texto con el que se abre la solicitud (la persona lo puede editar)
};

export const QUIEN: Record<Quien, string> = { tu: "Tú", enqora: "ENQORA", ambos: "Tú, con ENQORA" };

const clp = (n: number) => `$${n.toLocaleString("es-CL")}`;
const FIN_TGR = "2027-04-15";

function costoDe(servicios: ServiceOffer[]): string {
  const unicos = servicios.filter((s, i) => servicios.findIndex((x) => (x.codigo ?? x.id) === (s.codigo ?? s.id)) === i);
  if (!unicos.length) return "Sin costo de servicios.";
  const con = unicos.filter((s) => s.disponible && (s.precio ?? 0) > 0);
  const total = con.reduce((t, s) => t + (s.precio ?? 0), 0);
  const nombres = unicos.map((s) => s.nombre).join(", ");
  if (con.length === unicos.length) return `Desde ${clp(total)} en total por ${nombres} (tarifas publicadas). Los pagos al Estado son aparte.`;
  return `Se cotiza a tu medida (${nombres}). Un profesional te envía el precio total antes de empezar; no pagas nada hasta aceptarlo. Los pagos al Estado son aparte.`;
}

function servicioDe(e: ExpedientePersona, id: string): ServiceOffer | null {
  return e.prioridades.find((n) => n.id === id)?.servicio ?? e.necesidades.find((n) => n.id === id)?.servicio ?? null;
}

export function solucionPersona(a: PersonaAnswers, e: ExpedientePersona, today = new Date()): SolucionPersona | null {
  const hoy = today.toISOString().slice(0, 10);
  const deuda = (a.deudas === "si" || a.deudas === "no_se") && hoy <= FIN_TGR;
  const atrasado = a.declara !== "si";
  const prescripcion = revisarPrescripcion(a);

  // ---------- Negocio sin movimiento ----------
  if (a.venta === "inactivo") {
    const tgr = servicioDe(e, "p_tgr");
    const decl = servicioDe(e, "p_declaraciones");
    const cierre = servicioDe(e, "p_cierre");
    const retomar = servicioDe(e, "p_retomar");
    const presc = servicioDe(e, "p_prescripcion");
    const objetivo = a.futuro === "cerrar" ? "Cerrar tu negocio" : a.futuro === "retomar" ? "Retomar tu negocio" : "Decidir si cerrar o retomar tu negocio";
    const pasos: PasoSolucion[] = [
      {
        titulo: "Reúne tus antecedentes", quien: "tu", gratis: true,
        detalle: `Descarga tu Carpeta Tributaria en sii.cl${deuda ? " y tu certificado de deuda en tgr.cl" : ""}, con tu propia clave, y súbelos a tu espacio ENQORA. Nunca nos entregas tus claves.`,
      },
      {
        titulo: "Diagnóstico con números", quien: "enqora",
        detalle: [
          atrasado ? "Revisamos qué declaraciones faltan y cuánto suman sus multas" : "Confirmamos que tus declaraciones estén al día",
          prescripcion ? "revisamos deuda por deuda cuáles podrían estar prescritas (en general 3 años desde que debieron pagarse, o 6 si no se declararon)" : null,
          deuda ? `calculamos cuánto debes${prescripcion ? " de verdad" : ""} y cuánto se condona pagando al contado o en convenio` : null,
          a.futuro === "no_se" ? "y te mostramos qué cuesta cerrar frente a retomar" : null,
        ].filter(Boolean).join(", ") + ". Te lo explicamos antes de hacer nada.",
      },
    ];
    if (a.futuro === "no_se") pasos.push({ titulo: "Tú decides", quien: "tu", detalle: "Con el diagnóstico en la mano eliges cerrar o retomar. Seguimos según lo que decidas." });
    if (prescripcion) pasos.push({ titulo: "Pedimos que se declaren prescritas las deudas antiguas", quien: "enqora", servicio: presc,
      detalle: "Si hay deudas cuyo cobro prescribió, preparamos la solicitud ante la Tesorería con tu mandato. Mientras tanto no pagas ni firmas nada por esas deudas: hacerlo las reconocería." });
    if (atrasado) pasos.push({ titulo: "Ponemos al día tus declaraciones", quien: "enqora", servicio: decl,
      detalle: "Preparamos las declaraciones atrasadas que corresponda presentar (en cero si no hubo movimiento) y las presentamos solo con tu aprobación y un mandato firmado." });
    if (deuda) pasos.push({ titulo: prescripcion ? "Pagas solo lo que no prescribió, con la condonación" : "Pagas tu deuda con la condonación", quien: "ambos", servicio: tgr,
      detalle: "Te acompañamos en tgr.cl a pagar al contado o firmar el convenio con condonación de la Ley 21.850. Tú pagas y aceptas el convenio con tu clave; ENQORA nunca paga ni firma por ti." });
    if (a.futuro !== "retomar") pasos.push({ titulo: a.futuro === "cerrar" ? "Cerramos el negocio" : "Si decides cerrar: término de giro", quien: "enqora", servicio: cierre,
      detalle: `Preparamos y presentamos el término de giro ante el SII, y lo seguimos hasta la resolución. Desde ahí dejas de tener obligaciones mensuales por ese negocio.${a.deudas === "si" ? " Con deudas tributarias vigentes el SII no lo cierra por ti (presunción de la Ley 21.713): hay que hacerlo." : ""}` });
    if (a.futuro !== "cerrar") pasos.push({ titulo: a.futuro === "retomar" ? "Retomas con la contabilidad al día" : "Si decides retomar: contabilidad al día", quien: "enqora", servicio: retomar,
      detalle: "Llevamos tu F29 y tu renta cada mes para que no vuelvan a acumularse multas." });

    const servicios = pasos.map((p) => p.servicio).filter((s): s is ServiceOffer => !!s);
    return {
      titulo: `${objetivo}${deuda ? (prescripcion ? " sin pagar deudas prescritas, con condonación en las demás" : " pagando tu deuda con la Tesorería con condonación") : ""}${atrasado ? " y con tus declaraciones al día" : ""}`,
      resultado: a.futuro === "cerrar"
        ? `Tu negocio cerrado ante el SII${deuda ? ", tu deuda pagada o en convenio con la condonación" : ""} y sin obligaciones mensuales por él.`
        : a.futuro === "retomar"
          ? `Tus declaraciones al día${deuda ? ", tu deuda pagada o en convenio con la condonación" : ""} y tu negocio funcionando en regla.`
          : `Una decisión informada sobre tu negocio${deuda ? ", tu deuda pagada o en convenio con la condonación" : ""} y tus obligaciones en orden.`,
      plazo: deuda ? { fecha: "15 de abril de 2027", texto: "Último día para pagar o firmar convenio con la condonación de la Ley 21.850. No tiene prórroga." } : undefined,
      pasos,
      tuTraes: ["Carpeta Tributaria Electrónica (gratis en sii.cl)", ...(deuda ? ["Certificado de deuda de la Tesorería (gratis en tgr.cl)"] : []),
        ...(prescripcion ? ["Certificado de movimientos de deudas fiscales (gratis en tgr.cl)"] : []), "Tu cédula de identidad"],
      costo: costoDe(servicios),
      relato: [
        "Tengo inicio de actividades como persona natural, pero hoy no tengo movimiento.",
        atrasado ? (a.declara === "no" ? "Dejé de presentar mis declaraciones." : "No sé si mis declaraciones están al día.") : "Mis declaraciones están al día.",
        a.deudas === "si" ? "Tengo deudas con la Tesorería y quiero pagarlas con la condonación de la Ley 21.850." : a.deudas === "no_se" ? "No sé si tengo deudas con la Tesorería." : "",
        a.deudas === "si" && a.antiguedad === "antiguas" ? "Algunas deudas tienen más de 3 años: quiero saber si están prescritas antes de pagar." : a.deudas === "si" && a.antiguedad === "no_se" ? "No sé de cuándo son las deudas: quiero revisar si alguna está prescrita." : "",
        a.futuro === "cerrar" ? "Quiero cerrar el negocio con el término de giro." : a.futuro === "retomar" ? "Quiero retomar el negocio." : "Aún no decido si cerrar o retomar el negocio.",
      ].filter(Boolean).join(" "),
    };
  }

  // ---------- Demás perfiles: la ruta sale de sus prioridades, en orden ----------
  if (!e.prioridades.length) return null;
  const pasos: PasoSolucion[] = [
    { titulo: "Reúne tus antecedentes", quien: "tu", gratis: true,
      detalle: a.venta === "sin_inicio" ? "Ten a mano tu cédula de identidad y la descripción de lo que vas a vender." : "Descarga tu Carpeta Tributaria en sii.cl con tu propia clave y súbela a tu espacio ENQORA." },
    ...e.prioridades.map((n): PasoSolucion => ({ titulo: n.necesidad, quien: "enqora", detalle: n.proximo, servicio: n.servicio })),
  ];
  const servicios = pasos.map((p) => p.servicio).filter((s): s is ServiceOffer => !!s);
  return {
    titulo: e.prioridades.map((n) => n.necesidad.charAt(0).toLowerCase() + n.necesidad.slice(1)).join(", ").replace(/^./, (c) => c.toUpperCase()),
    resultado: "Tus prioridades resueltas en orden, con un profesional responsable en cada paso.",
    plazo: deuda ? { fecha: "15 de abril de 2027", texto: "Último día para la condonación de la Ley 21.850 en la Tesorería." } : undefined,
    pasos,
    tuTraes: a.venta === "sin_inicio" ? ["Tu cédula de identidad"] : ["Carpeta Tributaria Electrónica (gratis en sii.cl)", ...(deuda ? ["Certificado de deuda de la Tesorería (gratis en tgr.cl)"] : [])],
    costo: costoDe(servicios),
    relato: `Quiero resolver: ${e.prioridades.map((n) => n.necesidad.toLowerCase()).join("; ")}.`,
  };
}
