/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { FOTO_SERVICIO } from "@/app/entrada";
import { activeCompany } from "@/lib/companies";
import { CATEGORIES, categoryByKey, INTENT_COOKIE, SOLICITUD_COOKIE } from "@/lib/discovery";
import { CLOSED, NEEDS_CLIENT, NEXT_STEP, statusLabel, statusTone, type CaseRow } from "@/lib/cases";
import { clp, todayCL } from "@/lib/pricing";
import { createClient, currentUser } from "@/lib/supabase/server";
import { nombreLinea } from "@/lib/lineas";
import { SubirDocumentos } from "@/components/subir-documentos";
import { Tramites, type Tramite } from "./tramites";
import { TuMesCard } from "./tu-mes";
import { OportunidadesEmpresa } from "./oportunidades";
import { extrasPara, OPORTUNIDADES_AL, oportunidadesPara } from "@/lib/oportunidades";
import { REGIMES } from "@/lib/company-constants";
import { PreguntasCard, type PreguntaCliente } from "./preguntas";
import { Calendario } from "../empresa-al-dia/calendario";
import { vencimientos } from "@/lib/calendario-cumplimiento";
import { perfilValido } from "@/lib/empresa-al-dia";
import type { TuMes } from "@/lib/accounting";
import { messageForCode } from "@/lib/db-errors";

export const metadata: Metadata = { title: "Inicio" };

const AVISOS: Record<string, string> = {
  mfa: "Segundo factor activado. Tu cuenta quedó protegida.",
  clave: "Contraseña actualizada. Cerramos las demás sesiones de tu cuenta.",
  onboarding: "Guardamos tus respuestas.",
  mes_aprobado: "Aprobaste tu mes. Quedó la constancia y ENQORA presenta el F29.",
  mes_observado: "Enviamos tu observación al contador. Te avisamos cuando el mes esté corregido.",
  respuesta: "Gracias: tu respuesta quedó registrada para tu contador.",
};
const TZ = "America/Santiago";
const fecha = (iso: string) => new Intl.DateTimeFormat("es-CL", { day: "numeric", month: "short", timeZone: TZ }).format(new Date(iso));
function saludo() {
  const h = Number(new Intl.DateTimeFormat("es-CL", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()));
  return h < 12 ? "Buenos días" : h < 20 ? "Buenas tardes" : "Buenas noches";
}
const ESTADO_SOLICITUD: Record<string, string> = { nueva: "Recibida", en_revision: "En revisión", cotizada: "Propuesta enviada", cerrada: "Cerrada" };

type Accion = { id: string; texto: string; detalle: string; href: string; boton: string };
type Solicitud = { id: string; codigo: string | null; linea?: string | null; documentos?: number; estado: string; creada: string; areas: string[]; resumen: string; caso: string | null; folio: string | null };

