// Estado de carga del área privada: el reloj ENQORA.
// Con "movimiento reducido" activado en el dispositivo, las manecillas quedan quietas.
export default function Loading() {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <svg className="loading-clock" viewBox="0 0 48 48" width="56" height="56" aria-hidden="true">
        <circle cx="24" cy="24" r="20" className="lc-ring" />
        <circle cx="24" cy="24" r="20" className="lc-arc" />
        <line x1="24" y1="24" x2="24" y2="12" className="lc-hand lc-minute" />
        <line x1="24" y1="24" x2="31" y2="24" className="lc-hand lc-hour" />
        <circle cx="24" cy="24" r="1.8" className="lc-pin" />
      </svg>
      <span>Cargando…</span>
    </div>
  );
}
