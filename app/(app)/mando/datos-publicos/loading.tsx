import { EnqoraClockLoader } from "@/components/clock-loader";

// Transición de navegación: visible solo mientras esta sección se prepara en el servidor.
export default function Loading() {
  return <EnqoraClockLoader mode="navegacion" label="Abriendo los datos públicos" />;
}
