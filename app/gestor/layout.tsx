/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import type { Metadata } from "next";
import { SignOutLink } from "@/components/sign-out-link";
import { currentUser } from "@/lib/supabase/server";

// App ENQORA Gestor: espacio separado del Centro de Mando y de la app de clientes. El gestor solo ve sus encargos.
export const metadata: Metadata = {
  title: { default: "ENQORA Gestor", template: "%s · ENQORA Gestor" },
  manifest: "/gestor.webmanifest",
  appleWebApp: { capable: true, title: "ENQORA Gestor", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};

export default async function GestorLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <div className="gestor-shell">
      <header className="gestor-top">
        <Link href="/gestor" className="gestor-brand" aria-label="ENQORA Gestor, inicio">
          <img src="/brand/enqora-icon-192.png" alt="" width={32} height={32} />
          <span>ENQORA <b>Gestor</b></span>
        </Link>
        {user ? <SignOutLink label="Salir" /> : null}
      </header>
      <main className="gestor-main">{children}</main>
    </div>
  );
}
