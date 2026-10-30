-- =====================================================================
-- ENQORA · La consulta por RUT responde mientras la primera carga del SII avanza
-- Ejecutar en Supabase → SQL Editor DESPUÉS de 0022_acceso_equipo.sql.
-- Mientras la nómina se carga por tramos, si el RUT ya está cargado se muestra su ficha.
-- Si aún no está, se informa que la carga sigue (nunca se afirma que la empresa no existe).
-- =====================================================================

create or replace function private.public_profile(p_rut integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_company public.public_companies;
  v_prof public.public_company_profiles;
  v_meta public.public_data_imports;
  v_meta_acts public.public_data_imports;
  v_meta_emp public.public_data_imports;
  v_acts jsonb;
  v_nacts integer;
  v_senales jsonb := '[]'::jsonb;
  v_fuentes jsonb := '[]'::jsonb;
  v_formatted text;
  v_partial boolean := false;
begin
  select * into v_meta from public.public_data_imports
  where dataset = 'razon_social' and status = 'completada' order by published_on desc, finished_at desc limit 1;
  if not found then
    -- Primera carga aún en curso: se responde con lo ya cargado (sin afirmar que un RUT no existe).
    select * into v_meta from public.public_data_imports
    where dataset = 'razon_social' and status = 'en_curso' order by started_at desc limit 1;
    if not found then return jsonb_build_object('estado', 'sin_datos'); end if;
    v_partial := true;
  end if;
  select * into v_meta_acts from public.public_data_imports
  where dataset = 'actividades' and status = 'completada' order by published_on desc, finished_at desc limit 1;
  select * into v_meta_emp from public.public_data_imports
  where dataset = 'empresas' and status = 'completada' order by published_on desc, finished_at desc limit 1;

  v_fuentes := v_fuentes || jsonb_build_array(jsonb_build_object('nombre', 'Nómina de razón social de personas jurídicas (SII)',
    'url', v_meta.source_url, 'publicada', v_meta.published_on));
  if v_meta_acts.id is not null then
    v_fuentes := v_fuentes || jsonb_build_array(jsonb_build_object('nombre', 'Nómina de actividades económicas (SII)',
      'url', v_meta_acts.source_url, 'publicada', v_meta_acts.published_on));
  end if;
  if v_meta_emp.id is not null then
    v_fuentes := v_fuentes || jsonb_build_array(jsonb_build_object('nombre', 'Nómina de empresas personas jurídicas (SII)',
      'url', v_meta_emp.source_url, 'publicada', v_meta_emp.published_on));
  end if;

  select * into v_company from public.public_companies where rut = p_rut;
  if not found and v_partial then
    return jsonb_build_object('estado', 'sin_datos', 'cargadas', v_meta.rows_received);
  end if;
  if not found then
    return jsonb_build_object('estado', 'no_encontrada', 'rut', p_rut::text || '-' || private.rut_dv(p_rut),
      'fuente', 'Servicio de Impuestos Internos · Nómina de Razón Social de contribuyentes personas jurídicas',
      'fuente_url', v_meta.source_url, 'publicada', v_meta.published_on, 'fuentes', v_fuentes);
  end if;
  v_formatted := v_company.rut::text || '-' || v_company.dv;

  select count(*)::integer into v_nacts from public.public_company_activities where rut = p_rut;
  select coalesce(jsonb_agg(jsonb_build_object('codigo', a.code, 'descripcion', a.description) order by a.code), '[]'::jsonb)
  into v_acts
  from (select code, description from public.public_company_activities where rut = p_rut order by code limit 8) a;
  select * into v_prof from public.public_company_profiles where rut = p_rut;

  -- Señales: solo hechos que constan en las nóminas, sin conclusiones.
  if v_company.end_of_business is not null then
    v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'termino_giro', 'gravedad', 'alta', 'fecha', v_company.end_of_business));
  end if;
  if v_meta_acts.id is not null and v_nacts = 0 and v_company.end_of_business is null then
    v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_actividades', 'gravedad', 'media'));
  end if;
  if v_prof.rut is not null then
    if v_prof.sales_tranche ~* 'sin' or v_prof.sales_tranche ~ '^\s*1\s*$' then
      v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_ventas_informadas', 'gravedad', 'media', 'anio', v_prof.commercial_year));
    end if;
    if v_prof.commercial_year < extract(year from private.today_cl())::integer - 3 and v_company.end_of_business is null then
      v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_informacion_reciente', 'gravedad', 'media', 'anio', v_prof.commercial_year));
    end if;
  elsif v_meta_emp.id is not null and v_company.end_of_business is null then
    v_senales := v_senales || jsonb_build_array(jsonb_build_object('codigo', 'sin_registro_empresas', 'gravedad', 'baja'));
  end if;

  return jsonb_build_object(
    'estado', 'encontrada',
    'rut', v_formatted,
    'razon_social', v_company.legal_name,
    'inicio_actividades', v_company.activity_start,
    'termino_giro', v_company.end_of_business,
    'actividades', v_acts,
    'total_actividades', v_nacts,
    'perfil', case when v_prof.rut is null then null else jsonb_build_object(
      'anio_comercial', v_prof.commercial_year, 'tramo_ventas', v_prof.sales_tranche, 'trabajadores', v_prof.workers,
      'region', v_prof.region, 'rubro', v_prof.rubro, 'subrubro', v_prof.subrubro, 'actividad_principal', v_prof.main_activity,
      'tipo_termino', v_prof.end_type, 'tipo_contribuyente', v_prof.contributor_type, 'subtipo_contribuyente', v_prof.contributor_subtype,
      'tramo_capital', v_prof.equity_tranche) end,
    'senales', v_senales,
    'fuente', 'Servicio de Impuestos Internos · Nómina de Razón Social de contribuyentes personas jurídicas',
    'fuente_url', v_meta.source_url,
    'publicada', v_meta.published_on,
    'carga_parcial', v_partial,
    'fuentes', v_fuentes);
end
$$;


revoke execute on function private.public_profile(integer) from public, anon;
