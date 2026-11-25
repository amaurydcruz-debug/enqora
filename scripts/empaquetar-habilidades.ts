// Empaqueta las habilidades de los agentes (carpeta habilidades/) en lib/habilidades/paquetes.ts, para que el servidor
// pueda subirlas a la API de Claude sin leer archivos del disco. Ejecutar después de editar una habilidad:
//   tsx scripts/empaquetar-habilidades.ts
// La prueba «habilidades empaquetadas al día» falla si se olvida.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

export function leerHabilidades(raiz = "habilidades") {
  return readdirSync(raiz).filter((d) => statSync(join(raiz, d)).isDirectory()).sort().map((nombre) => {
    const archivos: Record<string, string> = {};
    const recorrer = (dir: string) => {
      for (const f of readdirSync(dir).sort()) {
        const p = join(dir, f);
        if (f === "__pycache__" || f.startsWith(".")) continue;
        if (statSync(p).isDirectory()) recorrer(p);
        else archivos[relative(raiz, p).split("\\").join("/")] = readFileSync(p, "utf8");
      }
    };
    recorrer(join(raiz, nombre));
    const huella = createHash("sha256").update(JSON.stringify(archivos)).digest("hex");
    return { nombre, huella, archivos };
  });
}

export function generar() {
  return `// GENERADO por scripts/empaquetar-habilidades.ts desde habilidades/. No editar a mano.\n` +
    `export const PAQUETES_HABILIDADES: { nombre: string; huella: string; archivos: Record<string, string> }[] = ${JSON.stringify(leerHabilidades(), null, 1)};\n`;
}

if (process.argv[1]?.endsWith("empaquetar-habilidades.ts")) {
  writeFileSync("lib/habilidades/paquetes.ts", generar());
  console.log(`Habilidades empaquetadas: ${leerHabilidades().map((h) => h.nombre).join(", ")}`);
}
