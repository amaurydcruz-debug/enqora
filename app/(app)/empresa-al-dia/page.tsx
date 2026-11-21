import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/disclosure";
import { activeCompany } from "@/lib/companies";
import { perfilValido, type Respuesta } from "@/lib/empresa-al-dia";
import { createClient } from "@/lib/supabase/server";
import { Cuestionario } from "./cuestionario";

export const metadata: Metadata = { title: "Empresa al día" };

type Diag = { version: number; perfil: unknown; respuestas: Record<string, Respuesta>; puntaje: number; creado: string };

// «Empresa al día»: diagnóstico de 0 a OK con semáforo por frente y lista priorizada (0071).
export default async function EmpresaAlDiaPage() {
  const { active } = await activeCompany();
  if (!active) {
    return (
      <div className="page narrow">
        <header className="hero"><div className="hero-main"><span className="eyebrow">Diagnóstico</span><h1>Empresa al día</h1></div></header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          El diagnóstico se guarda en la empresa para que ENQORA lo mantenga al día contigo.
        </Callout>
      </div>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from("diagnosticos_empresa").select("version, perfil, respuestas, puntaje, creado")
    .eq("company_id", active.id).order("version", { ascending: false }).limit(5);
  const historial = (data ?? []) as Diag[];
  const ultimo = historial[0] ?? null;
  const fecha = (d: string) => new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeZone: "America/Santiago" }).format(new Date(d));

  return (
    <div className="page narrow ps">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">{active.trade_name || active.legal_name} · Diagnóstico</span>
          <h1>Empresa al día</h1>
          <p className="hero-lead">En 5 minutos ves cómo está tu empresa ante el SII, la municipalidad, la Dirección del Trabajo, la previsión, la mutual y tus clientes, y qué resolver primero.</p>
        </div>
      </header>
      {historial.length ? (
        <p className="muted-line">
          Último diagnóstico: versión {ultimo!.version} del {fecha(ultimo!.creado)}, {ultimo!.puntaje}% al día.
          {historial.length > 1 ? ` Anteriores: ${historial.slice(1).map((h) => `v${h.version} ${h.puntaje}%`).join(" · ")}.` : ""}
        </p>
      ) : null}
      <Cuestionario companyId={active.id} inicialPerfil={perfilValido(ultimo?.perfil)} inicialRespuestas={ultimo?.respuestas ?? {}}
        puedeGuardar={["owner", "admin", "accountant"].includes(active.role)} />
    </div>
  );
}
