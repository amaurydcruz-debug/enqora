/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { ReactNode } from "react";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { CATEGORIES } from "@/lib/discovery";

// Puerta de entrada fotográfica (rediseño, fase 2). Solo presentación y navegación: la portada muestra el
// ecosistema en mosaicos; al elegir una categoría la persona llega a /explorar/<categoría>, donde está la
// consulta gratuita con CORA (RUT), los servicios con sus precios y el registro para continuar.
// Las fotografías son ilustrativas (no son clientes ni integrantes del equipo).

// Íconos de trazo dorado (sin dependencias).
const ICONOS: Record<string, ReactNode> = {
  cohete: <><path d="M14 4c3.5 0 6 2.5 6 6-2 3-5 5.5-8 7l-5-5c1.5-3 4-6 7-8Z" /><circle cx="14.5" cy="9.5" r="1.6" /><path d="M7 12l-3 1 2-4h4M12 17l-1 3 4-2v-4M6 18c-1 1-1.5 2-1.5 2s1-.5 2-1.5" /></>,
  tienda: <><path d="M4 9l1.5-5h13L20 9M4 9h16M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3" /><path d="M5 12v8h14v-8M9 20v-5h6v5" /></>,
  alerta: <><path d="M12 4l9 16H3L12 4Z" /><path d="M12 10v4M12 17.2v.3" /></>,
  grafico: <><path d="M4 20h16M6 20v-5M10 20v-8M14 20v-6M18 20V9" /><path d="M5 11l5-4 4 3 6-6M16 4h4v4" /></>,
  contabilidad: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 14h2M12 14h2M8 17h2M12 17h2M16 14v3" /></>,
  constitucion: <><path d="M12 3l9 4.5-9 4.5-9-4.5L12 3Z" /><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5" /></>,
  formalizacion: <><path d="M12 3v3M6 9l6-3 6 3" /><rect x="4" y="9" width="16" height="9" rx="1.5" /><path d="M8 13.5h8" /></>,
  marcas: <><path d="M3 12V4h8l10 10-8 8L3 12Z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  tributario: <><path d="M6 3h9l4 4v14H6V3Z" /><path d="M15 3v4h4M9 17l6-6" /><circle cx="9.5" cy="11.5" r="1" /><circle cx="14.5" cy="16.5" r="1" /></>,
  gestion: <><path d="M4 20h16M6 20v-6M10 20v-9M14 20v-5M18 20v-11" /></>,
  profesionales: <><path d="M12 4v16M8 20h8M5 7h14M5 7l-3 6c0 1.7 1.3 3 3 3s3-1.3 3-3L5 7ZM19 7l-3 6c0 1.7 1.3 3 3 3s3-1.3 3-3l-3-6Z" /></>,
  crecimiento: <><path d="M4 20h16M7 20v-4M11 20v-7M15 20v-10M19 20V5" /></>,
  enterprise: <><path d="M4 21V8l6-3v16M10 21V3l10 4v14M4 21h16M13 9h4M13 12h4M13 15h4M6 11h2M6 14h2" /></>,
};
export function Icono({ nombre, size = 34 }: { nombre: string; size?: number }) {
  return (
    <svg className="ent-icono" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre] ?? ICONOS.grafico}
    </svg>
  );
}

// Fotografía de cada categoría (public/entrada/servicios/<clave>.webp).
export const FOTO_SERVICIO: Partial<Record<string, string>> = {
  contabilidad: "/entrada/servicios/contabilidad.webp",
  constitucion: "/entrada/servicios/constitucion.webp",
  formalizacion: "/entrada/servicios/formalizacion.webp",
  marcas: "/entrada/servicios/marcas.webp",
  tributario: "/entrada/servicios/tributario.webp",
  gestion: "/entrada/servicios/gestion.webp",
  profesionales: "/entrada/servicios/profesionales.webp",
  crecimiento: "/entrada/servicios/crecimiento.webp",
  enterprise: "/entrada/servicios/enterprise.webp",
};

// Las cuatro puertas. «Enterprise» lleva directo a su categoría (es el mismo servicio).
export const PERFILES = [
  { key: "idea", titulo: "Soy emprendedor", texto: "Quiero iniciar y formalizar mi negocio.", foto: "/entrada/emprendedor.webp", pos: "68% 0%", icono: "cohete", alt: "Emprendedora sonriendo en su local", href: "/explorar/perfil/idea" },
  { key: "pyme", titulo: "Tengo una pyme", texto: "Necesito gestionar, ordenar y hacer crecer mi empresa.", foto: "/entrada/pyme.webp", pos: "50% 0%", icono: "tienda", alt: "Comerciante en su negocio", href: "/explorar/perfil/pyme" },
  { key: "problema", titulo: "Tengo un problema", texto: "Quiero resolver una situación tributaria, legal o contable.", foto: "/entrada/problema.webp", pos: "30% 10%", icono: "alerta", alt: "Persona pensando frente a su computador", href: "/explorar/perfil/problema" },
  { key: "enterprise", titulo: "ENQORA Enterprise", texto: "Soluciones empresariales avanzadas y personalizadas.", foto: "/entrada/enterprise.webp", pos: "40% 20%", icono: "grafico", alt: "Ejecutivo en un entorno corporativo", href: "/explorar/enterprise" },
] as const;

