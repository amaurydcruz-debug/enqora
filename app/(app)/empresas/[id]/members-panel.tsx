"use client";

import { useState } from "react";
import { changeRoleAction, removeMemberAction } from "@/app/actions/companies";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { SubmitButton } from "@/components/submit-button";
import { ROLE_HELP, ROLES, type Role } from "@/lib/company-constants";

const SINGULAR: Record<Role, string> = { owner: "propietario", admin: "administrador", accountant: "contador", viewer: "de solo lectura" };
const PLURAL: Record<Role, string> = { owner: "propietarios", admin: "administradores", accountant: "contadores", viewer: "de solo lectura" };

export type MemberView = {
  userId: string;
  name: string;
  email: string | null;
  role: Role;
  since: string;
  isMe: boolean;
  roleOptions: Role[]; // roles que el usuario actual puede asignarle (vacío: no puede cambiarlo)
  canRemove: boolean;
};

// Miembros y permisos: la lista muestra quién es cada persona y su rol.
// Las acciones aparecen solo al pulsar «Administrar» en un miembro, y solo si el usuario
// actual tiene permiso. La base de datos vuelve a verificar cada cambio (y pide
// confirmar la identidad para cambios de rol).
export function MembersPanel({ companyId, members }: { companyId: string; members: MemberView[] }) {
  const [managing, setManaging] = useState<string | null>(null);
  const counts = (Object.keys(ROLES) as Role[])
    .map((r) => [r, members.filter((m) => m.role === r).length] as const)
    .filter(([, n]) => n);

  return (
    <>
      <p className="panel-lead">
        {counts.map(([r, n]) => `${n} ${(n > 1 ? PLURAL : SINGULAR)[r]}`).join(" · ")}
        . Cada persona solo puede hacer lo que su rol permite.
      </p>
      <ul className="people" role="list">
        {members.map((m) => {
          const canManage = m.roleOptions.length > 1 || m.canRemove || m.isMe;
          const open = managing === m.userId;
          return (
            <li key={m.userId} className={`person${open ? " is-managing" : ""}`}>
              <div className="person-main">
                <span className="person-avatar" aria-hidden="true">{(m.name || m.email || "?").slice(0, 1).toUpperCase()}</span>
                <span className="person-who">
                  <b>{m.name}{m.isMe ? <span className="person-me"> · Tú</span> : null}</b>
                  {m.email && m.email !== m.name ? <small>{m.email}</small> : null}
                  <small>Desde {m.since}</small>
                </span>
                <span className="person-tools">
                <span className="person-role">{ROLES[m.role]}</span>
                {canManage ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-inline btn-sm"
                    aria-expanded={open}
                    onClick={() => setManaging(open ? null : m.userId)}
                  >
                    {open ? "Cerrar" : "Administrar"}
                  </button>
                ) : null}
                </span>
              </div>

              {open ? (
                <div className="person-manage">
                  {m.roleOptions.length > 1 ? (
                    <form action={changeRoleAction} className="person-form">
                      <input type="hidden" name="company_id" value={companyId} />
                      <input type="hidden" name="user_id" value={m.userId} />
                      <label htmlFor={`role-${m.userId}`}>Rol en la empresa</label>
                      <div className="person-form-row">
                        <select id={`role-${m.userId}`} name="role" className="input" defaultValue={m.role}>
                          {m.roleOptions.map((r) => (
                            <option key={r} value={r}>{ROLES[r]} — {ROLE_HELP[r]}</option>
                          ))}
                        </select>
                        <SubmitButton variant="gold" className="btn-inline" pendingText="Guardando…">Guardar rol</SubmitButton>
                      </div>
                      <span className="hint">Por seguridad, cambiar permisos pide confirmar tu identidad.</span>
                    </form>
                  ) : (
                    <p className="muted-line">{ROLE_HELP[m.role]}</p>
                  )}
                  {m.canRemove ? (
                    <form action={removeMemberAction} className="person-danger">
                      <input type="hidden" name="company_id" value={companyId} />
                      <input type="hidden" name="user_id" value={m.userId} />
                      <span>Quitar a esta persona de la empresa. Perderá el acceso de inmediato.</span>
                      <ConfirmSubmit message={`¿Quitar a ${m.email ?? m.name} de la empresa? Perderá el acceso de inmediato.`}>Quitar</ConfirmSubmit>
                    </form>
                  ) : null}
                  {m.isMe ? (
                    <form action={removeMemberAction} className="person-danger">
                      <input type="hidden" name="company_id" value={companyId} />
                      <input type="hidden" name="user_id" value={m.userId} />
                      <input type="hidden" name="leaving" value="1" />
                      <span>Salir de esta empresa. Perderás el acceso a su información.</span>
                      <ConfirmSubmit message="¿Salir de esta empresa? Perderás el acceso a su información.">Salir</ConfirmSubmit>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
