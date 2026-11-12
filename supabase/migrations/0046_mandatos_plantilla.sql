-- =====================================================================
-- ENQORA · 0046 · Mandatos con el texto aprobado por el estudio jurídico
-- Antes, el texto de cada mandato lo escribía el equipo a mano (alcance libre) y no tenía relación con la
-- plantilla de mandato de la biblioteca legal (DOC-MANDATO), que es la que revisa el estudio jurídico.
-- Ahora:
--  1) Un mandato solo se envía a firma si existe una versión APROBADA de DOC-MANDATO.
--  2) El texto del mandato = esa plantilla, con los datos de la empresa, el mandatario, los organismos, los
--     trámites, el alcance y la vigencia de ese mandato. Queda registrada la versión usada.
--  3) Al aceptarlo el cliente, se guarda el texto exacto aceptado y su huella SHA-256.
-- La plantilla v1 (si sigue en borrador) se actualiza para usar los datos automáticos.
-- Se puede ejecutar más de una vez.
-- =====================================================================
alter table public.mandates add column if not exists template_document_id uuid references public.legal_documents (id);
alter table public.mandates add column if not exists template_version integer;
alter table public.mandates add column if not exists accepted_text text;
alter table public.mandates add column if not exists accepted_hash text;

update public.legal_documents set body = $t$MANDATO ESPECIAL DE REPRESENTACIÓN

En Santiago, a {{FECHA}}, {{EMPRESA}}, RUT {{RUT_EMPRESA}}, representada por {{FIRMANTE}}, RUN {{RUN_FIRMANTE}}, {{CARGO}} («el Mandante»), otorga mandato especial a {{MANDATARIO}}, RUN {{RUN_MANDATARIO}}, de ENQORA SpA («el Mandatario»), para que lo represente ante {{ORGANISMOS}} exclusivamente en los siguientes trámites:

{{TRAMITES}}

Alcance: {{ALCANCE}}

Facultades. Presentar solicitudes, formularios y antecedentes; requerir y recibir información y certificados; ser notificado; y realizar las gestiones necesarias para esos trámites.

Límites. El Mandatario NO podrá: recibir dinero a nombre del Mandante; pagar, comprometer pagos ni firmar convenios de pago sin la aprobación escrita del Mandante para cada uno; desistirse, transigir ni renunciar a derechos; delegar este mandato; ni realizar trámites distintos de los indicados.

Credenciales. El Mandatario actúa con sus propias credenciales. El Mandante no entrega ni entregará su ClaveÚnica ni su clave tributaria.

Aprobación previa. Antes de presentar cada trámite, el Mandatario enviará al Mandante, por la plataforma, el borrador de lo que presentará, y presentará solo con su aprobación registrada.

Plazo. {{VIGENCIA}}.

Revocación. El Mandante puede revocar este mandato en cualquier momento y sin costo. El Mandatario informará la revocación o su renuncia al organismo cuando corresponda.

Rendición de cuentas. El Mandatario informará en la plataforma cada actuación, con su comprobante.$t$
where code = 'DOC-MANDATO' and version = 1 and status = 'borrador';

