import { redirect } from "next/navigation";

// La entrada principal la decide el middleware (ingreso, MFA o panel).
export default function Home() {
  redirect("/panel");
}
