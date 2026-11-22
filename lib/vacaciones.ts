// Control de vacaciones (0084). Saldo de feriado de un trabajador a una fecha de corte, a partir de sus registros.
// Reglas: 15 días hábiles por cada año de servicio cumplido (art. 67), más el progresivo acreditado (art. 68);
// el feriado se puede acumular solo hasta dos períodos (art. 70). Los días tomados los cuenta la base de datos
// (lunes a viernes sin festivos; el sábado es inhábil para el feriado, art. 69).
import { feriadoProporcional } from "@/lib/finiquito";

export type RegistroVacacion = {
  id: string; trabajador_id: string; tipo: "tomado" | "saldo_inicial" | "progresivo"; desde: string; hasta: string | null; dias: number;
  nota: string | null; estado: "vigente" | "anulado"; creado: string; motivo_anulacion: string | null;
};
export type SaldoVacaciones = {
  devengado: number; tomados: number; programados: number; saldo: number; proporcional: number;
  proximo_aniversario: string; advertencias: string[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;
// Aniversarios del ingreso (k >= 1) hasta la fecha de corte, inclusive.
export function aniversarios(ingreso: string, corte: string): string[] {
  const out: string[] = [];
  const y = Number(ingreso.slice(0, 4));
  const md = ingreso.slice(4);
  for (let k = 1; k < 80; k++) {
    // 29 de febrero: el aniversario de los años no bisiestos cae el 28.
    let f = `${y + k}${md}`;
    if (md === "-02-29" && new Date(`${f}T00:00:00Z`).getUTCMonth() !== 1) f = `${y + k}-02-28`;
    if (f > corte) break;
    out.push(f);
  }
  return out;
}

export function saldoVacaciones(ingreso: string, corte: string, hoy: string, registros: RegistroVacacion[]): SaldoVacaciones {
  const vig = registros.filter((x) => x.estado === "vigente");
  const inicial = vig.find((x) => x.tipo === "saldo_inicial") ?? null;
  const desdeCorte = inicial?.desde ?? "";
  const anis = aniversarios(ingreso, corte).filter((a) => a > desdeCorte);
  let devengado = (inicial ? Number(inicial.dias) : 0) + 15 * anis.length;
  for (const p of vig.filter((x) => x.tipo === "progresivo")) devengado += Number(p.dias) * anis.filter((a) => a >= p.desde).length;
  const tomadosReg = vig.filter((x) => x.tipo === "tomado" && x.desde > desdeCorte);
  const tomados = tomadosReg.filter((x) => x.desde <= hoy).reduce((s, x) => s + Number(x.dias), 0);
  const programados = tomadosReg.filter((x) => x.desde > hoy).reduce((s, x) => s + Number(x.dias), 0);
  const saldo = r2(devengado - tomados - programados);
  const adv: string[] = [];
  if (saldo > 30) adv.push("Acumula más de dos períodos: el feriado solo se puede acumular hasta dos períodos (art. 70). Conviene otorgar el más antiguo.");
  if (saldo < 0) adv.push("Tiene días tomados por adelantado (más de los ganados).");
  const proximo = aniversarios(ingreso, `${Number(corte.slice(0, 4)) + 2}-12-31`).find((a) => a > corte) ?? "";
  return {
    devengado: r2(devengado), tomados: r2(tomados), programados: r2(programados), saldo,
    proporcional: r2(feriadoProporcional(ingreso, corte, 15)), proximo_aniversario: proximo, advertencias: adv,
  };
}
