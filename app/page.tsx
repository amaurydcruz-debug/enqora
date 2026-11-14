import type { Metadata } from "next";
import { EntradaHero, EntradaNecesitas, EntradaPie, EntradaServicios, EntradaTop } from "./entrada";
import { indexable } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "ENQORA · Bienvenido al mundo ENQORA" },
  description: "Contabilidad, constitución, formalización, marcas y gestión para tu empresa, con inteligencia y profesionales.",
  alternates: { canonical: "/" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

// Puerta de entrada ENQORA (pública). La sesión iniciada va directo al Centro de control (middleware).
// 01 Inicio (galerías) → 02 Selección (/explorar/<categoría>) → 03 Consulta gratuita con CORA → 04 Registro para continuar.
// La consulta por RUT, los servicios con precios y los perfiles siguen existiendo: se abren al elegir una opción.
export default function WelcomePage() {
  return (
    <div className="entry">
      <EntradaTop />
      <main className="ent-main">
        <EntradaHero />
        <EntradaNecesitas />
        <EntradaServicios />
      </main>
      <EntradaPie />
    </div>
  );
}
