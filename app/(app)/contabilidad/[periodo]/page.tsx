import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  clearBankAction,
  clearBookAction,
  decideVatAction,
  presentVatAction,
  reconcileAction,
  reconcileOtherAction,
  saveVatDraftAction,
  submitVatAction,
  unreconcileAction,
  voidVatAction,
} from "@/app/actions/accounting";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import {
  docLabel,
  docSign,
  FLAGS,
  nextMonthLabel,
  periodFromParam,
  periodLabel,
  RECON_CATEGORIES,
  VAT_STATUSES,
  type AccDocument,
  type BankMovement,
  type Reconciliation,
  type VatReturn,
} from "@/lib/accounting";
import { booksCompany } from "@/lib/accounting-server";
import { day, moment, todayCl } from "@/lib/billing";
import { messageForCode } from "@/lib/db-errors";
import { clp } from "@/lib/pricing";
import { formatRut } from "@/lib/rut";
import { myStaffRole } from "@/lib/staff";
import { createClient, currentUser } from "@/lib/supabase/server";
import { BookImporter } from "./book-importer";

export const metadata: Metadata = { title: "Contabilidad del período" };

const AVISOS: Record<string, string> = {
  libro_vaciado: "Libro vaciado (los documentos conciliados se conservaron). Puedes volver a cargarlo.",
  banco_vaciado: "Movimientos de la cuenta eliminados (los conciliados se conservaron).",
  conciliado: "Conciliación registrada.",
  clasificado: "Movimiento clasificado.",
  desconciliado: "Conciliación deshecha.",
  f29_calculado: "Borrador del F29 calculado con los documentos cargados.",
  f29_enviado: "F29 enviado a revisión profesional.",
  f29_aprobado: "F29 aprobado. El período quedó cerrado para cambios.",
  f29_devuelto: "F29 devuelto al borrador con observaciones.",
  f29_presentado: "Presentación registrada con su folio.",
  f29_anulado: "Borrador del F29 anulado.",
};

const n = (v: unknown) => Number(v ?? 0);

