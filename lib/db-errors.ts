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
  ENQ_SIN_RESPONSABLE: "El caso aún no tiene responsable. Asígnalo o envía la aprobación a la supervisión.",
  ENQ_YA_DECIDIDA: "Esta solicitud ya fue decidida o anulada.",
  ENQ_CUATRO_OJOS: "No puedes decidir una solicitud que tú mismo enviaste. Debe decidirla otra persona.",
  ENQ_FALTA_OBSERVACION: "Para rechazar o devolver, explica el motivo (mínimo 10 caracteres).",
  ENQ_AUTORIZACION_VENCIDA: "El plazo de esta autorización ya venció. ENQORA deberá enviarte una nueva solicitud.",
  ENQ_FALTA_CONFIRMACION: "Para continuar, marca la casilla de confirmación.",
  ENQ_CODIGO_DUPLICADO: "Ya existe un servicio o plan con ese código.",
  ENQ_SIN_TARIFA: "Ese servicio aún no tiene una tarifa vigente publicada.",
  ENQ_SERVICIO_INACTIVO: "Ese servicio no está activo en el catálogo.",
  ENQ_FALTA_MOTIVO_DESCUENTO: "Todo descuento necesita un motivo (mínimo 10 caracteres).",
  ENQ_DEMASIADAS_CONSULTAS: "Hiciste muchas consultas seguidas. Intenta nuevamente en una hora.",
  ENQ_COTIZACION_VENCIDA: "La validez de esta cotización terminó. Pide al equipo ENQORA una nueva.",
  ENQ_FALTA_ONBOARDING: "Antes de pedir tu diagnóstico gratuito, responde las preguntas sobre tu empresa.",
  ENQ_DIAGNOSTICO_YA_USADO: "Tu empresa ya usó su diagnóstico gratuito. Puedes crear una nueva solicitud cuando quieras.",
  ENQ_DIAGNOSTICO_INCOMPLETO: "Para enviar el diagnóstico agrega el resumen, el nivel de certeza y al menos una situación.",
  ENQ_DIAGNOSTICO_NO_EDITABLE: "Este diagnóstico ya no se puede editar: está en revisión o fue entregado. Abre una nueva versión.",
  ENQ_FUENTE_INVALIDA: "Revisa las fuentes: cada una necesita un título y, si tiene enlace, debe comenzar con https://.",
  ENQ_PLAN_NO_DISPONIBLE: "Ese plan no está disponible o su precio cambió. Revisa los planes vigentes.",
  ENQ_SUSCRIPCION_ACTIVA: "Tu empresa ya tiene una suscripción en esta línea. Cancélala antes de contratar otro plan.",
  ENQ_CASO_NO_CERRADO: "La propuesta mensual se prepara cuando el caso está en verificación o cerrado.",
  ENQ_PROPUESTA_ABIERTA: "Este caso ya tiene una propuesta de plan abierta. Anúlala antes de enviar otra.",
  ENQ_PROPUESTA_VENCIDA: "La validez de esta propuesta terminó. Pide al equipo ENQORA una nueva.",
  ENQ_COBRO_NO_PAGABLE: "Este cobro ya fue pagado, está en revisión o fue anulado.",
  ENQ_CLAVE_SERVICIO: "La clave de servicio no es válida.",
  ENQ_PASARELA_NO_CONFIGURADA: "El pago en línea aún no está habilitado. Puedes pagar por transferencia.",
  ENQ_PASARELA_ERROR: "No pudimos conectar con la pasarela de pago. Intenta nuevamente o paga por transferencia.",
  ENQ_MANDATO_NO_EDITABLE: "Este mandato ya no se puede modificar en su estado actual.",
  ENQ_MANDATO_SIN_ACEPTAR: "Antes de subir el documento firmado, revisa el mandato e indica quién firma.",
  ENQ_VERIFICACION_INCOMPLETA: "Para dejar vigente el mandato, todos los puntos de la verificación deben estar comprobados.",
  ENQ_SIN_MANDATO_VIGENTE: "No hay un mandato vigente de la empresa que cubra esta institución hoy.",
  ENQ_SIN_AUTORIZACION_VIGENTE: "Falta una autorización vigente del cliente para este caso.",
  ENQ_ACTUACION_NO_VERIFICADA: "La actuación debe estar habilitada (mandato y autorización vigentes) antes de registrarla.",
  ENQ_TELEFONO_NO_VERIFICADO: "Para recibir avisos por WhatsApp primero verifica tu número.",
  ENQ_CODIGO_VENCIDO: "El código venció. Pide uno nuevo.",
  ENQ_CODIGO_INCORRECTO: "El código no es correcto.",
  ENQ_PERIODO_DECLARADO: "Este período ya tiene su F29 aprobado o presentado: sus documentos no se pueden modificar.",
  ENQ_MONTO_NO_COINCIDE: "El monto del movimiento no coincide con el total del documento.",
  ENQ_YA_CONCILIADO: "Ese movimiento o documento ya está conciliado.",
  ENQ_F29_NO_EDITABLE: "El F29 de este período ya no se puede modificar en su estado actual.",
  ENQ_AUDITORIA_PENDIENTE: "Esta propuesta aún no tiene auditoría completa. Espera la auditoría o pide a la supervisión que la revise.",
  ENQ_AUDITORIA_OBSERVADA: "La auditoría observó esta propuesta. Pide la corrección al agente o que la supervisión la revise.",
  ENQ_FALTA_FUNDAMENTO: "Para aceptar una propuesta observada, escribe el fundamento de tu decisión (mínimo 10 caracteres).",
  ENQ_SIN_CORRECCION: "Esta ejecución no tiene observaciones de auditoría que corregir.",
  ENQ_LIMITE_CORRECCIONES: "Ya se hicieron dos rondas de corrección. La propuesta debe revisarla la supervisión.",
  ENQ_AGENTE_OCUPADO: "Este agente ya está trabajando en el caso. Espera a que termine.",
  ENQ_YA_SOLICITADA: "Ya lo solicitaste. El equipo ENQORA te enviará la cotización en este caso.",
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