-- Texto del mandato a partir de la plantilla aprobada (o de la versión registrada en el mandato).
create or replace function private.render_mandato(p_mandate uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_m public.mandates;
  v_c public.companies;
  v_body text;
  v_org text;
begin
  select * into v_m from public.mandates where id = p_mandate;
  if not found then return null; end if;
  if v_m.accepted_text is not null then return v_m.accepted_text; end if;
  select body into v_body from public.legal_documents
  where id = coalesce(v_m.template_document_id, (select id from public.legal_documents where code = 'DOC-MANDATO' and status = 'aprobado'));
  if v_body is null then return null; end if;
  select * into v_c from public.companies where id = v_m.company_id;
  select string_agg(case i
      when 'sii' then 'el Servicio de Impuestos Internos (SII)' when 'tgr' then 'la Tesorería General de la República'
      when 'inapi' then 'el Instituto Nacional de Propiedad Industrial (INAPI)' when 'registro_empresas' then 'el Registro de Empresas y Sociedades'
      when 'municipalidad' then 'la Municipalidad' when 'direccion_trabajo' then 'la Dirección del Trabajo'
      when 'cbr' then 'el Conservador de Bienes Raíces' when 'notaria' then 'la Notaría' when 'tribunal' then 'el Tribunal'
      else 'la institución indicada' end, ', ') into v_org from unnest(v_m.institutions) i;
  v_body := replace(v_body, '{{EMPRESA}}', coalesce(v_c.legal_name, '[empresa]'));
  v_body := replace(v_body, '{{RUT_EMPRESA}}', coalesce(v_c.rut, '[RUT]'));
  v_body := replace(v_body, '{{FIRMANTE}}', coalesce(v_m.signer_name, '[nombre de quien firma]'));
  v_body := replace(v_body, '{{RUN_FIRMANTE}}', coalesce(v_m.signer_rut, '[RUN]'));
  v_body := replace(v_body, '{{CARGO}}', coalesce(v_m.signer_role, '[cargo]'));
  v_body := replace(v_body, '{{FECHA}}', to_char(coalesce(v_m.accepted_at, now()) at time zone 'America/Santiago', 'DD-MM-YYYY'));
  v_body := replace(v_body, '{{MANDATARIO}}', coalesce(v_m.representative_name, '[mandatario]'));
  v_body := replace(v_body, '{{RUN_MANDATARIO}}', coalesce(v_m.representative_rut, '[RUN]'));
  v_body := replace(v_body, '{{ORGANISMOS}}', coalesce(v_org, '[organismo]'));
  v_body := replace(v_body, '{{TRAMITES}}', coalesce(v_m.procedures, '[trámites]'));
  v_body := replace(v_body, '{{ALCANCE}}', coalesce(v_m.scope, '[alcance]'));
  v_body := replace(v_body, '{{VIGENCIA}}', 'Desde el ' || to_char(v_m.valid_from, 'DD-MM-YYYY') || ' hasta el ' || to_char(v_m.valid_until, 'DD-MM-YYYY') || ', o hasta el término del caso, lo que ocurra primero');
  return v_body;
end
$$;

-- Enviar a firma exige plantilla aprobada; aceptar guarda el texto exacto y su huella.
create or replace function private.on_mandate_template() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_doc public.legal_documents;
begin
  if new.status = 'pendiente_firma' and old.status = 'borrador' then
    select * into v_doc from public.legal_documents where code = 'DOC-MANDATO' and status = 'aprobado';
    if not found then raise exception 'ENQ_DOCUMENTO_NO_APROBADO'; end if;
    new.template_document_id := v_doc.id;
    new.template_version := v_doc.version;
  end if;
  return new;
end
$$;
drop trigger if exists mandates_template on public.mandates;
create trigger mandates_template before update of status on public.mandates
  for each row execute function private.on_mandate_template();

create or replace function private.on_mandate_accepted() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_text text;
begin
  if new.accepted_at is not null and old.accepted_at is null then
    v_text := private.render_mandato(new.id);
    if v_text is not null then
      update public.mandates set accepted_text = v_text, accepted_hash = encode(extensions.digest(v_text, 'sha256'), 'hex') where id = new.id;
    end if;
  end if;
  return null;
end
$$;
drop trigger if exists mandates_accepted on public.mandates;
create trigger mandates_accepted after update of accepted_at on public.mandates
  for each row execute function private.on_mandate_accepted();

create or replace function public.mandato_texto(p_mandate uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_m public.mandates;
begin
  perform private.require_session();
  select * into v_m from public.mandates where id = p_mandate;
  if not found or not private.can_see_mandate(p_mandate) then raise exception 'ENQ_SIN_PERMISO'; end if;
  return jsonb_build_object('texto', private.render_mandato(p_mandate), 'version', v_m.template_version, 'huella', v_m.accepted_hash,
    'revisado_por', (select review_firm from public.legal_documents where id = v_m.template_document_id));
end
$$;
revoke execute on function public.mandato_texto(uuid) from public;
grant execute on function public.mandato_texto(uuid) to authenticated;
