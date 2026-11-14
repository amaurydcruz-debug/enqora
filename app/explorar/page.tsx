import Link from "next/link";
import type { Metadata } from "next";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { CategoryScene } from "@/components/category-scene";
import { Emblem } from "@/components/emblems";
import { CATEGORIES } from "@/lib/discovery";
import { indexable } from "@/lib/site";
import { EntradaPie, EntradaTop } from "@/app/entrada";
import { cargarCatalogo, FormasDeTrabajar, serviciosDe, ServiciosLista } from "./catalogo";

export const metadata: Metadata = {
  title: { absolute: "Servicios y precios · ENQORA" },
  description: "Todos los servicios de ENQORA con sus precios publicados, cómo trabajar con nosotros y cómo crear tu espacio.",
  alternates: { canonical: "/explorar" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

// «Planes» y «Ayuda» del menú: la galería de servicios con precios y los pasos de registro que antes vivían en la portada.
export default async function ExplorarPage() {
  const catalog = await cargarCatalogo();
  const items: AccordionItem[] = CATEGORIES.map((c, i) => ({
    id: c.key,
    title: c.title,
    description: c.lead,
    emblem: <CategoryScene emblem={c.emblem} index={i} />,
    content: (
      <div className="cat-body">
        <div className="cat-intro">
          <p className="panel-lead">{c.detail}</p>
          <ul className="cat-solves">{c.solves.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <h4 className="sub-title">Servicios</h4>
        <ServiciosLista services={serviciosDe(c, catalog)} />
        <FormasDeTrabajar />
        <div className="panel-actions">
          <Link href={`/explorar/${c.key}#consulta`} className="btn btn-gold btn-inline">Consulta gratis sobre {c.title.toLowerCase()}</Link>
          <span className="muted-line">Primero te orienta CORA sin costo; si quieres continuar, creas tu cuenta.</span>
        </div>
      </div>
    ),
  }));

  return (
    <div className="entry">
      <EntradaTop activa="planes" />
      <main className="ent-main ent-cat">
        <div className="ent-cat-cabeza">
          <Link href="/" className="ent-volver">← Volver al inicio</Link>
          <h1 className="ent-h2">Servicios y <span>precios</span></h1>
          <p className="ent-sub">Precios publicados por servicio. Si tu caso necesita un profesional, te cotizamos antes de cualquier cobro.</p>
        </div>

        <section className="welcome-gallery" id="precios" aria-label="Servicios por categoría">
          <Accordion label="Categorías de servicios" variant="tiles" items={items} className="cat-gallery" />
        </section>

        <section className="welcome-steps" id="ayuda" aria-labelledby="espacio">
          <span className="eyebrow">Ayuda · Cómo funciona</span>
          <h2 id="espacio">Tu espacio ENQORA</h2>
          <ol className="steps-row">
            <li><Emblem name="proximas" size="sm" /><b>Eliges un servicio</b><small>En la galería, sin compromiso.</small></li>
            <li><Emblem name="identidad" size="sm" /><b>Consultas gratis con CORA</b><small>Primera orientación sin crear cuenta.</small></li>
            <li><Emblem name="empresas" size="sm" /><b>Creas tu cuenta</b><small>Confirmas tu correo, activas el segundo factor y registras tu empresa.</small></li>
            <li><Emblem name="casos" size="sm" /><b>Llegas a tu servicio</b><small>No vuelves a buscar lo que ya elegiste.</small></li>
          </ol>
        </section>
      </main>
      <EntradaPie />
    </div>
  );
}
