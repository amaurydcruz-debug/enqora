// Notificaciones (M11): categorías y tipos compartidos.

export type Notification = {
  id: number;
  category: "casos" | "cotizaciones" | "pagos" | "mandatos" | "equipo";
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

export type NotificationPreferences = {
  email: boolean;
  whatsapp: boolean;
  phone: string | null;
  phone_verified_at: string | null;
  muted: string[];
};

export const CATEGORIES: Record<Notification["category"], { label: string; help: string; emblem: string; staffOnly?: boolean }> = {
  casos: { label: "Mis casos", help: "Mensajes, documentos, diagnósticos, autorizaciones y cierres.", emblem: "casos" },
  cotizaciones: { label: "Cotizaciones y planes", help: "Cotizaciones y propuestas por revisar.", emblem: "contabilidad" },
  pagos: { label: "Cobros y pagos", help: "Cobros nuevos, vencidos y pagos confirmados.", emblem: "pagos" },
  mandatos: { label: "Mandatos", help: "Mandatos por firmar, vigentes, observados o vencidos.", emblem: "autorizaciones" },
  equipo: { label: "Trabajo del equipo", help: "Solicitudes, aprobaciones y respuestas de clientes.", emblem: "proximas", staffOnly: true },
};

export const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "ahora";
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
};
