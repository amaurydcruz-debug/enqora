import Link from "next/link";
import { todayCL } from "@/lib/pricing";
import { createClient } from "@/lib/supabase/server";

type Empresa = { id: string; nombre: string; rut: string; trabajadores: number; novedades: number; solicitudes: number };

// Empresas a las que el equipo presta el servicio de remuneraciones y laboral: las que ya tienen trabajadores y las que
// lo pidieron (casos «Remuneraciones: …»). El acceso lo da la base de datos (caso asignado o supervisión).
export async function EmpresasOperar() {
  const supabase = await createClient();
  const periodo = todayCL().slice(0, 7);
  const [{ data: t }, { data: n }, { data: c }] = await Promise.all([
    supabase.from("rem_trabajadores").select("company_id").eq("activo", true).limit(5000),
    supabase.from("rem_novedades_cliente").select("company_id").eq("periodo", periodo).limit(5000),
    supabase.from("cases").select("company_id, title, status").ilike("title", "Remuneraciones:%").not("status", "in", "(cerrado,cancelado)").limit(500),
  ]);
  const cuenta = (rows: { company_id: string }[] | null) => (rows ?? []).reduce((m, r) => m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1), new Map<string, number>());
  const ct = cuenta(t as { company_id: string }[] | null), cn = cuenta(n as { company_id: string }[] | null), cc = cuenta(c as { company_id: string }[] | null);
  const ids = [...new Set([...ct.keys(), ...cc.keys()])];
  const { data: emp } = ids.length ? await supabase.from("companies").select("id, legal_name, trade_name, rut").in("id", ids) : { data: [] };
  const empresas: Empresa[] = ((emp ?? []) as { id: string; legal_name: string; trade_name: string | null; rut: string }[])
    .map((e) => ({ id: e.id, nombre: e.trade_name || e.legal_name, rut: e.rut, trabajadores: ct.get(e.id) ?? 0, novedades: cn.get(e.id) ?? 0, solicitudes: cc.get(e.id) ?? 0 }))
    .sort((a, b) => b.solicitudes - a.solicitudes || b.novedades - a.novedades || a.nombre.localeCompare(b.nombre));
  return (
    <section className="card" id="operar" aria-labelledby="op-tit">
      <h2 id="op-tit">Empresas: remuneraciones y laboral</h2>
      <p className="muted-line">ENQORA presta este servicio: el cliente informa las novedades del mes y pide trámites; el equipo opera fichas, liquidaciones, Previred, Libro, contratos, vacaciones, cartas, finiquitos y certificados. Ves las empresas de tus casos asignados (o todas, si supervisas).</p>
      {empresas.length ? (
        <ul className="ps-filas">
          {empresas.map((e) => (
            <li key={e.id}>
              <span>
                <b>{e.nombre} · {e.rut}</b>
                <small>{e.trabajadores} trabajador(es) activos · novedades de {periodo}: {e.novedades}{e.solicitudes ? ` · ${e.solicitudes} solicitud(es) abiertas` : ""}</small>
              </span>
              <div className="upload-row">
                <Link className="btn btn-gold btn-inline btn-sm" href={`/mando/operar?empresa=${e.id}&destino=/remuneraciones`}>Operar remuneraciones</Link>
                <Link className="btn btn-ghost btn-inline btn-sm" href={`/mando/operar?empresa=${e.id}&destino=/laboral`}>Laboral</Link>
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="muted-line">Aún no hay empresas con trabajadores ni solicitudes de remuneraciones en tus casos.</p>}
    </section>
  );
}
