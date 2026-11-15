/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { EntradaPie, EntradaTop, Icono } from "@/app/entrada";
import { CATEGORIES } from "@/lib/discovery";
import { DEP_KEYS, DEPARTAMENTOS, fechaCL, type Publicacion } from "@/lib/informa";
import { indexable } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { TarjetaInforma } from "./tarjeta";

export const metadata: Metadata = {
  title: { absolute: "ENQORA Informa · Lo que cambia y te afecta, verificado" },
  description: "Centro de inteligencia normativa de ENQORA: cambios tributarios, laborales, legales y fondos públicos, verificados en su fuente oficial.",
  alternates: { canonical: "/informa" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};
export const revalidate = 300;

const PASOS = ["Investigar", "Detectar", "Verificar", "Clasificar", "Publicar", "Actualizar"];

// ENQORA Informa (público). Solo muestra lo publicado por el equipo: con fuente oficial, fecha de consulta,
// verificación humana y, si es de alto impacto, revisión profesional. Nunca contenido generado sin revisar.
export default async function InformaPage({ searchParams }: { searchParams: Promise<{ categoria?: string; q?: string }> }) {
  const sp = await searchParams;
  const categoria = CATEGORIES.some((c) => c.key === sp.categoria) ? sp.categoria! : null;
  const q = (sp.q ?? "").trim().slice(0, 80) || null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("informa_publicaciones", { p_categoria: categoria, p_q: q, p_limit: 60 });
  const pubs = (data ?? []) as Publicacion[];
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());
  const alertas = pubs.filter((p) => p.alerta === "urgente" || p.alerta === "importante");
  const oportunidades = pubs.filter((p) => p.tipo_contenido === "oportunidad" && !alertas.includes(p));
  const calendario = pubs
    .flatMap((p) => [
      ...(p.vigente_desde && p.vigente_desde >= hoy ? [{ fecha: p.vigente_desde, texto: "Entra en vigor", p }] : []),
      ...(p.vigente_hasta && p.vigente_hasta >= hoy ? [{ fecha: p.vigente_hasta, texto: p.tipo_contenido === "oportunidad" ? "Cierra la postulación" : "Vence", p }] : []),
    ])
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 8);
  const resto = pubs.filter((p) => !alertas.includes(p) && !oportunidades.includes(p));
  const cat = categoria ? CATEGORIES.find((c) => c.key === categoria) : null;

  return (
    <div className="entry">
      <EntradaTop activa="informa" />
      <main className="ent-main ent-cat">
        <section className="ent-cat-hero inf-hero" aria-labelledby="inf-t">
          <img src="/entrada/servicios/crecimiento.webp" alt="" className="ent-cat-foto" fetchPriority="high" />
          <div className="ent-cat-hero-text">
            <span className="ent-cat-n"><Icono nombre="grafico" size={30} /> Centro de inteligencia normativa</span>
            <h1 id="inf-t">ENQORA Informa</h1>
            <p className="ent-lead">ENQORA investiga por ti. Verifica la información. Te explica qué significa y te conecta con la solución que necesitas.</p>
            <form className="inf-buscar" role="search" action="/informa">
              {categoria ? <input type="hidden" name="categoria" value={categoria} /> : null}
              <input className="input" type="search" name="q" defaultValue={q ?? ""} placeholder="Busca: IVA, Ley Karin, Sercotec, marcas…" aria-label="Buscar en ENQORA Informa" />
              <button type="submit" className="btn btn-gold btn-inline">Buscar</button>
            </form>
          </div>
        </section>

        <nav className="inf-chips" aria-label="Filtrar por área">
          <Link href={q ? `/informa?q=${encodeURIComponent(q)}` : "/informa"} className={!categoria ? "is-on" : undefined}>Todo</Link>
          {CATEGORIES.map((c) => (
            <Link key={c.key} href={`/informa?categoria=${c.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={categoria === c.key ? "is-on" : undefined}>
              <Icono nombre={c.key} size={16} /> {c.title}
            </Link>
          ))}
        </nav>

        <p className="inf-regla">Regla de oro: nada aparece aquí como verificado sin fuente oficial, fecha de consulta y revisión del equipo ENQORA. Es información general: para tu caso, consulta con CORA.</p>

        {!pubs.length ? (
          <section className="inf-vacio">
            <h2 className="ent-h3">{q || cat ? "No hay publicaciones verificadas para esta búsqueda" : "Aún no hay publicaciones verificadas"}</h2>
            <p>El enjambre de ENQORA investiga las fuentes oficiales de forma permanente. Cada hallazgo aparece aquí solo cuando el equipo lo verifica en su fuente original.</p>
            {q || cat ? <Link href="/informa" className="btn btn-ghost btn-inline">Ver todo</Link> : null}
          </section>
        ) : null}

        {alertas.length ? (
          <section className="ent-opciones inf-seccion" aria-labelledby="alertas-t">
            <h2 id="alertas-t" className="ent-h2 ent-h2-linea">Alertas <span>importantes</span></h2>
            <div className="inf-grid">{alertas.map((p) => <TarjetaInforma key={p.id} p={p} destacada />)}</div>
          </section>
        ) : null}

        {calendario.length ? (
          <section className="ent-opciones inf-seccion" aria-labelledby="cal-t">
            <h2 id="cal-t" className="ent-h2 ent-h2-linea">Próximas <span>fechas</span></h2>
            <ol className="inf-calendario">
              {calendario.map((e) => (
                <li key={`${e.p.id}-${e.fecha}-${e.texto}`}>
                  <time dateTime={e.fecha}>{fechaCL(e.fecha, "long")}</time>
                  <span><b>{e.texto}</b> · <Link href={`/informa/${e.p.id}`}>{e.p.titulo}</Link></span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {oportunidades.length ? (
          <section className="ent-opciones inf-seccion" aria-labelledby="op-t">
            <h2 id="op-t" className="ent-h2 ent-h2-linea">Fondos y <span>oportunidades</span></h2>
            <div className="inf-grid">{oportunidades.map((p) => <TarjetaInforma key={p.id} p={p} />)}</div>
          </section>
        ) : null}

        {resto.length ? (
          <section className="ent-opciones inf-seccion" aria-labelledby="ult-t">
            <h2 id="ult-t" className="ent-h2 ent-h2-linea">Últimas <span>actualizaciones</span></h2>
            <div className="inf-grid">{resto.map((p) => <TarjetaInforma key={p.id} p={p} />)}</div>
          </section>
        ) : null}

        <section className="ent-opciones inf-seccion" aria-labelledby="como-t">
          <h2 id="como-t" className="ent-h2 ent-h2-linea">Así investiga <span>ENQORA</span></h2>
          <ol className="inf-pasos">{PASOS.map((p, i) => <li key={p}><span>{String(i + 1).padStart(2, "0")}</span>{p}</li>)}</ol>
          <ul className="inf-deps">
            {DEP_KEYS.map((k) => (
              <li key={k}><Icono nombre={DEPARTAMENTOS[k].icono} size={26} /><b>{DEPARTAMENTOS[k].titulo}</b><small>{DEPARTAMENTOS[k].monitorea}</small></li>
            ))}
          </ul>
        </section>

        <section className="ent-cat-continuar" aria-labelledby="cora-t">
          <div>
            <h2 id="cora-t">¿Esto afecta a tu empresa o a tu trabajo?</h2>
            <p>Pregúntale a CORA: te explica el cambio con tus datos y te conecta con el servicio ENQORA que lo resuelve.</p>
          </div>
          <Link href={cat ? `/explorar/${cat.key}#consulta` : "/#resuelve"} className="btn btn-gold btn-inline ent-cta">Pregúntale a CORA</Link>
        </section>
      </main>
      <EntradaPie />
    </div>
  );
}
