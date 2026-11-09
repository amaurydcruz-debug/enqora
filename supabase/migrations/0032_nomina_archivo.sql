-- =====================================================================
-- ENQORA · 0032 · Nóminas del SII: informa el archivo de la última carga
-- El ZIP de la nómina de empresas trae un archivo por año comercial (2020 a 2024). La versión anterior
-- del conector cargaba solo uno. Con este cambio, el estado del sincronizador informa el archivo de la
-- última carga completada; si fue hecha con un solo archivo, el conector vuelve a cargar la nómina
-- completa (todos los años, del más reciente al más antiguo). Se puede ejecutar más de una vez.
-- =====================================================================

create or replace function public.svc_public_sync_state(p_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_out jsonb := '{}'::jsonb;
  v_ds text;
  v_act public.public_data_imports;
  v_last public.public_data_imports;
begin
  if not private.check_service_token(p_token) then raise exception 'ENQ_CLAVE_SERVICIO'; end if;
  foreach v_ds in array array['razon_social', 'actividades', 'empresas'] loop
    select * into v_act from public.public_data_imports where dataset = v_ds and status = 'en_curso' order by started_at desc limit 1;
    select * into v_last from public.public_data_imports where dataset = v_ds and status = 'completada'
      order by finished_at desc nulls last limit 1;
    v_out := v_out || jsonb_build_object(v_ds, jsonb_build_object(
      'activa', case when v_act.id is null then null else jsonb_build_object(
        'id', v_act.id, 'modo', v_act.mode, 'cursor', v_act.cursor_line, 'fuente', v_act.source_url,
        'modificado', v_act.source_modified, 'latido', v_act.heartbeat_at, 'inicio', v_act.started_at) end,
      'ultima', case when v_last.id is null then null else jsonb_build_object(
        'id', v_last.id, 'modificado', v_last.source_modified, 'publicada', v_last.published_on, 'termino', v_last.finished_at,
        'filas', v_last.rows_received, 'archivo', v_last.file_name) end));
  end loop;
  return v_out;
end
$$;
