import { EnqoraClock } from "@/components/brand/enqora-clock";

// EnqoraClockLoader: indicador oficial de carga de ENQORA (sistema de diseño).
// Es el reloj del logotipo cobrando vida; nunca un círculo genérico.
//
// Modos:
// - "navegacion": transición breve mientras Next.js prepara la nueva sección (loading.tsx).
//   Aparece con un leve retraso para no destellar si la sección ya está lista.
// - "datos": se muestra solo mientras se espera una respuesta real (Suspense o acción pendiente).
//   Compacto y en línea: no bloquea el resto de la pantalla.
// - "ia": trabajo de los agentes; acompaña el reloj con la descripción real de lo que ocurre.
//
// No tiene temporizadores: desaparece en cuanto el contenido llega (lo controla quien lo usa).
export function EnqoraClockLoader({
  mode = "navegacion",
  label,
  detail,
}: {
  mode?: "navegacion" | "datos" | "ia";
  label: string;
  detail?: string;
}) {
  const size = mode === "datos" ? 44 : mode === "ia" ? 88 : 120;
  return (
    <div className={`clock-loader clock-${mode}`} role="status" aria-live="polite">
      <span className="clock-stage">
        <EnqoraClock size={size} live />
        <span className="clock-floor" aria-hidden="true" />
      </span>
      <span className="clock-text">
        <span className="clock-label">{label}</span>
        {detail ? <span className="clock-detail">{detail}</span> : null}
      </span>
    </div>
  );
}
