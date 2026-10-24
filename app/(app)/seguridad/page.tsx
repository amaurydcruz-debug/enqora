import type { Metadata } from "next";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import {
  IconActivity,
  IconAlert,
  IconCheck,
  IconDevice,
  IconKey,
  IconLogout,
  IconShield,
} from "@/components/icons";
import { signOutAction } from "@/app/actions/auth";
import {
  acknowledgeAlertsAction,
  forgetDeviceAction,
  revokeOtherSessionsAction,
  revokeSessionAction,
} from "@/app/actions/security";
import { messageForCode } from "@/lib/db-errors";
import { deviceLabel } from "@/lib/request-info";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password";

export const metadata: Metadata = { title: "Seguridad" };

const fmt = (iso?: string | null) =>
  iso
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Santiago" }).format(
        new Date(iso),
      )
    : "—";

const AVISOS: Record<string, string> = {
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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

  return (
    <div className="stack">
      <div className="page-head">
        <span className="eyebrow">ENQORA Shield</span>
        <h1>Seguridad de la cuenta</h1>
        <p>Controla quién y desde dónde se accede a ENQORA con tu cuenta.</p>
      </div>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      {pending.length ? (
        <div className="alert alert-warn alert-row" role="alert">
          <IconAlert size={22} />
          <div>
            <b>{pending.length === 1 ? "Nuevo ingreso detectado" : `${pending.length} ingresos nuevos detectados`}</b>
            <p>
              {pending.map((e) => `${deviceLabel(e.user_agent)} · ${fmt(e.created_at)}`).join(" — ")}. Si no fuiste tú,
              cambia tu contraseña y cierra las demás sesiones.
            </p>
          </div>
          <form action={acknowledgeAlertsAction}>
            <input type="hidden" name="next" value="/seguridad" />
            <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Fui yo</SubmitButton>
          </form>
        </div>
      ) : null}

      <div className="grid">
        <section className="card">
          <h2 className="card-title"><IconShield /> Tu identidad</h2>
          <div className="row"><span>Correo</span><span>{user?.email}</span></div>
          <div className="row">
            <span>Correo confirmado</span>
            <span className={`badge ${user?.email_confirmed_at ? "badge-ok" : "badge-warn"}`}>
              {user?.email_confirmed_at ? "Sí" : "Pendiente"}
            </span>
          </div>
          <div className="row"><span>Último ingreso</span><span>{fmt(user?.last_sign_in_at)}</span></div>
        </section>

        <section className="card">
          <h2 className="card-title"><IconCheck /> Verificación en dos pasos</h2>
          {totp.map((f) => (
            <div className="row" key={f.id}>
              <span>{f.friendly_name ?? "Aplicación autenticadora"}</span>
              <span className="badge badge-ok">Activo</span>
            </div>
          ))}
          <p className="mt-12">Las passkeys (huella o Face ID) se añadirán como método adicional en una próxima etapa.</p>
        </section>
      </div>

      <section className="card" id="sesiones">
        <h2 className="card-title"><IconDevice /> Sesiones abiertas</h2>
        <p>Dispositivos con una sesión activa en tu cuenta. Cerrar una sesión pide confirmar tu identidad.</p>
        {sessionsAvailable ? (
          <ul className="member-list">
            {sessions.map((s) => (
              <li key={s.id} className="member">
                <div className="member-who">
                  <b>
                    {deviceLabel(s.user_agent)}{" "}
                    {s.is_current ? <span className="badge badge-ok">Esta sesión</span> : null}
                  </b>
                  <span className="muted-line">
                    Última actividad {fmt(s.last_active)} · inicio {fmt(s.created_at)}
                    {s.ip ? ` · IP ${s.ip}` : ""}
                  </span>
                </div>
                {!s.is_current ? (
                  <form action={revokeSessionAction}>
                    <input type="hidden" name="session_id" value={s.id} />
                    <ConfirmSubmit message="¿Cerrar esta sesión? Ese dispositivo deberá ingresar de nuevo.">Cerrar</ConfirmSubmit>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Notice kind="info">La lista de sesiones no está disponible en este momento.</Notice>
        )}
        <div className="actions-row">
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
      </section>

      <div className="grid grid-wide">
        <section className="card" id="dispositivos">
          <h2 className="card-title"><IconDevice /> Dispositivos conocidos</h2>
          <p>Navegadores desde los que ingresaste. Si uno nuevo ingresa a tu cuenta, te avisaremos.</p>
          {devices.length ? (
            <ul className="member-list">
              {devices.map((d) => (
                <li key={d.id} className="member">
                  <div className="member-who">
                    <b>{d.label}</b>
                    <span className="muted-line">
                      Último uso {fmt(d.last_seen)} · desde {fmt(d.first_seen)}
                      {d.last_ip ? ` · IP ${d.last_ip}` : ""}
                    </span>
                  </div>
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
            <p className="muted-line">Se registrarán a partir de tu próximo ingreso.</p>
          )}
        </section>

        <section className="card" id="actividad">
          <h2 className="card-title"><IconActivity /> Actividad de seguridad</h2>
          <p>Registro de tu cuenta. No se puede modificar ni borrar.</p>
          {events.length ? (
            <ul className="audit-list">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="audit-when">{fmt(e.created_at)}</span>
                  <span>
                    <b className={e.event === "nuevo_dispositivo" ? "text-warn" : undefined}>{EVENTOS[e.event] ?? e.event}</b>
                    {e.user_agent ? ` · ${deviceLabel(e.user_agent)}` : ""}
                    {e.ip ? ` · IP ${e.ip}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-line">Sin actividad registrada todavía.</p>
          )}
        </section>
      </div>

      <section className="card card-narrow" id="clave">
        <h2 className="card-title"><IconKey /> Cambiar contraseña</h2>
        <p>Por seguridad te pediremos un código nuevo de tu aplicación autenticadora.</p>
        <ChangePasswordForm />
      </section>
    </div>
  );
}
