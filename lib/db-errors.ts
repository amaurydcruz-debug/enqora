// Traduce los códigos ENQ_* que devuelven las funciones de la base de datos.
type DbErr = { message?: string; code?: string } | null | undefined;

const MESSAGES: Record<string, string> = {
  ENQ_AUTH: "Tu sesión expiró. Ingresa nuevamente.",
  ENQ_MFA: "Confirma tu identidad con el segundo factor para continuar.",
  ENQ_REAUTH: "Por seguridad, confirma tu identidad con un código nuevo de tu aplicación autenticadora.",
  ENQ_RUT_INVALIDO: "El RUT no es válido. Revisa el número y el dígito verificador.",
  ENQ_DATOS_INVALIDOS: "Revisa los datos ingresados.",
  ENQ_LIMITE_EMPRESAS: "Alcanzaste el máximo de empresas que puedes registrar. Contacta al soporte de ENQORA.",
  ENQ_EMPRESA_DUPLICADA: "Ya tienes registrada una empresa con ese RUT.",
  ENQ_SIN_PERMISO: "No tienes permiso para realizar esta acción en esta empresa.",
  ENQ_ULTIMO_PROPIETARIO: "La empresa debe tener al menos un propietario. Asigna otro propietario antes de continuar.",
  ENQ_YA_MIEMBRO: "Esa persona ya es miembro de la empresa.",
  ENQ_MIEMBRO_NO_EXISTE: "Ese miembro ya no pertenece a la empresa.",
  ENQ_INVITACION_INVALIDA: "La invitación no es válida, ya fue usada o expiró.",
  ENQ_INVITACION_OTRO_CORREO: "Esta invitación fue enviada a otro correo. Ingresa con la cuenta invitada.",
  ENQ_USUARIO_NO_EXISTE: "No existe una cuenta ENQORA con ese correo. La persona debe registrarse primero.",
  ENQ_ULTIMO_ADMIN: "ENQORA debe tener al menos un Administrador activo.",
  ENQ_NO_ES_EQUIPO: "Esa persona no pertenece al equipo ENQORA.",
  ENQ_CASO_CERRADO: "El caso está cerrado. Solo la supervisión puede reabrirlo.",
  ENQ_CIERRE_SIN_RESULTADO: "Para cerrar el caso describe el resultado obtenido (mínimo 10 caracteres).",
  ENQ_ARCHIVO_NO_SUBIDO: "El archivo no terminó de subirse. Intenta nuevamente.",
};

export function dbCode(error: DbErr): string | null {
  const match = error?.message?.match(/ENQ_[A-Z_]+/);
  return match ? match[0] : null;
}

export function dbMessage(error: DbErr, fallback = "No pudimos completar la operación. Intenta nuevamente."): string {
  const code = dbCode(error);
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (error) console.error("[ENQORA db]", { code: error.code, message: error.message });
  return error?.code ? `${fallback} (código: ${error.code})` : fallback;
}

export function messageForCode(code: string | undefined | null): string | null {
  return code && MESSAGES[code] ? MESSAGES[code] : null;
}
