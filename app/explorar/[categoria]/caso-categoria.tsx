"use client";

import { useState } from "react";
import { CasoForm, CategoriaEntrada } from "@/app/cora-caso";

// Consulta sin RUT: el mismo formulario «Cuéntanos tu caso» de CORA, con los objetivos de la categoría elegida
// (lo que esa categoría resuelve) y la categoría como pista. Misma acción, mismas reglas y mismo consentimiento.
export function CasoCategoria({ categoria, titulo, objetivos }: { categoria: string; titulo: string; objetivos: string[] }) {
  const [relato, setRelato] = useState("");
  const opciones = objetivos.map((texto, i) => ({ id: `${categoria}-${i}`, texto, categoria, pista: /$^/ }));
  return (
    <CategoriaEntrada.Provider value={categoria}>
      <CasoForm rut="" razon="" relato={relato} setRelato={setRelato} objetivos={opciones} etiqueta={`Sin RUT · ${titulo}`}
        titulo="¿Qué necesitas resolver?"
        ayuda="Marca lo que te pasa y, si quieres, cuéntanos el detalle (escrito o dictado). CORA ordena tu caso y un profesional te responde con una propuesta, sin costo." />
    </CategoriaEntrada.Provider>
  );
}
