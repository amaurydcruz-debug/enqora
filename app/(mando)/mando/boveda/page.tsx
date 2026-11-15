import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pedirDocumentoAction } from "@/app/actions/boveda";
import { Notice } from "@/components/auth-card";
import { SubmitButton } from "@/components/submit-button";
import { CLASES, EQUIPO, ESTADOS, TIPOS } from "@/lib/boveda";
import { messageForCode } from "@/lib/db-errors";
import { fechaCL } from "@/lib/informa";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bóveda de archivos · Centro de Mando" };
export const maxDuration = 60;

type Row = { id: string; folio: string; titulo: string; tipo: string; clase: string; estado: string; origen: string; case_id: string | null;
  confidencialidad: string; version_actual: number; created_at: string; updated_at: string; retencion_legal: boolean };
type Caso = { id: string; folio: string; title: string };

const COLAS: { titulo: string; estados: string[] }[] = [
  { titulo: "Pedidos nuevos: Secretaria y Redactor", estados: ["solicitado", "antecedentes", "observado"] },
  { titulo: "Borradores por revisar visualmente", estados: ["borrador"] },
  { titulo: "En revisión profesional", estados: ["en_revision"] },
  { titulo: "Aprobados: por autorizar y enviar", estados: ["aprobado"] },
];

