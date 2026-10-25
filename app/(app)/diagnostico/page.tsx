import Link from "next/link";
import type { Metadata } from "next";
import { Callout } from "@/components/disclosure";
import { Emblem } from "@/components/emblems";
import { isModule, MODULES, statusLabel, statusTone, type ModuleKey } from "@/lib/cases";
import { activeCompany } from "@/lib/companies";
import { categoryByKey } from "@/lib/discovery";
import type { Answers } from "@/lib/onboarding";
import { createClient } from "@/lib/supabase/server";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Diagnóstico gratuito" };

// Etapa 7: onboarding guiado y primera consulta gratuita.
export default async function DiagnosisPage({ searchParams }: { searchParams: Promise<{ servicio?: string; modulo?: string }> }) {
  const sp = await searchParams;
  const { active } = await activeCompany();

  if (!active) {
    return (
      <div className="page narrow">
        <header className="hero">
          <div className="hero-main">
            <span className="eyebrow">Diagnóstico gratuito</span>
            <h1>Primero, tu empresa</h1>
            <p className="hero-lead">Para preparar tu diagnóstico necesitamos saber de qué empresa se trata.</p>
          </div>
        </header>
        <Callout kind="info" title="Registra tu empresa para comenzar" action={<Link href="/empresas/nueva" className="btn btn-gold btn-inline btn-sm">Registrar empresa</Link>}>
          Solo necesitas el RUT y la razón social. Quedarás como propietario.
        </Callout>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: onb }, { data: freeCases }] = await Promise.all([
    supabase.from("company_onboarding").select("answers, completed, updated_at").eq("company_id", active.id).maybeSingle(),
    supabase
      .from("cases")
      .select("id, folio, title, status, created_at")
      .eq("company_id", active.id)
      .eq("origin", "diagnostico_gratuito")
      .neq("status", "cancelado")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const free = ((freeCases ?? []) as { id: string; folio: string; title: string; status: string }[])[0] ?? null;
  const answers = ((onb as { answers: Answers } | null)?.answers ?? {}) as Answers;

  const fromCategory = categoryByKey(sp.servicio)?.module ?? null;
  const defaultModule: ModuleKey | null = fromCategory ?? (isModule(sp.modulo) ? sp.modulo : null);
  const canEdit = ["owner", "admin", "accountant"].includes(active.role);

  return (
    <div className="page narrow">
      <header className="hero">
        <div className="hero-main">
          <span className="eyebrow">Diagnóstico gratuito · {active.trade_name || active.legal_name}</span>
          <h1>Cuéntanos de tu empresa</h1>
          <p className="hero-lead">
            Unas pocas preguntas, por opciones. Con ellas te mostramos por dónde empezar y preparamos tu primera consulta gratuita.
          </p>
        </div>
        <Emblem name="diagnostico" size="xl" />
      </header>

      {free ? (
        <Callout
          kind="info"
          title={`Tu diagnóstico gratuito · ${free.folio}`}
          action={
            <div className="actions-inline">
              <Link href={`/casos/${free.id}#diagnostico`} className="btn btn-gold btn-inline btn-sm">Ver mi diagnóstico</Link>
              {defaultModule && canEdit ? (
                <Link href={`/casos/nuevo?modulo=${defaultModule}`} className="btn btn-ghost btn-inline btn-sm">
                  Solicitar {MODULES[defaultModule].name.replace("ENQORA ", "")}
                </Link>
              ) : null}
            </div>
          }
        >
          <span className={`status status-${statusTone(free.status)}`}>{statusLabel(free.status)}</span> · {free.title}
        </Callout>
      ) : null}

      <section className="card">
        <OnboardingWizard
          companyId={active.id}
          companyName={active.trade_name || active.legal_name}
          initial={answers}
          defaultModule={defaultModule}
          freeAvailable={!free}
          canEdit={canEdit}
        />
      </section>

      <p className="muted-line onb-privacy">
        ENQORA nunca te pedirá tu ClaveÚnica ni tu clave del SII. Tus respuestas solo las ven las personas de tu empresa y el equipo
        ENQORA que trabaja tus casos.
      </p>
    </div>
  );
}
