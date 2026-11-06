import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { proveedoresDisponibles } from "@/lib/ai/gateway";
import { TOTAL_CASOS } from "@/lib/ai/evaluacion";
import { isSupervisorRole, myStaffRole } from "@/lib/staff";
import { PanelEvaluacion } from "./panel";

export const metadata: Metadata = { title: "Laboratorio ENQORA BRAIN" };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NOMBRE: Record<string, string> = { anthropic: "Claude (Anthropic)", hf: "Hugging Face · modelos abiertos", openai: "OpenAI" };
const VARIABLES: Record<string, string> = { anthropic: "ANTHROPIC_API_KEY y ANTHROPIC_MODEL", hf: "HF_TOKEN y HF_MODEL (p. ej., un modelo Qwen del catálogo de Inference Providers)", openai: "OPENAI_API_KEY y OPENAI_CHAT_MODEL" };

// Centro de Mando → Laboratorio ENQORA BRAIN: qué modelos están conectados al AI Gateway y qué tan bien responden.
export default async function LaboratorioPage() {
  const role = await myStaffRole();
  if (!isSupervisorRole(role)) notFound();
  const provs = proveedoresDisponibles();
  const orden = process.env.ENQORA_IA_ORDEN?.trim() || "anthropic,hf,openai";

  return (
    <div className="page">
      <Link href="/mando" className="back-link"><span aria-hidden="true">←</span> Centro de Mando</Link>
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Centro de Mando · ENQORA BRAIN</span>
          <h1>Laboratorio de IA</h1>
          <p className="hero-lead">
            ENQORA habla con los modelos a través de su propio AI Gateway: ningún proveedor es indispensable y se pueden cambiar sin reconstruir
            la plataforma. Aquí se mide, con {TOTAL_CASOS} preguntas contables y tributarias ficticias, qué tan bien responde cada modelo. La
            respuesta correcta la calcula el motor contable determinista de ENQORA, no una persona ni otra IA.
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Proveedores conectados</h2>
        <ul className="ref-list" role="list">
          {provs.map((p) => (
            <li key={p.proveedor}>
              <span className="ref-main">
                <b>{NOMBRE[p.proveedor]}</b>
                <small className="muted-line">
                  {p.configurado ? `Modelo: ${p.modelo}` : `Sin configurar: agrega ${VARIABLES[p.proveedor]} en Vercel.`}
                  {p.configurado ? (p.privados ? " · autorizado para datos privados de clientes" : " · solo datos públicos o ficticios") : ""}
                </small>
              </span>
              <span className={`status status-${p.configurado ? "ok" : "muted"}`}>{p.configurado ? "Conectado" : "No configurado"}</span>
            </li>
          ))}
        </ul>
        <p className="muted-line">
          Orden de uso: <code>{orden}</code>. Si el primero falla o su respuesta no pasa la validación, ENQORA prueba con el siguiente.
          Los datos privados de clientes solo van a los proveedores indicados en <code>ENQORA_IA_PRIVADOS</code> (por defecto, solo Claude).
        </p>
      </section>

      <PanelEvaluacion proveedores={provs.filter((p) => p.configurado).map((p) => ({ id: p.proveedor, nombre: NOMBRE[p.proveedor], modelo: p.modelo }))} />
    </div>
  );
}
