// Calendario de cumplimiento (0072). Motor puro: a partir del perfil de «Empresa al día» y una fecha, arma los
// vencimientos de los próximos días. Reglas fijas de la investigación del 21-11-2026 (doc «Empresa al día»).
// Las fechas son las reglas generales; cuando un plazo cae en fin de semana o festivo, la nota lo advierte.

import type { Perfil } from "@/lib/empresa-al-dia";

export type Vencimiento = {
  clave: string;          // estable por obligación y fecha: sirve para no avisar dos veces
  fecha: string;          // AAAA-MM-DD
  titulo: string;
  detalle: string;
  institucion: string;
  categoria: string | null; // trámite de ENQORA que lo resuelve
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const finDeMes = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const mesAnterior = (y: number, m: number) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });

// Vencimientos entre `desde` (incluido) y `desde + dias`.
export function vencimientos(p: Perfil, desde: string, dias = 60): Vencimiento[] {
  const ini = Date.parse(`${desde}T12:00:00Z`);
  const fin = ini + dias * 86_400_000;
  const dentro = (f: string) => { const t = Date.parse(`${f}T12:00:00Z`); return t >= ini && t <= fin; };
  const out: Vencimiento[] = [];
  const add = (v: Vencimiento) => { if (dentro(v.fecha)) out.push(v); };
  const y0 = Number(desde.slice(0, 4));
  const m0 = Number(desde.slice(5, 7));
  const conTrab = p.trabajadores >= 1;

  // Recorre el mes actual y los siguientes que caben en la ventana.
  for (let k = 0; k <= Math.ceil(dias / 28) + 1; k++) {
    const m = ((m0 - 1 + k) % 12) + 1;
    const y = y0 + Math.floor((m0 - 1 + k) / 12);
    const ant = mesAnterior(y, m);
    const periodo = `${MESES[ant.m - 1]} ${ant.y}`;
    // Se usa el día 12 (el plazo más temprano) para no avisar tarde a quien no puede usar el día 20.
    add({ clave: `f29:${iso(y, m, 12)}`, fecha: iso(y, m, 12), titulo: `F29 de ${periodo}`, institucion: "SII", categoria: "contabilidad",
      detalle: "IVA, PPM y retenciones. Vence el día 12; hasta el día 20 si declaras y pagas por internet como facturador electrónico. Se presenta aunque no haya movimiento." });
    if (conTrab) {
      add({ clave: `previred:${iso(y, m, 13)}`, fecha: iso(y, m, 13), titulo: `Cotizaciones de ${periodo} en Previred`, institucion: "Previred", categoria: "empleador",
        detalle: "Declarar hasta el día 10 y pagar por internet hasta el día 13 (incluye el aporte del empleador a pensiones)." });
    }
    if (p.trabajadores >= 5) {
      add({ clave: `lre:${iso(y, m, 15)}`, fecha: iso(y, m, 15), titulo: `Libro de Remuneraciones de ${periodo}`, institucion: "Dirección del Trabajo", categoria: "empleador",
        detalle: "Dentro de los primeros 15 días del mes siguiente al pago (la DT los cuenta como hábiles: esta es la fecha más temprana)." });
    }
    if (m === 1 || m === 7) {
      if (p.local || p.tipo === "empresa") {
        add({ clave: `patente:${iso(y, m, finDeMes(y, m))}`, fecha: iso(y, m, finDeMes(y, m)), titulo: `Patente municipal · cuota de ${MESES[m - 1]}`, institucion: "Municipalidad", categoria: "formalizacion",
          detalle: "La patente se paga en dos cuotas al año (enero y julio). Revisa la fecha exacta en tu municipalidad." });
      }
    }
    if (m === 1 && p.trabajadores >= 100) {
      add({ clave: `inclusion:${iso(y, 1, 31)}`, fecha: iso(y, 1, 31), titulo: "Comunicación de inclusión laboral", institucion: "Dirección del Trabajo", categoria: "empleador",
        detalle: "Empresas de 100 o más trabajadores informan cada enero el cumplimiento de la cuota de personas con discapacidad." });
    }
    if (m === 3 && (p.tipo === "empresa" || conTrab)) {
      add({ clave: `dj:${iso(y, 3, 1)}`, fecha: iso(y, 3, 1), titulo: "Comienzan las declaraciones juradas anuales", institucion: "SII", categoria: "tributario",
        detalle: "Entre marzo y junio, cada declaración (sueldos 1887, honorarios 1879 y otras) tiene su propia fecha en el calendario del SII." });
    }
    if (m === 4) {
      add({ clave: `f22:${iso(y, 4, 30)}`, fecha: iso(y, 4, 30), titulo: `F22 · Operación Renta ${y}`, institucion: "SII", categoria: "tributario",
        detalle: "Declaración anual de renta. Si no se presenta, queda la anotación «No declarante F22»." });
    }
    if (m === 8 && conTrab) {
      add({ clave: `aporte:${iso(y, 8, 1)}`, fecha: iso(y, 8, 1), titulo: "Cambia el aporte del empleador a pensiones", institucion: "Previred", categoria: "empleador",
        detalle: "La Ley 21.735 sube el aporte del empleador por etapas cada agosto: revisa el nuevo porcentaje antes de calcular los sueldos." });
    }
  }
  // Hitos únicos.
  if (conTrab) add({ clave: "jornada40:2028-04-26", fecha: "2028-04-26", titulo: "Jornada de 40 horas", institucion: "Dirección del Trabajo", categoria: "empleador",
    detalle: "Desde el 26-04-2028 el máximo semanal baja de 42 a 40 horas, sin rebajar sueldos." });
  add({ clave: "datos:2026-12-01", fecha: "2026-12-01", titulo: "Ley de datos personales (21.719)", institucion: "Agencia de Protección de Datos", categoria: "profesionales",
    detalle: "Vigencia fijada para el 1-12-2026; hay un proyecto en trámite para postergarla al 15-10-2027." });

  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.titulo.localeCompare(b.titulo));
}

// Días entre hoy y la fecha (para «vence en 3 días»).
export const diasHasta = (hoy: string, fecha: string) => Math.round((Date.parse(`${fecha}T12:00:00Z`) - Date.parse(`${hoy}T12:00:00Z`)) / 86_400_000);
// Se avisa 7 días antes y 1 día antes.
export const tocaAvisar = (hoy: string, v: Vencimiento) => [7, 1].includes(diasHasta(hoy, v.fecha));
