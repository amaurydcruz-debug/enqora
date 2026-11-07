-- =====================================================================
-- ENQORA · 0030 · «Cuéntanos tu caso»
-- Después de la consulta pública, el visitante cuenta su caso y elige cómo quiere la respuesta (correo o
-- WhatsApp). CORA lo ordena (resumen, servicios y documentos necesarios) y el equipo responde con una
-- cotización. Los datos se guardan en el esquema privado: solo el equipo ENQORA los ve.
-- Límite: 5 solicitudes por hora por visitante. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists private.solicitudes_caso (
  id uuid primary key default gen_random_uuid(),
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  client text not null,
  rut text,
  razon_social text,
  nombre text not null check (char_length(nombre) between 2 and 120),
  canal text not null check (canal in ('correo', 'whatsapp')),
  contacto text not null check (char_length(contacto) between 5 and 160),
  relato text not null check (char_length(relato) between 10 and 4000),
  analisis jsonb not null default '{}'::jsonb,
  estado text not null default 'nueva' check (estado in ('nueva', 'en_revision', 'cotizada', 'cerrada')),
  nota text,
  atendida_por uuid
);
create index if not exists solicitudes_caso_creada_idx on private.solicitudes_caso (creada desc);
create index if not exists solicitudes_caso_client_idx on private.solicitudes_caso (client, creada desc);
alter table private.solicitudes_caso enable row level security;

-- Visitante (anónimo o con sesión): crea su solicitud. Requiere consentimiento expreso.
create or replace function public.crear_solicitud_caso(p jsonb) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_headers jsonb; v_client text; v_id uuid; v_canal text := lower(coalesce(p ->> 'canal', ''));
  v_contacto text := btrim(coalesce(p ->> 'contacto', ''));
begin
  if coalesce((p ->> 'consentimiento')::boolean, false) is not true then raise exception 'ENQ_SIN_CONSENTIMIENTO'; end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_headers := null;
  end;
  v_client := md5('enqora-caso:' || coalesce(v_headers ->> 'x-enqora-client', v_headers ->> 'cf-connecting-ip',
                  split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1), 'desconocido'));
  if (select count(*) from private.solicitudes_caso where client = v_client and creada > now() - interval '1 hour') >= 5 then
    raise exception 'ENQ_DEMASIADAS_CONSULTAS';
  end if;
  if v_canal = 'correo' and v_contacto !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'ENQ_CONTACTO_INVALIDO'; end if;
  if v_canal = 'whatsapp' and regexp_replace(v_contacto, '[^0-9]', '', 'g') !~ '^[0-9]{8,15}$' then raise exception 'ENQ_CONTACTO_INVALIDO'; end if;
  insert into private.solicitudes_caso (client, rut, razon_social, nombre, canal, contacto, relato, analisis)
  values (v_client, nullif(left(p ->> 'rut', 12), ''), nullif(left(p ->> 'razon_social', 200), ''), btrim(p ->> 'nombre'), v_canal, v_contacto,
          btrim(p ->> 'relato'), coalesce(p -> 'analisis', '{}'::jsonb))
  returning id into v_id;
  return v_id;
end
$$;

-- Equipo ENQORA: bandeja de solicitudes.
create or replace function public.solicitudes_caso_listar(p_estado text default null) returns setof jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  return query
    select to_jsonb(s) - 'client' from private.solicitudes_caso s
    where p_estado is null or s.estado = p_estado
    order by s.creada desc limit 200;
end
$$;

create or replace function public.solicitud_caso_estado(p_id uuid, p_estado text, p_nota text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not private.is_staff() then raise exception 'ENQ_SIN_PERMISO'; end if;
  update private.solicitudes_caso
     set estado = p_estado, nota = coalesce(nullif(btrim(p_nota), ''), nota), atendida_por = (select auth.uid()), actualizada = now()
   where id = p_id;
  if not found then raise exception 'ENQ_NO_ENCONTRADO'; end if;
end
$$;

revoke execute on function public.crear_solicitud_caso(jsonb) from public;
revoke execute on function public.solicitudes_caso_listar(text) from public;
revoke execute on function public.solicitud_caso_estado(uuid, text, text) from public;
grant execute on function public.crear_solicitud_caso(jsonb) to anon, authenticated;
grant execute on function public.solicitudes_caso_listar(text) to authenticated;
grant execute on function public.solicitud_caso_estado(uuid, text, text) to authenticated;
