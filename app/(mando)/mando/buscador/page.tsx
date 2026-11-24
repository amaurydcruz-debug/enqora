import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { modeloVectores, vectoresDisponibles } from "@/lib/ai/embeddings";
import { ORIGENES } from "@/lib/conocimiento";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { PanelBuscador, PanelIndexar } from "./panel";

export const metadata: Metadata = { title: "Buscador legal" };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Estado = { activos?: number; con_vector?: number; inactivos?: number; por_origen?: Record<string, number>; modelos?: string[]; actualizado?: string | null };

// Centro de Mando → Buscador legal: responde con la norma, el artículo y la fuente verificada, o dice «no tengo fuente».
export default async function BuscadorPage() {
  const role = await myStaffRole();
  if (!role) notFound();
  const supervisor = isSupervisorRole(role);
  const { data } = await (await createClient()).rpc("conocimiento_estado");
  const e = (data as Estado | null) ?? {};

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · ENQORA BRAIN</span>
          <h1>Buscador legal</h1>
          <p className="hero-lead">
            Busca en el conocimiento verificado de ENQORA (reglas con su artículo, rutas de casos, obligaciones laborales y publicaciones de
            ENQORA Informa) por significado y por palabras. Cada resultado trae su fuente y fecha de verificación. Si no hay respaldo, lo dice:
            nunca inventa una norma.
          </p>
        </div>
      </header>

      <PanelBuscador />

      <section className="card">
        <h2>Índice</h2>
        <ul className="ref-list" role="list">
          <li>
            <span className="ref-main">
              <b>{e.activos ?? 0} fragmentos activos</b>
              <small className="muted-line">
                {Object.entries(e.por_origen ?? {}).map(([k, v]) => `${ORIGENES[k as keyof typeof ORIGENES] ?? k}: ${v}`).join(" · ") || "Aún no se ha cargado."}
                {e.inactivos ? ` · ${e.inactivos} retirados (se conservan)` : ""}
              </small>
            </span>
            <span className={`status status-${e.activos ? "ok" : "muted"}`}>{e.activos ? "Cargado" : "Vacío"}</span>
          </li>
          <li>
            <span className="ref-main">
              <b>Búsqueda por significado</b>
              <small className="muted-line">
                {vectoresDisponibles()
                  ? `Modelo ${modeloVectores()} (Hugging Face). ${e.con_vector ?? 0} de ${e.activos ?? 0} fragmentos con vector.`
                  : "Sin HF_TOKEN en Vercel: el buscador funciona solo por palabras."}
              </small>
            </span>
            <span className={`status status-${vectoresDisponibles() && e.activos && e.con_vector === e.activos ? "ok" : "muted"}`}>
              {vectoresDisponibles() ? (e.activos && e.con_vector === e.activos ? "Completo" : "Pendiente") : "Solo palabras"}
            </span>
          </li>
        </ul>
        {supervisor ? <PanelIndexar /> : <p className="muted-line">Supervisión actualiza el índice cuando cambia la base de conocimiento o se publica en ENQORA Informa.</p>}
      </section>
    </div>
  );
}
