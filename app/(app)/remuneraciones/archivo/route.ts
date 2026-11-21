import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { booksCompany } from "@/lib/accounting-server";
import { archivoLre, archivoPrevired } from "@/lib/rem-archivos";
import { prepararArchivos } from "@/lib/rem-archivos-server";
import { periodoValido } from "@/lib/remuneraciones";
import { createClient } from "@/lib/supabase/server";

// Descarga la nómina de Previred o el LRE del mes, solo con liquidaciones aprobadas y datos completos.
// Cada descarga queda registrada con su huella SHA-256.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tipo = url.searchParams.get("tipo");
  const periodo = url.searchParams.get("periodo") ?? "";
  const volver = (error: string) => NextResponse.redirect(new URL(`/remuneraciones?periodo=${periodo}&error=${error}#archivos`, url.origin), 303);
  if ((tipo !== "previred" && tipo !== "lre") || !periodoValido(periodo)) return new NextResponse("Solicitud no válida", { status: 400 });
  const company = await booksCompany();
  if (!company?.canBook) return new NextResponse("No encontrado", { status: 404 });
  const prep = await prepararArchivos(company.id, periodo);
  if (!prep.listo || !prep.empresa) return volver("ENQ_ARCHIVO_INCOMPLETO");
  const texto = tipo === "previred" ? archivoPrevired(prep.filas, prep.empresa, periodo) : archivoLre(prep.filas, prep.empresa, periodo);
  // Previred y la Dirección del Trabajo reciben archivos de texto en codificación Windows/ISO-8859-1.
  const bytes = Buffer.from(texto, "latin1");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rem_registrar_exportacion", {
    p_company: company.id, p_periodo: periodo, p_tipo: tipo, p_trabajadores: prep.filas.length, p_sha256: sha,
  });
  if (error) return volver("ENQ_SIN_PERMISO");
  const rut = company.rut.replace(/[.\s]/g, "").split("-")[0];
  const nombre = tipo === "previred" ? `previred_${rut}_${periodo.slice(5, 7)}${periodo.slice(0, 4)}.txt` : `lre_${rut}_${periodo.replace("-", "")}.csv`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": tipo === "previred" ? "text/plain; charset=iso-8859-1" : "text/csv; charset=iso-8859-1",
      "content-disposition": `attachment; filename="${nombre}"`, "cache-control": "no-store",
    },
  });
}
