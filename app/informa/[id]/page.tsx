/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EntradaPie, EntradaTop, FOTO_SERVICIO, Icono } from "@/app/entrada";
import { CATEGORIES } from "@/lib/discovery";
import { ALERTAS, DEPARTAMENTOS, ETAPAS, FICHA_CAMPOS, fechaCL, TIPO_CONTENIDO, type Departamento, type Publicacion } from "@/lib/informa";
import { createClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ id: string }> };
type Detalle = Publicacion & { historial: { version: number; titulo: string; resumen: string; motivo: string | null; fecha: string }[] };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function cargar(id: string): Promise<Detalle | null> {
  if (!UUID_RE.test(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("informa_publicacion", { p_id: id });
  return (data ?? null) as Detalle | null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = await cargar((await params).id);
  return p ? { title: { absolute: `${p.titulo} · ENQORA Informa` }, description: p.resumen.slice(0, 160) } : {};
}

// Ficha editorial de una publicación: versión informativa, versión técnica, fuente, fechas, verificación e historial.
export default async function PublicacionPage({ params }: Props) {
  const p = await cargar((await params).id);
  if (!p) notFound();
  const alerta = ALERTAS[p.alerta] ?? ALERTAS.informativa;
  const etapa = ETAPAS[p.etapa]?.texto ?? p.etapa;
  const cats = p.categorias.map((k) => CATEGORIES.find((c) => c.key === k)).filter((c): c is (typeof CATEGORIES)[number] => !!c);
  const dep = p.departamento ? DEPARTAMENTOS[p.departamento as Departamento] : null;
  const campos = FICHA_CAMPOS.filter((f) => p.ficha?.[f.key]);

  return (
    <div className="entry">
      <EntradaTop activa="informa" />
      <main className="ent-main ent-cat">
        <div className="ent-cat-cabeza inf-ficha-cabeza">
          <Link href="/informa" className="ent-volver">← ENQORA Informa</Link>
          <span className="ent-cat-n">{dep ? <><Icono nombre={dep.icono} size={24} /> Departamento {dep.titulo}</> : "ENQORA Informa"}</span>
          <h1 className="ent-h2 inf-ficha-titulo">{p.titulo}</h1>
          <p className="inf-badges">
            <span className={`inf-alerta ${alerta.clase}`}>{alerta.texto}</span>
            <span className="inf-badge">{TIPO_CONTENIDO[p.tipo_contenido] ?? "Información"}</span>
            <span className="inf-badge inf-badge-ok">✓ {etapa}{p.revision_profesional ? " · revisión profesional" : ""}</span>
          </p>
        </div>

        <article className="inf-ficha">
          <section className="ent-precio inf-bloque">
            <div className="ent-precio-cuerpo">
              <h2 className="sub-title">En simple</h2>
              <p className="inf-resumen">{p.resumen}</p>
              {campos.length ? (
                <dl className="inf-preguntas">
                  {campos.map((f) => <div key={f.key}><dt>{f.titulo}</dt><dd>{p.ficha[f.key]}</dd></div>)}
                </dl>
              ) : null}
              {p.ficha?.tecnica ? (
                <details className="ent-sin-rut inf-tecnica">
                  <summary><Icono nombre="profesionales" size={20} /> Versión técnica</summary>
                  <div className="inf-tecnica-txt">{p.ficha.tecnica}{p.ficha.documentos ? <p><b>Documentos oficiales:</b> {p.ficha.documentos}</p> : null}</div>
                </details>
              ) : null}
            </div>
          </section>

          <aside className="ent-precio inf-bloque inf-datos" aria-label="Fuente y verificación">
            <div className="ent-precio-cuerpo">
              <h2 className="sub-title">Fuente y verificación</h2>
              <dl className="kv">
                <div><dt>Institución</dt><dd>{p.institucion ?? "—"}</dd></div>
                <div><dt>Fuente oficial</dt><dd><a href={p.fuente} target="_blank" rel="noopener noreferrer">Abrir documento ↗</a></dd></div>
                <div><dt>Publicado</dt><dd>{fechaCL(p.publicado)}</dd></div>
                <div><dt>Consultado por ENQORA</dt><dd>{fechaCL(p.consultado)}</dd></div>
                <div><dt>Vigencia</dt><dd>{p.vigente_desde || p.vigente_hasta ? `${p.vigente_desde ? `desde ${fechaCL(p.vigente_desde)}` : ""}${p.vigente_hasta ? ` hasta ${fechaCL(p.vigente_hasta)}` : ""}` : "Según la fuente"}</dd></div>
                <div><dt>Estado</dt><dd>{etapa} · versión {p.version}</dd></div>
              </dl>
              {p.historial.length ? (
                <details className="inf-historial">
                  <summary>Historial de cambios ({p.historial.length})</summary>
                  <ol>{p.historial.map((h) => <li key={h.version}><b>Versión {h.version}</b> · {fechaCL(h.fecha)}{h.motivo ? ` · ${h.motivo}` : ""}<small>{h.titulo}</small></li>)}</ol>
                </details>
              ) : null}
              <p className="muted-line">Información general verificada en la fuente. No reemplaza la asesoría profesional para tu caso.</p>
            </div>
          </aside>
        </article>

        {cats.length ? (
          <section className="ent-opciones" aria-labelledby="serv-t">
            <h2 id="serv-t" className="ent-h2 ent-h2-linea">ENQORA te <span>ayuda</span></h2>
            <p className="ent-sub">Servicios relacionados con este cambio. Cada uno abre una primera orientación gratis con CORA.</p>
            <div className="ent-mosaico inf-servicios">
              {cats.slice(0, 3).map((c) => (
                <Link key={c.key} href={`/explorar/${c.key}#consulta`} className="ent-tile ent-tile-lado">
                  {FOTO_SERVICIO[c.key] ? <img src={FOTO_SERVICIO[c.key]} alt="" loading="lazy" /> : null}
                  <span className="ent-tile-shine" aria-hidden="true" />
                  <span className="ent-tile-body"><Icono nombre={c.key} /><b>{c.title}</b><small>{c.lead}</small></span>
                  <span className="ent-card-go" aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </main>
      <EntradaPie informa={false} />
    </div>
  );
}
