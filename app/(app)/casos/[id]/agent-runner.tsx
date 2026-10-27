"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnqoraClockLoader } from "@/components/clock-loader";
import { AGENTS, type AgentKey } from "@/lib/mirror";

// Ejecuta un agente IA real sobre el caso. Mientras trabaja, el cliente ve en MIRROR
// «Analizando los antecedentes del caso»; lo que el agente proponga queda pendiente de revisión.
export function AgentRunner({ caseId, enabled, defaultAgent = "tributario" }: { caseId: string; enabled: boolean; defaultAgent?: AgentKey }) {
  const router = useRouter();
  const [agent, setAgent] = useState<AgentKey>(defaultAgent);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  if (!enabled) {
    return (
      <div className="alert alert-info" role="status">
        Los agentes IA aún no están habilitados. La administración debe agregar la variable <code>ANTHROPIC_API_KEY</code> en Vercel
        (Settings → Environment Variables) y volver a desplegar. La clave nunca se escribe en el código ni se comparte por chat.
      </div>
    );
  }

  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/agentes/ejecutar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, agent, instruction }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; count?: number } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.message ?? "No se pudo ejecutar el agente. Revisa tu sesión e intenta nuevamente.");
      const n = data.count ?? 0;
      setMsg({ kind: "ok", text: n ? `${AGENTS[agent].name} entregó ${n} propuesta${n === 1 ? "" : "s"} para revisar.` : `${AGENTS[agent].name} no encontró propuestas nuevas.` });
      setInstruction("");
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo ejecutar el agente." });
    } finally {
      setBusy(false);
      router.refresh();
    }
  };

  return (
    <div className="agent-runner">
      {busy ? (
        <EnqoraClockLoader mode="ia" label={`${AGENTS[agent].name} trabajando`} detail="Revisando los antecedentes reales del caso y la normativa aplicable. Puede tardar hasta un minuto." />
      ) : (
        <>
          <div className="inline-form">
            <select className="input input-sm" value={agent} onChange={(e) => setAgent(e.target.value as AgentKey)} aria-label="Agente">
              {(Object.keys(AGENTS) as AgentKey[]).map((k) => <option key={k} value={k}>{AGENTS[k].name}</option>)}
            </select>
          </div>
          <textarea className="input" rows={2} maxLength={1000} value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="Indicación opcional (ej.: revisa si conviene el régimen Pro Pyme transparente)" aria-label="Indicación para el agente" />
          <div className="comment-actions">
            <span className="muted-line">Usa los antecedentes del caso. Lo que proponga no llega al cliente hasta que una persona lo acepte.</span>
            <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={run}>Ejecutar agente</button>
          </div>
        </>
      )}
      {msg ? <div className={`alert alert-${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div> : null}
    </div>
  );
}
