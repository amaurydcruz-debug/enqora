/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarGastoAction, leerFotoGastoAction, leerTextoGastoAction, prepararFotoGastoAction } from "@/app/actions/gastos";
import { Notice } from "@/components/auth-card";
import { prepararImagen } from "@/components/subir-documentos";
import { AVISO_GASTO, CATEGORIAS_GASTO, DOCUMENTOS_GASTO, type Gasto } from "@/lib/gastos";
import { createClient } from "@/lib/supabase/client";
import { escuchar, soporteVoz, useModoVoz } from "@/lib/voz/navegador";

type Origen = "foto" | "voz" | "texto";
type Borrador = Gasto & { uso: "negocio" | "personal" | "por_confirmar" };

// «Registrar gasto»: foto de la boleta, voz o texto. La IA propone; la persona revisa y guarda.
export function RegistrarGasto({ companyId, hoy }: { companyId: string; hoy: string }) {
  const router = useRouter();
  const camara = useRef<HTMLInputElement>(null);
  const voz = useModoVoz();
  const [puedeVoz, setPuedeVoz] = useState(false);
  const [paso, setPaso] = useState<"inicio" | "texto" | "leyendo" | "revisar">("inicio");
  const [origen, setOrigen] = useState<Origen>("texto");
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState<{ path: string; url: string } | null>(null);
  const [lectura, setLectura] = useState<unknown>(null);
  const [g, setG] = useState<Borrador | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => setPuedeVoz(soporteVoz().escuchar), []);

  const vacio = (): Borrador => ({ fecha: hoy, monto: 0, iva: null, descripcion: "", categoria: "otros", documento: "boleta", proveedor: null, folio: null, confianza: "baja", dudas: [], uso: "negocio" });
  const reiniciar = () => { setPaso("inicio"); setG(null); setFoto(null); setTexto(""); setLectura(null); };

  async function onFoto(file: File | undefined) {
    if (!file) return;
    setMsg(null); setOrigen("foto"); setPaso("leyendo");
    try {
      const f = await prepararImagen(file);
      const prep = await prepararFotoGastoAction(companyId, f.type, f.size);
      if (prep.error || !prep.path || !prep.token) throw new Error(prep.error ?? "No se pudo preparar la foto.");
      const up = await createClient().storage.from("expedientes").uploadToSignedUrl(prep.path, prep.token, f, { contentType: f.type });
      if (up.error) throw new Error("La subida falló. Revisa tu conexión.");
      setFoto({ path: prep.path, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : "" });
      const r = await leerFotoGastoAction(companyId, prep.path, f.type);
      setLectura(r.lectura ?? null);
      setG(r.gasto ? { ...r.gasto, uso: "negocio" } : vacio());
      if (r.error) setMsg({ kind: "error", text: r.error });
      setPaso("revisar");
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo leer la foto." });
      setPaso("inicio");
    } finally {
      if (camara.current) camara.current.value = "";
    }
  }

  async function leerTexto(t: string, o: Origen) {
    setMsg(null); setOrigen(o); setPaso("leyendo");
    const r = await leerTextoGastoAction(t).catch(() => ({ error: "No se pudo leer el gasto.", gasto: undefined, lectura: undefined }));
    if (r.error || !r.gasto) { setMsg({ kind: "error", text: r.error ?? "No se pudo leer el gasto." }); setPaso(o === "texto" ? "texto" : "inicio"); return; }
    setLectura(r.lectura ?? null);
    setG({ ...r.gasto, uso: "negocio" });
    setPaso("revisar");
  }

  async function onVoz() {
    setMsg(null);
    const dicho = await escuchar(12_000);
    if (!dicho) { setMsg({ kind: "error", text: "No te escuchamos. Intenta de nuevo o escribe el gasto." }); return; }
    setTexto(dicho);
    await leerTexto(dicho, "voz");
  }

  async function guardar() {
    if (!g) return;
    if (!g.monto || g.monto <= 0) return setMsg({ kind: "error", text: "Ingresa el monto." });
    if (g.descripcion.trim().length < 2) return setMsg({ kind: "error", text: "Describe el gasto." });
    setGuardando(true);
    const r = await guardarGastoAction(companyId, {
      fecha: g.fecha, monto: Math.round(g.monto), iva: g.iva, descripcion: g.descripcion.trim(), categoria: g.categoria, documento: g.documento,
      proveedor: g.proveedor, folio: g.folio, uso: g.uso, origen, storage_path: foto?.path ?? null,
      lectura: lectura && typeof lectura === "object" ? lectura : null,
    }).catch(() => ({ error: "No se pudo guardar. Intenta nuevamente." }));
    setGuardando(false);
    if (r.error) return setMsg({ kind: "error", text: r.error });
    setMsg({ kind: "ok", text: "Gasto guardado. Tu contador lo revisa al cerrar el mes." });
    reiniciar();
    router.refresh();
  }

  const set = <K extends keyof Borrador>(k: K, v: Borrador[K]) => setG((x) => (x ? { ...x, [k]: v } : x));
  const avisos = g ? [g.uso === "personal" ? AVISO_GASTO.personal : "", AVISO_GASTO[g.documento] ?? ""].filter(Boolean) : [];

  return (
    <div className="gx">
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <input ref={camara} id="gx-foto" type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={(e) => void onFoto(e.target.files?.[0])} />

      {paso === "inicio" ? (
        <div className="gx-modos">
          <label htmlFor="gx-foto" className="gx-modo"><span className="gx-ico" aria-hidden="true">📷</span><b>Foto de la boleta</b><small>CORA lee el monto, la fecha y el comercio.</small></label>
          {puedeVoz ? (
            <button type="button" className="gx-modo" onClick={() => void onVoz()}>
              <span className="gx-ico" aria-hidden="true">🎙</span><b>{voz.escuchando ? "Te escucho…" : "Dictar"}</b>
              <small>{voz.escuchando ? voz.parcial || "Ej.: «gasté 15.990 en bencina, con boleta»" : "«Gasté 15.990 en bencina, con boleta»."}</small>
            </button>
          ) : null}
          <button type="button" className="gx-modo" onClick={() => { setPaso("texto"); setOrigen("texto"); }}>
            <span className="gx-ico" aria-hidden="true">✍</span><b>Escribir</b><small>Cuéntalo con tus palabras.</small>
          </button>
        </div>
      ) : null}

      {paso === "texto" ? (
        <div className="gx-texto">
          <textarea className="input" rows={2} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Ej.: ayer pagué 45 mil de arriendo de bodega, sin boleta" aria-label="Describe el gasto" autoFocus />
          <div className="upload-row">
            <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={() => void leerTexto(texto, "texto")}>Continuar</button>
            <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={() => { setG(vacio()); setPaso("revisar"); }}>Llenar a mano</button>
            <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={reiniciar}>Cancelar</button>
          </div>
        </div>
      ) : null}

      {paso === "leyendo" ? <p className="gx-leyendo" role="status">CORA está leyendo tu gasto…</p> : null}

      {paso === "revisar" && g ? (
        <div className="gx-revisar">
          {foto?.url ? <img src={foto.url} alt="Foto del comprobante" className="gx-foto" /> : null}
          <div className="gx-campos">
            <p className="muted-line">Revisa lo que leyó CORA{g.confianza !== "alta" ? " (confírmalo con cuidado)" : ""} y guarda.</p>
            {g.dudas.length ? <ul className="gx-dudas">{g.dudas.map((d) => <li key={d}>{d}</li>)}</ul> : null}
            <div className="form-grid">
              <label className="field"><span>Monto total (CLP)</span><input className="input mono" inputMode="numeric" value={g.monto ? String(g.monto) : ""} onChange={(e) => set("monto", Number(e.target.value.replace(/\D/g, "")) || 0)} /></label>
              <label className="field"><span>Fecha</span><input type="date" className="input" max={hoy} value={g.fecha} onChange={(e) => set("fecha", e.target.value)} /></label>
              <label className="field field-wide"><span>¿Qué compraste?</span><input className="input" maxLength={300} value={g.descripcion} onChange={(e) => set("descripcion", e.target.value)} /></label>
              <label className="field"><span>Categoría</span>
                <select className="input" value={g.categoria} onChange={(e) => set("categoria", e.target.value)}>{Object.entries(CATEGORIAS_GASTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="field"><span>Comprobante</span>
                <select className="input" value={g.documento} onChange={(e) => set("documento", e.target.value)}>{Object.entries(DOCUMENTOS_GASTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="field"><span>Comercio (opcional)</span><input className="input" maxLength={160} value={g.proveedor ?? ""} onChange={(e) => set("proveedor", e.target.value || null)} /></label>
              <label className="field"><span>N° de documento (opcional)</span><input className="input mono" maxLength={30} value={g.folio ?? ""} onChange={(e) => set("folio", e.target.value || null)} /></label>
            </div>
            <fieldset className="gx-uso">
              <legend>¿Es del negocio?</legend>
              {([["negocio", "Del negocio"], ["personal", "Personal"], ["por_confirmar", "No sé"]] as const).map(([k, v]) => (
                <label key={k} className={`chip-opcion${g.uso === k ? " is-on" : ""}`}><input type="radio" name="uso" checked={g.uso === k} onChange={() => set("uso", k)} /> {v}</label>
              ))}
            </fieldset>
            {avisos.map((a) => <p key={a} className="gx-aviso">{a}</p>)}
            <div className="upload-row">
              <button type="button" className={`btn btn-gold btn-inline${guardando ? " is-busy" : ""}`} disabled={guardando} onClick={() => void guardar()}>{guardando ? "Guardando…" : "Guardar gasto"}</button>
              <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={reiniciar} disabled={guardando}>Cancelar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
