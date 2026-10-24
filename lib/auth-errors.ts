// Traduce los errores de Supabase Auth a mensajes claros, sin revelar
// si un correo existe o no en la plataforma.
// Cuando el error no está catalogado, el mensaje incluye su código técnico
// (nunca datos del usuario) para poder diagnosticarlo.
type AuthErr = { code?: string; message?: string; status?: number; name?: string } | null | undefined;

const RATE = "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
const CONFIG = "ENQORA está en configuración y no puede completar esta operación todavía.";

const MESSAGES: Record<string, string> = {
  // Credenciales y contraseñas
  invalid_credentials: "Correo o contraseña incorrectos.",
  email_not_confirmed: "Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.",
  weak_password: "La contraseña no cumple la política de seguridad. Usa una más larga y que no haya sido filtrada.",
  same_password: "La nueva contraseña debe ser distinta de la actual.",
  reauthentication_needed: "Por seguridad, confirma tu identidad con el código de tu aplicación autenticadora.",
  reauthentication_not_valid: "El código de verificación no es válido.",
  user_banned: "Esta cuenta está suspendida. Contacta al soporte de ENQORA.",

  // Correo
  email_address_invalid: "Ese correo no es aceptado. Usa una dirección real (no de prueba ni de ejemplo).",
  email_address_not_authorized: `${CONFIG} (El servicio de correo de prueba no puede enviar a esta dirección: falta configurar el SMTP propio.)`,
  over_email_send_rate_limit: "Se enviaron demasiados correos a esta dirección. Espera unos minutos y vuelve a intentarlo.",
  otp_expired: "El enlace o código expiró. Solicita uno nuevo.",

  // Registro deshabilitado
  signup_disabled: "El registro de nuevas cuentas está desactivado por el momento.",
  email_provider_disabled: `${CONFIG} (El ingreso con correo y contraseña está desactivado.)`,

  // MFA
  insufficient_aal: "Por seguridad, confirma tu identidad con el código de tu aplicación autenticadora.",
  mfa_verification_failed: "El código no es válido. Usa el código actual de tu aplicación autenticadora.",
  mfa_challenge_expired: "El código expiró. Ingresa el código actual de tu aplicación autenticadora.",
  mfa_verification_rejected: "Demasiados intentos fallidos. Espera unos minutos antes de volver a intentarlo.",
  mfa_factor_not_found: "El segundo factor ya no existe. Vuelve a configurarlo.",
  mfa_factor_name_conflict: "Ya existe un autenticador con ese nombre. Intenta nuevamente.",
  mfa_ip_address_mismatch: "La configuración debe iniciarse y completarse desde la misma red. Genera un nuevo código QR.",
  too_many_enrolled_mfa_factors: "Alcanzaste el máximo de autenticadores. Contacta al soporte de ENQORA.",
  mfa_totp_enroll_not_enabled: `${CONFIG} (La verificación con aplicación autenticadora está desactivada.)`,
  mfa_totp_verify_not_enabled: `${CONFIG} (La verificación con aplicación autenticadora está desactivada.)`,

  // Límites y sesión
  over_request_rate_limit: RATE,
  request_timeout: "El servicio tardó demasiado en responder. Intenta nuevamente.",
  session_expired: "Tu sesión expiró. Ingresa nuevamente.",
  session_not_found: "Tu sesión ya no es válida. Ingresa nuevamente.",
  captcha_failed: "No pudimos verificar que no eres un robot. Intenta nuevamente.",
};

export function authMessage(error: AuthErr, fallback = "No pudimos completar la operación. Intenta nuevamente."): string {
  if (!error) return fallback;

  const known = error.code ? MESSAGES[error.code] : undefined;
  if (known) return known;
  if (error.status === 429) return RATE;

  // Errores no catalogados: se registran en el servidor (Vercel → Logs) y se muestra el código.
  console.error("[ENQORA auth]", { code: error.code, status: error.status, name: error.name, message: error.message });

  if (error.status === 401 || /invalid api key/i.test(error.message ?? "")) {
    return `${CONFIG} (Clave de Supabase no válida.)`;
  }
  const ref = error.code ?? (error.status ? `http_${error.status}` : error.name ?? "desconocido");
  return `${fallback} (código: ${ref})`;
}
