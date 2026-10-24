// Constantes de empresas y roles, utilizables tanto en el servidor como en el navegador.

export const ROLES = {
  owner: "Propietario",
  admin: "Administrador",
  accountant: "Contador",
  viewer: "Solo lectura",
} as const;
export type Role = keyof typeof ROLES;

export const ROLE_HELP: Record<Role, string> = {
  owner: "Control total, incluidos propietarios y permisos.",
  admin: "Edita la empresa e invita a contadores y lectores.",
  accountant: "Trabaja la contabilidad. No administra miembros.",
  viewer: "Consulta información sin modificarla.",
};

export const REGIMES = {
  pro_pyme_general: "Pro Pyme General (14 D N°3)",
  pro_pyme_transparente: "Pro Pyme Transparente (14 D N°8)",
  general_semi_integrado: "Régimen General Semi Integrado (14 A)",
  renta_presunta: "Renta Presunta (art. 34)",
  otro: "Otro",
  por_definir: "Por definir",
} as const;
export type Regime = keyof typeof REGIMES;

export type Company = {
  id: string;
  rut: string;
  legal_name: string;
  trade_name: string | null;
  activity: string | null;
  tax_regime: Regime;
  rut_verified: boolean;
  created_at: string;
};

export type MyCompany = Company & { role: Role };

export const canManage = (role: Role | null | undefined) => role === "owner" || role === "admin";

export const isRole = (v: unknown): v is Role => typeof v === "string" && v in ROLES;
export const isRegime = (v: unknown): v is Regime => typeof v === "string" && v in REGIMES;
