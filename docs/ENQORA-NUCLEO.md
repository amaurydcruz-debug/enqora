# ENQORA — Etapa 4: Núcleo operativo

Casos, equipo ENQORA, tareas, historial y expedientes. Es la base común de todos los módulos (CONTABILIDAD, CREATE, FORMALIZA, BRAND, LEGAL…): cada solicitud del cliente es un caso.

## Qué incluye

| Función | Detalle |
| --- | --- |
| Solicitudes del cliente | Menú **Casos**: crear una solicitud por área (módulo), ver avance, conversar con el equipo, adjuntar documentos, cancelar si aún no se trabaja |
| Folio | `ENQ-AAAA-NNNNN`, único |
| Ficha de caso | Avance por etapas, historial completo, mensajes, expediente, tareas, equipo y resultado verificado |
| Equipo ENQORA | Administrador ENQORA, Director de operaciones, Contador autorizado, Abogado autorizado, Gestor presencial, Agente IA |
| Centro de Mando | Menú visible solo para el equipo: casos por vista (míos, activos, sin responsable, finalizados), prioridades, vencidos |
| Acceso mínimo | Un profesional solo ve los casos asignados y los datos básicos de esa empresa (no sus miembros ni su auditoría). La supervisión ve todos |
| Notas y documentos internos | El cliente nunca los ve (lo garantiza la base de datos) |
| Cierre verificable | Solo el responsable o la supervisión cierran, y siempre con el resultado descrito |
| Expediente privado | Almacenamiento privado `expedientes`, 20 MB por archivo, PDF/imagen/XML/CSV/Excel/Word. Descarga con enlace firmado de 60 segundos |
| Reautenticación | Asignar personas a un caso o cambiar el equipo pide un código nuevo si ingresaste hace más de 15 minutos |
| Navegación lateral | Menú lateral en computador; barra desplazable en teléfono |

## Instalación

1. **Supabase → SQL Editor**: ejecuta `supabase/migrations/0004_nucleo.sql`.
2. **SQL Editor**: ejecuta `supabase/tests/0004_nucleo_rls.sql` → debe responder **TODAS LAS PRUEBAS OK**.
3. **Tu cuenta como primer Administrador ENQORA** (una sola vez), en SQL Editor:

   ```sql
   select private.bootstrap_enqora_admin('amaurydcruz@gmail.com');
   ```

   Debe responder *Administrador ENQORA creado*. Desde ahí, el resto del equipo se agrega en **Centro de Mando → Equipo ENQORA**.
4. Sube los archivos a GitHub.

## Pruebas manuales

1. **Casos → Nueva solicitud** (área CONTABILIDAD) → se crea con folio y aparece en la ficha "Recibido".
2. Adjunta un PDF → aparece en Expediente; ábrelo (descarga firmada).
3. Escribe un mensaje → aparece en el historial.
4. Como administrador: **Centro de Mando** → el caso aparece en "Sin responsable". En la ficha, asígnate como Responsable.
5. Deja una **nota interna** y un documento **Solo equipo**. Con otra cuenta cliente de la misma empresa, verifica que no se ven.
6. Cambia el estado a "En investigación" → el cliente lo ve en el avance.
7. Crea una tarea para el cliente ("Subir cartola") → el cliente la ve y puede marcarla como hecha.
8. Intenta cerrar sin resultado → error. Cierra con el resultado → aparece "Resultado verificado".
9. Con una cuenta de otra empresa, abre `/casos/<id>` → página no encontrada.

## Reversión

```sql
drop function if exists public.set_staff_role, public.create_case, public.add_case_comment, public.change_case_status,
  public.set_case_priority, public.assign_case, public.unassign_case, public.create_task, public.update_task_status,
  public.register_document cascade;
drop policy if exists enqora_expedientes_subir on storage.objects;
drop policy if exists enqora_expedientes_leer on storage.objects;
drop policy if exists equipo_lee_empresas_de_sus_casos on public.companies;
drop policy if exists perfil_propio_o_colegas on public.profiles;
create policy perfil_propio_o_colegas on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_company(id));
drop table if exists public.case_documents, public.case_tasks, public.case_events, public.case_assignments,
  public.cases, public.staff_members cascade;
drop sequence if exists public.case_folio_seq;
drop function if exists private.staff_role, private.is_staff, private.is_supervisor, private.case_company,
  private.is_assigned, private.can_work_case, private.can_see_case, private.can_post_case, private.can_see_item,
  private.shares_case, private.path_case, private.log_case, private.staff_sees_company,
  private.bootstrap_enqora_admin cascade;
```

Los archivos del almacenamiento `expedientes` se borran desde Supabase → Storage.
