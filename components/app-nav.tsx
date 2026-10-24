import { signOutAction } from "@/app/actions/auth";
import { IconLogout } from "@/components/icons";

// Cerrar sesión en este dispositivo.
export function SignOutLink({ label = "Cerrar sesión", className = "signout-link", icon = false }: { label?: string; className?: string; icon?: boolean }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="scope" value="local" />
      <button type="submit" className={className} aria-label={label}>
        {icon ? <IconLogout size={18} /> : null}
        <span>{label}</span>
      </button>
    </form>
  );
}
