// Dominios oficiales (Estado de Chile y servicios oficiales). Los usa el enjambre investigador para buscar y
// ENQORA Informa para aceptar imágenes de una publicación. Sin dependencias: sirve en servidor y navegador.
export const OFFICIAL_DOMAINS = [
  "sii.cl", "bcn.cl", "leychile.cl", "tgr.cl", "dt.gob.cl", "inapi.cl", "chileatiende.gob.cl", "diariooficial.interior.gob.cl",
  "registrodeempresasysociedades.cl", "cmfchile.cl", "corfo.cl", "sercotec.cl", "previred.com", "suseso.cl", "spensiones.cl",
  "aduana.cl", "minsal.cl", "sag.gob.cl", "conservador.cl", "economia.gob.cl", "pjud.cl",
  // M16: todo el dominio gob.cl (solo organismos del Estado) y servicios con dominio propio.
  "gob.cl", "sernac.cl", "sernatur.cl", "mercadopublico.cl", "chilecompra.cl", "ispch.cl", "sec.cl", "nic.cl", "prochile.gob.cl",
  // Fomento y oportunidades (2026-11-27). Los .gob.cl (FOSIS, SernamEG, INDAP, CNR, Chile Emprende, Portal de
  // Emprendimiento, ChileAtiende) ya entran por «gob.cl». FOGAPE no tiene sitio propio verificado: lo administra
  // BancoEstado y lo regula Hacienda.
  "sence.cl", "prodemu.cl", "dedecon.cl", "bancoestado.cl", "hacienda.cl", "cerronavia.cl",
];

export function esDominioOficial(url: string | null | undefined): boolean {
  try {
    const u = new URL(String(url));
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
