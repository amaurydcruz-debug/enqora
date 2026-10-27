/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { Accordion, type AccordionItem } from "@/components/accordion";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { CategoryScene } from "@/components/category-scene";
import { Emblem } from "@/components/emblems";
import { CATEGORIES } from "@/lib/discovery";
import { clp, UNITS } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";
import { RutLookup } from "./rut-lookup";
import { Portal } from "./portal";
import { indexable } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "ENQORA · Bienvenido al mundo ENQORA" },
  description: "Contabilidad, constitución, formalización, marcas y gestión para tu empresa, con inteligencia y profesionales.",
  alternates: { canonical: "/" },
  robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
};

type CatalogRow = { code: string; module: string; name: string; summary: string | null; unit: string; requires_professional: boolean; price_from: number | null };

// Puerta de entrada ENQORA (pública). La sesión iniciada va directo al Centro de control (middleware).
// 01 Primer contacto → 02 Demostración (consulta por RUT) → 03 Galería de servicios → 04 Registro.
export default async function WelcomePage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("public_catalog");
  const catalog = (data ?? []) as CatalogRow[];

  const servicesFor = (c: (typeof CATEGORIES)[number]) =>
    catalog.filter((s) => (c.services.codes?.includes(s.code) ?? false) || (c.services.module ? s.module === c.services.module : false));

  const items: AccordionItem[] = CATEGORIES.map((c, i) => {
    const services = servicesFor(c);
    return {
      id: c.key,
      title: c.title,
      description: c.lead,
      emblem: <CategoryScene emblem={c.emblem} index={i} />,
      content: (
        <div className="cat-body">
          <div className="cat-intro">
            <p className="panel-lead">{c.detail}</p>
            <ul className="cat-solves">
              {c.solves.map((s) => <li key={s}>{s}</li>)}
            </ul>
          </div>

          {services.length ? (
            <div className="cat-services">
              <h4 className="sub-title">Servicios</h4>
              <ul role="list">
                {services.map((s) => (
                  <li key={s.code}>
                    <span className="cat-service-text">
                      <b>{s.name}</b>
                      {s.summary ? <small>{s.summary}</small> : null}
                    </span>
                    <span className="cat-service-price">
                      {s.price_from != null && !s.requires_professional ? (
                        <>desde <b>{clp(s.price_from)}</b> <small>/ {UNITS[s.unit]?.per ?? s.unit}</small></>
                      ) : (
                        <small>Precio según diagnóstico</small>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="cat-ways">
            <h4 className="sub-title">Cómo trabajar con ENQORA</h4>
            <ul role="list">
              <li><b>Consulta</b><small>Cuéntanos tu situación. El equipo la revisa y te orienta antes de que contrates.</small></li>
              <li><b>Contratación puntual</b><small>Cotización por caso con el alcance, lo que no incluye y el precio final.</small></li>
              <li><b>Suscripción mensual</b><small>Planes de acompañamiento continuo: cada uno dice qué incluye, qué no y su precio mensual.</small></li>
            </ul>
          </div>

          <div className="panel-actions">
            <Link href={`/comenzar?servicio=${c.key}`} className="btn btn-gold btn-inline">Comenzar con {c.title}</Link>
            <span className="muted-line">Crearás tu cuenta y llegarás directo a este servicio.</span>
          </div>
        </div>
      ),
    };
  });

  return (
    <div className="entry">
      <header className="welcome-top">
        <Link href="/" className="welcome-brand" aria-label="ENQORA, inicio">
          <EnqoraClock size={34} />
          <span>ENQ<em>ORA</em></span>
        </Link>
        <nav className="welcome-nav" aria-label="Cuenta">
          <Link href="/ingresar" className="btn btn-ghost btn-inline btn-sm">Ingresar</Link>
          <Link href="/registro" className="btn btn-gold btn-inline btn-sm">Crear cuenta</Link>
        </nav>
      </header>

      <main className="welcome-main">
        {/* 01 · Primer contacto */}
        <section className="welcome-first" aria-labelledby="bienvenida">
          <div className="welcome-first-text">
            <span className="eyebrow">01 · Primer contacto</span>
            <h1 id="bienvenida">Bienvenido al mundo ENQORA</h1>
            <p className="welcome-lead">
              ¿Quieres conocer la información pública disponible de una empresa? Ingresa su RUT para comenzar.
            </p>
            <RutLookup />
          </div>
          <div className="welcome-clock" aria-hidden="true">
            <EnqoraClock size={260} live />
            <span className="welcome-clock-floor" />
          </div>
        </section>

        {/* 02 · Tu camino: perfil y tipo de negocio (M16) */}
        <Portal />

        {/* 03 · Galería de servicios */}
        <section className="welcome-gallery" id="servicios" aria-labelledby="galeria">
          <span className="eyebrow">03 · Galería de servicios</span>
          <h2 id="galeria">¿Qué deseas explorar en ENQORA?</h2>
          <p className="welcome-lead">Elige una categoría. Verás solo lo que corresponde a esa área.</p>
          <Accordion label="Categorías de servicios" variant="tiles" items={items} className="cat-gallery" />
        </section>

        {/* 04 · Registro y contratación */}
        <section className="welcome-steps" aria-labelledby="espacio">
          <span className="eyebrow">04 · Registro y contratación</span>
          <h2 id="espacio">Tu espacio ENQORA</h2>
          <ol className="steps-row">
            <li><Emblem name="proximas" size="sm" /><b>Eliges un servicio</b><small>En la galería, sin compromiso.</small></li>
            <li><Emblem name="identidad" size="sm" /><b>Creas tu cuenta</b><small>Confirmas tu correo y activas el segundo factor.</small></li>
            <li><Emblem name="empresas" size="sm" /><b>Registras tu empresa</b><small>Quedas como propietario.</small></li>
            <li><Emblem name="casos" size="sm" /><b>Llegas a tu servicio</b><small>No vuelves a buscar lo que ya elegiste.</small></li>
          </ol>
        </section>
      </main>

      <footer className="welcome-foot">
        <p>ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII. La consulta por RUT usa solo información pública del SII sobre personas jurídicas.</p>
        <p className="welcome-motto">La complejidad es nuestra. La claridad, tuya.</p>
        <nav className="legal-links" aria-label="Información legal">
          <Link href="/terminos">Términos del servicio</Link>
          <Link href="/privacidad">Privacidad</Link>
        </nav>
      </footer>
    </div>
  );
}