// Bóveda de archivos ENQORA: el Archivero recibe pedidos, el equipo documental los prepara y todo queda registrado.
export default async function BovedaPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; clase?: string; aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  let q = supabase.from("vault_documents").select("id, folio, titulo, tipo, clase, estado, origen, case_id, confidencialidad, version_actual, created_at, updated_at, retencion_legal")
    .order("updated_at", { ascending: false }).limit(200);
  const busca = (sp.q ?? "").trim().slice(0, 60);
  if (busca) q = q.or(`folio.ilike.%${busca.replace(/[%,()]/g, "")}%,titulo.ilike.%${busca.replace(/[%,()]/g, "")}%`);
  if (sp.estado && ESTADOS[sp.estado]) q = q.eq("estado", sp.estado);
  if (sp.clase && CLASES[sp.clase]) q = q.eq("clase", sp.clase);
  const [{ data: docs, error }, { data: tab }, { data: casos }] = await Promise.all([
    q, supabase.rpc("vault_tablero"),
    supabase.from("cases").select("id, folio, title").not("status", "in", "(cerrado,cancelado)").order("created_at", { ascending: false }).limit(200),
  ]);
  if (error && /vault_documents|relation/.test(error.message)) {
    return <div className="page"><header className="hero"><div className="hero-main"><span className="eyebrow">Centro de Mando</span><h1>Bóveda de archivos</h1>
      <p className="hero-lead">Falta pegar en Supabase la migración 0059 (Bóveda de archivos). Revisa Estado del sistema.</p></div></header></div>;
  }
  const rows = (docs ?? []) as Row[];
  const conteo = (tab ?? {}) as Record<string, number>;
  const folioCaso = new Map(((casos ?? []) as Caso[]).map((c) => [c.id, c.folio]));
  const filtrando = !!(busca || sp.estado || sp.clase);

  const fila = (d: Row) => (
    <li key={d.id} className="inf-cola-item">
      <span className="mono">{d.folio}</span>
      <span className={`badge ${ESTADOS[d.estado]?.tono === "ok" ? "badge-ok" : ESTADOS[d.estado]?.tono === "muted" ? "badge-muted" : "badge-gold"}`}>{ESTADOS[d.estado]?.texto ?? d.estado}</span>
      {d.confidencialidad !== "cliente" ? <span className="badge badge-muted">{d.confidencialidad === "reservado" ? "Reservado" : "Interno"}</span> : null}
      {d.retencion_legal ? <span className="badge badge-gold">Retención legal</span> : null}
      <Link href={`/mando/boveda/${d.id}`}><b>{d.titulo}</b></Link>
      <small>{CLASES[d.clase] ?? d.clase} · {d.case_id ? folioCaso.get(d.case_id) ?? "caso" : "empresa"} · {d.origen === "subido" ? "archivo subido" : `versión ${d.version_actual}`} · {fechaCL(d.updated_at)}</small>
    </li>
  );

  return (
    <div className="page inf-mando">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando</span>
          <h1>Bóveda de archivos ENQORA</h1>
          <p className="hero-lead">Todo documento de ENQORA se genera y se guarda aquí, con folio, caso, versiones con huella SHA-256, responsables y una bitácora que no se puede alterar. Los agentes preparan; las personas revisan, autorizan y envían.</p>
        </div>
      </header>
      {sp.aviso === "pedido" ? <Notice kind="ok">Pedido registrado en la Bóveda.</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="inf-kpis" aria-label="Estado de la Bóveda">
        {["solicitado", "borrador", "en_revision", "aprobado", "enviado", "archivado"].map((e) => (
          <Link key={e} href={`/mando/boveda?estado=${e}`} className={(conteo[e] ?? 0) && ["en_revision", "aprobado"].includes(e) ? "is-alerta" : undefined}>
            <b>{conteo[e] ?? 0}</b><small>{ESTADOS[e].texto}</small>
          </Link>
        ))}
      </section>

      <section className="card" aria-labelledby="pedir-t">
        <h2 id="pedir-t">Pídele un documento al Archivero</h2>
        <form action={pedirDocumentoAction} className="mini-form">
          <input type="hidden" name="desde" value="mando" />
          <div className="inline-form">
            <select name="case_id" className="input" required aria-label="Caso" defaultValue="">
              <option value="" disabled>Elige el caso</option>
              {((casos ?? []) as Caso[]).map((c) => <option key={c.id} value={c.id}>{c.folio} · {c.title}</option>)}
            </select>
            <select name="tipo" className="input" aria-label="Tipo de documento" defaultValue="">
              <option value="">Que el Archivero lo identifique</option>
              {TIPOS.map((t) => <option key={t.key} value={t.key}>{t.titulo}</option>)}
            </select>
          </div>
          <textarea name="pedido" className="input" rows={2} maxLength={500} placeholder="Ej.: necesito los antecedentes y el poder para registrar la marca del cliente en INAPI" aria-label="Pedido" />
          <div className="inline-form">
            <input name="destinatario" className="input" maxLength={200} placeholder="Destinatario o institución (opcional)" aria-label="Destinatario" />
            <select name="confidencialidad" className="input input-sm" defaultValue="cliente" aria-label="Confidencialidad">
              <option value="cliente">Visible para el cliente</option><option value="interno">Interno del equipo</option><option value="reservado">Reservado (supervisión y responsables)</option>
            </select>
            <SubmitButton variant="gold" className="btn-inline" pendingText="El Archivero está registrando…">Pedir documento</SubmitButton>
          </div>
        </form>
      </section>

      {!filtrando ? COLAS.map((c) => {
        const lista = rows.filter((r) => c.estados.includes(r.estado));
        return (
          <section key={c.titulo} className="card">
            <h2>{c.titulo} ({lista.length})</h2>
            {lista.length ? <ul className="inf-cola">{lista.map(fila)}</ul> : <p className="muted-line">Nada pendiente.</p>}
          </section>
        );
      }) : null}

      <section className="card" aria-labelledby="registro-t">
        <h2 id="registro-t">Registro de documentos</h2>
        <form className="inline-form" role="search">
          <input name="q" className="input" defaultValue={busca} placeholder="Folio o título" aria-label="Buscar" />
          <select name="estado" className="input input-sm" defaultValue={sp.estado ?? ""} aria-label="Estado"><option value="">Todos los estados</option>{Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.texto}</option>)}</select>
          <select name="clase" className="input input-sm" defaultValue={sp.clase ?? ""} aria-label="Clase"><option value="">Todas las clases</option>{Object.entries(CLASES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <button type="submit" className="btn btn-ghost btn-inline btn-sm">Filtrar</button>
          {filtrando ? <Link href="/mando/boveda" className="btn btn-ghost btn-inline btn-sm">Limpiar</Link> : null}
        </form>
        {rows.length ? <ul className="inf-cola">{rows.map(fila)}</ul> : <p className="muted-line">No hay documentos{filtrando ? " con ese filtro" : ""}.</p>}
      </section>

      <section className="card" aria-labelledby="equipo-t">
        <h2 id="equipo-t">Equipo documental</h2>
        <ul className="inf-agentes">{EQUIPO.map((e) => <li key={e.rol}><b>{e.rol}</b><small>{e.quien}</small><span>{e.hace}</span></li>)}</ul>
        <p className="muted-line">Conservación: 6 años por defecto (plazo de revisión del SII, arts. 17 y 200 del Código Tributario); la supervisión puede extenderla o marcar retención legal. Nada se borra: se anula con motivo.</p>
      </section>
    </div>
  );
}
