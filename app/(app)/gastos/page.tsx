import Link from "next/link";
import type { Metadata } from "next";
import { gastoDescartarAction, gastoUsoAction } from "@/app/actions/gastos";
import { Notice } from "@/components/auth-card";
import { Callout } from "@/components/disclosure";
import { SubmitButton } from "@/components/submit-button";
import { booksCompany } from "@/lib/accounting-server";
import { messageForCode } from "@/lib/db-errors";
import { AVISO_GASTO, CATEGORIAS_GASTO, DOCUMENTOS_GASTO } from "@/lib/gastos";
import { clp, todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { RegistrarGasto } from "./registrar";

export const metadata: Metadata = { title: "Registrar gasto" };

type Fila = {
  id: string; fecha: string; monto: number; descripcion: string; categoria: string; documento: string; proveedor: string | null;
  uso: "negocio" | "personal" | "por_confirmar"; origen: string; estado: "registrado" | "revisado" | "descartado"; storage_path: string | null; nota: string | null;
};
const AVISOS: Record<string, string> = { uso: "Listo, quedó clasificado.", descartado: "Gasto descartado (queda registrado con su motivo)." };
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fechaCorta = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1].slice(0, 3)}`; };

// «Registrar gasto» (etapa 2 de la contabilidad mensual): foto de la boleta, voz o texto, y los gastos del mes.
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const sp = await searchParams;
  const company = await booksCompany();
  if (!company) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">Tu contabilidad</span><h1>Registrar gasto</h1></div></header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          Los gastos se registran por empresa.
        </Callout>
      </div>
    );
  }
  const hoy = todayCL();
  const desde = `${hoy.slice(0, 7)}-01`;
  const supabase = await createClient();
  const { data } = await supabase.from("gastos").select("id, fecha, monto, descripcion, categoria, documento, proveedor, uso, origen, estado, storage_path, nota")
    .eq("company_id", company.id).gte("fecha", desde).order("fecha", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  const filas = (data ?? []) as Fila[];
  const fotos = filas.map((f) => f.storage_path).filter((p): p is string => !!p);
  const { data: firmadas } = fotos.length ? await supabase.storage.from("expedientes").createSignedUrls(fotos, 600) : { data: [] };
  const url = new Map(((firmadas ?? []) as { path: string | null; signedUrl: string }[]).map((f) => [f.path ?? "", f.signedUrl]));
  const vivos = filas.filter((f) => f.estado !== "descartado");
  const total = (fn: (f: Fila) => boolean) => vivos.filter(fn).reduce((s, f) => s + Number(f.monto), 0);
  const negocio = total((f) => f.uso === "negocio");
  const sinDoc = total((f) => f.uso === "negocio" && f.documento === "sin_documento");
  const porConfirmar = vivos.filter((f) => f.uso === "por_confirmar").length;
  const mes = MESES[Number(hoy.slice(5, 7)) - 1];

  return (
    <div className="page narrow ps">
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{company.name} · Tu contabilidad</span>
          <h1>Registrar gasto</h1>
          <p className="hero-lead">Saca una foto a la boleta, díctalo o escríbelo. CORA lo ordena, tú lo confirmas y tu contador lo revisa al cerrar el mes.</p>
        </div>
      </header>

      {company.canBook ? <section className="ps-card"><RegistrarGasto companyId={company.id} hoy={hoy} /></section> : (
        <Callout kind="info" title="Solo lectura">Registran gastos el propietario, el administrador o el contador de la empresa.</Callout>
      )}

      <section className="ps-card" aria-labelledby="gx-mes">
        <div className="ps-card-cab"><h2 id="gx-mes">Gastos de {mes}</h2><Link href={`/contabilidad/${hoy.slice(0, 7)}`} className="ps-link">Contabilidad del mes</Link></div>
        <dl className="gx-totales">
          <div><dt>Del negocio</dt><dd>{clp(negocio)}</dd></div>
          <div><dt>Sin documento</dt><dd>{clp(sinDoc)}</dd></div>
          <div><dt>Por clasificar</dt><dd>{porConfirmar}</dd></div>
        </dl>
        {sinDoc > 0 ? <p className="gx-aviso">{AVISO_GASTO.sin_documento}</p> : null}
        {filas.length ? (
          <ul className="ps-filas">
            {filas.map((f) => (
              <li key={f.id} className={f.estado === "descartado" ? "is-descartado" : ""}>
                <span>
                  <b>{f.descripcion}</b>
                  <small>
                    {fechaCorta(f.fecha)} · {CATEGORIAS_GASTO[f.categoria] ?? f.categoria} · {DOCUMENTOS_GASTO[f.documento] ?? f.documento}
                    {f.proveedor ? ` · ${f.proveedor}` : ""}{f.storage_path && url.get(f.storage_path) ? <> · <a href={url.get(f.storage_path)} target="_blank" rel="noopener noreferrer">ver foto</a></> : null}
                    {f.estado === "revisado" ? " · ✓ revisado por tu contador" : ""}{f.estado === "descartado" ? ` · descartado${f.nota ? `: ${f.nota}` : ""}` : ""}
                  </small>
                </span>
                <b className="mono">{clp(Number(f.monto))}</b>
                {f.estado === "registrado" && company.canBook ? (
                  <>
                    {f.uso === "por_confirmar" ? (
                      <form action={gastoUsoAction} className="gx-chips">
                        <input type="hidden" name="id" value={f.id} />
                        <span className="muted-line">¿Del negocio?</span>
                        <SubmitButton name="uso" value="negocio" variant="ghost" className="btn-inline btn-sm" pendingText="…">Sí</SubmitButton>
                        <SubmitButton name="uso" value="personal" variant="ghost" className="btn-inline btn-sm" pendingText="…">Personal</SubmitButton>
                      </form>
                    ) : <span className="badge badge-muted">{f.uso === "personal" ? "Personal" : "Negocio"}</span>}
                    <details className="ps-docs">
                      <summary>Descartar</summary>
                      <form action={gastoDescartarAction} className="upload-row">
                        <input type="hidden" name="id" value={f.id} />
                        <input name="motivo" className="input input-sm" required minLength={3} maxLength={200} placeholder="Motivo (ej.: lo ingresé dos veces)" aria-label="Motivo" />
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Descartar</SubmitButton>
                      </form>
                    </details>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">Aún no registras gastos este mes.</p>}
      </section>
    </div>
  );
}