// Inicio del cliente: simple a propósito. Arriba, qué quiere resolver; si hay algo que hacer, solo eso;
// sus trámites en curso; y «Trámites» para elegir UNA solución. El detalle de la empresa vive en /panel/detalle.
export default async function PanelPage({ searchParams }: { searchParams: Promise<{ aviso?: string; tramite?: string; error?: string }> }) {
  const sp = await searchParams;
  const jar = await cookies();
  const intent = categoryByKey(jar.get(INTENT_COOKIE)?.value);
  const supabase = await createClient();
  // Trazabilidad: las solicitudes enviadas desde la portada con el mismo correo quedan unidas a esta cuenta.
  await supabase.rpc("vincular_mis_solicitudes").then(() => undefined, () => undefined);
  const user = await currentUser();
  const { active } = await activeCompany();
  if (intent && active && active.role !== "viewer") redirect("/comenzar/continuar");
  // Solicitud enviada a CORA desde este navegador antes de registrarse: se une a la cuenta (0056).
  if (jar.get(SOLICITUD_COOKIE)?.value) {
    const { data: unida, error: e56 } = await supabase.rpc("vincular_solicitud_navegador", { p_id: jar.get(SOLICITUD_COOKIE)?.value ?? null });
    if (!e56 || unida) redirect("/comenzar/continuar?solo=solicitud");
  }

  const { data: me } = await supabase.from("profiles").select("full_name").eq("id", user?.id ?? "").maybeSingle();
  const nombre = ((me as { full_name: string | null } | null)?.full_name ?? "").trim();
  const correo = user?.email ?? "";
  const primerNombre = nombre.split(" ")[0];

  // Trámites en curso de la empresa activa (solo lo esencial).
  const { data: caseRows } = active
    ? await supabase.from("cases").select("id, folio, module, title, status, updated_at, created_at").eq("company_id", active.id)
        .not("status", "in", `(${CLOSED.join(",")})`).order("updated_at", { ascending: false }).limit(6)
    : { data: [] };
  const casos = (caseRows ?? []) as CaseRow[];
  const caseIds = casos.map((c) => c.id);

  // Solo lo que espera una acción del cliente.
  const [quoteRes, authRes, taskRes, firmasRes, solRes, mesRes, pregRes, abonoRes, diagRes] = await Promise.all([
    active ? supabase.from("quotes").select("id, case_id, service_name, final_price").eq("company_id", active.id).eq("status", "enviada").gte("valid_until", todayCL()).order("sent_at").limit(5) : Promise.resolve({ data: [] }),
    active && ["owner", "admin"].includes(active.role)
      ? supabase.from("client_authorizations").select("id, case_id, title").eq("company_id", active.id).eq("status", "pendiente").order("requested_at").limit(5)
      : Promise.resolve({ data: [] }),
    caseIds.length ? supabase.from("case_tasks").select("id, case_id, title").eq("assignee_id", user?.id ?? "").in("status", ["pendiente", "en_curso", "bloqueada"]).in("case_id", caseIds).limit(5) : Promise.resolve({ data: [] }),
    supabase.rpc("sign_mis_firmas"),
    supabase.rpc("mis_solicitudes"),
    // «Tu mes» (0066): cierre mensual de la contabilidad, si la empresa la lleva con ENQORA.
    active ? supabase.rpc("tu_mes", { p_company: active.id }) : Promise.resolve({ data: null }),
    // Preguntas del contador sobre movimientos del banco (0069).
    active && active.role !== "viewer"
      ? supabase.from("preguntas_mes").select("id, pregunta, opciones").eq("company_id", active.id).eq("estado", "abierta").order("creada").limit(10)
      : Promise.resolve({ data: [] }),
    // Abonos y saldos por pagar (0070): sin abono confirmado el trabajo no comienza.
    active && active.role !== "viewer"
      ? supabase.from("charges").select("id, case_id, etapa, amount, status").eq("company_id", active.id).in("etapa", ["abono", "saldo"]).in("status", ["pendiente", "vencido"]).limit(5)
      : Promise.resolve({ data: [] }),
    // Diagnóstico «Empresa al día» (0071): último semáforo.
    active ? supabase.from("diagnosticos_empresa").select("version, puntaje, resultado, creado, perfil").eq("company_id", active.id).order("version", { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const diag = (diagRes.data ?? null) as { version: number; puntaje: number; creado: string; perfil?: unknown; resultado: { frentes?: { frente: string; nombre: string; semaforo: string; pendientes: number }[] } } | null;
  // Oportunidades (beneficios vigentes según el perfil de la empresa).
  const { count: nTrab } = active ? await supabase.from("rem_trabajadores").select("id", { count: "exact", head: true }).eq("company_id", active.id).eq("activo", true) : { count: 0 };
  const perfilDiag = diag && perfilValido(diag.perfil) ? perfilValido(diag.perfil)! : null;
  const ctxOp = active ? { regimen: (active as { tax_regime?: string | null }).tax_regime ?? null, tipo: perfilDiag?.tipo ?? null,
    trabajadores: Math.max(nTrab ?? 0, perfilDiag?.trabajadores ?? 0), diagnostico: diag?.puntaje ?? null, hoy: todayCL() } : null;
  const oportunidades = ctxOp ? [...oportunidadesPara(ctxOp), ...extrasPara(ctxOp)] : [];
  const preguntas = ((pregRes.data ?? []) as PreguntaCliente[]);
  const mes = (mesRes.data && typeof mesRes.data === "object" && (mesRes.data as TuMes).lleva ? mesRes.data : null) as TuMes | null;
  const puedeAprobar = !!active && ["owner", "admin"].includes(active.role);
  const acciones: Accion[] = [
    ...((abonoRes.data ?? []) as { id: string; case_id: string | null; etapa: string; amount: number }[]).map((ch) => ({
      id: `ch${ch.id}`, texto: ch.etapa === "abono" ? "Paga el abono para comenzar tu trámite" : "Trabajo terminado: paga el saldo",
      detalle: clp(Number(ch.amount)), href: "/facturacion#cobros", boton: "Pagar" })),
    ...(preguntas.length ? [{ id: "preg", texto: `Tu contador tiene ${preguntas.length} pregunta(s)`, detalle: "Sobre movimientos de tu banco", href: "#preguntas", boton: "Responder" }] : []),
    ...(mes?.etapa === "por_aprobar" && puedeAprobar ? [{ id: "mes", texto: "Tu mes está listo para aprobar", detalle: mes.f29 ? `Total a pagar referencial ${clp(mes.f29.total)}` : "Resumen del F29", href: "#tu-mes", boton: "Revisar" }] : []),
    ...((quoteRes.data ?? []) as { id: string; case_id: string; service_name: string; final_price: number }[]).map((q) => ({
      id: `q${q.id}`, texto: `Propuesta lista: ${q.service_name}`, detalle: clp(Number(q.final_price)), href: `/casos/${q.case_id}#cotizacion`, boton: "Revisar" })),
    ...((authRes.data ?? []) as { id: string; case_id: string; title: string }[]).map((a) => ({
      id: `a${a.id}`, texto: a.title, detalle: "Necesitamos tu autorización", href: `/casos/${a.case_id}`, boton: "Autorizar" })),
    ...((Array.isArray(firmasRes.data) ? firmasRes.data : []) as { id: string; titulo: string; turno: boolean; estado: string; solicitud: string; vencida: boolean }[])
      .filter((f) => f.turno && !f.vencida).map((f) => ({ id: `f${f.id}`, texto: f.titulo, detalle: "Documento para firmar", href: `/firmas/${f.id}`, boton: "Firmar" })),
    ...((taskRes.data ?? []) as { id: string; case_id: string; title: string }[]).map((t) => ({
      id: `t${t.id}`, texto: t.title, detalle: "Tarea pendiente", href: `/casos/${t.case_id}`, boton: "Ver" })),
    ...casos.filter((c) => NEEDS_CLIENT.includes(c.status) && c.status === "esperando_cliente").map((c) => ({
      id: `c${c.id}`, texto: c.title, detalle: "Esperamos tus antecedentes", href: `/casos/${c.id}`, boton: "Enviar" })),
  ].slice(0, 5);
  // Solicitudes enviadas que aún no se convierten en caso.
  const solicitudes = ((Array.isArray(solRes.data) ? solRes.data : []) as Solicitud[]).filter((s) => !s.caso && s.estado !== "cerrada").slice(0, 4);

  const tramites: Tramite[] = CATEGORIES.map((c) => ({
    key: c.key, titulo: c.title, texto: c.lead, foto: FOTO_SERVICIO[c.key] ?? null, necesidades: (c.necesidades ?? c.solves).slice(0, 6),
  }));
  const hayTramites = casos.length + solicitudes.length > 0;
  const puedeEnviar = !!active && active.role !== "viewer";

  return (
    <div className="page ps">
      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {sp.error ? <Notice kind="error">{messageForCode(sp.error) ?? "No pudimos completar la operación."}</Notice> : null}

      <header className="ps-hero">
        <img src="/entrada/hero.webp" alt="" className="ps-hero-foto" fetchPriority="high" />
        <div className="ps-hero-txt">
          <span className="eyebrow">{active ? active.trade_name || active.legal_name : "Tu espacio ENQORA"}</span>
          <h1>{saludo()}{primerNombre ? `, ${primerNombre}` : ""}.</h1>
          <p>¿Qué quieres que ENQORA resuelva hoy?</p>
          <div className="ps-hero-acciones">
            <a href="#tramites" className="btn btn-gold btn-inline">Nueva solicitud</a>
            {hayTramites ? <a href="#mis-tramites" className="btn btn-ghost btn-inline">Enviar documentos</a> : null}
          </div>
        </div>
      </header>

      {acciones.length ? (
        <section className="ps-card ps-accion" aria-labelledby="ps-accion-t">
          <h2 id="ps-accion-t">Requiere tu acción</h2>
          <ul className="ps-filas">
            {acciones.map((a) => (
              <li key={a.id}>
                <span><b>{a.texto}</b><small>{a.detalle}</small></span>
                <Link href={a.href} className="btn btn-gold btn-inline btn-sm">{a.boton}</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {active && ctxOp ? (
        <OportunidadesEmpresa al={OPORTUNIDADES_AL} items={oportunidades}
          empresa={{ nombre: active.trade_name || active.legal_name, rut: active.rut, giro: (active as { activity?: string | null }).activity ?? null,
            regimen: ctxOp.regimen ? REGIMES[ctxOp.regimen as keyof typeof REGIMES] ?? null : null, trabajadores: ctxOp.trabajadores }} />
      ) : null}
      {preguntas.length ? <PreguntasCard preguntas={preguntas} /> : null}
      {active ? (
        <section className="ps-card" aria-labelledby="ead-p">
          <div className="ps-card-cab"><h2 id="ead-p">Empresa al día{diag ? ` · ${diag.puntaje}%` : ""}</h2><Link href="/empresa-al-dia" className="ps-link">{diag ? "Actualizar" : "Hacer diagnóstico"}</Link></div>
          {diag?.resultado?.frentes?.length ? (
            <ul className="ead-semaforo ead-mini">
              {diag.resultado.frentes.map((f) => (
                <li key={f.frente} className={`is-${f.semaforo}`}><span className="ead-luz" aria-hidden="true" /><b>{f.nombre}</b>{f.pendientes ? <small>{f.pendientes} pendiente(s)</small> : <small>Al día</small>}</li>
              ))}
            </ul>
          ) : null}
          {diag && perfilValido(diag.perfil) ? (
            <>
              <h3 className="ead-sub">Próximos vencimientos</h3>
              <Calendario items={vencimientos(perfilValido(diag.perfil)!, todayCL(), 30).slice(0, 3)} hoy={todayCL()} compacto />
            </>
          ) : null}
          {diag ? null : <p className="muted-line">En 5 minutos ves cómo está tu empresa ante el SII, la municipalidad, la Dirección del Trabajo, la previsión, la mutual y tus clientes, y qué resolver primero.</p>}
        </section>
      ) : null}
      {mes ? <TuMesCard mes={mes} puedeAprobar={puedeAprobar} /> : null}

      {hayTramites ? (
        <section className="ps-card" id="mis-tramites" aria-labelledby="ps-mis-t">
          <div className="ps-card-cab">
            <h2 id="ps-mis-t">Mis trámites</h2>
            {casos.length ? <Link href="/casos" className="ps-link">Ver todos</Link> : null}
          </div>
          <ul className="ps-filas">
            {casos.slice(0, 4).map((c) => (
              <li key={c.id}>
                <span>
                  <b>{c.title}</b>
                  <small>{c.folio}{nombreLinea(c.folio) ? ` · ${nombreLinea(c.folio)}` : ""} · {NEXT_STEP[c.status] ?? "En curso"}</small>
                </span>
                <span className={`badge badge-${statusTone(c.status)}`}>{statusLabel(c.status)}</span>
                <Link href={`/casos/${c.id}`} className="btn btn-ghost btn-inline btn-sm">Ver</Link>
                {puedeEnviar ? (
                  <details className="ps-docs">
                    <summary>Enviar documentos o fotos</summary>
                    <SubirDocumentos destino={{ tipo: "caso", id: c.id }} compacto />
                  </details>
                ) : null}
              </li>
            ))}
            {solicitudes.map((s) => (
              <li key={s.id}>
                <span>
                  <b>{s.resumen || "Solicitud enviada"}</b>
                  <small>
                    {s.codigo ?? "Solicitud"}{nombreLinea(s.codigo) ? ` · ${nombreLinea(s.codigo)}` : ""} · enviada el {fecha(s.creada)}
                    {s.documentos ? ` · ${s.documentos} ${s.documentos === 1 ? "documento" : "documentos"}` : ""} · un profesional te responde con la solución y su precio
                  </small>
                </span>
                <span className="badge badge-gold">{ESTADO_SOLICITUD[s.estado] ?? s.estado}</span>
                <details className="ps-docs">
                  <summary>Enviar documentos o fotos</summary>
                  <SubirDocumentos destino={{ tipo: "solicitud", id: s.id }} compacto />
                </details>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="ps-card" id="tramites" aria-labelledby="ps-tram-t">
        <h2 id="ps-tram-t" className="sr-only">Nueva solicitud</h2>
        <Tramites tramites={tramites} cuenta={{ nombre: nombre.length >= 2 ? nombre : correo.split("@")[0] || "Cliente ENQORA", correo }}
          rut={active?.rut ?? ""} razon={active ? active.legal_name : ""} abierto={!hayTramites || sp.tramite === "1"}
          inicial={categoryByKey(sp.tramite)?.key ?? null} />
      </section>

      <p className="ps-pie">
        {active ? <Link href="/panel/detalle">Ver el detalle de tu empresa</Link> : <Link href="/empresas/nueva">Registrar mi empresa</Link>}
        <span aria-hidden="true"> · </span>
        <Link href="/seguridad">Seguridad de tu cuenta</Link>
      </p>
    </div>
  );
}
