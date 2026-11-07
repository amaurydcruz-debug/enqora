"use client";

// Voz del navegador (piloto): reconocimiento con Web Speech API y lectura con speechSynthesis.
// Pensado para reemplazarse por un proveedor de voz natural sin cambiar las pantallas: estas solo usan
// `soporteVoz`, `hablar`, `escuchar`, `detenerVoz` y el estado compartido `useModoVoz`.
// El audio no pasa por ENQORA ni se guarda. Aviso: en Chrome y Edge el reconocimiento lo procesa el servicio del navegador.
import { useSyncExternalStore } from "react";
import { paraVoz } from "@/lib/voz/interpretar";

type Reconocedor = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
type CtorReconocedor = new () => Reconocedor;

const ctor = (): CtorReconocedor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: CtorReconocedor; webkitSpeechRecognition?: CtorReconocedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export function soporteVoz(): { escuchar: boolean; hablar: boolean } {
  return { escuchar: !!ctor(), hablar: typeof window !== "undefined" && "speechSynthesis" in window };
}

// ── Estado compartido: modo voz activo, lo que CORA está diciendo (subtítulo) y si está escuchando ──
type Estado = { activo: boolean; subtitulo: string; escuchando: boolean; parcial: string };
let estado: Estado = { activo: false, subtitulo: "", escuchando: false, parcial: "" };
const subs = new Set<() => void>();
const set = (p: Partial<Estado>) => { estado = { ...estado, ...p }; subs.forEach((f) => f()); };
const INICIAL: Estado = { activo: false, subtitulo: "", escuchando: false, parcial: "" };
export function useModoVoz(): Estado {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => estado, () => INICIAL);
}
export const activarModoVoz = (activo: boolean) => { set({ activo }); if (!activo) detenerVoz(); };
export const modoVozActivo = () => estado.activo;

// ── Hablar ──
function vozEspanol(): SpeechSynthesisVoice | null {
  const voces = window.speechSynthesis.getVoices();
  return voces.find((v) => v.lang === "es-CL") ?? voces.find((v) => v.lang === "es-419" || v.lang === "es-US" || v.lang === "es-MX")
    ?? voces.find((v) => v.lang.startsWith("es")) ?? null;
}

let turnoHabla = 0;
// Lee el texto frase por frase (Chrome corta los textos largos) y muestra cada frase como subtítulo.
export async function hablar(texto: string): Promise<void> {
  if (!soporteVoz().hablar || !texto.trim()) return;
  const id = ++turnoHabla;
  window.speechSynthesis.cancel();
  if (!window.speechSynthesis.getVoices().length) await new Promise((r) => { window.speechSynthesis.onvoiceschanged = () => r(null); setTimeout(r, 800); });
  const voz = vozEspanol();
  const frases = texto.split(/(?<=[.!?])\s+/).map((f) => f.trim()).filter(Boolean);
  for (const f of frases) {
    if (id !== turnoHabla) return;
    set({ subtitulo: f });
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(paraVoz(f));
      u.lang = voz?.lang ?? "es-CL"; if (voz) u.voice = voz;
      u.rate = 1.02; u.pitch = 1;
      u.onend = () => resolve(); u.onerror = () => resolve();
      window.speechSynthesis.speak(u);
      setTimeout(resolve, 20_000 + f.length * 120); // nunca quedar colgado
    });
  }
  if (id === turnoHabla) set({ subtitulo: "" });
}

// ── Escuchar ──
let actual: Reconocedor | null = null;
// Escucha una frase. Devuelve el texto reconocido, "" si no oyó nada, o null si no hay micrófono o se negó el permiso.
export function escuchar(ms = 9000): Promise<string | null> {
  const C = ctor();
  if (!C) return Promise.resolve(null);
  detenerEscucha();
  return new Promise((resolve) => {
    const rec = new C();
    actual = rec;
    rec.lang = "es-CL"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let final = "", listo = false;
    const fin = (v: string | null) => { if (listo) return; listo = true; clearTimeout(t); set({ escuchando: false, parcial: "" }); actual = null; resolve(v); };
    const t = setTimeout(() => { try { rec.stop(); } catch { /* ya detenido */ } }, ms);
    rec.onresult = (e) => {
      let parcial = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) final += r[0].transcript; else parcial += r[0].transcript;
      }
      set({ parcial: (final + " " + parcial).trim() });
    };
    rec.onerror = (e) => fin(e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture" ? null : final.trim());
    rec.onend = () => fin(final.trim());
    set({ escuchando: true, parcial: "" });
    try { rec.start(); } catch { fin(null); }
  });
}

function detenerEscucha() { try { actual?.abort(); } catch { /* nada */ } actual = null; }

export function detenerVoz() {
  turnoHabla++;
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  detenerEscucha();
  set({ subtitulo: "", escuchando: false, parcial: "" });
}
