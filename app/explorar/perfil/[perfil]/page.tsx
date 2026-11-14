/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { CATEGORIES } from "@/lib/discovery";
import { ENTRIES } from "@/lib/rubros";
import { indexable } from "@/lib/site";
import { PerfilContenido } from "@/app/portal";
import { EntradaPie, EntradaTop, FOTO_SERVICIO, Icono, PERFILES } from "@/app/entrada";

type Props = { params: Promise<{ perfil: string }> };

// Servicios que más usa cada perfil (orden de la galería). Solo navegación: cada uno abre su categoría con la consulta gratuita.
const PARA: Record<string, string[]> = {
  idea: ["constitucion", "formalizacion", "marcas", "tributario"],
  pyme: ["contabilidad", "gestion", "tributario", "crecimiento"],
  problema: ["tributario", "contabilidad", "profesionales", "formalizacion"],
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { perfil } = await params;
  const p = PERFILES.find((x) => x.key === perfil);
  if (!p) return {};
  return {
    title: { absolute: `${p.titulo} · ENQORA` },
    description: p.texto,
    robots: indexable() ? { index: true, follow: true } : { index: false, follow: false },
  };
}

export default async function PerfilPage({ params }: Props) {
  const { perfil } = await params;
  if (perfil === "enterprise") redirect("/explorar/enterprise");
  const p = PERFILES.find((x) => x.key === perfil);
  const e = ENTRIES.find((x) => x.key === perfil);
  if (!p || !e || !PARA[perfil]) notFound();
  const cats = PARA[perfil].map((k) => CATEGORIES.find((c) => c.key === k)).filter((c): c is (typeof CATEGORIES)[number] => !!c);

  return (
    <div className="entry">
      <EntradaTop />
      <main className="ent-main ent-cat">
        <section className="ent-cat-hero" aria-labelledby="perfil-t" style={{ ["--pos" as string]: p.pos }}>
          <img src={p.foto} alt="" className="ent-cat-foto" fetchPriority="high" />
          <div className="ent-cat-hero-text">
            <Link href="/#necesitas" className="ent-volver">← Volver</Link>
            <span className="ent-cat-n"><Icono nombre={p.icono} size={30} /> Tu camino en ENQORA</span>
            <h1 id="perfil-t">{p.titulo}</h1>
            <p className="ent-lead">{p.texto} {e.resultado}</p>
          </div>
        </section>

        <section className="ent-opciones" aria-labelledby="para-ti">
          <h2 id="para-ti" className="ent-h3">Elige por dónde empezar</h2>
          <p className="ent-sub">Cada servicio abre una primera orientación gratis con CORA.</p>
          <div className="ent-mosaico ent-mosaico-perfil">
            {cats.map((c, i) => (
              <Link key={c.key} href={`/explorar/${c.key}`} className={`ent-tile ent-tile-m${i + 1}`}>
                {FOTO_SERVICIO[c.key] ? <img src={FOTO_SERVICIO[c.key]} alt="" loading={i < 2 ? "eager" : "lazy"} /> : null}
                <span className="ent-tile-shine" aria-hidden="true" />
                <span className="ent-tile-body"><Icono nombre={c.key} /><b>{c.title}</b><small>{c.lead}</small></span>
                <span className="ent-card-go" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="ent-cat-bloque" aria-labelledby="ruta-t">
          <h2 id="ruta-t" className="ent-h3">{perfil === "problema" ? "¿Cuál es tu situación?" : "Tu ruta según tu tipo de negocio"}</h2>
          <PerfilContenido e={e} />
        </section>
      </main>
      <EntradaPie />
    </div>
  );
}
