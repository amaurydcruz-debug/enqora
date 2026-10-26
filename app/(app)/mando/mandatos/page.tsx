import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cancelMandateAction, saveMandateAction, sendMandateAction, verifyMandateAction } from "@/app/actions/mandates";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { day, moment, todayCl } from "@/lib/billing";
import { messageForCode } from "@/lib/db-errors";
import { INSTITUTIONS, instList, MANDATE_KINDS, MANDATE_STATUSES, VERIFY_CHECKS, type Mandate } from "@/lib/mandates";
import { formatRut } from "@/lib/rut";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mandatos" };

const AVISOS: Record<string, string> = {
  mandato_creado: "Borrador del mandato creado. Revísalo y envíalo al cliente.",
  mandato_guardado: "Borrador actualizado.",
  mandato_enviado: "Mandato enviado al cliente para revisión y firma.",
  mandato_anulado: "Mandato anulado.",
  mandato_vigente: "Mandato verificado y vigente.",
  mandato_observado: "Mandato observado. El cliente verá el motivo y podrá subir un nuevo documento.",
};

const ORDER: Mandate["status"][] = ["en_verificacion", "pendiente_firma", "borrador", "vigente", "revocado", "vencido", "anulado"];

// Mandatos de representación: el equipo los prepara y envía; un abogado o el Administrador ENQORA
// los verifica (no quien los preparó). Ninguna actuación ante una institución sin mandato vigente.
export default async function MandatesAdminPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const role = await myStaffRole();
  if (!role) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const canVerify = role === "lawyer_pro" || role === "enqora_admin";
  const human = role !== "ai_agent";

  const [{ data: mRows }, { data: cRows }] = await Promise.all([
    supabase.from("mandates").select("*").order("updated_at", { ascending: false }).limit(200),
    supabase.from("companies").select("id, legal_name, trade_name, rut").order("legal_name").limit(500),
  ]);
  const mandates = ((mRows ?? []) as Mandate[]).sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const companies = (cRows ?? []) as { id: string; legal_name: string; trade_name: string | null; rut: string }[];
  const nameOf = new Map(companies.map((c) => [c.id, c.trade_name || c.legal_name]));
  const today = todayCl();
  const in180 = new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10);

  const form = (m?: Mandate) => (
    <form action={saveMandateAction} className="catalog-form">
      {m ? <input type="hidden" name="mandate_id" value={m.id} /> : null}
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`co-${m?.id ?? "new"}`}>Empresa</label>
          <select id={`co-${m?.id ?? "new"}`} name="company_id" className="input" required defaultValue={m?.company_id ?? ""} disabled={!!m}>
            <option value="" disabled>Elegir…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.trade_name || c.legal_name} · {formatRut(c.rut)}</option>)}
          </select>
          {m ? <input type="hidden" name="company_id" value={m.company_id} /> : null}
        </div>
        <div className="field">
          <label htmlFor={`kind-${m?.id ?? "new"}`}>Tipo</label>
          <select id={`kind-${m?.id ?? "new"}`} name="kind" className="input" defaultValue={m?.kind ?? "simple"}>
            {Object.entries(MANDATE_KINDS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="field"><label htmlFor={`vf-${m?.id ?? "new"}`}>Desde</label><input id={`vf-${m?.id ?? "new"}`} name="valid_from" type="date" className="input" required defaultValue={m?.valid_from ?? today} /></div>
        <div className="field"><label htmlFor={`vu-${m?.id ?? "new"}`}>Hasta <span className="optional">(máx. 3 años)</span></label><input id={`vu-${m?.id ?? "new"}`} name="valid_until" type="date" className="input" required defaultValue={m?.valid_until ?? in180} /></div>
      </div>
      <div className="form-grid">
        <div className="field"><label htmlFor={`rn-${m?.id ?? "new"}`}>Mandatario (persona o ENQORA)</label><input id={`rn-${m?.id ?? "new"}`} name="representative_name" className="input" required minLength={3} maxLength={160} defaultValue={m?.representative_name ?? ""} /></div>
        <div className="field"><label htmlFor={`rr-${m?.id ?? "new"}`}>RUT del mandatario</label><input id={`rr-${m?.id ?? "new"}`} name="representative_rut" className="input mono" maxLength={12} defaultValue={m?.representative_rut ?? ""} /></div>
      </div>
      <fieldset className="pref-group">
        <legend>Instituciones</legend>
        <div className="inst-grid">
          {Object.entries(INSTITUTIONS).map(([k, v]) => (
            <label key={k} className="check-inline"><input type="checkbox" name="institutions" value={k} defaultChecked={m?.institutions.includes(k)} /> {v}</label>
          ))}
        </div>
      </fieldset>
      <div className="field"><label htmlFor={`pr-${m?.id ?? "new"}`}>Trámites permitidos (precisos)</label><textarea id={`pr-${m?.id ?? "new"}`} name="procedures" className="input" rows={3} required minLength={10} maxLength={2000} defaultValue={m?.procedures ?? ""} /></div>
      <div className="field"><label htmlFor={`sc-${m?.id ?? "new"}`}>Texto del mandato</label><textarea id={`sc-${m?.id ?? "new"}`} name="scope" className="input" rows={6} required minLength={30} maxLength={8000} defaultValue={m?.scope ?? ""} /></div>
      <p className="muted-line">No incluyas claves ni la ClaveÚnica: ENQORA nunca las solicita. El texto debe revisarlo un abogado antes de enviarse.</p>
      <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">{m ? "Guardar borrador" : "Crear borrador"}</SubmitButton></div>
    </form>
  );

  const items: AccordionItem[] = mandates.map((m) => ({
    id: m.id,
    title: `${m.folio} · ${nameOf.get(m.company_id) ?? "Empresa"}`,
    description: `${MANDATE_KINDS[m.kind].label} · ${instList(m.institutions)}`,
    emblem: <Emblem name="legal" size="sm" />,
    tone: m.status === "en_verificacion" && canVerify ? "gold" : "default",
    status: <span className={`status status-${MANDATE_STATUSES[m.status].tone}`}>{MANDATE_STATUSES[m.status].label}</span>,
    content: (
      <div className="catalog-body">
        <dl className="data-grid">
          <div><dt>Mandatario</dt><dd>{m.representative_name}{m.representative_rut ? ` · ${m.representative_rut}` : ""}</dd></div>
          <div><dt>Vigencia</dt><dd>{day(m.valid_from, "medium")} al {day(m.valid_until, "medium")}</dd></div>
          <div><dt>Firma declarada</dt><dd>{m.signer_name ? `${m.signer_name} · ${formatRut(m.signer_rut ?? "")} · ${m.signer_role}` : "—"}</dd></div>
          <div><dt>Aceptado por el cliente</dt><dd>{m.accepted_at ? moment(m.accepted_at) : "—"}</dd></div>
        </dl>
        <div className="quote-terms"><div><h5>Trámites permitidos</h5><p className="pre">{m.procedures}</p></div></div>
        <div className="panel-actions">
          <Link href={`/empresas/${m.company_id}/mandatos/${m.id}`} className="btn btn-ghost btn-inline btn-sm">Ver texto</Link>
          {m.document_path ? <a href={`/mandatos/${m.id}/documento`} target="_blank" rel="noopener" className="btn btn-ghost btn-inline btn-sm">Documento firmado</a> : null}
        </div>

        {m.status === "borrador" ? (
          <>
            <details className="more inline-more"><summary>Editar borrador</summary>{form(m)}</details>
            <div className="panel-actions">
              {human ? (
                <form action={sendMandateAction}>
                  <input type="hidden" name="mandate_id" value={m.id} />
                  <ConfirmSubmit variant="gold" message="¿Enviar el mandato al cliente para que lo revise y firme?">Enviar al cliente</ConfirmSubmit>
                </form>
              ) : (
                <span className="muted-line">Un integrante del equipo debe revisarlo y enviarlo; un agente IA no envía mandatos.</span>
              )}
              <form action={cancelMandateAction}>
                <input type="hidden" name="mandate_id" value={m.id} />
                <ConfirmSubmit variant="ghost" message="¿Anular este mandato?">Anular</ConfirmSubmit>
              </form>
            </div>
          </>
        ) : null}

        {m.status === "en_verificacion" ? (
          canVerify && m.prepared_by !== user?.id ? (
            <form action={verifyMandateAction} className="catalog-form">
              <input type="hidden" name="mandate_id" value={m.id} />
              <h5 className="sub-title">Verificación legal</h5>
              <div className="check-stack">
                {VERIFY_CHECKS.map((c) => (
                  <label key={c.key} className="check-inline"><input type="checkbox" name={c.key} /> {c.label}</label>
                ))}
              </div>
              <textarea name="note" className="input" rows={2} maxLength={1000} placeholder="Nota de verificación (obligatoria para observar)" aria-label="Nota" />
              <div className="panel-actions">
                <SubmitButton name="decision" value="aprobar" className="btn-inline btn-sm" pendingText="…">Dejar vigente</SubmitButton>
                <SubmitButton name="decision" value="observar" variant="ghost" className="btn-inline btn-sm" pendingText="…">Observar</SubmitButton>
              </div>
            </form>
          ) : (
            <p className="muted-line">
              {canVerify ? "Lo preparaste tú: debe verificarlo otro abogado o el Administrador ENQORA." : "Lo verifica un abogado o el Administrador ENQORA."}
            </p>
          )
        ) : null}
        {m.status === "vigente" ? <p className="muted-line">Verificado {moment(m.verified_at)}. Habilita actuaciones ante {instList(m.institutions)} hasta el {day(m.valid_until)}.</p> : null}
        {m.status === "revocado" ? <p className="muted-line">Revocado por la empresa {moment(m.revoked_at)}{m.revoke_reason ? ` · ${m.revoke_reason}` : ""}.</p> : null}
        {["pendiente_firma", "en_verificacion"].includes(m.status) ? (
          <form action={cancelMandateAction}>
            <input type="hidden" name="mandate_id" value={m.id} />
            <ConfirmSubmit variant="ghost" message="¿Anular este mandato? El cliente dejará de verlo por firmar.">Anular</ConfirmSubmit>
          </form>
        ) : null}
      </div>
    ),
  }));

  items.unshift({
    id: "nuevo-mandato",
    title: "Preparar mandato",
    description: "Borrador interno: el cliente lo ve cuando lo envías",
    emblem: <Emblem name="create" size="sm" />,
    content: companies.length ? form() : <p className="muted-line">No tienes empresas visibles. Necesitas un caso asignado de la empresa.</p>,
  });

  const count = (s: Mandate["status"]) => mandates.filter((m) => m.status === s).length;

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · Representación</span>
          <h1>Mandatos</h1>
          <p className="hero-lead">
            La autorización dentro de ENQORA no es un mandato. Para actuar ante una institución se necesita un mandato firmado,
            verificado y vigente que cubra esa institución y ese trámite.
          </p>
        </div>
        <Emblem name="legal" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <div className="kpis kpis-mando">
        <div className={`kpi${count("en_verificacion") ? " kpi-gold" : ""}`}><span>Por verificar</span><b>{count("en_verificacion")}</b></div>
        <div className="kpi"><span>Pendientes de firma</span><b>{count("pendiente_firma")}</b></div>
        <div className="kpi"><span>Vigentes</span><b>{count("vigente")}</b></div>
        <div className="kpi"><span>Borradores</span><b>{count("borrador")}</b></div>
      </div>

      <Callout kind="info" title="Antes de usar un mandato">
        Confirma con cada institución el tipo de mandato que acepta (simple o notarial) y sus formularios propios. ENQORA nunca
        solicita ni guarda la ClaveÚnica ni la clave tributaria del cliente.
      </Callout>

      <Accordion label="Mandatos" items={items} defaultOpen={mandates.some((m) => m.status === "en_verificacion") && canVerify ? null : "nuevo-mandato"} />
    </div>
  );
}
