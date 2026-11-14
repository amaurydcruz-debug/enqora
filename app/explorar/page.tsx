/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { CATEGORIES } from "@/lib/discovery";
import { clp } from "@/lib/pricing";
import { indexable } from "@/lib/site";
import { EntradaPie, EntradaTop, FOTO_SERVICIO, Icono, MosaicoServicios } from "@/app/entrada";
import { cargarCatalogo, FormasDeTrabajar, serviciosDe, ServiciosLista } from "./catalogo";

export const metadata: Metadata = {
  title: { absolute: "Servicios y precios · ENQORA" },
  description: "Todos los servicios de ENQORA con sus precios publicados, cómo trabajar con nosotros y cómo crear tu espacio.",
  alternates: { canonical: "/explorar" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

const PASOS = [
  { n: "01", icono: "marcas", t: "Eliges un servicio", d: "En la galería, sin compromiso.", foto: "/entrada/servicios/marcas.webp" },
  { n: "02", icono: "tributario", t: "Consultas gratis con CORA", d: "Primera orientación sin crear cuenta.", foto: "/entrada/servicios/tributario.webp" },
  { n: "03", icono: "constitucion", t: "Creas tu cuenta", d: "Confirmas tu correo, activas el segundo factor y registras tu empresa.", foto: "/entrada/servicios/constitucion.webp" },
  { n: "04", icono: "crecimiento", t: "Llegas a tu servicio", d: "No vuelves a buscar lo que ya elegiste.", foto: "/entrada/servicios/crecimiento.webp" },
];

// «Planes» y «Ayuda» del menú, con la misma apariencia de la portada: mosaico fotográfico, precios por categoría
// (franjas con su fotografía) y los pasos de «Tu espacio ENQORA». Mismos precios publicados del catálogo.
export default async function ExplorarPage() {
  const catalog = await cargarCatalogo();

  return (
    <div className="entry">
      <EntradaTop activa="planes" />
      <main className="ent-main ent-cat">
        <section className="ent-cat-hero" aria-labelledby="explorar-t">
          <img src="/entrada/servicios/enterprise.webp" alt="" className="ent-cat-foto" fetchPriority="high" />
          <div className="ent-cat-hero-text">
            <Link href="/" className="ent-volver">← Volver al inicio</Link>
            <span className="ent-cat-n"><Icono nombre="contabilidad" size={30} /> Planes ENQORA</span>
            <h1 id="explorar-t">Servicios y precios</h1>
            <p className="ent-lead">Precios publicados por servicio. Si tu caso necesita un profesional, te cotizamos antes de cualquier cobro.</p>
          </div>
        </section>

        <section className="ent-opciones" aria-labelledby="elige-t">
          <h2 id="elige-t" className="ent-h2 ent-h2-linea">Elige un <span>servicio</span></h2>
          <p className="ent-sub">Cada servicio abre su primera orientación gratis con CORA.</p>
          <MosaicoServicios />
        </section>

        <section className="ent-opciones ent-precios" id="precios" aria-labelledby="precios-t">
          <h2 id="precios-t" className="ent-h2 ent-h2-linea">Precios por <span>servicio</span></h2>
          <p className="ent-sub">Toca una categoría para ver sus servicios, precios y cómo contratar.</p>
          <div className="ent-precio-lista">
            {CATEGORIES.map((c, i) => {
              const services = serviciosDe(c, catalog);
              const desde = services.filter((s) => s.price_from != null && !s.requires_professional).map((s) => s.price_from as number);
              return (
                <details key={c.key} id={c.key} className="ent-precio">
                  <summary>
                    <span className="ent-precio-foto">{FOTO_SERVICIO[c.key] ? <img src={FOTO_SERVICIO[c.key]} alt="" loading="lazy" /> : null}</span>
                    <span className="ent-precio-txt">
                      <span className="ent-card-n">{String(i + 1).padStart(2, "0")}</span>
                      <b><Icono nombre={c.key} size={24} /> {c.title}</b>
                      <small>{c.lead}</small>
                    </span>
                    <span className="ent-precio-desde">{desde.length ? <>desde <b>{clp(Math.min(...desde))}</b></> : <>Precio según diagnóstico</>}</span>
                    <span className="ent-card-go" aria-hidden="true">↓</span>
                  </summary>
                  <div className="ent-precio-cuerpo">
                    <p className="panel-lead">{c.detail}</p>
                    <ServiciosLista services={services} />
                    <FormasDeTrabajar />
                    <div className="panel-actions">
                      <Link href={`/explorar/${c.key}#consulta`} className="btn btn-gold btn-inline ent-cta">Consulta gratis sobre {c.title.toLowerCase()}</Link>
                      <span className="muted-line">Primero te orienta CORA sin costo; si quieres continuar, creas tu cuenta.</span>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="ent-opciones" id="ayuda" aria-labelledby="ayuda-t">
          <h2 id="ayuda-t" className="ent-h2 ent-h2-linea">Tu espacio <span>ENQORA</span></h2>
          <p className="ent-sub">Así funciona, de la primera consulta a tu servicio.</p>
          <ol className="ent-mosaico ent-mosaico-pasos" role="list">
            {PASOS.map((p) => (
              <li key={p.n} className="ent-tile ent-paso">
                <img src={p.foto} alt="" loading="lazy" />
                <span className="ent-tile-body">
                  <span className="ent-paso-n">{p.n}</span>
                  <Icono nombre={p.icono} />
                  <b>{p.t}</b>
                  <small>{p.d}</small>
                </span>
              </li>
            ))}
          </ol>
          <Link href="/#resuelve" className="btn btn-gold btn-inline ent-cta ent-pasos-cta">Comenzar ahora</Link>
        </section>
      </main>
      <EntradaPie />
    </div>
  );
}
