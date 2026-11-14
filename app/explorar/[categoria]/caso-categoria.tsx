"use client";

import { useState } from "react";
import { CasoForm, CategoriaEntrada } from "@/app/cora-caso";

// Consulta sin RUT: el mismo formulario «Cuéntanos tu caso» de CORA, con los objetivos de la categoría elegida
// (lo que esa categoría resuelve) y la categoría como pista. Misma acción, mismas reglas y mismo consentimiento.
const EJEMPLOS: Record<string, string> = {
  trabajador: "Ej.: me despidieron el 3 de noviembre por «necesidades de la empresa», no me pagaron las vacaciones y tengo cotizaciones impagas.",
  empleador: "Ej.: un ex trabajador nos demandó por despido injustificado; nos notificaron la semana pasada y la audiencia es en diciembre.",
};

export function CasoCategoria({ categoria, titulo, objetivos, sinRut = true }: { categoria: string; titulo: string; objetivos: string[]; sinRut?: boolean }) {
  const [relato, setRelato] = useState("");
  const opciones = objetivos.map((texto, i) => ({ id: `${categoria}-${i}`, texto, categoria, pista: /$^/ }));
  return (
    <CategoriaEntrada.Provider value={categoria}>
      <CasoForm rut="" razon="" relato={relato} setRelato={setRelato} objetivos={opciones} etiqueta={sinRut ? `Sin RUT · ${titulo}` : titulo} ejemplo={EJEMPLOS[categoria]}
        titulo="¿Qué necesitas resolver?"
        ayuda="Marca lo que te pasa y, si quieres, cuéntanos el detalle (escrito o dictado). CORA ordena tu caso y un profesional te responde con una propuesta, sin costo." />
    </CategoriaEntrada.Provider>
  );
}
