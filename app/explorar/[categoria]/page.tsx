/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { CATEGORIES } from "@/lib/discovery";
import { indexable } from "@/lib/site";
import { RutLookup } from "@/app/rut-lookup";
import { EntradaPie, EntradaTop, FOTO_SERVICIO, Icono } from "@/app/entrada";
import { CasoCategoria } from "./caso-categoria";
import { cargarCatalogo, FormasDeTrabajar, serviciosDe, ServiciosLista } from "../catalogo";

type Props = { params: Promise<{ categoria: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { categoria } = await params;
  const c = CATEGORIES.find((x) => x.key === categoria);
  if (!c) return {};
  return {
    title: { absolute: `${c.title} · ENQORA` },
    description: `${c.lead} ${c.detail}`.slice(0, 160),
    alternates: { canonical: `/explorar/${c.key}` },
    robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

// 02 Selección → 03 Consulta gratuita con CORA → 04 Registro para continuar.
// La consulta por RUT es la misma de siempre; aquí recibe la categoría elegida, que llega como pista al formulario de CORA.
export default async function CategoriaPage({ params }: Props) {
  const { categoria } = await params;
  const i = CATEGORIES.findIndex((x) => x.key === categoria);
  if (i < 0) notFound();
  const c = CATEGORIES[i];
  const services = serviciosDe(c, await cargarCatalogo());
  const foto = FOTO_SERVICIO[c.key];
  const otras = CATEGORIES.filter((x) => x.key !== c.key);

  return (
    <div className="entry">
      <EntradaTop activa="servicios" />
      <main className="ent-main ent-cat">
        <section className="ent-cat-hero" aria-labelledby="cat-titulo">
          {foto ? <img src={foto} alt="" className="ent-cat-foto" fetchPriority="high" /> : null}
          <div className="ent-cat-hero-text">
            <Link href="/#resuelve" className="ent-volver">← Volver</Link>
            <span className="ent-cat-n"><Icono nombre={c.key} size={30} /> {String(i + 1).padStart(2, "0")} · Servicio ENQORA</span>
            <h1 id="cat-titulo">{c.title}</h1>
            <p className="ent-lead">{c.detail}</p>
            <ul className="ent-solves" aria-label="Lo que resolvemos">{c.solves.map((s) => <li key={s}>{s}</li>)}</ul>
          </div>
        </section>

        <ol className="ent-ruta" aria-label="Tu recorrido">
          <li className="is-done"><span>1</span>Elegiste {c.title.toLowerCase()}</li>
          <li className="is-now"><span>2</span>Consulta gratis con CORA</li>
          <li><span>3</span>Crea tu cuenta para continuar</li>
        </ol>

        <section className="ent-consulta" id="consulta" aria-labelledby="consulta-t">
          <div className="ent-consulta-texto">
            <span className="ent-cat-n">Primera orientación gratis · {c.title}</span>
            <h2 id="consulta-t" className="ent-h2">Consulta gratis con <span>CORA</span></h2>
            <p className="ent-lead">
              Dile a CORA el RUT de tu empresa (o tu RUT si emprendes a tu nombre) y cuéntale tu caso. Te orienta sin costo y sin crear cuenta.
            </p>
            <RutLookup categoria={c.key} />
            <details className="ent-sin-rut">
              <summary><Icono nombre="tributario" size={22} /> ¿Prefieres no dar el RUT? Cuéntanos tu caso</summary>
              <CasoCategoria categoria={c.key} titulo={c.title} objetivos={c.solves} />
            </details>
          </div>
          <div className="ent-consulta-visual" aria-hidden="true">
            <div className="ent-tile ent-consulta-foto">
              {foto ? <img src={foto} alt="" loading="lazy" /> : null}
              <span className="ent-tile-shine" />
            </div>
            <span className="ent-consulta-reloj"><EnqoraClock size={120} live /></span>
            <ul className="ent-consulta-sellos">
              <li>Sin costo</li><li>Sin crear cuenta</li><li>Nunca pedimos tu clave del SII</li>
            </ul>
          </div>
        </section>

        <section className="ent-opciones ent-cat-precios" aria-labelledby="precios-t">
          <h2 id="precios-t" className="ent-h2 ent-h2-linea">Servicios y <span>precios</span></h2>
          <p className="ent-sub">Lo que incluye {c.title.toLowerCase()} y cómo contratarlo.</p>
          <div className="ent-precio ent-precio-fijo">
            <div className="ent-precio-cuerpo">
              <ServiciosLista services={services} />
              <FormasDeTrabajar />
            </div>
          </div>
        </section>

        <section className="ent-cat-continuar" aria-labelledby="continuar-t">
          <div>
            <h2 id="continuar-t">¿Quieres que ENQORA resuelva tu caso?</h2>
            <p>Crea tu cuenta y llegas directo a {c.title.toLowerCase()}. Tus documentos se suben de forma segura en tu espacio, nunca antes.</p>
          </div>
          <Link href={`/comenzar?servicio=${c.key}`} className="btn btn-gold btn-inline ent-cta">Crear mi cuenta y continuar</Link>
        </section>

        <nav className="ent-otras" aria-label="Otros servicios">
          <span>Otros servicios:</span>
          {otras.map((o) => <Link key={o.key} href={`/explorar/${o.key}`}>{o.title}</Link>)}
        </nav>
      </main>
      <EntradaPie />
    </div>
  );
}
