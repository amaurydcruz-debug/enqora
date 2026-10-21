import { signOutAction } from "@/app/actions/auth";

export function SignOutLink({ label = "Cerrar sesión" }: { label?: string }) {
  return (
    <form action={signOutAction}>
      <input type="hidden" name="scope" value="local" />
      <button
        type="submit"
        style={{ background: "none", border: 0, padding: 0, color: "var(--gold-bright)", cursor: "pointer", font: "inherit" }}
      >
        {label}
      </button>
    </form>
  );
}
