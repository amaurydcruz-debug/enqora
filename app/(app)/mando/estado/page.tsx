import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Callout } from "@/components/disclosure";
import { flowIsSandbox } from "@/lib/flow";
import { LEGAL } from "@/lib/site";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Estado del sistema" };

type Status = {
  migraciones: Record<string, boolean>;
  administradores_activos: number;
  equipo_activo: number;
  equipo_sin_mfa: number | null;
  clave_servicio: boolean;
  datos_transferencia: boolean;
  servicios_activos: number;
  servicios_con_tarifa: number;
  planes_activos: number;
  planes_con_precio: number;
  empresas_publicas: number;
  ultima_importacion_publica: string | null;
  empresas: number;
  casos_abiertos: number;
  avisos_pendientes: number;
  avisos_fallidos_7d: number;
  agentes_30d: { ejecuciones: number; fallidas: number; tokens: number };
};

type Check = { label: string; ok: boolean; help: string; required?: boolean };

const has = (...keys: string[]) => keys.every((k) => !!process.env[k]?.trim());
const n = (v: number | null | undefined) => (v ?? 0).toLocaleString("es-CL");

function CheckList({ title, items }: { title: string; items: Check[] }) {
  const pending = items.filter((i) => !i.ok);
  return (
    <section className="card">
      <div className="status-head">
        <h2>{title}</h2>
        <span className={`badge ${pending.length ? (pending.some((p) => p.required) ? "badge-risk" : "badge-warn") : "badge-ok"}`}>
          {pending.length ? `${pending.length} pendiente${pending.length === 1 ? "" : "s"}` : "Listo"}
        </span>
      </div>
      <ul className="status-list">
        {items.map((i) => (
          <li key={i.label} className={i.ok ? "is-ok" : i.required ? "is-missing" : "is-optional"}>
            <span className="status-dot" aria-hidden="true" />
            <span>
              <b>{i.label}</b>
              <small>{i.ok ? "Configurado" : i.help}</small>
            </span>
            <span className="sr-only">{i.ok ? "listo" : i.required ? "falta, obligatorio" : "pendiente, opcional"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// Lista de verificación antes de abrir a clientes. Muestra solo si cada variable está configurada,
// nunca su valor. Lo ven el Administrador ENQORA y la Dirección de operaciones.
export default async function SystemStatusPage() {
  const role = await myStaffRole();
  if (!isSupervisorRole(role)) notFound();

  const supabase = await createClient();
  const [{ data, error }, { data: auditData }] = await Promise.all([supabase.rpc("system_status"), supabase.rpc("audit_stats")]);
  const a = auditData as { auditorias: number; aprobadas: number; con_observaciones: number; escaladas: number; fallidas: number; aceptadas_con_excepcion: number } | null;
  const s = data as Status | null;

  const migrations = s ? Object.entries(s.migraciones) : [];
  const missingMigrations = migrations.filter(([, ok]) => !ok).map(([k]) => k);

  const config: Check[] = [
    { label: "Dirección pública del sitio", ok: has("NEXT_PUBLIC_SITE_URL"), required: true, help: "Falta NEXT_PUBLIC_SITE_URL (p. ej., https://enqora.cl). Se usa en correos, enlaces y buscadores." },
    { label: "Clave de servicio", ok: has("ENQORA_SERVICE_TOKEN") && !!s?.clave_servicio, required: true, help: "Genérala en Cobros y pagos y guárdala en Vercel como ENQORA_SERVICE_TOKEN." },
    { label: "Tarea diaria (facturación, mandatos y limpieza)", ok: has("CRON_SECRET"), required: true, help: "Falta CRON_SECRET en Vercel: sin ella la tarea diaria no se ejecuta." },
    { label: "Correos de avisos", ok: has("RESEND_API_KEY", "ALERT_EMAIL_FROM"), help: "Faltan RESEND_API_KEY y ALERT_EMAIL_FROM: los avisos quedan solo en la bandeja." },
    { label: "Pagos en línea (Flow)", ok: has("FLOW_API_KEY", "FLOW_SECRET_KEY"), help: "Sin FLOW_API_KEY y FLOW_SECRET_KEY solo se paga por transferencia." },
    { label: "Flow en producción", ok: has("FLOW_API_KEY") && !flowIsSandbox(), help: "Flow apunta al ambiente de pruebas (sandbox). Cambia FLOW_API_URL y las claves de producción." },
    { label: "Avisos por WhatsApp", ok: has("WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID"), help: "Opcional: requiere WhatsApp Business y plantillas aprobadas por Meta." },
    { label: "Agentes IA", ok: has("ANTHROPIC_API_KEY"), help: "Opcional: agrega ANTHROPIC_API_KEY para habilitar los agentes." },
    { label: "Auditoría independiente de agentes", ok: !has("ANTHROPIC_API_KEY") || has("OPENAI_API_KEY"), required: has("ANTHROPIC_API_KEY"),
      help: "Con agentes activos, agrega OPENAI_API_KEY: sin auditoría, las propuestas se revisan solo por personas." },
  ];
  const business: Check[] = [
    { label: "Administradores activos", ok: (s?.administradores_activos ?? 0) >= 2, help: `Hay ${n(s?.administradores_activos)}. Se recomiendan al menos 2 para la aprobación de cuatro ojos y respaldo.` },
    { label: "Equipo con segundo factor", ok: s?.equipo_sin_mfa === 0 || s?.equipo_sin_mfa === null, required: true, help: `${n(s?.equipo_sin_mfa)} persona(s) del equipo sin segundo factor verificado.` },
    { label: "Servicios con tarifa vigente", ok: !!s && s.servicios_activos > 0 && s.servicios_con_tarifa >= s.servicios_activos, required: true, help: `${n(s?.servicios_con_tarifa)} de ${n(s?.servicios_activos)} servicios activos tienen tarifa publicada. Publícalas en Catálogo y precios.` },
    { label: "Planes con precio vigente", ok: !!s && s.planes_activos > 0 && s.planes_con_precio >= s.planes_activos, help: `${n(s?.planes_con_precio)} de ${n(s?.planes_activos)} planes activos tienen precio. Revisa Planes.` },
    { label: "Datos para transferencias", ok: !!s?.datos_transferencia, required: true, help: "Completa banco y número de cuenta en Cobros y pagos." },
    { label: "Datos públicos de empresas (SII)", ok: (s?.empresas_publicas ?? 0) > 0, help: "La consulta por RUT de la portada no tendrá datos hasta importar el registro en Datos públicos." },
  ];
  const legal: Check[] = [
    { label: "Razón social y RUT del responsable", ok: !!LEGAL.name && !!LEGAL.rut, required: true, help: "Faltan NEXT_PUBLIC_LEGAL_NAME y NEXT_PUBLIC_LEGAL_RUT (aparecen en Términos y Privacidad)." },
    { label: "Correo de contacto", ok: !!LEGAL.email, required: true, help: "Falta NEXT_PUBLIC_CONTACT_EMAIL: es el canal para ejercer derechos sobre datos personales." },
    { label: "Revisión legal de Términos y Privacidad", ok: LEGAL.reviewed, required: true, help: "Cuando un abogado los apruebe, define NEXT_PUBLIC_LEGAL_REVIEWED=si (quita el aviso de versión preliminar)." },
  ];

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando</span>
          <h1>Estado del sistema</h1>
          <p className="hero-lead">Lo que falta configurar antes de abrir ENQORA a clientes. Se muestra si cada clave existe, nunca su valor.</p>
        </div>
        <div className="hero-actions">
          <Link href="/mando" className="btn btn-ghost btn-inline">Volver al Centro de Mando</Link>
        </div>
      </header>

      {error || !s ? (
        <Callout kind="warn" title="No se pudo leer el estado">Ejecuta la migración 0015_publicacion.sql en Supabase y vuelve a cargar esta página.</Callout>
      ) : (
        <>
          <section className="card">
            <div className="status-head">
              <h2>Base de datos</h2>
              <span className={`badge ${missingMigrations.length || !a ? "badge-risk" : "badge-ok"}`}>
                {missingMigrations.length || !a ? `Faltan ${[...missingMigrations, ...(a ? [] : ["0016"])].join(", ")}` : `Migraciones 0002–0016 aplicadas`}
              </span>
            </div>
            <dl className="data-grid">
              <div><dt>Empresas</dt><dd>{n(s.empresas)}</dd></div>
              <div><dt>Casos abiertos</dt><dd>{n(s.casos_abiertos)}</dd></div>
              <div><dt>Equipo activo</dt><dd>{n(s.equipo_activo)}</dd></div>
              <div><dt>Avisos pendientes de envío</dt><dd>{n(s.avisos_pendientes)}</dd></div>
              <div><dt>Avisos fallidos (7 días)</dt><dd>{n(s.avisos_fallidos_7d)}</dd></div>
              <div><dt>Agentes IA (30 días)</dt><dd>{n(s.agentes_30d.ejecuciones)} ejecuciones · {n(s.agentes_30d.fallidas)} fallidas · {n(s.agentes_30d.tokens)} tokens</dd></div>
              {a ? <div><dt>Auditorías (30 días)</dt><dd>{n(a.auditorias)} · {n(a.aprobadas)} sin observaciones · {n(a.con_observaciones)} con observaciones · {n(a.escaladas)} escaladas · {n(a.fallidas)} fallidas</dd></div> : null}
              {a ? <div><dt>Aceptadas con excepción</dt><dd>{n(a.aceptadas_con_excepcion)}</dd></div> : null}
            </dl>
          </section>
          <CheckList title="Configuración en Vercel" items={config} />
          <CheckList title="Operación" items={business} />
          <CheckList title="Información legal" items={legal} />
          <p className="muted-line">La guía completa está en docs/ENQORA-PUBLICACION.md del repositorio.</p>
        </>
      )}
    </div>
  );
}
