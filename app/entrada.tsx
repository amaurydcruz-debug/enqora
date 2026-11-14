import Link from "next/link";
import { EnqoraClock } from "@/components/brand/enqora-clock";
import { CategoryScene } from "@/components/category-scene";
import { CATEGORIES } from "@/lib/discovery";

// Puerta de entrada fotográfica (rediseño, fase 1). Solo presentación: cada tarjeta lleva a las rutas existentes
// (perfiles del Portal, consulta con CORA y galería de servicios). No cambia ninguna lógica de ENQORA.
// Las fotografías son ilustrativas (no son clientes ni integrantes del equipo).

const OPCIONES = [
  { key: "idea", titulo: "Soy emprendedor", texto: "Quiero iniciar y formalizar mi negocio.", foto: "/entrada/emprendedor.webp", pos: "68% 0%", alt: "Emprendedora sonriendo en su local" },
  { key: "pyme", titulo: "Tengo una pyme", texto: "Necesito gestionar, ordenar y hacer crecer mi empresa.", foto: "/entrada/pyme.webp", pos: "45% 0%", alt: "Comerciante en su negocio" },
  { key: "problema", titulo: "Tengo un problema", texto: "Quiero resolver una situación tributaria, legal o contable.", foto: "/entrada/problema.webp", pos: "40% 0%", alt: "Persona pensando frente a su computador" },
  { key: "enterprise", titulo: "ENQORA Enterprise", texto: "Soluciones empresariales avanzadas y personalizadas.", foto: "/entrada/enterprise.webp", pos: "42% 0%", alt: "Ejecutivo en un entorno corporativo" },
] as const;

const BENEFICIOS = [
  { t: "Agentes de IA especializados", i: "◎" },
  { t: "Respuesta rápida", i: "↯" },
  { t: "Información segura y confidencial", i: "◈" },
  { t: "Te ayudamos a estar al día con el SII", i: "✓" },
  { t: "Acompañamiento de especialistas", i: "◉" },
];

export function EntradaTop() {
  return (
    <header className="ent-top">
      <Link href="/" className="welcome-brand" aria-label="ENQORA, inicio">
        <EnqoraClock size={34} />
        <span>ENQ<em>ORA</em></span>
      </Link>
      <nav className="ent-nav" aria-label="Secciones">
        <a href="#inicio" className="is-active">Inicio</a>
        <a href="#resuelve">Servicios</a>
        <a href="#planes">Planes</a>
        <a href="#como-funciona">Ayuda</a>
      </nav>
      <nav className="ent-account" aria-label="Cuenta">
        <Link href="/ingresar" className="btn btn-ghost btn-inline btn-sm">Iniciar sesión</Link>
        <Link href="/registro" className="btn btn-gold btn-inline btn-sm">Crear cuenta</Link>
      </nav>
    </header>
  );
}

export function EntradaHero() {
  return (
    <>
      <section className="ent-hero" id="inicio" aria-labelledby="ent-titulo">
        <div className="ent-hero-photo" aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/entrada/hero.webp" alt="" width={980} height={472} fetchPriority="high" />
        </div>
        <div className="ent-hero-text">
          <span className="eyebrow">Plataforma contable, tributaria y legal con IA</span>
          <h1 id="ent-titulo">Soluciones inteligentes <span>para tu negocio</span></h1>
          <p className="ent-lead">Contabilidad, impuestos, legalidad y gestión empresarial, con el respaldo de agentes de IA y especialistas reales.</p>
          <a href="#como-funciona" className="btn btn-gold btn-inline ent-cta"><span aria-hidden="true" className="ent-play">▶</span> Conoce ENQORA</a>
        </div>
      </section>

      <section className="ent-opciones" aria-labelledby="ent-necesitas">
        <h2 id="ent-necesitas">¿Qué necesitas hoy?</h2>
        <p className="ent-sub">Elige la opción que mejor se adapta a tu situación y recibe una primera orientación gratis.</p>
        <ul className="ent-cards" role="list">
          {OPCIONES.map((o, i) => (
            <li key={o.key} style={{ animationDelay: `${i * 80}ms` }}>
              <a href={`#perfil-${o.key}`} className="ent-card" style={{ ["--pos" as string]: o.pos }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={o.foto} alt={o.alt} loading={i < 2 ? "eager" : "lazy"} width={556} height={330} />
                <span className="ent-card-body">
                  <b>{o.titulo}</b>
                  <small>{o.texto}</small>
                </span>
                <span className="ent-card-go" aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <EntradaServicios />

      <section className="ent-opciones ent-opciones-cierre" aria-label="Por qué ENQORA">
        <ul className="ent-beneficios" role="list">
          {BENEFICIOS.map((b) => <li key={b.t}><span aria-hidden="true">{b.i}</span>{b.t}</li>)}
        </ul>
      </section>

      <section className="ent-como" id="como-funciona" aria-labelledby="ent-como-t">
        <h2 id="ent-como-t">Así funciona tu primera consulta</h2>
        <ol className="ent-pasos">
          <li><span>1</span><b>Elige tu opción de consulta</b></li>
          <li><span>2</span><b>Cuéntanos tu caso en un formulario simple</b></li>
          <li><span>3</span><b>Recibe tu primera orientación gratis</b></li>
        </ol>
        <a href="#consulta" className="btn btn-gold btn-inline ent-cta">→ Comenzar ahora</a>
        <p className="muted-line">Sin registro obligatorio para tu primera consulta. Las fotografías son ilustrativas.</p>
      </section>
    </>
  );
}

// Fotografía de cada servicio (public/entrada/servicios/<clave>.webp). Una categoría sin foto usa su escena
// gráfica con el mismo marco, brillo y degradado que las tarjetas fotográficas.
const FOTO_SERVICIO: Partial<Record<string, string>> = {
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

// «Todo lo que ENQORA resuelve»: galería de todas las categorías de servicio (las mismas de lib/discovery).
// Cada tarjeta lleva a su categoría en la galería de servicios existente, con precios y cómo contratar.
export function EntradaServicios() {
  return (
    <section className="ent-opciones ent-servicios" id="resuelve" aria-labelledby="ent-resuelve">
      <h2 id="ent-resuelve">Todo lo que ENQORA resuelve</h2>
      <p className="ent-sub">Servicios con agentes de IA que preparan y especialistas que revisan y responden. Elige uno para ver qué incluye y sus precios.</p>
      <ul className="ent-cards ent-cards-servicios" role="list">
        {CATEGORIES.map((c, i) => {
          const foto = FOTO_SERVICIO[c.key];
          return (
            <li key={c.key} style={{ animationDelay: `${(i % 3) * 80}ms` }}>
              <a href={`#${c.key}`} className={`ent-card ent-card-servicio${foto ? "" : " is-scene"}`}>
                {foto
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={foto} alt="" loading="lazy" width={556} height={330} />
                  : <span className="ent-card-scene"><CategoryScene emblem={c.emblem} index={i} /></span>}
                <span className="ent-card-body">
                  <span className="ent-card-n">{String(i + 1).padStart(2, "0")}</span>
                  <b>{c.title}</b>
                  <small>{c.lead}</small>
                  <span className="ent-solves">{c.solves.slice(0, 3).map((x) => <em key={x}>{x}</em>)}</span>
                </span>
                <span className="ent-card-go" aria-hidden="true">→</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