type Seccion = "inicio" | "servicios" | "planes" | "ayuda";
export function EntradaTop({ activa = "inicio" }: { activa?: Seccion }) {
  const enlaces: { k: Seccion; href: string; t: string }[] = [
    { k: "inicio", href: "/", t: "Inicio" },
    { k: "servicios", href: "/#resuelve", t: "Servicios" },
    { k: "planes", href: "/explorar#precios", t: "Planes" },
    { k: "ayuda", href: "/explorar#ayuda", t: "Ayuda" },
  ];
  return (
    <header className="ent-top">
      <Link href="/" className="welcome-brand" aria-label="ENQORA, inicio">
        <EnqoraClock size={34} />
        <span>ENQ<em>ORA</em></span>
      </Link>
      <nav className="ent-nav" aria-label="Secciones">
        {enlaces.map((e) => (
          <Link key={e.k} href={e.href} className={e.k === activa ? "is-active" : undefined} aria-current={e.k === activa ? "page" : undefined}>{e.t}</Link>
        ))}
      </nav>
      <nav className="ent-account" aria-label="Cuenta">
        <Link href="/ingresar" className="btn btn-ghost btn-inline btn-sm">Iniciar sesión</Link>
        <Link href="/registro" className="btn btn-gold btn-inline btn-sm">Crear cuenta</Link>
      </nav>
    </header>
  );
}

// Encabezado: fotografía a la izquierda, título al centro y el logo oficial a la derecha.
export function EntradaHero() {
  return (
    <section className="ent-hero" id="inicio" aria-labelledby="ent-titulo">
      <div className="ent-hero-photo" aria-hidden="true">
        <img src="/entrada/hero.webp" alt="" width={980} height={460} fetchPriority="high" />
      </div>
      <div className="ent-hero-text">
        <h1 id="ent-titulo">Soluciones integrales <span>para tu negocio</span></h1>
        <p className="ent-lead">Contabilidad, impuestos, legalidad y gestión empresarial, con el respaldo de agentes de IA y especialistas reales.</p>
        <a href="#necesitas" className="btn btn-gold btn-inline ent-cta"><span aria-hidden="true" className="ent-play">▶</span> Conoce ENQORA</a>
      </div>
      <div className="ent-hero-logo">
        <img src="/brand/enqora-logo.webp" alt="ENQORA · Inteligencia contable y tributaria" width={949} height={302} />
      </div>
    </section>
  );
}

function Tarjeta({ href, foto, pos, alt, icono, titulo, texto, n, clase, eager }: {
  href: string; foto?: string; pos?: string; alt: string; icono: string; titulo: string; texto: string; n?: string; clase: string; eager?: boolean;
}) {
  return (
    <Link href={href} className={`ent-tile ${clase}`} style={pos ? { ["--pos" as string]: pos } : undefined}>
      {foto ? <img src={foto} alt={alt} loading={eager ? "eager" : "lazy"} /> : null}
      <span className="ent-tile-shine" aria-hidden="true" />
      <span className="ent-tile-body">
        <Icono nombre={icono} />
        {n ? <span className="ent-card-n">{n}</span> : null}
        <b>{titulo}</b>
        <small>{texto}</small>
      </span>
      <span className="ent-card-go" aria-hidden="true">→</span>
    </Link>
  );
}

// «¿Qué necesitas hoy?»: mosaico asimétrico (una vertical, una grande y dos horizontales).
export function EntradaNecesitas() {
  return (
    <section className="ent-opciones" id="necesitas" aria-labelledby="ent-necesitas">
      <h2 id="ent-necesitas" className="ent-h2">¿Qué necesitas <span>hoy</span>?</h2>
      <p className="ent-sub">Elige la opción que mejor se adapta a tu situación y recibe una primera orientación gratis.</p>
      <div className="ent-mosaico ent-mosaico-perfiles">
        {PERFILES.map((p, i) => (
          <Tarjeta key={p.key} href={p.href} foto={p.foto} pos={p.pos} alt={p.alt} icono={p.icono} titulo={p.titulo} texto={p.texto}
            clase={`ent-tile-p${i + 1}${i >= 2 ? " ent-tile-lado" : ""}`} eager={i < 2} />
        ))}
      </div>
    </section>
  );
}

// «Todo lo que ENQORA resuelve»: las nueve categorías en mosaico de tamaños distintos.
export function EntradaServicios() {
  return (
    <section className="ent-opciones ent-servicios" id="resuelve" aria-labelledby="ent-resuelve">
      <h2 id="ent-resuelve" className="ent-h2 ent-h2-linea">Todo lo que <span>ENQORA</span> resuelve</h2>
      <p className="ent-sub">Elige un servicio: recibes una primera orientación gratis con CORA y ves qué incluye y sus precios.</p>
      <div className="ent-mosaico ent-mosaico-servicios">
        {CATEGORIES.map((c, i) => (
          <Tarjeta key={c.key} href={`/explorar/${c.key}`} foto={FOTO_SERVICIO[c.key]} alt="" icono={c.key} titulo={c.title} texto={c.lead}
            n={String(i + 1).padStart(2, "0")} clase={`ent-tile-s ent-tile-${c.key}${c.key === "crecimiento" ? " ent-tile-lado" : ""}`} />
        ))}
      </div>
    </section>
  );
}

export function EntradaPie() {
  return (
    <footer className="welcome-foot">
      <p>ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII. Las fotografías son ilustrativas.</p>
      <p className="welcome-motto">La complejidad es nuestra. La claridad, tuya.</p>
      <nav className="legal-links" aria-label="Información legal">
        <Link href="/explorar">Servicios y precios</Link>
        <Link href="/terminos">Términos del servicio</Link>
        <Link href="/privacidad">Privacidad</Link>
      </nav>
    </footer>
  );
}
