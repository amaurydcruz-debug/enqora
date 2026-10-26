import Link from "next/link";
import type { Metadata } from "next";
import { markAllReadAction, removePhoneAction, savePreferencesAction } from "@/app/actions/notifications";
import { Notice } from "@/components/auth-card";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { Emblem } from "@/components/emblems";
import { SubmitButton } from "@/components/submit-button";
import { messageForCode } from "@/lib/db-errors";
import { ago, CATEGORIES, type Notification, type NotificationPreferences } from "@/lib/notifications";
import { whatsappEnabled } from "@/lib/notify-delivery";
import { myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { PhoneForm } from "./phone-form";

export const metadata: Metadata = { title: "Notificaciones" };

const AVISOS: Record<string, string> = {
  leidas: "Todas las notificaciones quedaron leídas.",
  preferencias: "Preferencias guardadas.",
  telefono: "Número verificado. Ya puedes activar los avisos por WhatsApp.",
  telefono_eliminado: "Número eliminado. Ya no recibirás avisos por WhatsApp.",
};

// Centro de notificaciones: avisos recientes y cómo recibirlos fuera de la aplicación.
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ aviso?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: rows }, { data: prefRow }, staffRole] = await Promise.all([
    supabase.from("notifications").select("id, category, title, body, link, created_at, read_at").eq("user_id", user?.id ?? "")
      .order("created_at", { ascending: false }).limit(80),
    supabase.from("notification_preferences").select("email, whatsapp, phone, phone_verified_at, muted").eq("user_id", user?.id ?? "").maybeSingle(),
    myStaffRole(),
  ]);
  const list = (rows ?? []) as Notification[];
  const prefs: NotificationPreferences = (prefRow as NotificationPreferences | null) ?? { email: true, whatsapp: false, phone: null, phone_verified_at: null, muted: [] };
  const unread = list.filter((n) => !n.read_at).length;
  const cats = (Object.keys(CATEGORIES) as Notification["category"][]).filter((k) => !CATEGORIES[k].staffOnly || staffRole);
  const wa = whatsappEnabled();

  return (
    <div className="page narrow">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Notificaciones</span>
          <h1>Tus avisos</h1>
          <p className="hero-lead">Lo que requiere tu atención o cambió en tus casos, cobros y mandatos. Tú eliges qué recibir por correo o WhatsApp.</p>
        </div>
        <Emblem name="mensajes" size="xl" />
      </header>

      {sp.aviso && AVISOS[sp.aviso] ? <Notice kind="ok">{AVISOS[sp.aviso]}</Notice> : null}
      {messageForCode(sp.error) ? <Notice kind="error">{messageForCode(sp.error)}</Notice> : null}

      <section className="zone" aria-labelledby="avisos">
        <div className="zone-head">
          <h2 className="zone-title" id="avisos">{unread ? `${unread} sin leer` : "Recientes"}</h2>
          {unread ? (
            <form action={markAllReadAction}>
              <SubmitButton variant="ghost" className="btn-inline btn-sm" pendingText="…">Marcar todo como leído</SubmitButton>
            </form>
          ) : null}
        </div>
        {list.length ? (
          <ul className="notif-list" role="list">
            {list.map((n) => (
              <li key={n.id} className={n.read_at ? "" : "is-unread"}>
                <Link href={`/notificaciones/abrir/${n.id}`} className="notif-line">
                  <Emblem name={CATEGORIES[n.category]?.emblem ?? "general"} size="sm" />
                  <span className="notif-main">
                    <b>{n.title}</b>
                    {n.body ? <small>{n.body}</small> : null}
                  </span>
                  <span className="notif-time">{ago(n.created_at)}</span>
                  {!n.read_at ? <span className="notif-dot" aria-label="Sin leer" /> : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-lead">No tienes notificaciones. Cuando algo requiera tu atención, aparecerá aquí.</p>
        )}
      </section>

      <section className="card" id="preferencias" aria-labelledby="pref-title">
        <h2 className="sub-title" id="pref-title">Cómo recibirlos</h2>
        <form action={savePreferencesAction} className="catalog-form">
          <fieldset className="pref-group">
            <legend>Canales</legend>
            <label className="check-inline"><input type="checkbox" name="email" defaultChecked={prefs.email} /> Correo electrónico ({user?.email})</label>
            <label className="check-inline">
              <input type="checkbox" name="whatsapp" defaultChecked={prefs.whatsapp} disabled={!prefs.phone_verified_at || !wa} />
              WhatsApp {prefs.phone_verified_at ? `(${prefs.phone})` : "(primero verifica tu número)"}
            </label>
          </fieldset>
          <fieldset className="pref-group">
            <legend>Qué avisos recibir fuera de la aplicación</legend>
            {cats.map((k) => (
              <label key={k} className="check-inline pref-cat">
                <input type="checkbox" name="cat" value={k} defaultChecked={!prefs.muted.includes(k)} />
                <span><b>{CATEGORIES[k].label}</b> <small>{CATEGORIES[k].help}</small></span>
              </label>
            ))}
          </fieldset>
          <p className="muted-line">En la aplicación siempre verás todos tus avisos. Las alertas de seguridad de tu cuenta se envían siempre por correo.</p>
          <div className="panel-actions"><SubmitButton className="btn-inline" pendingText="Guardando…">Guardar preferencias</SubmitButton></div>
        </form>

        <div className="sub-block">
          <h3 className="sub-title">WhatsApp</h3>
          {!wa ? (
            <p className="muted-line">Los avisos por WhatsApp estarán disponibles cuando ENQORA active su cuenta de WhatsApp Business.</p>
          ) : prefs.phone_verified_at ? (
            <div className="panel-actions">
              <span className="status status-ok">Número verificado · {prefs.phone}</span>
              <form action={removePhoneAction}>
                <ConfirmSubmit variant="ghost" message="¿Eliminar tu número? Dejarás de recibir avisos por WhatsApp.">Eliminar número</ConfirmSubmit>
              </form>
            </div>
          ) : (
            <PhoneForm />
          )}
          <p className="muted-line">Los avisos por WhatsApp solo dicen qué ocurrió y llevan a ENQORA; nunca incluyen documentos ni datos tributarios.</p>
        </div>
      </section>
    </div>
  );
}
