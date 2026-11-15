"use client";

import { usePathname } from "next/navigation";

// Fondo de profundidad del Centro de Mando: cada ventana muestra, detrás del contenido,
// una imagen tenue relacionada con su tema (misma línea visual que la portada de ENQORA).
// Es decorativa: no lleva texto alternativo ni recibe clics.
const FONDOS: Record<string, string> = {
  "/mando/mandatos": "mandatos",
  "/mando/legal": "legal",
  "/mando/derechos": "derechos",
  "/mando/aprendizajes": "aprendizajes",
  "/mando/boveda": "boveda",
  "/mando/informa": "informa",
  "/mando/vigilancia": "vigilancia",
  "/mando/datos-publicos": "datos-publicos",
  "/mando/fuentes": "fuentes",
  "/mando/investigador": "investigador",
  "/mando/solicitudes": "solicitudes",
  "/mando/terreno": "terreno",
  "/mando/agentes": "agentes",
  "/mando/laboratorio": "laboratorio",
  "/mando/catalogo": "catalogo",
  "/mando/planes": "planes",
  "/mando/cobros": "cobros",
  "/mando/estado": "estado",
  "/mando/equipo": "equipo",
};

// Punto de interés horizontal de cada imagen, para que en el teléfono se vea lo importante.
const FOCO: Record<string, string> = {
  resumen: "55%", mandatos: "55%", legal: "62%", derechos: "66%", aprendizajes: "72%", boveda: "76%", informa: "45%",
  vigilancia: "66%", "datos-publicos": "52%", fuentes: "55%", investigador: "45%", solicitudes: "52%", terreno: "50%",
  agentes: "62%", laboratorio: "55%", catalogo: "45%", planes: "55%", cobros: "68%", estado: "55%", equipo: "62%",
};

export function fondoDe(pathname: string): string {
  const ruta = Object.keys(FONDOS)
    .filter((r) => pathname === r || pathname.startsWith(r + "/"))
    .sort((a, b) => b.length - a.length)[0];
  return ruta ? FONDOS[ruta] : "resumen";
}

export function FondoMando() {
  const nombre = fondoDe(usePathname() ?? "/mando");
  return (
    <div className="mando-fondo" aria-hidden="true" data-fondo={nombre}>
      <div className="mando-fondo-img" style={{ backgroundImage: `url(/entrada/mando/${nombre}.webp)`, backgroundPositionX: FOCO[nombre] ?? "50%" }} />
    </div>
  );
}
