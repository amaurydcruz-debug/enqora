import { Emblem } from "@/components/emblems";
import type { ModuleKey } from "@/lib/cases";

// Emblema de cada módulo ENQORA (ver components/emblems.tsx).
export function ModuleIcon({ module, size = "md" }: { module: ModuleKey; size?: "sm" | "md" | "lg" | "xl" }) {
  return <Emblem name={module} size={size} />;
}
