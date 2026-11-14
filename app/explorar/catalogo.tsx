import type { Category } from "@/lib/discovery";
import { clp, UNITS } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

// Servicios publicados con sus precios (mismo catálogo público que mostraba la portada; no cambia precios ni reglas).
export type CatalogRow = {
  code: string; module: string; name: string; summary: string | null; unit: string; requires_professional: boolean; price_from: number | null;
  market_price: number | null; market_sources: number | null; market_consulted: string | null;
  welcome_pct: number | null; welcome_months: number | null;
};

const fmtMonth = (d: string) => new Intl.DateTimeFormat("es-CL", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));

export async function cargarCatalogo(): Promise<CatalogRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_catalog");
  return (data ?? []) as CatalogRow[];
}

export const serviciosDe = (c: Category, catalog: CatalogRow[]) =>
  catalog.filter((s) => (c.services.codes?.includes(s.code) ?? false) || (c.services.module ? s.module === c.services.module : false));

export function ServiciosLista({ services }: { services: CatalogRow[] }) {
  if (!services.length) return <p className="muted-line">Esta categoría se cotiza según tu caso: un profesional revisa tu situación y te propone el alcance y el precio antes de cualquier cobro.</p>;
  return (
    <div className="cat-services">
      <ul role="list">
        {services.map((s) => (
          <li key={s.code}>
            <span className="cat-service-text">
              <b>{s.name}</b>
              {s.summary ? <small>{s.summary}</small> : null}
            </span>
            <span className="cat-service-price">
              {s.price_from != null && !s.requires_professional ? (
                <>
                  desde <b>{clp(s.price_from)}</b> <small>/ {UNITS[s.unit]?.per ?? s.unit}</small>
                  {s.welcome_pct && s.welcome_months ? (
                    <small className="cat-market">
                      <span className="cat-save">Tus primeros {s.welcome_months} meses: {clp(Math.round(s.price_from * (100 - s.welcome_pct) / 100))} (−{s.welcome_pct}%)</span>
                    </small>
                  ) : null}
                  {s.market_price ? (
                    <small className="cat-market" title={`Mediana de ${s.market_sources} precios publicados por otros proveedores en Chile, consultados hasta ${s.market_consulted ? fmtMonth(s.market_consulted) : ""}. Referencial.`}>
                      Precio de mercado {clp(s.market_price)}
                      {s.market_price > s.price_from ? ` · ENQORA ${Math.round((1 - s.price_from / s.market_price) * 100)}% menos` : ""}
                    </small>
                  ) : null}
                </>
              ) : (
                <small>Precio según diagnóstico</small>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormasDeTrabajar() {
  return (
    <div className="cat-ways">
      <h4 className="sub-title">Cómo trabajar con ENQORA</h4>
      <ul role="list">
        <li><b>Consulta</b><small>Cuéntanos tu situación. El equipo la revisa y te orienta antes de que contrates.</small></li>
        <li><b>Contratación puntual</b><small>Cotización por caso con el alcance, lo que no incluye y el precio final.</small></li>
        <li><b>Suscripción mensual</b><small>Planes de acompañamiento continuo: cada uno dice qué incluye, qué no y su precio mensual.</small></li>
      </ul>
    </div>
  );
}
