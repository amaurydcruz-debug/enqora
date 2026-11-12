import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { Accordion } from "@/components/accordion";
import { Emblem } from "@/components/emblems";
import { IconAlert, IconDevice, IconKey, IconLogout } from "@/components/icons";
import { signOutAction } from "@/app/actions/auth";
import { requestDataRightAction } from "@/app/actions/security";
import { DERECHO_ESTADO, DERECHOS } from "@/lib/legal-versions";
import {
  acknowledgeAlertsAction,
  forgetDeviceAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/app/actions/security";
import { messageForCode } from "@/lib/db-errors";
import { deviceLabel } from "@/lib/request-info";
import { createClient, currentUser } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password";

export const metadata: Metadata = { title: "Seguridad" };

const fmt = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(
        new Date(iso),
      )
    : "—";

const AVISOS: Record<string, string> = {
  derecho_solicitado: "Recibimos tu solicitud sobre tus datos personales. Te responderemos dentro del plazo legal y te avisaremos aquí.",
  sesion: "Sesión cerrada. Ese dispositivo deberá ingresar de nuevo.",
  sesiones: "Cerramos todas las demás sesiones. Solo queda abierta esta.",
  dispositivo: "Dispositivo olvidado. Si vuelve a ingresar, te avisaremos.",
};

const EVENTOS: Record<string, string> = {
  ingreso: "Ingreso",
  nuevo_dispositivo: "Ingreso desde un dispositivo nuevo",
  mfa_activado: "Segundo factor activado",
  clave_cambiada: "Contraseña cambiada",
  clave_restablecida: "Contraseña restablecida por correo",
  sesion_cerrada: "Sesión cerrada en otro dispositivo",
  sesiones_cerradas: "Se cerraron las demás sesiones",
  dispositivo_olvidado: "Dispositivo olvidado",
};

type Session = {
  id: string;
  created_at: string;
  last_active: string | null;
  user_agent: string | null;
  ip: string | null;
  aal: string | null;
  is_current: boolean;
};
type Device = { id: string; label: string; first_seen: string; last_seen: string; last_ip: string | null };
type SecEvent = {
  id: number;
  event: string;
  ip: string | null;
  user_agent: string | null;
  acknowledged_at: string | null;
  created_at: string;
};

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await currentUser();

  const [consRes, derechosRes] = await Promise.all([
    supabase.rpc("mis_consentimientos"),
    supabase.from("data_rights_requests").select("id, tipo, detalle, estado, vence, prorrogada, respuesta, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const consentimientos = (consRes.data ?? []) as { documento: string; version: string; aceptado_at: string }[];
  const derechos = (derechosRes.data ?? []) as { id: string; tipo: string; detalle: string | null; estado: string; vence: string; prorrogada: boolean; respuesta: string | null; created_at: string }[];
  const [factorsRes, sessionsRes, devicesRes, eventsRes] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.rpc("my_sessions"),
    supabase.from("known_devices").select("id, label, first_seen, last_seen, last_ip").order("last_seen", { ascending: false }),
    supabase
      .from("security_events")
      .select("id, event, ip, user_agent, acknowledged_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const totp = factorsRes.data?.totp ?? [];
  const sessions = (sessionsRes.data ?? []) as Session[];
  const sessionsAvailable = !sessionsRes.error;
  const devices = (devicesRes.data ?? []) as Device[];
  const events = (eventsRes.data ?? []) as SecEvent[];
  const pending = events.filter((e) => e.event === "nuevo_dispositivo" && !e.acknowledged_at);
  const others = sessions.filter((s) => !s.is_current);

  const verified = !!user?.email_confirmed_at;

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">ENQORA Shield</span>
          <h1>Centro de seguridad</h1>
          <p className="hero-lead">Controla quién y desde dónde se accede a ENQORA con tu cuenta.</p>
        </div>
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {/* Estado de protección */}
      <div className="shield-status" role="list" aria-label="Estado de protección">
        <div className={`shield-item ${verified ? "is-ok" : "is-warn"}`} role="listitem">
          <Emblem name="identidad" size="sm" />
          <span><small>Correo</small><b>{verified ? "Verificado" : "Pendiente"}</b></span>
        </div>
        <div className={`shield-item ${totp.length ? "is-ok" : "is-warn"}`} role="listitem">
          <Emblem name="dos-pasos" size="sm" />
          <span><small>Dos pasos</small><b>{totp.length ? "Activo" : "Sin configurar"}</b></span>
        </div>
        <div className="shield-item" role="listitem">
          <Emblem name="sesiones" size="sm" />
          <span><small>Sesiones abiertas</small><b>{sessionsAvailable ? sessions.length : "—"}</b></span>
        </div>
        <div className={`shield-item ${pending.length ? "is-warn" : "is-ok"}`} role="listitem">
          <Emblem name="seguridad" size="sm" />
          <span><small>Alertas</small><b>{pending.length ? `${pending.length} por revisar` : "Ninguna"}</b></span>
        </div>
      </div>

      {pending.length ? (
        <div className="alert alert-warn alert-row" role="alert">
          <IconAlert size={22} />
          <div>
            <b>{pending.length === 1 ? "Nuevo ingreso detectado" : `${pending.length} ingresos nuevos detectados`}</b>
            <p>
              {pending.map((e) => `${deviceLabel(e.user_agent)} · ${fmt(e.created_at)}`).join(" — ")}
              <br />
              Si no fuiste tú, cambia tu contraseña y cierra las demás sesiones.
            </p>
          </div>
          <form action={acknowledgeAlertsAction}>
            <input type="hidden" name="next" value="/seguridad" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Fui yo</SubmitButton>
          </form>
        </div>
      ) : null}

      <Accordion
        label="Opciones de seguridad"
        defaultOpen={pending.length ? "actividad" : null}
        items={[
          {
            id: "identidad",
            title: "Identidad",
            description: "La cuenta con la que ingresas a ENQORA.",
            emblem: <Emblem name="identidad" />,
            status: <span className={`status status-${verified ? "ok" : "warn"}`}>{verified ? "Correo verificado" : "Correo por verificar"}</span>,
            content: (
              <dl className="setting-body facts">
                <div><dt>Correo</dt><dd>{user?.email}</dd></div>
                <div>
                  <dt>Verificación del correo</dt>
                  <dd><span className={`status status-${verified ? "ok" : "warn"}`}>{verified ? "Verificado" : "Pendiente"}</span></dd>
                </div>
                <div><dt>Último acceso</dt><dd>{fmt(user?.last_sign_in_at)}</dd></div>
              </dl>
            ),
          },
          {
            id: "dos-pasos",
            title: "Verificación en dos pasos",
            description: "Cada ingreso exige un código de tu aplicación autenticadora.",
            emblem: <Emblem name="dos-pasos" />,
            status: <span className={`status status-${totp.length ? "ok" : "warn"}`}>{totp.length ? "Activa" : "Sin configurar"}</span>,
            content: (
              <div className="setting-body">
                {totp.length ? (
                  <ul className="rows">
                    {totp.map((f: { id: string; friendly_name?: string | null }) => (
                      <li key={f.id} className="row-item">
                        <span className="row-icon"><IconKey size={18} /></span>
                        <span className="row-text">
                          <b>{f.friendly_name ?? "Aplicación autenticadora"}</b>
                          <small>Código de 6 dígitos (TOTP)</small>
                        </span>
                        <span className="status status-ok">Activo</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-inline">No hay métodos activos.</p>
                )}
                <p className="note">Las passkeys (huella o Face ID) se añadirán como método adicional en una próxima etapa.</p>
              </div>
            ),
          },
          {
            id: "sesiones",
            title: "Sesiones abiertas",
            description: "Dispositivos con una sesión activa. Cerrar una sesión pide confirmar tu identidad.",
            emblem: <Emblem name="sesiones" />,
            status: <span>{sessionsAvailable ? (sessions.length === 1 ? "1 sesión abierta" : `${sessions.length} sesiones abiertas`) : "No disponible"}</span>,
            content: (
              <div className="setting-body">
                {sessionsAvailable ? (
                  <ul className="rows">
                    {sessions.map((s) => (
                      <li key={s.id} className={`row-item${s.is_current ? " is-current" : ""}`}>
                        <span className="row-icon"><IconDevice size={18} /></span>
                        <span className="row-text">
                          <b>{deviceLabel(s.user_agent)}</b>
                          <small>
                            Última actividad {fmt(s.last_active)} · inicio {fmt(s.created_at)}
                            {s.ip ? ` · IP ${s.ip}` : ""}
                          </small>
                        </span>
                        {s.is_current ? (
                          <span className="status status-ok">Esta sesión</span>
                        ) : (
                          <form action={revokeSessionAction}>
                            <input type="hidden" name="session_id" value={s.id} />
                            <ConfirmSubmit message="¿Cerrar esta sesión? Ese dispositivo deberá ingresar de nuevo." variant="ghost">Cerrar</ConfirmSubmit>
                          </form>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Notice kind="info">La lista de sesiones no está disponible en este momento.</Notice>
                )}
                <div className="setting-actions">
                  {others.length ? (
                    <form action={revokeOtherSessionsAction}>
                      <ConfirmSubmit message="¿Cerrar todas las demás sesiones? Solo quedará abierta esta.">
                        Cerrar las demás sesiones
                      </ConfirmSubmit>
                    </form>
                  ) : null}
                  <form action={signOutAction}>
                    <input type="hidden" name="scope" value="global" />
                    <ConfirmSubmit message="¿Cerrar sesión en todos los dispositivos, incluido este?" pendingText="Cerrando…">
                      <IconLogout size={16} /> Salir de todos los dispositivos
                    </ConfirmSubmit>
                  </form>
                </div>
              </div>
            ),
          },
          {
            id: "dispositivos",
            title: "Dispositivos conocidos",
            description: "Navegadores desde los que ingresaste. Si uno nuevo ingresa, te avisaremos.",
            emblem: <Emblem name="dispositivos" />,
            status: <span>{devices.length === 1 ? "1 dispositivo" : `${devices.length} dispositivos`}</span>,
            content: (
              <div className="setting-body">
                {devices.length ? (
                  <ul className="rows">
                    {devices.map((d) => (
                      <li key={d.id} className="row-item">
                        <span className="row-icon"><IconDevice size={18} /></span>
                        <span className="row-text">
                          <b>{d.label}</b>
                          <small>
                            Último uso {fmt(d.last_seen)} · desde {fmt(d.first_seen)}
                            {d.last_ip ? ` · IP ${d.last_ip}` : ""}
                          </small>
                        </span>
                        <form action={forgetDeviceAction}>
                          <input type="hidden" name="device_id" value={d.id} />
                          <ConfirmSubmit message={`¿Olvidar ${d.label}? Si vuelve a ingresar, te avisaremos.`} variant="ghost">
                            Olvidar
                          </ConfirmSubmit>
                        </form>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="empty-inline">Se registrarán a partir de tu próximo ingreso.</p>
                )}
              </div>
            ),
          },
          {
            id: "actividad",
            title: "Actividad de seguridad",
            description: "Registro de tu cuenta. No se puede modificar ni borrar.",
            emblem: <Emblem name="actividad" />,
            tone: pending.length ? "gold" : "default",
            status: pending.length
              ? <span className="status status-gold">{pending.length} por revisar</span>
              : <span>{events.length === 1 ? "1 evento" : `${events.length} eventos`}</span>,
            content: (
              <div className="setting-body">
                {events.length ? (
                  <ol className="feed feed-wide">
                    {events.map((e) => (
                      <li key={e.id} className={e.event === "nuevo_dispositivo" && !e.acknowledged_at ? "is-warn" : undefined}>
                        <span className="feed-dot" aria-hidden="true" />
                        <span className="feed-text">
                          <b>{EVENTOS[e.event] ?? e.event}</b>
                          <small>
                            {fmt(e.created_at)}
                            {e.user_agent ? ` · ${deviceLabel(e.user_agent)}` : ""}
                            {e.ip ? ` · IP ${e.ip}` : ""}
                          </small>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="empty-inline">Sin actividad registrada todavía.</p>
                )}
              </div>
            ),
          },
          {
            id: "datos",
            title: "Tus datos personales",
            description: "Qué aceptaste al crear tu cuenta y tus derechos sobre tus datos (acceso, rectificación, supresión, oposición, portabilidad y bloqueo).",
            emblem: <Emblem name="seguridad" />,
            content: (
              <div className="setting-body">
                {consentimientos.length ? (
                  <ul className="ref-list" role="list">
                    {consentimientos.map((c) => (
                      <li key={c.documento + c.aceptado_at}>
                        <span className="ref-main">
                          <b>{c.documento === "terminos" ? "Términos del servicio" : "Política de privacidad"}</b>
                          <small>Versión del {c.version} · aceptada el {new Intl.DateTimeFormat("es-CL", { dateStyle: "long", timeZone: "America/Santiago" }).format(new Date(c.aceptado_at))}</small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="empty-inline">Tu cuenta se creó antes de que ENQORA registrara la versión aceptada. Las condiciones vigentes están en Términos y Privacidad.</p>}
                <form action={requestDataRightAction} className="setting-form">
                  <div className="field">
                    <label htmlFor="tipo">¿Qué quieres pedir?</label>
                    <select id="tipo" name="tipo" className="input" required defaultValue="acceso">
                      {Object.entries(DERECHOS).map(([k, d]) => <option key={k} value={k}>{d.label}: {d.help}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="detalle">Detalle (opcional)</label>
                    <textarea id="detalle" name="detalle" className="input" maxLength={2000} rows={3} placeholder="Por ejemplo: qué dato corregir o para qué fin te opones." />
                  </div>
                  <SubmitButton pendingText="Enviando…">Enviar solicitud</SubmitButton>
                  <p className="muted-line">ENQORA responde dentro de 30 días corridos (prorrogables una vez). Es gratis.</p>
                </form>
                {derechos.length ? (
                  <ul className="ref-list" role="list">
                    {derechos.map((d) => (
                      <li key={d.id}>
                        <span className="ref-main">
                          <b>{DERECHOS[d.tipo]?.label ?? d.tipo}</b>
                          <small>
                            Pedida el {new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(d.created_at))}
                            {d.estado === "recibida" || d.estado === "en_curso" ? ` · plazo hasta el ${d.vence.split("-").reverse().join("-")}${d.prorrogada ? " (prorrogado)" : ""}` : ""}
                            {d.respuesta ? ` · Respuesta: ${d.respuesta}` : ""}
                          </small>
                        </span>
                        <span className={`status status-${DERECHO_ESTADO[d.estado]?.tone ?? "muted"}`}>{DERECHO_ESTADO[d.estado]?.label ?? d.estado}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ),
          },
          {
            id: "clave",
            title: "Cambiar contraseña",
            description: "Por seguridad te pediremos un código nuevo de tu aplicación autenticadora.",
            emblem: <Emblem name="clave" />,
            content: (
              <div className="setting-body setting-form">
                <ChangePasswordForm />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
