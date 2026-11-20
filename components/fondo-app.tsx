"use client";

import { usePathname } from "next/navigation";

// Fondo en profundidad del espacio del cliente: la misma línea visual de la portada de ENQORA.
// Cada sección muestra, tenue y detrás del contenido, una fotografía relacionada. Es decorativa.
const FONDOS: [string, string][] = [
  ["/casos", "/entrada/servicios/gestion.webp"],
  ["/firmas", "/entrada/mando/mandatos.webp"],
  ["/contabilidad", "/entrada/servicios/contabilidad.webp"],
  ["/facturacion", "/entrada/mando/cobros.webp"],
  ["/planes", "/entrada/mando/planes.webp"],
  ["/empresas", "/entrada/servicios/constitucion.webp"],
  ["/seguridad", "/entrada/mando/derechos.webp"],
  ["/legal", "/entrada/mando/legal.webp"],
  ["/mandatos", "/entrada/mando/mandatos.webp"],
  ["/notificaciones", "/entrada/mando/resumen.webp"],
];

export function FondoApp() {
  const path = usePathname() ?? "/panel";
  // El inicio ya tiene su propia fotografía grande: el fondo general queda solo en las demás secciones.
  if (path === "/panel") return null;
  const foto = FONDOS.find(([r]) => path === r || path.startsWith(r + "/"))?.[1] ?? "/entrada/hero.webp";
  return (
    <div className="mando-fondo" aria-hidden="true">
      <div className="mando-fondo-img" style={{ backgroundImage: `url(${foto})` }} />
    </div>
  );
}
