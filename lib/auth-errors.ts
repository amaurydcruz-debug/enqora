// Traduce los errores de Supabase Auth a mensajes claros, sin revelar
// si un correo existe o no en la plataforma.
type AuthErr = { code?: string; message?: string; status?: number } | null | undefined;

export function authMessage(error: AuthErr, fallback = "No pudimos completar la operación. Intenta nuevamente."): string {
  if (!error) return fallback;
  switch (error.code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.";
    case "weak_password":
      return "La contraseña no cumple la política de seguridad. Usa una más larga y que no haya sido filtrada.";
    case "same_password":
      return "La nueva contraseña debe ser distinta de la actual.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
    case "mfa_verification_failed":
    case "mfa_challenge_expired":
      return "El código no es válido o expiró. Usa el código actual de tu aplicación autenticadora.";
    case "insufficient_aal":
    case "reauthentication_needed":
      return "Por seguridad, confirma tu identidad con el código de tu aplicación autenticadora.";
    case "user_banned":
      return "Esta cuenta está suspendida. Contacta al soporte de ENQORA.";
  }
  if (error.status === 429) return "Demasiados intentos. Espera unos minutos antes de volver a intentarlo.";
  return fallback;
}
