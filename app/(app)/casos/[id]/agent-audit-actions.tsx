"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EnqoraClockLoader } from "@/components/clock-loader";
import { DECISION_TEXT } from "@/lib/audit-labels";

// Acciones de auditoría de una ejecución: auditar (o reintentar) y pedir la corrección al agente.
// La corrección crea una nueva versión que vuelve a auditarse automáticamente.
export async function requestAudit(runId: string) {
  const res = await fetch("/api/agentes/auditar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; decision?: string } | null;
  if (!res.ok || !data?.ok) throw new Error(data?.message ?? "No se pudo completar la auditoría.");
  return data.decision ?? "";
}


export function AuditActions({ caseId, runId, agent, canAudit, canCorrect }: {
  caseId: string;
  runId: string;
  agent: string;
  canAudit: boolean;
  canCorrect: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "audit" | "correct">(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const audit = async () => {
    setBusy("audit");
    setMsg(null);
    try {
      const d = await requestAudit(runId);
      setMsg({ kind: "ok", text: DECISION_TEXT[d] ?? "Auditoría completada." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo auditar." });
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  const correct = async () => {
    setBusy("correct");
    setMsg(null);
    try {
      const res = await fetch("/api/agentes/ejecutar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId, agent, correctionOf: runId }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; message?: string; run?: string; audit?: boolean } | null;
      if (!res.ok || !data?.ok) throw new Error(data?.message ?? "No se pudo pedir la corrección.");
      let text = "El agente entregó una versión corregida.";
      if (data.audit && data.run) {
        router.refresh();
        setBusy("audit");
        const d = await requestAudit(data.run);
        text = `Versión corregida auditada. ${DECISION_TEXT[d] ?? ""}`;
      }
      setMsg({ kind: "ok", text });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof Error ? e.message : "No se pudo pedir la corrección." });
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  if (!canAudit && !canCorrect && !msg) return null;
  return (
    <div className="audit-actions">
      {busy ? (
        <EnqoraClockLoader mode="datos" label={busy === "audit" ? "Auditoría independiente en curso" : "El agente está corrigiendo según la auditoría"} />
      ) : (
        <div className="inline-form">
          {canAudit ? <button type="button" className="btn btn-ghost btn-inline btn-sm" onClick={audit}>Auditar ahora</button> : null}
          {canCorrect ? <button type="button" className="btn btn-gold btn-inline btn-sm" onClick={correct}>Pedir corrección al agente</button> : null}
        </div>
      )}
      {msg ? <div className={`alert alert-${msg.kind}`} role={msg.kind === "error" ? "alert" : "status"}>{msg.text}</div> : null}
    </div>
  );
}
