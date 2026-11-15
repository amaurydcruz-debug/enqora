import Link from "next/link";
import type { Metadata } from "next";
import { CALIDADES, ESTADOS_FIRMANTE, type Calidad } from "@/lib/firma";
import { fechaCL } from "@/lib/informa";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Mis firmas" };
export const dynamic = "force-dynamic";

type Fila = { id: string; estado: string; firmado_at: string | null; calidad: Calidad; folio: string; solicitud: string; vence_at: string;
  documento: string; titulo: string; vencida: boolean; turno: boolean };

// ENQORA SIGN: los documentos que ENQORA te envió para firmar, y los que ya firmaste.
export default async function FirmasPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("sign_mis_firmas");
  const filas = (Array.isArray(data) ? data : []) as Fila[];
  const porFirmar = filas.filter((f) => f.estado === "pendiente" && f.solicitud === "pendiente" && !f.vencida);
  const resto = filas.filter((f) => !porFirmar.includes(f));
  return (
    <div className="page">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">ENQORA SIGN</span>
          <h1>Mis firmas</h1>
          <p className="hero-lead">Documentos que ENQORA te envió para firmar desde tu teléfono o computador. Lees el documento completo y firmas con el código de tu autenticador: el documento firmado queda guardado en la Bóveda con su evidencia.</p>
        </div>
      </header>
      <section className="card" aria-labelledby="pf-t">
        <h2 id="pf-t">Por firmar ({porFirmar.length})</h2>
        {porFirmar.length ? (
          <ul className="inf-cola">
            {porFirmar.map((f) => (
              <li key={f.id} className="inf-cola-item">
                <span className="mono">{f.documento}</span>
                <span className={`badge ${f.turno ? "badge-gold" : "badge-muted"}`}>{f.turno ? "Te toca firmar" : "Esperando a otra parte"}</span>
                <b>{f.titulo}</b>
                <small>Firmas como {CALIDADES[f.calidad] ?? f.calidad} · vence el {fechaCL(f.vence_at, "long")} · <Link href={`/firmas/${f.id}`}>{f.turno ? "Leer y firmar" : "Ver documento"}</Link></small>
              </li>
            ))}
          </ul>
        ) : <p className="muted-line">No tienes documentos pendientes de firma.</p>}
      </section>
      {resto.length ? (
        <section className="card" aria-labelledby="hist-t">
          <h2 id="hist-t">Historial</h2>
          <ul className="inf-cola">
            {resto.map((f) => (
              <li key={f.id} className="inf-cola-item">
                <span className="mono">{f.documento}</span>
                <span className={`badge ${f.estado === "firmado" ? "badge-ok" : "badge-muted"}`}>{f.vencida ? "Plazo vencido" : f.solicitud === "anulada" ? "Anulada" : ESTADOS_FIRMANTE[f.estado] ?? f.estado}</span>
                <b>{f.titulo}</b>
                <small>{f.firmado_at ? `Firmaste el ${fechaCL(f.firmado_at, "long")} · ` : ""}<Link href={`/firmas/${f.id}`}>Ver detalle</Link></small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