function DocTable({ docs }: { docs: AccDocument[] }) {
  return (
    <div className="table-scroll">
      <table className="ledger-table">
        <thead>
          <tr><th>Fecha</th><th>Documento</th><th>Contraparte</th><th className="num">Neto</th><th className="num">Exento</th><th className="num">IVA</th><th className="num">Total</th></tr>
        </thead>
        <tbody>
          {docs.slice(0, 300).map((d) => (
            <tr key={d.id} className={docSign(d.doc_type) < 0 ? "is-negative" : ""}>
              <td>{d.issue_date ? day(d.issue_date, "medium") : "—"}</td>
              <td><span className="mono">{d.doc_type}</span> {docLabel(d.doc_type)} · <span className="mono">{d.folio}</span></td>
              <td>{d.counterpart_name ?? "—"}{d.counterpart_rut ? <small className="mono"> {formatRut(d.counterpart_rut)}</small> : null}</td>
              <td className="num">{clp(d.net)}</td>
              <td className="num">{clp(d.exempt)}</td>
              <td className="num">{clp(d.vat)}</td>
              <td className="num">{docSign(d.doc_type) < 0 ? "−" : ""}{clp(d.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {docs.length > 300 ? <p className="muted-line">Se muestran 300 de {docs.length} documentos.</p> : null}
    </div>
  );
}

// Período contable: ventas, compras, banco, conciliación y F29.
export default async function PeriodPage({
  params,
  searchParams,
}: {
  params: Promise<{ periodo: string }>;
  searchParams: Promise<{ empresa?: string; aviso?: string; error?: string }>;
}) {
  const { periodo } = await params;
  const sp = await searchParams;
  const period = periodFromParam(periodo);
  if (!period) notFound();
  const company = await booksCompany(sp.empresa);
  if (!company) notFound();
  const staffRole = await myStaffRole();
  const supabase = await createClient();
  const user = await currentUser();

  const [{ data: dRows }, { data: mRows }, { data: rRows }, { data: sugg }, { data: figs }, { data: vRows }, { data: subRows }] = await Promise.all([
    supabase.from("acc_documents").select("*").eq("company_id", company.id).eq("period", period).order("issue_date").limit(5000),
    supabase.from("bank_movements").select("*").eq("company_id", company.id).eq("period", period).order("movement_date").limit(5000),
    supabase.from("reconciliations").select("id, movement_id, document_id, category, note").eq("company_id", company.id).limit(20000),
    supabase.rpc("match_suggestions", { p_company: company.id, p_period: period }),
    supabase.rpc("vat_figures", { p_company: company.id, p_period: period }),
    supabase.from("vat_returns").select("*").eq("company_id", company.id).eq("period", period).neq("status", "anulado").limit(1),
    supabase.from("subscriptions").select("plan_id, status").eq("company_id", company.id).in("status", ["activa", "vencida"]),
  ]);
  const docs = (dRows ?? []) as AccDocument[];
  const moves = (mRows ?? []) as BankMovement[];
  const recs = ((rRows ?? []) as Reconciliation[]).filter((r) => moves.some((m) => m.id === r.movement_id));
  const suggestions = (sugg ?? []) as { movement_id: string; document_id: string; score: number; days: number }[];
  const f = (figs ?? {}) as Record<string, number | string[]>;
  const vat = ((vRows ?? []) as VatReturn[])[0] ?? null;
  const planIds = ((subRows ?? []) as { plan_id: string }[]).map((s) => s.plan_id);
  const { data: planRows } = planIds.length ? await supabase.from("plans").select("name, limit_documents").in("id", planIds) : { data: [] };
  const limits = ((planRows ?? []) as { name: string; limit_documents: number | null }[]).filter((p) => p.limit_documents != null);
  const limit = limits.length ? Math.max(...limits.map((p) => p.limit_documents!)) : null;

  const ventas = docs.filter((d) => d.book === "venta");
  const compras = docs.filter((d) => d.book === "compra");
  const docById = new Map(docs.map((d) => [d.id, d]));
  const recByMove = new Map(recs.map((r) => [r.movement_id, r]));
  const pending = moves.filter((m) => !recByMove.has(m.id));
  const locked = vat?.status === "aprobado" || vat?.status === "presentado";
  const canBook = company.canBook;
  const reviewer = !!staffRole && ["accountant_pro", "enqora_admin", "ops_director"].includes(staffRole);
  const accounts = [...new Set(moves.map((m) => m.account_label))];
  const hidden = (
    <>
      <input type="hidden" name="company_id" value={company.id} />
      <input type="hidden" name="period" value={periodo} />
    </>
  );
  const q = sp.empresa ? `?empresa=${company.id}` : "";
  const sum = (list: AccDocument[], k: keyof AccDocument) => list.reduce((s, d) => s + docSign(d.doc_type) * Number(d[k]), 0);
  const alertas = (vat ? vat.flags : ((f.alertas as string[]) ?? [])).filter((x) => FLAGS[x]);
  const debit = n(f.debito);
  const credit = n(f.credito);

  const bookItem = (key: "ventas" | "compras", list: AccDocument[]): AccordionItem => ({
    id: key,
    title: key === "ventas" ? "Ventas" : "Compras",
    description: `${list.length} documento${list.length === 1 ? "" : "s"} · neto ${clp(sum(list, "net"))} · IVA ${clp(sum(list, "vat"))}`,
    emblem: <Emblem name={key === "ventas" ? "crece" : "documentos"} size="sm" />,
    status: list.length ? <span>{clp(sum(list, "total"))}</span> : <span className="status status-muted">Sin cargar</span>,
    content: (
      <div className="catalog-body">
        {list.length ? <DocTable docs={list} /> : <p className="panel-lead">Aún no hay {key} cargadas para este período.</p>}
        {canBook && !locked ? (
          <>
            <details className="more inline-more" open={!list.length}>
              <summary>Cargar detalle del RCV</summary>
              <BookImporter kind={key} companyId={company.id} period={period} />
            </details>
            {list.length ? (
              <form action={clearBookAction}>
                {hidden}
                <input type="hidden" name="book" value={key === "ventas" ? "venta" : "compra"} />
                <ConfirmSubmit variant="ghost" message={`¿Vaciar las ${key} del período para volver a cargarlas? Los documentos conciliados se conservan.`}>Vaciar y volver a cargar</ConfirmSubmit>
              </form>
            ) : null}
          </>
        ) : locked ? <p className="muted-line">El período tiene su F29 {vat?.status}: los documentos no se pueden modificar.</p> : null}
      </div>
    ),
  });

  const items: AccordionItem[] = [
    bookItem("ventas", ventas),
    bookItem("compras", compras),
    {
      id: "banco",
      title: "Banco",
      description: moves.length ? `${moves.length} movimientos · ${accounts.length} cuenta${accounts.length === 1 ? "" : "s"}` : "Sin cartolas cargadas",
      emblem: <Emblem name="pagos" size="sm" />,
      content: (
        <div className="catalog-body">
          {accounts.map((acc) => {
            const list = moves.filter((m) => m.account_label === acc);
            return (
              <section key={acc}>
                <h4 className="sub-title">{acc}</h4>
                <div className="table-scroll">
                  <table className="ledger-table">
                    <thead><tr><th>Fecha</th><th>Descripción</th><th className="num">Monto</th><th className="num">Saldo</th><th>Estado</th></tr></thead>
                    <tbody>
                      {list.slice(0, 400).map((m) => (
                        <tr key={m.id} className={m.amount < 0 ? "is-negative" : ""}>
                          <td>{day(m.movement_date, "medium")}</td>
                          <td>{m.description}</td>
                          <td className="num">{m.amount < 0 ? "−" : ""}{clp(Math.abs(m.amount))}</td>
                          <td className="num">{m.balance != null ? clp(m.balance) : "—"}</td>
                          <td>{recByMove.has(m.id) ? <span className="status status-ok">Conciliado</span> : <span className="status status-muted">Pendiente</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {canBook ? (
                  <form action={clearBankAction}>
                    {hidden}
                    <input type="hidden" name="account" value={acc} />
                    <ConfirmSubmit variant="ghost" message="¿Eliminar los movimientos de esta cuenta en el período? Los conciliados se conservan.">Eliminar movimientos de la cuenta</ConfirmSubmit>
                  </form>
                ) : null}
              </section>
            );
          })}
          {canBook ? (
            <details className="more inline-more" open={!moves.length}>
              <summary>Cargar cartola</summary>
              <BookImporter kind="banco" companyId={company.id} period={period} />
            </details>
          ) : null}
        </div>
      ),
    },
    {
      id: "conciliacion",
      title: "Conciliación bancaria",
      description: moves.length ? `${moves.length - pending.length} de ${moves.length} movimientos conciliados` : "Carga una cartola para conciliar",
      emblem: <Emblem name="proceso" size="sm" />,
      tone: suggestions.length && canBook ? "gold" : "default",
      status: suggestions.length ? <span className="status status-gold">{suggestions.length} sugerencia{suggestions.length === 1 ? "" : "s"}</span> : undefined,
      content: (
        <div className="catalog-body">
          {suggestions.length ? (
            <section>
              <h4 className="sub-title">Coincidencias sugeridas</h4>
              <p className="muted-line">Mismo monto y fecha cercana. Revisa y confirma: ENQORA no concilia nada sin tu confirmación.</p>
              <form action={reconcileAction} className="recon-form">
                {hidden}
                <ul className="pay-list" role="list">
                  {suggestions.map((s) => {
                    const m = moves.find((x) => x.id === s.movement_id);
                    const d = docById.get(s.document_id);
                    if (!m || !d) return null;
                    return (
                      <li key={s.movement_id}>
                        <label className="check-inline recon-pair">
                          <input type="checkbox" name="pair" value={`${m.id}:${d.id}`} defaultChecked={s.score >= 2} disabled={!canBook} />
                          <span className="pay-main">
                            <b>{m.amount < 0 ? "−" : ""}{clp(Math.abs(m.amount))} · {day(m.movement_date, "medium")} · {m.description}</b>
                            <small>↔ {docLabel(d.doc_type)} {d.folio} · {d.counterpart_name ?? formatRut(d.counterpart_rut)} · {d.issue_date ? day(d.issue_date, "medium") : ""}{s.score >= 3 ? " · RUT en la glosa" : ""}</small>
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {canBook ? <SubmitButton className="btn-inline btn-sm" pendingText="Conciliando…">Confirmar seleccionadas</SubmitButton> : null}
              </form>
            </section>
          ) : null}
          {pending.length ? (
            <section>
              <h4 className="sub-title">Movimientos sin conciliar</h4>
              <ul className="pay-list" role="list">
                {pending.filter((m) => !suggestions.some((x) => x.movement_id === m.id)).slice(0, 100).map((m) => (
                  <li key={m.id}>
                    <span className="pay-main">
                      <b>{m.amount < 0 ? "−" : ""}{clp(Math.abs(m.amount))} · {day(m.movement_date, "medium")}</b>
                      <small>{m.description} · {m.account_label}</small>
                    </span>
                    {canBook ? (
                      <form action={reconcileOtherAction} className="inline-form">
                        {hidden}
                        <input type="hidden" name="movement_id" value={m.id} />
                        <select name="category" className="input input-sm" aria-label="Clasificar">
                          {Object.entries(RECON_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Clasificar</SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : moves.length ? <p className="panel-lead">Todos los movimientos del período están conciliados.</p> : <p className="panel-lead">Carga una cartola en «Banco» para conciliar.</p>}
          {recs.length ? (
            <details className="more inline-more">
              <summary>Conciliados ({recs.length})</summary>
              <ul className="pay-list" role="list">
                {recs.slice(0, 200).map((r) => {
                  const m = moves.find((x) => x.id === r.movement_id)!;
                  const d = r.document_id ? docById.get(r.document_id) : null;
                  return (
                    <li key={r.id}>
                      <span className="pay-main">
                        <b>{m.amount < 0 ? "−" : ""}{clp(Math.abs(m.amount))} · {m.description}</b>
                        <small>{d ? `${docLabel(d.doc_type)} ${d.folio} · ${d.counterpart_name ?? ""}` : r.category ? RECON_CATEGORIES[r.category] : "Documento de otro período"}</small>
                      </span>
                      {canBook ? (
                        <form action={unreconcileAction}>
                          {hidden}
                          <input type="hidden" name="reconciliation_id" value={r.id} />
                          <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Deshacer</SubmitButton>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </details>
          ) : null}
          <p className="muted-line">Un movimiento se concilia con un solo documento del mismo monto. Pagos parciales o agrupados se clasifican y se revisan con tu contador.</p>
        </div>
      ),
    },
    {
      id: "f29",
      title: "IVA y F29",
      description: vat ? `Versión ${vat.version} · ${VAT_STATUSES[vat.status].label}` : "Borrador sin calcular",
      emblem: <Emblem name="contabilidad" size="sm" />,
      tone: vat?.status === "en_revision" && reviewer ? "gold" : "default",
      status: vat ? <span className={`status status-${VAT_STATUSES[vat.status].tone}`}>{VAT_STATUSES[vat.status].label}</span> : undefined,
      content: (
        <div className="catalog-body">
          <Callout kind="info" title={`Plazo: día 12 de ${nextMonthLabel(period)}`}>
            O hasta el día 20 si declaras y pagas por internet. Confirma tu plazo en sii.cl. Este cálculo es preliminar: se basa
            en los documentos cargados y no reemplaza la propuesta del SII ni la revisión de un profesional.
          </Callout>
          <div className="table-scroll">
            <table className="ledger-table f29-table">
              <thead><tr><th>Concepto</th><th>Código</th><th className="num">Cantidad</th><th className="num">Monto</th></tr></thead>
              <tbody>
                <tr><td>Facturas emitidas del giro</td><td className="mono">503 · 502</td><td className="num">{n(f.ventas_facturas_cantidad)}</td><td className="num">{clp(n(f.ventas_facturas_iva))}</td></tr>
                <tr><td>Boletas</td><td className="mono">—</td><td className="num">{n(f.ventas_boletas_cantidad)}</td><td className="num">{clp(n(f.ventas_boletas_iva))}</td></tr>
                <tr><td>Notas de débito emitidas</td><td className="mono">—</td><td className="num">{n(f.ventas_nd_cantidad)}</td><td className="num">{clp(n(f.ventas_nd_iva))}</td></tr>
                <tr className="is-negative"><td>Notas de crédito emitidas</td><td className="mono">509 · 510</td><td className="num">{n(f.ventas_nc_cantidad)}</td><td className="num">−{clp(n(f.ventas_nc_iva))}</td></tr>
                <tr className="is-total"><td>Total débitos</td><td className="mono">538</td><td /><td className="num">{clp(vat?.debit ?? debit)}</td></tr>
                <tr><td>Facturas recibidas del giro</td><td className="mono">519 · 520</td><td className="num">{n(f.compras_facturas_cantidad)}</td><td className="num">{clp(n(f.compras_facturas_iva))}</td></tr>
                <tr><td>Notas de débito recibidas</td><td className="mono">—</td><td className="num">{n(f.compras_nd_cantidad)}</td><td className="num">{clp(n(f.compras_nd_iva))}</td></tr>
                <tr className="is-negative"><td>Notas de crédito recibidas</td><td className="mono">527 · 528</td><td className="num">{n(f.compras_nc_cantidad)}</td><td className="num">−{clp(n(f.compras_nc_iva))}</td></tr>
                <tr><td>Remanente de crédito del mes anterior</td><td className="mono">504</td><td /><td className="num">{clp(vat?.prev_remanente ?? 0)}</td></tr>
                <tr className="is-total"><td>Total créditos</td><td className="mono">537</td><td /><td className="num">{clp(vat?.credit ?? credit)}</td></tr>
                <tr className="is-total"><td>{vat && vat.remanente_siguiente ? "Remanente para el período siguiente" : "IVA determinado"}</td><td className="mono">{vat && vat.remanente_siguiente ? "77" : "89"}</td><td /><td className="num">{clp(vat ? (vat.remanente_siguiente || vat.iva_determinado) : Math.max(debit - credit, 0))}</td></tr>
                <tr><td>PPM · base imponible</td><td className="mono">563</td><td /><td className="num">{clp(vat?.ppm_base ?? Math.max(n(f.ventas_netas), 0))}</td></tr>
                <tr><td>PPM · tasa</td><td className="mono">115</td><td /><td className="num">{vat ? `${Number(vat.ppm_rate).toLocaleString("es-CL")}%` : "—"}</td></tr>
                <tr><td>PPM neto determinado</td><td className="mono">62</td><td /><td className="num">{clp(vat?.ppm ?? 0)}</td></tr>
                <tr><td>Retención de honorarios</td><td className="mono">151</td><td /><td className="num">{clp(vat?.retenciones ?? 0)}</td></tr>
                <tr className="is-final"><td>Total a pagar (referencial)</td><td className="mono">91</td><td /><td className="num">{vat ? clp(vat.total_pagar) : "Calcula el borrador"}</td></tr>
              </tbody>
            </table>
          </div>
          {n(f.compras_iva_no_recuperable) ? <p className="muted-line">IVA no recuperable de compras: {clp(n(f.compras_iva_no_recuperable))} (no da derecho a crédito).</p> : null}
          {alertas.length ? (
            <Callout kind="warn" title="Requiere revisión profesional">
              <ul className="flag-list">{alertas.map((a) => <li key={a}>{FLAGS[a]}</li>)}</ul>
            </Callout>
          ) : null}
          {vat?.decision_note && vat.status === "borrador" ? <Callout kind="warn" title="Observaciones de la revisión">{vat.decision_note}</Callout> : null}

          {canBook && (!vat || vat.status === "borrador") ? (
            <form action={saveVatDraftAction} className="catalog-form">
              {hidden}
              <div className="form-grid">
                <div className="field"><label htmlFor="v-rem">Remanente del mes anterior, reajustado (CLP)</label><input id="v-rem" name="prev_remanente" inputMode="numeric" className="input mono" defaultValue={vat?.prev_remanente ?? ""} /></div>
                <div className="field"><label htmlFor="v-ppm">Tasa de PPM (%)</label><input id="v-ppm" name="ppm_rate" inputMode="decimal" className="input mono" defaultValue={vat?.ppm_rate ?? ""} placeholder="Ej.: 0,25" /></div>
                <div className="field"><label htmlFor="v-ret">Retenciones de honorarios (CLP)</label><input id="v-ret" name="retenciones" inputMode="numeric" className="input mono" defaultValue={vat?.retenciones ?? ""} /></div>
              </div>
              <div className="field"><label htmlFor="v-note">Nota</label><input id="v-note" name="note" className="input" maxLength={1000} defaultValue={vat?.note ?? ""} /></div>
              <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Calculando…">{vat ? "Recalcular borrador" : "Calcular borrador"}</SubmitButton></div>
            </form>
          ) : null}

          {vat ? (
            <div className="panel-actions">
              {vat.status === "borrador" && canBook ? (
                <form action={submitVatAction}>{hidden}<input type="hidden" name="return_id" value={vat.id} />
                  <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="Enviando…">Enviar a revisión profesional</SubmitButton>
                </form>
              ) : null}
              {vat.status !== "presentado" && canBook ? (
                <form action={voidVatAction}>{hidden}<input type="hidden" name="return_id" value={vat.id} />
                  <ConfirmSubmit variant="ghost" message="¿Anular este F29? Podrás preparar uno nuevo.">Anular</ConfirmSubmit>
                </form>
              ) : null}
            </div>
          ) : null}

          {vat?.status === "en_revision" ? (
            reviewer && vat.prepared_by !== user?.id ? (
              <form action={decideVatAction} className="catalog-form">
                {hidden}
                <input type="hidden" name="return_id" value={vat.id} />
                <h5 className="sub-title">Revisión profesional</h5>
                <textarea name="note" className="input" rows={2} maxLength={1000} placeholder="Observaciones (obligatorias para devolver)" aria-label="Observaciones" />
                <div className="panel-actions">
                  <SubmitButton name="decision" value="aprobar" className="btn-inline btn-sm" pendingText="…">Aprobar</SubmitButton>
                  <SubmitButton name="decision" value="devolver" variant="ghost" className="btn-inline btn-sm" pendingText="…">Devolver</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="muted-line">En revisión: lo aprueba un contador ENQORA distinto de quien lo preparó.</p>
            )
          ) : null}

          {vat && ["borrador", "aprobado"].includes(vat.status) && canBook ? (
            <details className="more inline-more">
              <summary>Registrar presentación en el SII</summary>
              <form action={presentVatAction} className="mini-form">
                {hidden}
                <input type="hidden" name="return_id" value={vat.id} />
                <p className="muted-line">
                  {vat.status === "borrador"
                    ? "Aún no tiene revisión profesional: quedará registrado así."
                    : "Registra el folio que entrega el SII al presentar."} ENQORA no presenta declaraciones sin un mandato vigente.
                </p>
                <div className="form-grid">
                  <div className="field"><label htmlFor="p-folio">Folio del SII</label><input id="p-folio" name="folio" className="input mono" required minLength={3} maxLength={40} /></div>
                  <div className="field"><label htmlFor="p-date">Fecha</label><input id="p-date" name="presented_on" type="date" className="input" required max={todayCl()} defaultValue={todayCl()} /></div>
                </div>
                <SubmitButton className="btn-inline btn-sm" pendingText="Registrando…">Registrar presentación</SubmitButton>
              </form>
            </details>
          ) : null}
          {vat?.status === "presentado" ? <p className="muted-line">Presentado el {day(vat.presented_on)} · folio <span className="mono">{vat.presented_folio}</span>.</p> : null}
          {vat?.decided_at && vat.status !== "borrador" ? <p className="muted-line">Revisión profesional: {moment(vat.decided_at)}{vat.decision_note ? ` · ${vat.decision_note}` : ""}.</p> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <Link href={`/contabilidad${q}`} className="back-link"><span aria-hidden="true">←</span> Contabilidad</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">ENQORA Contabilidad · {company.name}</span>
          <h1>{periodLabel(period)}</h1>
          <p className="hero-lead">
            {locked ? `Período con F29 ${vat?.status}: los documentos quedan cerrados.` : "Carga ventas, compras y cartolas; concilia y prepara el F29."}
          </p>
        </div>
        <Emblem name="contabilidad" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className="kpi"><span>Débito fiscal</span><b>{clp(debit)}</b></div>
        <div className="kpi"><span>Crédito fiscal</span><b>{clp(credit)}</b></div>
        <div className={`kpi${debit - credit > 0 ? " kpi-gold" : ""}`}><span>{debit - credit >= 0 ? "IVA estimado" : "Remanente estimado"}</span><b>{clp(Math.abs(debit - credit))}</b></div>
        <div className="kpi"><span>Conciliación</span><b>{moves.length ? `${Math.round(((moves.length - pending.length) / moves.length) * 100)}%` : "—"}</b></div>
      </div>

      {limit != null ? (
        <p className={`muted-line${docs.length > limit ? " over-limit" : ""}`}>
          Documentos del período: {docs.length.toLocaleString("es-CL")} de {limit.toLocaleString("es-CL")} incluidos en tu plan
          {docs.length > limit ? ". Superaste el límite: el equipo ENQORA te contactará para ajustar el plan; tus documentos se procesan igual." : "."}
        </p>
      ) : null}

      <Accordion label="Contabilidad del período" items={items} defaultOpen={docs.length ? null : "ventas"} />
    </div>
  );
}
