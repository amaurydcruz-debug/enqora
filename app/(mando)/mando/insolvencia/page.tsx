import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ameritaRevision, senalesInsolvencia } from "@/lib/insolvencia";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Insolvencia" };
export const dynamic = "force-dynamic";

type Caso = { id: string; folio: string; title: string; description: string | null; status: string; module: string; created_at: string; company_id: string };

// Centro de Mando → Insolvencia: casos abiertos con señales de que el cliente no puede pagar sus deudas.
// Solo equipo. El abogado evalúa y decide; al cliente no le llega nada desde aquí.
export default async function InsolvenciaPage() {
  const role = await myStaffRole();
  if (!role || role === "ai_agent") notFound();
  const sb = await createClient();
  const { data } = await sb.from("cases").select("id, folio, title, description, status, module, created_at, company_id")
    .not("status", "in", "(cerrado,cancelado)").order("created_at", { ascending: false }).limit(600);
  const casos = ((data as Caso[] | null) ?? [])
    .map((c) => ({ ...c, senales: senalesInsolvencia(`${c.title} ${c.description ?? ""}`) }))
    .filter((c) => ameritaRevision(c.senales));
  const ids = [...new Set(casos.map((c) => c.company_id))];
  const { data: cos } = ids.length ? await sb.from("companies").select("id, legal_name, trade_name, es_prueba").in("id", ids) : { data: [] };
  const empresa = new Map(((cos as { id: string; legal_name: string; trade_name: string | null; es_prueba: boolean }[] | null) ?? []).map((x) => [x.id, x]));

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Legal</span>
          <h1>Posible insolvencia</h1>
          <p className="hero-lead">
            Casos abiertos con señales de que el cliente no puede pagar sus deudas ni regularizarse. Antes de proponer nada, un abogado evalúa
            las alternativas: convenios con Tesorería o el SII y repactaciones; y, si no alcanzan, las rutas de la Ley 20.720 modificada por la
            Ley 21.563: reorganización simplificada o liquidación voluntaria simplificada (micro y pequeñas empresas) y renegociación gratuita de
            la persona deudora en la Superir.
          </p>
        </div>
      </header>

      <section className="card">
        <h2>{casos.length ? `${casos.length} caso(s) por evaluar` : "Sin casos con señales"}</h2>
        {casos.length ? (
          <ul className="ref-list" role="list">
            {casos.map((c) => {
              const e = empresa.get(c.company_id);
              return (
                <li key={c.id}>
                  <span className="ref-main">
                    <Link href={`/casos/${c.id}`}><b>{c.folio} · {c.title}</b></Link>
                    <small className="muted-line">{e ? (e.trade_name || e.legal_name) : "Empresa"}{e?.es_prueba ? " · PRUEBA" : ""} · {c.status.replace(/_/g, " ")}</small>
                    <small className="muted-line">Señales: {c.senales.join(" · ")}</small>
                  </span>
                  <Link href={`/casos/${c.id}`} className="btn btn-ghost btn-inline btn-sm">Evaluar</Link>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted-line">Cuando un caso traiga señales (deudas vencidas, embargos, cobranza judicial, «no puedo pagar»…), aparecerá aquí y los abogados recibirán un aviso.</p>}
      </section>

      <section className="card">
        <h2>Cómo se trabaja</h2>
        <ol className="ref-list">
          <li><span className="ref-main">En el caso, ejecuta el <b>Agente Legal</b> con la indicación «evaluar insolvencia»: usa la habilidad enqora-insolvencia y deja la orientación de rutas como propuesta.</span></li>
          <li><span className="ref-main">El abogado revisa deudas, tamaño de la empresa, bienes, avales y trabajadores, y decide la ruta.</span></li>
          <li><span className="ref-main">Lo gratuito se informa como gratuito: la renegociación de la Superir y la nominación de veedor o liquidador no tienen costo.</span></li>
          <li><span className="ref-main">La ClaveÚnica la usa el propio cliente en la Superir; ENQORA nunca la pide.</span></li>
        </ol>
      </section>
    </div>
  );
}
