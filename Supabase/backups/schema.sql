


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."actualizar_rutina_entrenador"("p_rutina_id" integer, "p_nombre" "text", "p_descripcion" "text", "p_detalles" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rutina_id integer;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'ENTRENADOR' THEN
    RAISE EXCEPTION 'Solo un entrenador autenticado puede editar rutinas.' USING ERRCODE = '42501';
  END IF;

  -- Bloquea la fila durante la operación para evitar ediciones concurrentes.
  SELECT id INTO v_rutina_id
  FROM public.rutinas
  WHERE id = p_rutina_id AND entrenador_id = auth.uid()
  FOR UPDATE;

  IF v_rutina_id IS NULL THEN
    RAISE EXCEPTION 'La rutina no existe o no te pertenece.' USING ERRCODE = '42501';
  END IF;

  IF p_nombre IS NULL OR length(btrim(p_nombre)) = 0 OR length(btrim(p_nombre)) > 120 THEN
    RAISE EXCEPTION 'El nombre debe tener entre 1 y 120 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_descripcion, '')) > 1500 THEN
    RAISE EXCEPTION 'La descripción supera los 1500 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_detalles IS NULL OR jsonb_typeof(p_detalles) <> 'array' THEN
    RAISE EXCEPTION 'El detalle de ejercicios debe ser una lista.' USING ERRCODE = '22023';
  END IF;

  v_total := jsonb_array_length(p_detalles);
  IF v_total < 1 OR v_total > 100 THEN
    RAISE EXCEPTION 'La rutina debe tener entre 1 y 100 ejercicios.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_detalles) AS d(
      ejercicio_id integer, orden integer, series integer,
      repeticiones integer, duracion_segundos integer,
      descanso_segundos integer, indicaciones_adicionales text
    )
    WHERE d.ejercicio_id IS NULL OR d.orden IS NULL OR d.orden < 1
       OR (d.series IS NOT NULL AND d.series < 1)
       OR (d.repeticiones IS NOT NULL AND d.repeticiones < 1)
       OR (d.duracion_segundos IS NOT NULL AND d.duracion_segundos < 1)
       OR (d.descanso_segundos IS NOT NULL AND d.descanso_segundos < 0)
       OR (d.repeticiones IS NULL AND d.duracion_segundos IS NULL)
       OR length(coalesce(d.indicaciones_adicionales, '')) > 500
  ) THEN
    RAISE EXCEPTION 'Uno o más ejercicios tienen valores inválidos.' USING ERRCODE = '22023';
  END IF;

  -- Los órdenes deben ser exactamente 1, 2, 3, ... N, sin repeticiones.
  IF (
    SELECT count(DISTINCT d.orden)
    FROM jsonb_to_recordset(p_detalles) AS d(orden integer)
  ) <> v_total
  OR (
    SELECT max(d.orden)
    FROM jsonb_to_recordset(p_detalles) AS d(orden integer)
  ) <> v_total THEN
    RAISE EXCEPTION 'El orden de los ejercicios no es válido.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.rutinas
  SET nombre = btrim(p_nombre),
      descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
      updated_at = now()
  WHERE id = p_rutina_id AND entrenador_id = auth.uid();

  -- Todas estas operaciones forman una sola transacción.
  -- Si falla un INSERT o una política RLS, PostgreSQL revierte TODO.
  DELETE FROM public.detalle_rutina WHERE rutina_id = p_rutina_id;

  INSERT INTO public.detalle_rutina (
    rutina_id, ejercicio_id, orden, series, repeticiones,
    duracion_segundos, descanso_segundos, indicaciones_adicionales, created_at
  )
  SELECT
    p_rutina_id, d.ejercicio_id, d.orden, d.series, d.repeticiones,
    d.duracion_segundos, d.descanso_segundos,
    nullif(btrim(coalesce(d.indicaciones_adicionales, '')), ''), now()
  FROM jsonb_to_recordset(p_detalles) AS d(
    ejercicio_id integer, orden integer, series integer,
    repeticiones integer, duracion_segundos integer,
    descanso_segundos integer, indicaciones_adicionales text
  )
  ORDER BY d.orden;
END;
$$;


ALTER FUNCTION "public"."actualizar_rutina_entrenador"("p_rutina_id" integer, "p_nombre" "text", "p_descripcion" "text", "p_detalles" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_actualizar_video_ejercicio"("p_ejercicio_id" integer, "p_video_anterior" "text", "p_video_nuevo" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
  v_actualizado integer;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = auth.uid() AND u.rol_id = 1
  ) THEN
    RAISE EXCEPTION 'No autorizado para gestionar videos';
  END IF;

  -- Solo enlaces HTTPS o NULL (quitar video). No se permite subir archivos.
  IF p_video_nuevo IS NOT NULL AND (
    length(p_video_nuevo) > 2000 OR
    p_video_nuevo !~* '^https://[^[:space:]]+$'
  ) THEN
    RAISE EXCEPTION 'El video debe ser un enlace HTTPS válido';
  END IF;

  UPDATE public.ejercicios
     SET video_url = p_video_nuevo
   WHERE id = p_ejercicio_id
     AND video_url IS NOT DISTINCT FROM p_video_anterior
     AND video_url IS NOT NULL;
  GET DIAGNOSTICS v_actualizado = ROW_COUNT;
  RETURN v_actualizado = 1;
END;
$_$;


ALTER FUNCTION "public"."admin_actualizar_video_ejercicio"("p_ejercicio_id" integer, "p_video_anterior" "text", "p_video_nuevo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_admin_cambiar_estado_usuario"("p_usuario_id" "uuid", "p_estado" boolean) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_rol integer;
begin
 if not public.ath_es_admin_activo() then raise exception 'Acceso denegado'; end if;
 if p_usuario_id is null or p_estado is null then raise exception 'Parámetros inválidos'; end if;
 select rol_id into v_rol from public.usuarios where id=p_usuario_id for update;
 if not found then raise exception 'Usuario inexistente'; end if;
 if v_rol=1 then raise exception 'Las cuentas administrativas están protegidas'; end if;
 update public.usuarios set estado=p_estado where id=p_usuario_id;
 return true;
end $$;


ALTER FUNCTION "public"."ath_admin_cambiar_estado_usuario"("p_usuario_id" "uuid", "p_estado" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_admin_cancelar_partido"("p_partido_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_deporte text;
BEGIN
 IF NOT public.ath_es_admin_activo() THEN RAISE EXCEPTION 'Solo administradores activos'; END IF;
 SELECT deporte INTO v_deporte FROM public.partidos_activos WHERE id=p_partido_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'El encuentro ya no existe'; END IF;
 DELETE FROM public.partidos_activos WHERE id=p_partido_id;
 -- Las inscripciones se eliminan mediante FK ON DELETE CASCADE del backend de Athletix Match.
 INSERT INTO public.ath_admin_auditoria(administrador_id,accion,recurso,recurso_id,motivo)
 VALUES(auth.uid(),'retirar','partido',p_partido_id::text,'Retiro de encuentro público: '||coalesce(v_deporte,'sin deporte'));
END $$;


ALTER FUNCTION "public"."ath_admin_cancelar_partido"("p_partido_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_admin_listar_denuncias"("p_bajas" boolean, "p_pendientes" boolean, "p_tipo" "text", "p_offset" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE resultado jsonb; BEGIN
IF NOT public.ath_mod_admin() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
SELECT jsonb_build_object('pendientes',(SELECT count(*) FROM public.ath_denuncias WHERE estado='pendiente' AND tipo<>'baja'),'solicitudes',(SELECT count(*) FROM public.ath_denuncias WHERE estado='pendiente' AND tipo='baja'),'items',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.creado_en DESC,q.id DESC) FROM (SELECT d.id,d.tipo,d.estado,d.motivo,d.evidencia,d.creado_en,d.resuelto_en,d.medida,d.nota_resolucion,u.nombre AS denunciante,a.nombre AS denunciado,r.nombre AS responsable, CASE WHEN d.tipo IN ('publicacion','comentario') THEN public.ath_autor_denuncia(d.tipo,d.objeto) IS NOT NULL WHEN d.tipo='mensaje' THEN EXISTS(SELECT 1 FROM public.ath_chat_mensajes m WHERE m.id::text=d.objeto AND m.chat_id::text='00000000-0000-0000-0000-000000000001') ELSE false END AS puede_retirar, EXISTS(SELECT 1 FROM public.usuarios z WHERE z.id=d.denunciado_id AND z.estado IS TRUE) AS puede_advertir FROM public.ath_denuncias d LEFT JOIN public.usuarios u ON u.id=d.usuario_id LEFT JOIN public.usuarios a ON a.id=d.denunciado_id LEFT JOIN public.usuarios r ON r.id=d.resuelto_por WHERE (d.tipo='baja')=p_bajas AND (d.estado='pendiente')=p_pendientes AND (p_tipo='' OR d.tipo=p_tipo) ORDER BY d.creado_en DESC,d.id DESC LIMIT 21 OFFSET greatest(0,p_offset)) q),'[]'::jsonb)) INTO resultado; RETURN resultado; END $$;


ALTER FUNCTION "public"."ath_admin_listar_denuncias"("p_bajas" boolean, "p_pendientes" boolean, "p_tipo" "text", "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_admin_moderar_contenido"("p_tipo" "text", "p_id" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_chat_id uuid;
DECLARE v_general uuid := '00000000-0000-0000-0000-000000000001'::uuid;
DECLARE v_rows integer;
DECLARE v_comentario record;
BEGIN
 IF NOT public.ath_es_admin_activo() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
 IF p_id IS NULL OR length(p_id)>80 THEN RAISE EXCEPTION 'Identificador inválido'; END IF;
 IF p_tipo = 'publicacion' THEN
   -- Eliminar primero comentarios de mayor profundidad para no romper FK de respuestas.
   FOR v_comentario IN
     WITH RECURSIVE arbol AS (
       SELECT id, respuesta_a, 0 AS nivel FROM public.muro_comentarios WHERE publicacion_id::text=p_id
       UNION ALL
       SELECT c.id,c.respuesta_a,a.nivel+1 FROM public.muro_comentarios c JOIN arbol a ON c.respuesta_a=a.id
     ) SELECT DISTINCT id, max(nivel) AS nivel FROM arbol GROUP BY id ORDER BY nivel DESC
   LOOP
     DELETE FROM public.muro_comentarios WHERE id=v_comentario.id;
   END LOOP;
   DELETE FROM public.muro_comunidad WHERE id::text=p_id;
 ELSIF p_tipo = 'comentario' THEN
   FOR v_comentario IN
     WITH RECURSIVE arbol AS (
       SELECT id, respuesta_a, 0 AS nivel FROM public.muro_comentarios WHERE id::text=p_id
       UNION ALL
       SELECT c.id,c.respuesta_a,a.nivel+1 FROM public.muro_comentarios c JOIN arbol a ON c.respuesta_a=a.id
     ) SELECT DISTINCT id, max(nivel) AS nivel FROM arbol GROUP BY id ORDER BY nivel DESC
   LOOP
     DELETE FROM public.muro_comentarios WHERE id=v_comentario.id;
   END LOOP;
 ELSIF p_tipo = 'chat_general' THEN
   SELECT chat_id INTO v_chat_id FROM public.ath_chat_mensajes WHERE id::text=p_id;
   IF v_chat_id IS DISTINCT FROM v_general THEN RAISE EXCEPTION 'Solo se permite moderar el chat general'; END IF;
   DELETE FROM public.ath_chat_mensajes WHERE id::text=p_id AND chat_id=v_general;
 ELSE
   RAISE EXCEPTION 'Tipo de contenido no autorizado';
 END IF;
 GET DIAGNOSTICS v_rows = ROW_COUNT;
 IF v_rows=0 THEN RAISE EXCEPTION 'Contenido no encontrado o ya retirado'; END IF;
 INSERT INTO public.ath_admin_auditoria(administrador_id,accion,recurso,recurso_id,motivo)
 VALUES(auth.uid(),'retirar',p_tipo,p_id,'Moderación de contenido público');
 RETURN true;
END $$;


ALTER FUNCTION "public"."ath_admin_moderar_contenido"("p_tipo" "text", "p_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_admin_reporte_global"("p_desde" "date", "p_hasta" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_resultado jsonb;
begin
 if not public.ath_es_admin_activo() then raise exception 'Acceso denegado'; end if;
 if p_desde is null or p_hasta is null or p_desde>p_hasta then
   raise exception 'Rango de fechas inválido';
 end if;
 select jsonb_build_object(
  'deportistas',(select count(*) from public.usuarios where rol_id=3 and lower(trim(estado::text)) in ('true','activo','activa','active','1')),
  'entrenadores',(select count(*) from public.usuarios where rol_id=2 and lower(trim(estado::text)) in ('true','activo','activa','active','1')),
  'rutinas',(select count(*) from public.rutinas where lower(trim(estado::text)) in ('true','activo','activa','active','1')),
  'total_asistencias',(select count(*) from public.ath_asistencia_individual where fecha between p_desde and p_hasta),
  'estados',jsonb_build_object(
    'PRESENTE',(select count(*) from public.ath_asistencia_individual where fecha between p_desde and p_hasta and upper(estado)='PRESENTE'),
    'AUSENTE',(select count(*) from public.ath_asistencia_individual where fecha between p_desde and p_hasta and upper(estado)='AUSENTE'),
    'JUSTIFICADO',(select count(*) from public.ath_asistencia_individual where fecha between p_desde and p_hasta and upper(estado)='JUSTIFICADO')
  ),
  'meses',coalesce((select jsonb_object_agg(mes,cantidad) from
    (select to_char(fecha,'YYYY-MM') mes,count(*) cantidad from public.ath_asistencia_individual
      where fecha between p_desde and p_hasta group by 1) m),'{}'::jsonb)
 ) into v_resultado;
 return v_resultado;
end $$;


ALTER FUNCTION "public"."ath_admin_reporte_global"("p_desde" "date", "p_hasta" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_admin_resolver_denuncia"("p_id" bigint, "p_medida" "text", "p_nota" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE d public.ath_denuncias%ROWTYPE; BEGIN
IF NOT public.ath_mod_admin() THEN RAISE EXCEPTION 'Acceso denegado'; END IF;
IF p_nota IS NULL OR length(trim(p_nota)) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Indica el motivo de resolución'; END IF;
SELECT * INTO d FROM public.ath_denuncias WHERE id=p_id FOR UPDATE;
IF NOT FOUND OR d.estado<>'pendiente' THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
IF d.tipo='baja' THEN IF p_medida NOT IN ('gestionada','desestimada') OR p_medida IS NULL THEN RAISE EXCEPTION 'Medida inválida'; END IF;
ELSE IF p_medida NOT IN ('desestimada','revisada','retirada','advertida') OR p_medida IS NULL THEN RAISE EXCEPTION 'Medida inválida'; END IF;
IF p_medida='advertida' AND NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=d.denunciado_id AND estado IS TRUE) THEN RAISE EXCEPTION 'Usuario no disponible'; END IF;
IF p_medida='retirada' THEN IF d.tipo NOT IN ('mensaje','publicacion','comentario') OR (d.tipo='mensaje' AND NOT EXISTS(SELECT 1 FROM public.ath_chat_mensajes WHERE id::text=d.objeto AND chat_id::text='00000000-0000-0000-0000-000000000001')) THEN RAISE EXCEPTION 'Contenido no permitido'; END IF; PERFORM public.ath_admin_moderar_contenido(CASE WHEN d.tipo='mensaje' THEN 'chat_general' ELSE d.tipo END,d.objeto); END IF; END IF;
UPDATE public.ath_denuncias SET estado='revisada',medida=p_medida,nota_resolucion=trim(p_nota),resuelto_por=auth.uid(),resuelto_en=now() WHERE id=p_id;
IF d.tipo<>'baja' THEN
 INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
 SELECT id,'Denuncia resuelta','El equipo de administración ha revisado tu denuncia.','comunidad' FROM public.usuarios WHERE id=d.usuario_id AND estado IS TRUE;
 IF p_medida='advertida' THEN
 INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
 SELECT id,'Advertencia de moderación','El equipo de administración ha emitido una advertencia sobre tu contenido. Recuerda respetar las normas de convivencia.','comunidad' FROM public.usuarios WHERE id=d.denunciado_id AND estado IS TRUE;
 END IF;
END IF;
END $$;


ALTER FUNCTION "public"."ath_admin_resolver_denuncia"("p_id" bigint, "p_medida" "text", "p_nota" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_auditar_cambio"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a uuid:=auth.uid(); n jsonb; o jsonb; accion text; recurso text; identificador text;
begin
if a is null or not public.ath_es_admin_activo() then return null; end if;
if TG_OP<>'DELETE' then n:=to_jsonb(NEW); end if;
if TG_OP<>'INSERT' then o:=to_jsonb(OLD); end if;
identificador:=coalesce(n->>'id',o->>'id');
case TG_TABLE_NAME
when 'usuarios' then
 recurso:='usuario';
 if TG_OP='INSERT' then accion:='crear_usuario';
 elsif TG_OP='DELETE' then accion:='eliminar_usuario';
 elsif n->'estado' is distinct from o->'estado' then accion:=case when n->>'estado'='true' then 'activar_usuario' else 'desactivar_usuario' end;
 elsif n->'rol_id' is distinct from o->'rol_id' or n->'nombre' is distinct from o->'nombre' or n->'email' is distinct from o->'email' then accion:='modificar_usuario'; end if;
when 'ath_denuncias' then
 recurso:='denuncia'; if n->'estado' is distinct from o->'estado' and n->>'estado'='revisada' then accion:='resolver_denuncia'; end if;
when 'ath_soporte' then
 recurso:='soporte'; if n->'estado' is distinct from o->'estado' then accion:=case when n->>'estado'='resuelto' then 'resolver_soporte' else 'atender_soporte' end; end if;
when 'ath_soporte_mensajes' then
 recurso:='soporte'; identificador:=n->>'solicitud_id'; if n->>'equipo'='true' then accion:='responder_soporte'; end if;
end case;
if accion is not null then insert into public.ath_admin_auditoria(administrador_id,accion,recurso,recurso_id,motivo) values(a,accion,recurso,identificador,case when recurso='denuncia' then n->>'medida' else 'Acción administrativa' end); end if;
return null;
end $$;


ALTER FUNCTION "public"."ath_auditar_cambio"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_autor_denuncia"("t" "text", "o" "text") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ SELECT CASE t WHEN 'mensaje' THEN (SELECT usuario_id FROM public.ath_chat_mensajes WHERE id::text=o) WHEN 'publicacion' THEN (SELECT usuario_id FROM public.muro_comunidad WHERE id::text=o) WHEN 'comentario' THEN (SELECT usuario_id FROM public.muro_comentarios WHERE id::text=o) WHEN 'encuentro' THEN (SELECT organizador_id FROM public.partidos_activos WHERE id::text=o) END $$;


ALTER FUNCTION "public"."ath_autor_denuncia"("t" "text", "o" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_bloquear"("p_usuario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ BEGIN IF NOT public.ath_mod_activo() OR p_usuario=auth.uid() THEN RAISE EXCEPTION 'Acceso no permitido'; END IF; INSERT INTO public.ath_bloqueos VALUES(auth.uid(),p_usuario) ON CONFLICT DO NOTHING; END $$;


ALTER FUNCTION "public"."ath_bloquear"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_capturar_autor_denuncia"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ BEGIN NEW.denunciado_id:=public.ath_autor_denuncia(NEW.tipo,NEW.objeto); RETURN NEW; END $$;


ALTER FUNCTION "public"."ath_capturar_autor_denuncia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_chat_estado_rpc"("p_chat" "uuid" DEFAULT NULL::"uuid", "p_mensaje" "text" DEFAULT NULL::"text", "p_escribir" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_fecha timestamptz; v_lectura boolean; v_escritura boolean; v_result jsonb; begin
if not coalesce(public.ath_mod_activo(),false) then raise exception 'Acceso no permitido'; end if;
if p_chat is not null and not exists(select 1 from public.ath_chat_participantes p join public.ath_chats c on c.id=p.chat_id where p.chat_id=p_chat and p.usuario_id=auth.uid() and c.tipo in ('privado','grupo')) then raise exception 'Conversación no disponible'; end if;
select lectura,escritura into v_lectura,v_escritura from public.ath_chat_preferencias where usuario_id=auth.uid();
if p_chat is not null and (p_mensaje is not null or p_escribir is not null) then
select creado_en into v_fecha from public.ath_chat_mensajes where chat_id=p_chat and id::text=p_mensaje;
insert into public.ath_chat_estado(chat_id,usuario_id,leido,publicado,escribiendo) values(p_chat,auth.uid(),v_fecha,case when v_lectura then v_fecha end,case when v_escritura and p_escribir then now() end)
on conflict(chat_id,usuario_id) do update set leido=greatest(ath_chat_estado.leido,excluded.leido), publicado=case when v_lectura then greatest(ath_chat_estado.publicado,excluded.publicado) end, escribiendo=case when not coalesce(v_escritura,false) then null when p_escribir is null then ath_chat_estado.escribiendo when p_escribir then now() else null end;
end if;
select jsonb_build_object('noLeidos',coalesce((select jsonb_object_agg(p.chat_id,(select count(*) from public.ath_chat_mensajes m where m.chat_id=p.chat_id and m.usuario_id<>auth.uid() and m.creado_en>coalesce(e.leido,'-infinity'::timestamptz))) from public.ath_chat_participantes p join public.ath_chats c on c.id=p.chat_id left join public.ath_chat_estado e on e.chat_id=p.chat_id and e.usuario_id=auth.uid() where p.usuario_id=auth.uid() and c.tipo in ('privado','grupo')),'{}'::jsonb),'otros',coalesce((select jsonb_agg(jsonb_build_object('id',e.usuario_id,'leido',case when f.lectura then e.publicado end,'escribiendo',coalesce(f.escritura and e.escribiendo>now()-interval '8 seconds',false))) from public.ath_chat_estado e join public.ath_chat_participantes p on p.chat_id=e.chat_id and p.usuario_id=e.usuario_id join public.usuarios u on u.id=e.usuario_id and u.estado is true join public.ath_chat_preferencias f on f.usuario_id=e.usuario_id where e.chat_id=p_chat and e.usuario_id<>auth.uid() and not exists(select 1 from public.ath_bloqueos b where (b.usuario_id=auth.uid() and b.bloqueado_id=e.usuario_id) or (b.bloqueado_id=auth.uid() and b.usuario_id=e.usuario_id))),'[]'::jsonb)) into v_result;
return v_result; end $$;


ALTER FUNCTION "public"."ath_chat_estado_rpc"("p_chat" "uuid", "p_mensaje" "text", "p_escribir" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_chat_preferencia"("p_lectura" boolean DEFAULT NULL::boolean, "p_escritura" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r public.ath_chat_preferencias; begin
if not coalesce(public.ath_mod_activo(),false) then raise exception 'Acceso no permitido'; end if;
insert into public.ath_chat_preferencias(usuario_id) values(auth.uid()) on conflict do nothing;
update public.ath_chat_preferencias set lectura=coalesce(p_lectura,lectura), escritura=coalesce(p_escritura,escritura) where usuario_id=auth.uid() returning * into r;
if not r.lectura then update public.ath_chat_estado set publicado=null where usuario_id=auth.uid(); end if;
if not r.escritura then update public.ath_chat_estado set escribiendo=null where usuario_id=auth.uid(); end if;
return jsonb_build_object('lectura',r.lectura,'escritura',r.escritura); end $$;


ALTER FUNCTION "public"."ath_chat_preferencia"("p_lectura" boolean, "p_escritura" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_codigo_entrenador"() RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_codigo text; v_rol int;
begin
 select rol_id into v_rol from public.usuarios where id=auth.uid() and estado IS TRUE;
 if v_rol is distinct from 2 then raise exception 'Solo entrenadores pueden generar códigos'; end if;
 select codigo into v_codigo from public.codigos_entrenador where entrenador_id=auth.uid();
 if v_codigo is not null then return v_codigo; end if;
 loop
   v_codigo := 'ATH-' || upper(substr(md5(gen_random_uuid()::text),1,8));
   begin
     insert into public.codigos_entrenador(entrenador_id,codigo) values(auth.uid(),v_codigo);
     return v_codigo;
   exception when unique_violation then
     select codigo into v_codigo from public.codigos_entrenador where entrenador_id=auth.uid();
     if v_codigo is not null then return v_codigo; end if;
   end;
 end loop;
end $$;


ALTER FUNCTION "public"."ath_codigo_entrenador"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_consumir_cuota_edge"("p_usuario" "uuid", "p_servicio" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_limite integer; v_usos integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_usuario AND estado IS TRUE) THEN RETURN 'inactivo'; END IF;
 v_limite := CASE p_servicio WHEN 'analizar-alimento' THEN 12 WHEN 'asistente-athletix' THEN 30 WHEN 'buscar-video-ejercicio' THEN 30 WHEN 'match-recintos' THEN 40 ELSE 0 END;
 IF v_limite=0 THEN RETURN 'inactivo'; END IF;
 INSERT INTO public.ath_edge_cuotas AS c(usuario_id,servicio,ventana) VALUES(p_usuario,p_servicio,date_trunc('hour',now()))
 ON CONFLICT(usuario_id,servicio,ventana) DO UPDATE SET usos=c.usos+1 WHERE c.usos<v_limite RETURNING usos INTO v_usos;
 IF v_usos IS NULL THEN RETURN 'limite'; END IF;
 RETURN 'ok';
END; $$;


ALTER FUNCTION "public"."ath_consumir_cuota_edge"("p_usuario" "uuid", "p_servicio" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_crear_grupo_solicitudes"("p_nombre" "text", "p_invitados" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE yo uuid:=auth.uid(); c uuid; persona uuid;
BEGIN
 IF yo IS NULL OR length(trim(coalesce(p_nombre,''))) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Nombre inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=yo AND estado=true) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
 IF coalesce(array_length(p_invitados,1),0)<1 OR coalesce(array_length(p_invitados,1),0)>30 THEN RAISE EXCEPTION 'Selecciona entre 1 y 30 invitados'; END IF;
 INSERT INTO public.ath_chats(tipo,nombre,creador_id) VALUES('grupo',trim(p_nombre),yo) RETURNING id INTO c;
 INSERT INTO public.ath_chat_participantes(chat_id,usuario_id) VALUES(c,yo);
 FOR persona IN SELECT DISTINCT unnest(p_invitados) LOOP
  IF persona<>yo AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=persona AND estado=true) THEN
   INSERT INTO public.ath_chat_invitaciones(chat_id,invitado_id,invitador_id) VALUES(c,persona,yo) ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
 RETURN c;
END $$;


ALTER FUNCTION "public"."ath_crear_grupo_solicitudes"("p_nombre" "text", "p_invitados" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_cuenta_activa_rls"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.usuarios u
  WHERE u.id = (SELECT auth.uid())
    AND lower(coalesce(to_jsonb(u)->>'estado','')) IN ('true','activo','activa','1')
 );
$$;


ALTER FUNCTION "public"."ath_cuenta_activa_rls"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_denunciar"("p_tipo" "text", "p_objeto" "text", "p_motivo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ DECLARE v text; BEGIN IF NOT public.ath_mod_activo() OR p_motivo IS NULL OR length(trim(p_motivo)) NOT BETWEEN 5 AND 500 THEN RAISE EXCEPTION 'Solicitud inválida'; END IF; CASE p_tipo WHEN 'mensaje' THEN SELECT m.contenido INTO v FROM public.ath_chat_mensajes m JOIN public.ath_chats c ON c.id=m.chat_id WHERE m.id::text=p_objeto AND m.usuario_id<>auth.uid() AND (c.id::text='00000000-0000-0000-0000-000000000001' OR EXISTS(SELECT 1 FROM public.ath_chat_participantes p WHERE p.chat_id=m.chat_id AND p.usuario_id=auth.uid())); WHEN 'publicacion' THEN SELECT mensaje INTO v FROM public.muro_comunidad WHERE id::text=p_objeto AND usuario_id<>auth.uid(); WHEN 'comentario' THEN SELECT mensaje INTO v FROM public.muro_comentarios WHERE id::text=p_objeto AND usuario_id<>auth.uid(); WHEN 'encuentro' THEN SELECT deporte::text INTO v FROM public.partidos_activos WHERE id::text=p_objeto AND organizador_id<>auth.uid(); WHEN 'baja' THEN v:='Solicitud personal'; p_objeto:=''; ELSE RAISE EXCEPTION 'Tipo inválido'; END CASE; IF v IS NULL THEN RAISE EXCEPTION 'Contenido no disponible'; END IF; IF EXISTS(SELECT 1 FROM public.ath_denuncias WHERE usuario_id=auth.uid() AND tipo=p_tipo AND objeto=p_objeto AND estado='pendiente') THEN RAISE EXCEPTION 'Ya existe una solicitud pendiente'; END IF; INSERT INTO public.ath_denuncias(usuario_id,tipo,objeto,motivo,evidencia) VALUES(auth.uid(),p_tipo,p_objeto,trim(p_motivo),left(v,2000)); END $$;


ALTER FUNCTION "public"."ath_denunciar"("p_tipo" "text", "p_objeto" "text", "p_motivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_desbloquear"("p_usuario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ BEGIN DELETE FROM public.ath_bloqueos WHERE usuario_id=auth.uid() AND bloqueado_id=p_usuario; END $$;


ALTER FUNCTION "public"."ath_desbloquear"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_desvincular_entrenador"("p_id" bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
 update public.vinculos_entrenador set estado='cancelado',respondido_en=now()
 where id=p_id and estado='activo' and (entrenador_id=auth.uid() or deportista_id=auth.uid());
 if not found then raise exception 'Vinculación no disponible'; end if;
 return 'Vinculación finalizada';
end $$;


ALTER FUNCTION "public"."ath_desvincular_entrenador"("p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_desvincular_push"("p_token" "text") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 DELETE FROM public.ath_dispositivos_push WHERE token=p_token AND usuario_id=auth.uid();
$$;


ALTER FUNCTION "public"."ath_desvincular_push"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_edge_crear_perfil"("p_actor" "uuid", "p_id" "uuid", "p_nombre" "text", "p_rut" "text", "p_correo" "text", "p_rol" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 if not exists(select 1 from public.usuarios where id=p_actor and rol_id=1 and estado is true) or p_rol not in (2,3) then raise exception 'Operación no autorizada'; end if;
 insert into public.usuarios(id,nombre,rut,correo,rol_id,estado) values(p_id,p_nombre,p_rut,p_correo,p_rol,true);
 insert into public.ath_admin_auditoria(administrador_id,accion,recurso,recurso_id,motivo) values(p_actor,'crear_usuario','usuario',p_id::text,'Acción administrativa');
end $$;


ALTER FUNCTION "public"."ath_edge_crear_perfil"("p_actor" "uuid", "p_id" "uuid", "p_nombre" "text", "p_rut" "text", "p_correo" "text", "p_rol" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_edge_solicitar_eliminacion"("p_actor" "uuid", "p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_estado boolean; v_rol integer; v_insertadas integer;
begin
 if p_actor=p_id or not exists(select 1 from public.usuarios where id=p_actor and rol_id=1 and estado is true) then raise exception 'Operación no autorizada'; end if;
 select estado,rol_id into v_estado,v_rol from public.usuarios where id=p_id for update;
 if not found or v_rol=1 then raise exception 'Cuenta no disponible'; end if;
 update public.usuarios set estado=false where id=p_id and estado is distinct from false;
 if v_estado is distinct from false then
 insert into public.ath_admin_auditoria(administrador_id,accion,recurso,recurso_id,motivo) values(p_actor,'desactivar_usuario','usuario',p_id::text,'Acción administrativa');
 end if;
 insert into public.ath_solicitudes_eliminacion(usuario_id,solicitado_por,estado,ultimo_error) values(p_id,p_actor,'pendiente',null) on conflict(usuario_id) do nothing;
 get diagnostics v_insertadas=row_count;
 if v_insertadas>0 then
 insert into public.ath_admin_auditoria(administrador_id,accion,recurso,recurso_id,motivo) values(p_actor,'solicitar_eliminacion','usuario',p_id::text,'Solicitud de eliminación');
 end if;
end $$;


ALTER FUNCTION "public"."ath_edge_solicitar_eliminacion"("p_actor" "uuid", "p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_enviar_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
    project_url text;
    push_secret text;
    request_id bigint;
BEGIN
    SELECT decrypted_secret
    INTO project_url
    FROM vault.decrypted_secrets
    WHERE name = 'athletix_project_url';

    SELECT decrypted_secret
    INTO push_secret
    FROM vault.decrypted_secrets
    WHERE name = 'athletix_push_secret';

    IF project_url IS NULL OR push_secret IS NULL THEN
        RAISE WARNING 'Configuración push incompleta';
        RETURN NEW;
    END IF;

    INSERT INTO public.ath_push_envios (
        notificacion_id
    )
    VALUES (NEW.id)
    ON CONFLICT DO NOTHING;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT net.http_post(
        url := project_url ||
            '/functions/v1/athletix-push',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-athletix-secret', push_secret
        ),
        body := jsonb_build_object(
            'notification_id', NEW.id
        ),
        timeout_milliseconds := 15000
    )
    INTO request_id;

    UPDATE public.ath_push_envios AS e
    SET request_id = ath_enviar_push.request_id
    WHERE e.notificacion_id = NEW.id;

    RETURN NEW;

EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'No se pudo programar el envío push';
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."ath_enviar_push"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_es_admin_activo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select exists(select 1 from public.usuarios u where u.id=auth.uid() and u.rol_id=1 and u.estado=true);
$$;


ALTER FUNCTION "public"."ath_es_admin_activo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_es_participante"("p_chat" "uuid", "p_usuario" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select exists(select 1 from public.ath_chat_participantes where chat_id=p_chat and usuario_id=p_usuario)
$$;


ALTER FUNCTION "public"."ath_es_participante"("p_chat" "uuid", "p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_eval_permiso"("d" "uuid", "e" "uuid", "escritura" boolean) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id=auth.uid() AND u.estado IS TRUE AND ((NOT escritura AND u.rol_id=3 AND u.id=d) OR (u.rol_id=2 AND (NOT escritura OR u.id=e) AND EXISTS (SELECT 1 FROM public.vinculos_entrenador v JOIN public.usuarios a ON a.id=v.deportista_id WHERE v.entrenador_id=u.id AND v.deportista_id=d AND v.estado='activo' AND a.estado IS TRUE AND a.rol_id=3))));
$$;


ALTER FUNCTION "public"."ath_eval_permiso"("d" "uuid", "e" "uuid", "escritura" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_filtrar_notificacion"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF EXISTS (SELECT 1 FROM public.ath_preferencias_privacidad WHERE usuario_id=NEW.usuario_id AND NOT notificaciones) THEN RETURN NULL; END IF;
 RETURN NEW;
END; $$;


ALTER FUNCTION "public"."ath_filtrar_notificacion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_guardar_bloqueo_chat"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ BEGIN IF TG_TABLE_NAME='ath_chat_solicitudes' THEN IF EXISTS(SELECT 1 FROM public.ath_bloqueos b WHERE (b.usuario_id=NEW.remitente_id AND b.bloqueado_id=NEW.destinatario_id) OR (b.usuario_id=NEW.destinatario_id AND b.bloqueado_id=NEW.remitente_id)) THEN RAISE EXCEPTION 'Contacto privado no disponible'; END IF; ELSE IF EXISTS(SELECT 1 FROM public.ath_chats c JOIN public.ath_chat_participantes p ON p.chat_id=c.id JOIN public.ath_bloqueos b ON ((b.usuario_id=NEW.usuario_id AND b.bloqueado_id=p.usuario_id) OR (b.bloqueado_id=NEW.usuario_id AND b.usuario_id=p.usuario_id)) WHERE c.id=NEW.chat_id AND c.tipo='privado') THEN RAISE EXCEPTION 'Contacto privado no disponible'; END IF; END IF; RETURN NEW; END $$;


ALTER FUNCTION "public"."ath_guardar_bloqueo_chat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_marcar_presencia"("p_primer_plano" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 if auth.uid() is null then raise exception 'No autenticado'; end if;
 insert into public.ath_usuarios_presencia(usuario_id, ultima_actividad, en_primer_plano)
 values (auth.uid(), now(), p_primer_plano)
 on conflict (usuario_id) do update set ultima_actividad = now(), en_primer_plano = excluded.en_primer_plano;
end $$;


ALTER FUNCTION "public"."ath_marcar_presencia"("p_primer_plano" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_match_editar_encuentro"("p_partido_id" integer, "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_partido public.partidos_activos%ROWTYPE; v_ocupados integer;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND estado IS TRUE) THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_partido FROM public.partidos_activos WHERE id=p_partido_id FOR UPDATE;
 IF NOT FOUND OR v_partido.organizador_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE='42501'; END IF;
 IF v_partido.fecha_hora<=now() OR p_fecha_hora IS NULL OR p_fecha_hora<=now() THEN RAISE EXCEPTION 'Fecha inválida'; END IF;
 SELECT count(*) INTO v_ocupados FROM public.participantes_partido WHERE partido_id=p_partido_id;
 IF p_capacidad IS NULL OR p_capacidad<greatest(2,v_ocupados,coalesce(v_partido.jugadores_actuales,0)) OR p_capacidad>30 THEN RAISE EXCEPTION 'Cupos inválidos'; END IF;
 UPDATE public.partidos_activos SET fecha_hora=p_fecha_hora,capacidad_maxima=p_capacidad WHERE id=p_partido_id;
END; $$;


ALTER FUNCTION "public"."ath_match_editar_encuentro"("p_partido_id" integer, "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_mis_bloqueos"() RETURNS TABLE("id" "uuid", "nombre" "text")
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ SELECT u.id,u.nombre::text FROM public.ath_bloqueos b JOIN public.usuarios u ON u.id=b.bloqueado_id WHERE b.usuario_id=auth.uid() AND public.ath_mod_activo() $$;


ALTER FUNCTION "public"."ath_mis_bloqueos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_mis_vinculos"() RETURNS TABLE("id" bigint, "entrenador_id" "uuid", "deportista_id" "uuid", "estado" "text", "nombre_otro" "text", "creado_en" timestamp with time zone)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
 select v.id,v.entrenador_id,v.deportista_id,v.estado,u.nombre::text,v.creado_en
 from public.vinculos_entrenador v
 join public.usuarios u on u.id=case when v.entrenador_id=auth.uid() then v.deportista_id else v.entrenador_id end
 where (v.entrenador_id=auth.uid() or v.deportista_id=auth.uid()) and v.estado in ('pendiente','activo')
 order by v.creado_en desc;
$$;


ALTER FUNCTION "public"."ath_mis_vinculos"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_mod_activo"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ SELECT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND lower(estado::text) IN ('true','activo')) $$;


ALTER FUNCTION "public"."ath_mod_activo"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_mod_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ SELECT public.ath_mod_activo() AND EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND rol_id=1) $$;


ALTER FUNCTION "public"."ath_mod_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_notificar_deporte_v2"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE destinatario uuid; asunto text; texto text; partido integer;
BEGIN
 IF TG_TABLE_NAME='ath_avisos_individuales' THEN
  IF NEW.destinatario_id IS NULL THEN
   INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
   SELECT DISTINCT v.deportista_id,'Nuevo aviso general','Tu entrenador publicó un comunicado.','avisos'
   FROM public.vinculos_entrenador v JOIN public.usuarios u ON u.id=v.deportista_id
   JOIN public.usuarios a ON a.id=v.entrenador_id
   WHERE v.entrenador_id=NEW.autor_id AND v.estado='activo' AND u.estado IS TRUE AND u.rol_id=3 AND a.rol_id=2 AND a.estado IS TRUE;
  END IF;
 ELSIF TG_TABLE_NAME='entrenamientos_programados' THEN
  IF TG_OP='INSERT' THEN asunto:='Entrenamiento programado';
  ELSIF NEW.estado='CANCELADO' AND OLD.estado IS DISTINCT FROM NEW.estado THEN asunto:='Entrenamiento cancelado';
  ELSIF NEW.estado='PROGRAMADO' AND (NEW.fecha_programada IS DISTINCT FROM OLD.fecha_programada OR NEW.hora_programada IS DISTINCT FROM OLD.hora_programada OR OLD.estado='CANCELADO') THEN asunto:='Entrenamiento reprogramado';
  ELSE RETURN NEW; END IF;
  INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
  SELECT id,asunto,'Consulta tu calendario personal.','actividades' FROM public.usuarios WHERE id=NEW.usuario_id AND estado IS TRUE AND rol_id IN (2,3);
 ELSIF TG_TABLE_NAME='participantes_partido' THEN
  IF TG_OP='DELETE' THEN partido:=OLD.partido_id; destinatario:=OLD.usuario_id; asunto:='Un participante se retiró';
  ELSE partido:=NEW.partido_id; destinatario:=NEW.usuario_id; asunto:='Nuevo participante'; END IF;
  INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
  SELECT p.organizador_id,asunto,'Revisa tu encuentro en Athletix Match.','mapa' FROM public.partidos_activos p JOIN public.usuarios u ON u.id=p.organizador_id WHERE p.id=partido AND p.organizador_id<>destinatario AND u.estado IS TRUE AND p.fecha_hora>now();
 ELSIF TG_TABLE_NAME='partidos_activos' THEN
  IF NEW.fecha_hora IS DISTINCT FROM OLD.fecha_hora THEN
   INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
   SELECT DISTINCT p.usuario_id,'Encuentro reprogramado','Cambió la fecha u hora de tu encuentro.','mapa' FROM public.participantes_partido p JOIN public.usuarios u ON u.id=p.usuario_id WHERE p.partido_id=NEW.id AND p.usuario_id<>NEW.organizador_id AND u.estado IS TRUE;
  END IF;
 ELSIF TG_TABLE_NAME='actividades' THEN
  IF TG_OP='INSERT' THEN asunto:='Nueva actividad deportiva';
  ELSIF NEW.estado='CANCELADA' AND OLD.estado IS DISTINCT FROM NEW.estado THEN asunto:='Actividad cancelada';
  ELSIF ROW(NEW.fecha_hora,NEW.fecha_fin,NEW.lugar,NEW.equipo_id,NEW.estado) IS DISTINCT FROM ROW(OLD.fecha_hora,OLD.fecha_fin,OLD.lugar,OLD.equipo_id,OLD.estado) THEN asunto:='Actividad modificada';
  ELSE RETURN NEW; END IF;
  -- El calendario de deportistas aún no muestra actividades grupales.
  INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
  SELECT DISTINCT u.id,asunto,'Consulta el calendario deportivo.','actividades' FROM public.usuarios u WHERE u.estado IS TRUE AND u.id IS DISTINCT FROM NEW.creado_por AND u.rol_id IN (1,2) AND (u.rol_id=1 OR NEW.equipo_id IS NULL OR EXISTS (SELECT 1 FROM public.usuario_equipo m WHERE m.usuario_id=u.id AND m.equipo_id=NEW.equipo_id AND m.activo IS TRUE AND m.funcion_en_equipo='ENTRENADOR'));
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;


ALTER FUNCTION "public"."ath_notificar_deporte_v2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_notificar_evento_v1"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF TG_TABLE_NAME = 'rutina_usuario' THEN
   IF NEW.activo IS NOT TRUE THEN RETURN NEW; END IF;
   IF TG_OP = 'UPDATE' THEN IF OLD.activo IS TRUE THEN RETURN NEW; END IF; END IF;
   INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo) VALUES (NEW.usuario_id,'Nueva rutina asignada','Tienes una rutina disponible.','rutinas');
 ELSIF TG_TABLE_NAME = 'ath_avisos_individuales' THEN
   IF NEW.destinatario_id IS NOT NULL AND NEW.destinatario_id IS DISTINCT FROM NEW.autor_id THEN
     INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo) VALUES (NEW.destinatario_id,'Nuevo aviso','Tienes un comunicado de tu entrenador.','avisos');
   END IF;
 ELSIF TG_TABLE_NAME = 'ath_chat_mensajes' THEN
   INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo)
   SELECT DISTINCT p.usuario_id,'Nuevo mensaje','Tienes un mensaje privado o grupal.','comunidad'
   FROM public.ath_chat_participantes p JOIN public.ath_chats c ON c.id=p.chat_id
   WHERE p.chat_id=NEW.chat_id AND p.usuario_id<>NEW.usuario_id AND c.tipo IN ('privado','grupo');
 ELSIF TG_TABLE_NAME = 'ath_chat_solicitudes' THEN
   IF NEW.estado='pendiente' AND NEW.destinatario_id<>NEW.remitente_id THEN
     INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo) VALUES (NEW.destinatario_id,'Solicitud de chat','Tienes una solicitud de conversación.','comunidad');
   END IF;
 ELSIF TG_TABLE_NAME = 'ath_chat_invitaciones' THEN
   IF NEW.estado='pendiente' AND NEW.invitado_id<>NEW.invitador_id THEN
     INSERT INTO public.ath_notificaciones(usuario_id,titulo,mensaje,modulo) VALUES (NEW.invitado_id,'Invitación a grupo','Tienes una invitación a un grupo.','comunidad');
   END IF;
 END IF;
 RETURN NEW;
END; $$;


ALTER FUNCTION "public"."ath_notificar_evento_v1"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_presencia_visible"("p_usuario" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ SELECT auth.uid()=p_usuario OR NOT EXISTS (SELECT 1 FROM public.ath_preferencias_privacidad WHERE usuario_id=p_usuario AND NOT mostrar_conexion) $$;


ALTER FUNCTION "public"."ath_presencia_visible"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_registrar_push"("p_token" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF auth.uid() IS NULL OR public.ath_cuenta_activa_rls() IS NOT TRUE THEN RAISE EXCEPTION 'Cuenta no autorizada'; END IF;
 INSERT INTO public.ath_dispositivos_push(token,usuario_id) VALUES(p_token,auth.uid()) ON CONFLICT(token) DO UPDATE SET usuario_id=EXCLUDED.usuario_id, actualizado_en=now();
END; $$;


ALTER FUNCTION "public"."ath_registrar_push"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_responder_chat"("p_solicitud" "uuid", "p_aceptar" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE s public.ath_chat_solicitudes%ROWTYPE; c uuid; n text;
BEGIN
 SELECT * INTO s FROM public.ath_chat_solicitudes WHERE id=p_solicitud AND destinatario_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR s.estado<>'pendiente' THEN RAISE EXCEPTION 'Solicitud no disponible'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND estado=true) OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=s.remitente_id AND estado=true) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
 IF p_aceptar THEN
  n:=concat(least(s.remitente_id::text,s.destinatario_id::text),':',greatest(s.remitente_id::text,s.destinatario_id::text));
  SELECT id INTO c FROM public.ath_chats WHERE tipo='privado' AND nombre=n LIMIT 1;
  IF c IS NULL THEN INSERT INTO public.ath_chats(tipo,nombre,creador_id) VALUES('privado',n,s.remitente_id) RETURNING id INTO c; END IF;
  INSERT INTO public.ath_chat_participantes(chat_id,usuario_id) VALUES(c,s.remitente_id),(c,s.destinatario_id) ON CONFLICT DO NOTHING;
 END IF;
 UPDATE public.ath_chat_solicitudes SET estado=CASE WHEN p_aceptar THEN 'aceptada' ELSE 'rechazada' END,chat_id=c,respondido_en=now() WHERE id=s.id;
 RETURN c;
END $$;


ALTER FUNCTION "public"."ath_responder_chat"("p_solicitud" "uuid", "p_aceptar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_responder_invitacion"("p_invitacion" "uuid", "p_aceptar" boolean) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE s public.ath_chat_invitaciones%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.ath_chat_invitaciones WHERE id=p_invitacion AND invitado_id=auth.uid() FOR UPDATE;
 IF NOT FOUND OR s.estado<>'pendiente' THEN RAISE EXCEPTION 'Invitación no disponible'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND estado=true) THEN RAISE EXCEPTION 'Cuenta inactiva'; END IF;
 IF p_aceptar THEN INSERT INTO public.ath_chat_participantes(chat_id,usuario_id) VALUES(s.chat_id,s.invitado_id) ON CONFLICT DO NOTHING; END IF;
 UPDATE public.ath_chat_invitaciones SET estado=CASE WHEN p_aceptar THEN 'aceptada' ELSE 'rechazada' END,respondido_en=now() WHERE id=s.id;
 RETURN s.chat_id;
END $$;


ALTER FUNCTION "public"."ath_responder_invitacion"("p_invitacion" "uuid", "p_aceptar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_responder_solicitud"("p_id" bigint, "p_aceptar" boolean) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_deportista uuid; v_entrenador uuid; v_estado text;
begin
 select deportista_id, entrenador_id, estado into v_deportista,v_entrenador,v_estado
 from public.vinculos_entrenador where id=p_id for update;
 if v_entrenador is distinct from auth.uid() or v_estado is distinct from 'pendiente' then
   raise exception 'Solicitud no disponible';
 end if;
 if p_aceptar then
   perform 1 from public.usuarios where id=v_deportista for update;
   if exists(select 1 from public.vinculos_entrenador where deportista_id=v_deportista and estado='activo') then
     raise exception 'Este deportista ya tiene entrenador';
   end if;
 end if;
 update public.vinculos_entrenador set estado=case when p_aceptar then 'activo' else 'rechazado' end,
 respondido_en=now() where id=p_id;
 return case when p_aceptar then 'Solicitud aceptada' else 'Solicitud rechazada' end;
end $$;


ALTER FUNCTION "public"."ath_responder_solicitud"("p_id" bigint, "p_aceptar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_resumen_mis_deportistas"() RETURNS TABLE("deportista_id" "uuid", "rutinas_asignadas" bigint)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select v.deportista_id,
         (select count(*) from public.rutina_usuario ru
          where ru.usuario_id = v.deportista_id and ru.activo = true)::bigint
  from public.vinculos_entrenador v
  join public.usuarios entrenador on entrenador.id = v.entrenador_id
  where v.entrenador_id = auth.uid()
    and entrenador.rol_id = 2 AND entrenador.estado IS TRUE
    and v.estado = 'activo';
$$;


ALTER FUNCTION "public"."ath_resumen_mis_deportistas"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_revisar_denuncia"("p_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ BEGIN IF NOT public.ath_mod_admin() THEN RAISE EXCEPTION 'Acceso no permitido'; END IF; UPDATE public.ath_denuncias SET estado='revisada' WHERE id=p_id; END $$;


ALTER FUNCTION "public"."ath_revisar_denuncia"("p_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_solicitar_chat"("p_destinatario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE yo uuid:=auth.uid(); nombre_chat text;
BEGIN
 IF yo IS NULL OR p_destinatario IS NULL OR yo=p_destinatario THEN RAISE EXCEPTION 'Destinatario inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=yo AND estado=true) OR NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_destinatario AND estado=true) THEN RAISE EXCEPTION 'Cuenta no disponible'; END IF;
 nombre_chat:=concat(least(yo::text,p_destinatario::text),':',greatest(yo::text,p_destinatario::text));
 IF EXISTS(SELECT 1 FROM public.ath_chats WHERE tipo='privado' AND nombre=nombre_chat) THEN RAISE EXCEPTION 'Ya existe una conversación'; END IF;
 IF EXISTS(SELECT 1 FROM public.ath_chat_solicitudes WHERE ((remitente_id=yo AND destinatario_id=p_destinatario) OR (remitente_id=p_destinatario AND destinatario_id=yo)) AND estado IN ('pendiente','aceptada')) THEN RAISE EXCEPTION 'Ya existe una solicitud'; END IF;
 INSERT INTO public.ath_chat_solicitudes(remitente_id,destinatario_id) VALUES(yo,p_destinatario)
 ON CONFLICT(remitente_id,destinatario_id) DO UPDATE SET estado='pendiente',respondido_en=NULL,creado_en=now();
END $$;


ALTER FUNCTION "public"."ath_solicitar_chat"("p_destinatario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_solicitar_entrenador"("p_codigo" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_entrenador uuid; v_rol int;
begin
 select rol_id into v_rol from public.usuarios where id=auth.uid();
 if v_rol is distinct from 3 then raise exception 'Solo deportistas pueden solicitar vinculación'; end if;
 select entrenador_id into v_entrenador from public.codigos_entrenador where codigo=upper(trim(p_codigo));
 if v_entrenador is null then raise exception 'Código de entrenador no encontrado'; end if;
 if exists(select 1 from public.vinculos_entrenador where deportista_id=auth.uid() and estado='activo') then
   raise exception 'Ya tienes un entrenador activo';
 end if;
 if exists(select 1 from public.vinculos_entrenador where deportista_id=auth.uid() and estado='pendiente') then
   raise exception 'Ya tienes una solicitud pendiente';
 end if;
 insert into public.vinculos_entrenador(entrenador_id,deportista_id,estado,respondido_en)
 values(v_entrenador,auth.uid(),'pendiente',null)
 on conflict(entrenador_id,deportista_id) do update set estado='pendiente',creado_en=now(),respondido_en=null;
 return 'Solicitud enviada';
end $$;


ALTER FUNCTION "public"."ath_solicitar_entrenador"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_soporte_crear"("p_categoria" "text", "p_mensaje" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ begin
if not exists(select 1 from public.usuarios where id=auth.uid() and estado is true) then raise exception 'Acceso denegado'; end if;
perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
if (select count(*) from public.ath_soporte where usuario_id=auth.uid() and creado_en>now()-interval '1 hour')>=5 then raise exception 'Límite de solicitudes'; end if;
insert into public.ath_soporte(usuario_id,categoria,mensaje) values(auth.uid(),p_categoria,btrim(p_mensaje));
insert into public.ath_notificaciones(usuario_id,titulo,mensaje,modulo) select id,'Nueva solicitud de soporte','Hay una consulta pendiente en Reportes → Soporte.','avisos' from public.usuarios where rol_id=1 and estado is true and id<>auth.uid(); end $$;


ALTER FUNCTION "public"."ath_soporte_crear"("p_categoria" "text", "p_mensaje" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_soporte_listar"("p_admin" boolean, "p_estado" "text", "p_offset" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r integer; resultado jsonb; begin
select rol_id into r from public.usuarios where id=auth.uid() and estado is true;
if r is null or (p_admin and r<>1) then raise exception 'Acceso denegado'; end if;
select coalesce(jsonb_agg(to_jsonb(q) order by q.creado_en desc,q.id desc),'[]'::jsonb) into resultado from (select s.*, case when p_admin then u.nombre else null end as nombre,case when p_admin then u.rol_id else null end as rol_id, (select coalesce(jsonb_agg(to_jsonb(m) order by m.id),'[]'::jsonb) from public.ath_soporte_mensajes m where m.solicitud_id=s.id) as mensajes from public.ath_soporte s left join public.usuarios u on u.id=s.usuario_id where (p_admin or s.usuario_id=auth.uid()) and (p_estado='' or s.estado=p_estado) order by s.creado_en desc,s.id desc limit 21 offset greatest(0,coalesce(p_offset,0))) q;
return resultado; end $$;


ALTER FUNCTION "public"."ath_soporte_listar"("p_admin" boolean, "p_estado" "text", "p_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_soporte_responder"("p_id" bigint, "p_admin" boolean, "p_mensaje" "text", "p_resolver" boolean) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare r integer; s public.ath_soporte%rowtype; begin
select rol_id into r from public.usuarios where id=auth.uid() and estado is true;
select * into s from public.ath_soporte where id=p_id for update;
if r is null or s.id is null or s.estado='resuelto' or (p_admin and r<>1) or (not p_admin and s.usuario_id<>auth.uid()) or (p_resolver and not p_admin) then raise exception 'Acceso denegado'; end if;
if p_mensaje is null or length(btrim(p_mensaje)) not between 2 and 1500 then raise exception 'Mensaje inválido'; end if;
if (select count(*) from public.ath_soporte_mensajes where solicitud_id=p_id and creado_en>now()-interval '1 hour')>=60 then raise exception 'Límite de mensajes'; end if;
insert into public.ath_soporte_mensajes(solicitud_id,equipo,mensaje) values(p_id,p_admin,btrim(p_mensaje));
update public.ath_soporte set estado=case when p_resolver then 'resuelto' when p_admin then 'atencion' else estado end where id=p_id;
insert into public.ath_notificaciones(usuario_id,titulo,mensaje,modulo) select id,case when p_resolver then 'Solicitud resuelta' else 'Respuesta de soporte' end,'Tienes una actualización en Ayuda y soporte.','avisos' from public.usuarios where estado is true and id<>auth.uid() and ((p_admin and id=s.usuario_id) or (not p_admin and rol_id=1)); end $$;


ALTER FUNCTION "public"."ath_soporte_responder"("p_id" bigint, "p_admin" boolean, "p_mensaje" "text", "p_resolver" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_v29_historial_vinculado"("p_deportista_id" "uuid") RETURNS TABLE("id" "uuid", "fecha" "date", "duracion_minutos" integer, "esfuerzo" integer, "ejercicios_realizados" "jsonb")
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.vinculos_entrenador v
    JOIN public.usuarios entrenador ON entrenador.id = v.entrenador_id
    WHERE v.entrenador_id = auth.uid()
      AND v.deportista_id = p_deportista_id
      AND v.estado = 'activo'
      AND entrenador.rol_id = 2 AND entrenador.estado IS TRUE
  ) THEN
    RAISE EXCEPTION 'No tienes acceso a este deportista';
  END IF;
  RETURN QUERY
  SELECT s.id, s.fecha, s.duracion_minutos, s.esfuerzo,
         s.ejercicios_realizados
  FROM public.sesiones_entrenamiento_ia s
  WHERE s.usuario_id = p_deportista_id
    AND s.fecha BETWEEN CURRENT_DATE - 89 AND CURRENT_DATE
  ORDER BY s.fecha DESC, s.creado_en DESC;
END;
$$;


ALTER FUNCTION "public"."ath_v29_historial_vinculado"("p_deportista_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_v29_resumen_vinculados"() RETURNS TABLE("deportista_id" "uuid", "deportista" "text", "sesiones_7d" bigint, "sesiones_30d" bigint, "minutos_30d" bigint, "esfuerzo_promedio_30d" numeric, "ultima_sesion" "date")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT v.deportista_id,
         COALESCE(u.nombre, 'Deportista')::text,
         COUNT(s.id) FILTER (WHERE s.fecha >= CURRENT_DATE - 6)::bigint,
         COUNT(s.id) FILTER (WHERE s.fecha >= CURRENT_DATE - 29)::bigint,
         COALESCE(SUM(s.duracion_minutos) FILTER (WHERE s.fecha >= CURRENT_DATE - 29),0)::bigint,
         ROUND(AVG(s.esfuerzo) FILTER (WHERE s.fecha >= CURRENT_DATE - 29),1),
         MAX(s.fecha)
  FROM public.vinculos_entrenador v
  JOIN public.usuarios u ON u.id = v.deportista_id
  JOIN public.usuarios entrenador ON entrenador.id = v.entrenador_id
  LEFT JOIN public.sesiones_entrenamiento_ia s
    ON s.usuario_id = v.deportista_id AND s.fecha <= CURRENT_DATE
  WHERE v.entrenador_id = auth.uid()
    AND v.estado = 'activo'
    AND entrenador.rol_id = 2 AND entrenador.estado IS TRUE
  GROUP BY v.deportista_id, u.nombre
  ORDER BY u.nombre;
$$;


ALTER FUNCTION "public"."ath_v29_resumen_vinculados"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_v48_anonimizar"("p_usuario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE s public.ath_solicitudes_eliminacion%ROWTYPE; token text;
BEGIN
 SELECT * INTO s FROM public.ath_solicitudes_eliminacion WHERE usuario_id=p_usuario FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud inexistente'; END IF;
 IF s.anonimizado_en IS NOT NULL THEN RETURN; END IF;
 IF s.estado NOT IN ('pendiente','error') THEN RAISE EXCEPTION 'Estado no elegible'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_usuario AND rol_id<>1)
 THEN RAISE EXCEPTION 'Cuenta inexistente o protegida'; END IF;
 token := replace(pg_catalog.gen_random_uuid()::text,'-','');
 -- Primero se eliminan comentarios propios y luego publicaciones propias (cascadas de respuestas).
 DELETE FROM public.ath_chat_mensajes WHERE usuario_id=p_usuario;
 DELETE FROM public.muro_comentarios WHERE usuario_id=p_usuario;
 DELETE FROM public.muro_comunidad WHERE usuario_id=p_usuario;
 DELETE FROM public.alimentacion_registros WHERE usuario_id=p_usuario;
 DELETE FROM public.planes_alimentacion_ia WHERE usuario_id=p_usuario;
 UPDATE public.usuarios SET nombre='Cuenta eliminada',
   rut='ELIM-' || token, correo='eliminado-' || token || '@invalid.local',
   telefono=NULL, fecha_nacimiento=NULL, apodo_publico=NULL,
   estado=false, updated_at=now()
 WHERE id=p_usuario AND rol_id<>1;
 UPDATE public.ath_solicitudes_eliminacion
 SET anonimizado_en=now(), estado='pendiente', ultimo_error=NULL WHERE usuario_id=p_usuario;
END $$;


ALTER FUNCTION "public"."ath_v48_anonimizar"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_v48_preparar_purga"("p_usuario" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE s public.ath_solicitudes_eliminacion%ROWTYPE; n bigint;
BEGIN
 SELECT * INTO s FROM public.ath_solicitudes_eliminacion WHERE usuario_id=p_usuario FOR UPDATE;
 IF NOT FOUND OR s.eliminar_despues_de IS NULL OR s.eliminar_despues_de>now() OR s.anonimizado_en IS NULL
 THEN RAISE EXCEPTION 'Solicitud inexistente o plazo no cumplido'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_usuario AND rol_id<>1)
 THEN RAISE EXCEPTION 'Cuenta inexistente o protegida'; END IF;
 IF s.purga_preparada_en IS NOT NULL THEN RETURN; END IF;
 -- No borrar rutinas que estén asignadas a terceros.
 IF EXISTS (SELECT 1 FROM public.rutinas r JOIN public.rutina_usuario ru ON ru.rutina_id=r.id
    WHERE r.entrenador_id=p_usuario AND ru.usuario_id<>p_usuario)
 OR EXISTS (SELECT 1 FROM public.rutinas r JOIN public.rutina_equipo re ON re.rutina_id=r.id
    WHERE r.entrenador_id=p_usuario) THEN
  RAISE EXCEPTION 'Rutinas compartidas: requiere transferencia o resolución manual';
 END IF;
 DELETE FROM public.entrenamientos_programados WHERE usuario_id=p_usuario;
 DELETE FROM public.sesiones_entrenamiento_ia WHERE usuario_id=p_usuario;
 DELETE FROM public.planes_entrenamiento_ia WHERE usuario_id=p_usuario;
 -- Quitar las referencias del autor, sin borrar asignaciones de otros usuarios.
 UPDATE public.rutina_usuario SET asignado_por=NULL WHERE asignado_por=p_usuario;
 UPDATE public.rutina_equipo SET asignado_por=NULL WHERE asignado_por=p_usuario;
 DELETE FROM public.rutina_usuario WHERE usuario_id=p_usuario;
 DELETE FROM public.rutinas WHERE entrenador_id=p_usuario;
 DELETE FROM public.ath_asistencia_individual WHERE entrenador_id=p_usuario OR deportista_id=p_usuario;
 DELETE FROM public.ath_avisos_individuales WHERE autor_id=p_usuario OR destinatario_id=p_usuario;
 DELETE FROM public.vinculos_entrenador WHERE entrenador_id=p_usuario OR deportista_id=p_usuario;
 DELETE FROM public.ath_chat_mensajes WHERE usuario_id=p_usuario;
 DELETE FROM public.ath_chat_participantes WHERE usuario_id=p_usuario;
 UPDATE public.ath_chats SET creador_id=NULL WHERE creador_id=p_usuario;
 DELETE FROM public.muro_comentarios WHERE usuario_id=p_usuario;
 DELETE FROM public.muro_comunidad WHERE usuario_id=p_usuario;
 DELETE FROM public.avisos WHERE autor_id=p_usuario;
 DELETE FROM public.alimentacion_registros WHERE usuario_id=p_usuario;
 DELETE FROM public.planes_alimentacion_ia WHERE usuario_id=p_usuario;
 DELETE FROM public.participantes_partido WHERE usuario_id=p_usuario;
 DELETE FROM public.asistencias WHERE deportista_id=p_usuario;
 DELETE FROM public.usuario_equipo WHERE usuario_id=p_usuario;
 DELETE FROM public.codigos_entrenador WHERE entrenador_id=p_usuario;
 UPDATE public.asistencias SET registrado_por=NULL WHERE registrado_por=p_usuario;
 UPDATE public.actividades SET creado_por=NULL WHERE creado_por=p_usuario;
 UPDATE public.ejercicios SET creado_por=NULL WHERE creado_por=p_usuario;
 UPDATE public.partidos_activos SET organizador_id=NULL WHERE organizador_id=p_usuario;
 -- Evitar perder la trazabilidad por errores de FK no contemplados.
 SELECT coalesce(sum(cantidad),0) INTO n FROM public.ath_v48_referencias_pendientes(p_usuario);
 IF n>0 THEN RAISE EXCEPTION 'Referencias restantes: %',n; END IF;
 UPDATE public.ath_solicitudes_eliminacion SET purga_preparada_en=now(),
  estado='procesando', ultimo_error=NULL WHERE usuario_id=p_usuario;
END $$;


ALTER FUNCTION "public"."ath_v48_preparar_purga"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_v48_referencias_pendientes"("p_usuario" "uuid") RETURNS TABLE("tabla" "text", "columna" "text", "cantidad" bigint)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE fk record; n bigint;
BEGIN
 FOR fk IN
  SELECT ns.nspname AS esquema, rel.relname AS nombre_tabla, att.attname AS nombre_columna
  FROM pg_catalog.pg_constraint c
  JOIN pg_catalog.pg_class rel ON rel.oid=c.conrelid
  JOIN pg_catalog.pg_namespace ns ON ns.oid=rel.relnamespace
  JOIN pg_catalog.pg_attribute att ON att.attrelid=rel.oid AND att.attnum=c.conkey[1]
  WHERE c.contype='f' AND c.confrelid='public.usuarios'::regclass
   AND array_length(c.conkey,1)=1 AND array_length(c.confkey,1)=1
   AND ns.nspname='public' AND rel.relname <> 'ath_solicitudes_eliminacion'
 LOOP
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE %I=$1',fk.esquema,fk.nombre_tabla,fk.nombre_columna)
   INTO n USING p_usuario;
  IF n>0 THEN tabla:=fk.nombre_tabla; columna:=fk.nombre_columna; cantidad:=n; RETURN NEXT; END IF;
 END LOOP;
END $_$;


ALTER FUNCTION "public"."ath_v48_referencias_pendientes"("p_usuario" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_validar_asignacion_individual"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare v_rol int;
begin
 select rol_id into v_rol from public.usuarios where id=auth.uid();
 if v_rol=2 then
   if not exists(select 1 from public.vinculos_entrenador v
     where v.entrenador_id=auth.uid() and v.deportista_id=new.usuario_id and v.estado='activo') then
     raise exception 'Primero debes vincularte con este deportista';
   end if;
 end if;
 return new;
end $$;


ALTER FUNCTION "public"."ath_validar_asignacion_individual"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ath_validar_mensaje_chat"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
 IF NEW.usuario_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Remitente inválido'; END IF;
 IF NEW.chat_id<>'00000000-0000-0000-0000-000000000001'::uuid AND NOT EXISTS(SELECT 1 FROM public.ath_chat_participantes WHERE chat_id=NEW.chat_id AND usuario_id=auth.uid()) THEN RAISE EXCEPTION 'No participas en esta conversación'; END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "public"."ath_validar_mensaje_chat"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athletix_historial_deportista_entrenador"("p_deportista_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select coalesce(jsonb_agg(jsonb_build_object(
   'id', h.id,
   'fecha', h.fecha,
   'duracion_minutos', h.duracion_minutos,
   'esfuerzo', h.esfuerzo,
   'sesion_indice', h.sesion_indice,
   'ejercicios_realizados', h.ejercicios_realizados
 ) order by h.fecha desc, h.creado_en desc), '[]'::jsonb)
 from (
   select s.id, s.fecha, s.duracion_minutos, s.esfuerzo,
          s.sesion_indice, s.ejercicios_realizados, s.creado_en
   from public.sesiones_entrenamiento_ia s
   where s.usuario_id = p_deportista_id
     and s.fecha between current_date - 89 and current_date
     and auth.uid() is not null
     and exists (
       select 1
       from public.usuario_equipo entrenador
       join public.usuario_equipo deportista
         on deportista.equipo_id = entrenador.equipo_id
        and deportista.usuario_id = p_deportista_id
        and deportista.activo = true
        and deportista.funcion_en_equipo = 'DEPORTISTA'
       join public.equipos e on e.id = entrenador.equipo_id and e.estado = true
       where entrenador.usuario_id = auth.uid()
         and entrenador.activo = true
         and entrenador.funcion_en_equipo = 'ENTRENADOR'
     )
   order by s.fecha desc, s.creado_en desc
   limit 100
 ) h;
$$;


ALTER FUNCTION "public"."athletix_historial_deportista_entrenador"("p_deportista_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athletix_resumen_deportistas_entrenador"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'equipo_id', datos.equipo_id,
    'equipo', datos.equipo,
    'deportista_id', datos.deportista_id,
    'deportista', datos.deportista,
    'sesiones_30d', datos.sesiones_30d,
    'minutos_30d', datos.minutos_30d,
    'esfuerzo_promedio_30d', datos.esfuerzo_promedio_30d,
    'ultima_sesion', datos.ultima_sesion,
    'sesiones_7d', datos.sesiones_7d
  ) order by datos.equipo, datos.deportista), '[]'::jsonb)
  from (
    select e.id as equipo_id, e.nombre as equipo,
           u.id as deportista_id, u.nombre as deportista,
           (select count(*) from public.sesiones_entrenamiento_ia s
            where s.usuario_id = u.id and s.fecha >= current_date - 29
              and s.fecha <= current_date) as sesiones_30d,
           (select coalesce(sum(s.duracion_minutos),0) from public.sesiones_entrenamiento_ia s
            where s.usuario_id = u.id and s.fecha >= current_date - 29
              and s.fecha <= current_date) as minutos_30d,
           (select round(avg(s.esfuerzo)::numeric,1) from public.sesiones_entrenamiento_ia s
            where s.usuario_id = u.id and s.fecha >= current_date - 29
              and s.fecha <= current_date) as esfuerzo_promedio_30d,
           (select max(s.fecha) from public.sesiones_entrenamiento_ia s
            where s.usuario_id = u.id) as ultima_sesion,
           (select count(*) from public.sesiones_entrenamiento_ia s
            where s.usuario_id = u.id and s.fecha >= current_date - 6
              and s.fecha <= current_date) as sesiones_7d
    from public.usuario_equipo coach
    join public.equipos e on e.id = coach.equipo_id and e.estado = true
    join public.usuario_equipo athlete on athlete.equipo_id = coach.equipo_id
      and athlete.activo = true and athlete.funcion_en_equipo = 'DEPORTISTA'
    join public.usuarios u on u.id = athlete.usuario_id
    where coach.usuario_id = (select auth.uid())
      and coach.activo = true and coach.funcion_en_equipo = 'ENTRENADOR'
      and (select auth.uid()) is not null
    group by e.id, e.nombre, u.id, u.nombre
  ) datos;
$$;


ALTER FUNCTION "public"."athletix_resumen_deportistas_entrenador"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."athletix_validar_programacion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE propietario uuid;
DECLARE sesion_usuario uuid;
DECLARE sesion_plan uuid;
DECLARE sesion_num integer;
BEGIN
  SELECT usuario_id INTO propietario FROM public.planes_entrenamiento_ia WHERE id = NEW.plan_id;
  IF propietario IS DISTINCT FROM NEW.usuario_id THEN
    RAISE EXCEPTION 'El plan no pertenece al deportista';
  END IF;
  IF NEW.sesion_realizada_id IS NOT NULL THEN
    SELECT usuario_id, plan_id, sesion_indice INTO sesion_usuario, sesion_plan, sesion_num
    FROM public.sesiones_entrenamiento_ia WHERE id = NEW.sesion_realizada_id;
    IF sesion_usuario IS DISTINCT FROM NEW.usuario_id OR sesion_plan IS DISTINCT FROM NEW.plan_id OR sesion_num IS DISTINCT FROM NEW.sesion_indice THEN
      RAISE EXCEPTION 'El registro no corresponde al entrenamiento programado';
    END IF;
  END IF;
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."athletix_validar_programacion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_activity"("p_actividad_id" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.actividades a
      WHERE a.id = p_actividad_id
        AND public.is_team_trainer(a.equipo_id)
    );
$$;


ALTER FUNCTION "public"."can_manage_activity"("p_actividad_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_manage_routine"("p_rutina_id" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT COALESCE(
        public.is_admin()
        OR (
            public.current_app_role() = 'ENTRENADOR'
            AND EXISTS (
                SELECT 1
                FROM public.rutinas r
                WHERE r.id = p_rutina_id
                  AND r.entrenador_id = auth.uid()
            )
        ),
        false
    );
$$;


ALTER FUNCTION "public"."can_manage_routine"("p_rutina_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."can_view_routine"("p_rutina_id" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT COALESCE(
        public.current_app_role() IS NOT NULL
        AND (
            public.is_admin()

            OR (
                public.current_app_role() = 'ENTRENADOR'
                AND EXISTS (
                    SELECT 1
                    FROM public.rutinas r
                    WHERE r.id = p_rutina_id
                      AND r.entrenador_id = auth.uid()
                )
            )

            OR EXISTS (
                SELECT 1
                FROM public.rutina_usuario ru
                WHERE ru.rutina_id = p_rutina_id
                  AND ru.usuario_id = auth.uid()
                  AND ru.activo = true
            )

            OR EXISTS (
                SELECT 1
                FROM public.rutina_equipo re
                JOIN public.usuario_equipo ue
                  ON ue.equipo_id = re.equipo_id
                WHERE re.rutina_id = p_rutina_id
                  AND re.activo = true
                  AND ue.usuario_id = auth.uid()
                  AND ue.activo = true
            )
        ),
        false
    );
$$;


ALTER FUNCTION "public"."can_view_routine"("p_rutina_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."comunidad_guardar_apodo"("nuevo_apodo" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE limpio text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión';
  END IF;
  limpio := NULLIF(btrim(nuevo_apodo), '');
  IF limpio IS NOT NULL AND (char_length(limpio) < 3 OR char_length(limpio) > 24
    OR limpio !~ '^[[:alnum:]_.-]+$') THEN
    RAISE EXCEPTION 'Apodo inválido: usa entre 3 y 24 caracteres (letras, números, _, punto o guion)';
  END IF;
  UPDATE public.usuarios SET apodo_publico = limpio WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró tu perfil';
  END IF;
END;
$_$;


ALTER FUNCTION "public"."comunidad_guardar_apodo"("nuevo_apodo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consumir_intento_login"("p_clave" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
DECLARE
    permitido BOOLEAN;
BEGIN
    IF p_clave IS NULL
       OR p_clave !~ '^[0-9a-f]{64}$' THEN
        RETURN FALSE;
    END IF;

    INSERT INTO public.login_intentos AS li (
        rut_clave,
        intentos,
        inicio_ventana
    )
    VALUES (
        p_clave,
        1,
        NOW()
    )
    ON CONFLICT (rut_clave)
    DO UPDATE SET
        intentos = CASE
            WHEN li.inicio_ventana <= NOW() - INTERVAL '15 minutes'
                THEN 1
            ELSE li.intentos + 1
        END,
        inicio_ventana = CASE
            WHEN li.inicio_ventana <= NOW() - INTERVAL '15 minutes'
                THEN NOW()
            ELSE li.inicio_ventana
        END
    RETURNING intentos <= 10 INTO permitido;

    RETURN COALESCE(permitido, FALSE);
END;
$_$;


ALTER FUNCTION "public"."consumir_intento_login"("p_clave" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_app_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT upper(trim(r.nombre))
  FROM public.usuarios u
  JOIN public.roles r ON r.id = u.rol_id
  WHERE u.id = auth.uid()
    AND u.estado = true
  LIMIT 1;
$$;


ALTER FUNCTION "public"."current_app_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."eliminar_rutina_entrenador"("p_rutina_id" integer) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_rutina_id integer;
BEGIN
  IF auth.uid() IS NULL OR public.current_app_role() IS DISTINCT FROM 'ENTRENADOR' THEN
    RAISE EXCEPTION 'Solo un entrenador autenticado puede eliminar rutinas.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_rutina_id
  FROM public.rutinas
  WHERE id = p_rutina_id AND entrenador_id = auth.uid()
  FOR UPDATE;

  IF v_rutina_id IS NULL THEN
    RAISE EXCEPTION 'La rutina no existe o no te pertenece.' USING ERRCODE = '42501';
  END IF;

  -- Se incluyen asignaciones inactivas: también forman parte del historial.
  IF EXISTS (SELECT 1 FROM public.rutina_usuario WHERE rutina_id = p_rutina_id)
     OR EXISTS (SELECT 1 FROM public.rutina_equipo WHERE rutina_id = p_rutina_id) THEN
    RAISE EXCEPTION 'La rutina tiene asignaciones. Archívala en lugar de eliminarla.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.detalle_rutina WHERE rutina_id = p_rutina_id;
  DELETE FROM public.rutinas
  WHERE id = p_rutina_id AND entrenador_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo eliminar la rutina.' USING ERRCODE = '42501';
  END IF;
END;
$$;


ALTER FUNCTION "public"."eliminar_rutina_entrenador"("p_rutina_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(public.current_app_role() = 'ADMINISTRADOR', false);
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_member"("p_equipo_id" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuario_equipo ue
        JOIN public.usuarios u
            ON u.id = ue.usuario_id
        WHERE ue.usuario_id = auth.uid()
          AND ue.equipo_id = p_equipo_id
          AND ue.activo IS TRUE
          AND u.estado IS TRUE
    );
$$;


ALTER FUNCTION "public"."is_team_member"("p_equipo_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_team_trainer"("p_equipo_id" integer) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuario_equipo ue
        JOIN public.usuarios u
            ON u.id = ue.usuario_id
        WHERE ue.usuario_id = auth.uid()
          AND ue.equipo_id = p_equipo_id
          AND ue.funcion_en_equipo = 'ENTRENADOR'
          AND ue.activo IS TRUE
          AND u.estado IS TRUE
          AND u.rol_id = 2
    );
$$;


ALTER FUNCTION "public"."is_team_trainer"("p_equipo_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."listar_integrantes_equipo_deportista"("p_equipo_id" integer) RETURNS TABLE("asignacion_id" bigint, "nombre" "text", "funcion_en_equipo" "text", "cuenta_activa" boolean, "soy_yo" boolean)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  -- La sesión debe corresponder a un deportista que pertenezca
  -- ACTUALMENTE al equipo consultado. La función de membresía
  -- existente usa auth.uid() y comprueba usuario_equipo.activo.
  IF auth.uid() IS NULL
     OR public.current_app_role() IS DISTINCT FROM 'DEPORTISTA'
     OR NOT public.is_team_member(p_equipo_id)
  THEN
    RAISE EXCEPTION 'No tienes permiso para consultar los integrantes de este equipo.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT
      ue.id AS asignacion_id,
      u.nombre::text AS nombre,
      ue.funcion_en_equipo::text AS funcion_en_equipo,
      u.estado AS cuenta_activa,
      (ue.usuario_id = auth.uid()) AS soy_yo
    FROM public.usuario_equipo AS ue
    JOIN public.usuarios AS u ON u.id = ue.usuario_id
    WHERE ue.equipo_id = p_equipo_id
      AND ue.activo IS TRUE
    ORDER BY u.nombre, ue.id;
END;
$$;


ALTER FUNCTION "public"."listar_integrantes_equipo_deportista"("p_equipo_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_cancelar_partido"("p_partido_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=auth.uid() AND estado IS TRUE) THEN RAISE EXCEPTION 'Inicia sesión'; END IF;
  DELETE FROM public.partidos_activos WHERE id=p_partido_id AND organizador_id=auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'No puedes cancelar este partido'; END IF;
END $$;


ALTER FUNCTION "public"."match_cancelar_partido"("p_partido_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_crear_partido"("p_osm_id" "text", "p_nombre" "text", "p_direccion" "text", "p_latitud" double precision, "p_longitud" double precision, "p_disciplinas" "text"[], "p_deporte" "text", "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_usuario uuid := auth.uid(); v_lugar integer; v_partido integer;
BEGIN
  IF v_usuario IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_usuario AND estado = true) THEN
    RAISE EXCEPTION 'Usuario no autorizado';
  END IF;
  IF nullif(btrim(p_osm_id),'') IS NULL OR nullif(btrim(p_nombre),'') IS NULL
     OR nullif(btrim(p_deporte),'') IS NULL OR p_latitud IS NULL OR p_longitud IS NULL
     OR p_latitud NOT BETWEEN -90 AND 90 OR p_longitud NOT BETWEEN -180 AND 180
     OR p_fecha_hora IS NULL OR p_fecha_hora <= now() OR p_capacidad IS NULL OR p_capacidad < 2 OR p_capacidad > 30 THEN
    RAISE EXCEPTION 'Datos del partido no válidos';
  END IF;
  INSERT INTO public.lugares_deportivos(osm_id,nombre,direccion,latitud,longitud,disciplinas)
  VALUES (p_osm_id,p_nombre,p_direccion,p_latitud,p_longitud,p_disciplinas)
  ON CONFLICT (osm_id) WHERE osm_id IS NOT NULL DO UPDATE SET osm_id = EXCLUDED.osm_id
  RETURNING id INTO v_lugar;
  INSERT INTO public.partidos_activos(lugar_id,deporte,capacidad_maxima,jugadores_actuales,fecha_hora,organizador_id)
  VALUES (v_lugar,p_deporte,p_capacidad,1,p_fecha_hora,v_usuario) RETURNING id INTO v_partido;
  INSERT INTO public.participantes_partido(partido_id,usuario_id) VALUES (v_partido,v_usuario);
  RETURN v_partido;
END $$;


ALTER FUNCTION "public"."match_crear_partido"("p_osm_id" "text", "p_nombre" "text", "p_direccion" "text", "p_latitud" double precision, "p_longitud" double precision, "p_disciplinas" "text"[], "p_deporte" "text", "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_es_admin_muro"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid())
      AND u.rol_id = 1
      AND u.estado = true
  );
$$;


ALTER FUNCTION "public"."match_es_admin_muro"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_salir_partido"("p_partido_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_usuario uuid := auth.uid(); v_organizador uuid;
BEGIN
  IF v_usuario IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=v_usuario AND estado IS TRUE) THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  SELECT organizador_id INTO v_organizador FROM public.partidos_activos WHERE id=p_partido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partido no encontrado'; END IF;
  IF v_organizador=v_usuario THEN RAISE EXCEPTION 'El organizador debe cancelar el partido'; END IF;
  DELETE FROM public.participantes_partido WHERE partido_id=p_partido_id AND usuario_id=v_usuario;
  IF NOT FOUND THEN RAISE EXCEPTION 'No estás inscrito'; END IF;
  UPDATE public.partidos_activos SET jugadores_actuales=(SELECT count(*) FROM public.participantes_partido WHERE partido_id=p_partido_id) WHERE id=p_partido_id;
END $$;


ALTER FUNCTION "public"."match_salir_partido"("p_partido_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."match_unirse_partido"("p_partido_id" integer) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE v_usuario uuid := auth.uid(); v_partido public.partidos_activos%ROWTYPE;
BEGIN
  IF v_usuario IS NULL OR NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id = v_usuario AND estado = true) THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  SELECT * INTO v_partido FROM public.partidos_activos WHERE id = p_partido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Partido no encontrado'; END IF;
  IF v_partido.fecha_hora <= now() THEN RAISE EXCEPTION 'El partido ya comenzó'; END IF;
  IF EXISTS (SELECT 1 FROM public.participantes_partido WHERE partido_id=p_partido_id AND usuario_id=v_usuario) THEN RAISE EXCEPTION 'Ya estás inscrito'; END IF;
  IF (SELECT count(*) FROM public.participantes_partido WHERE partido_id=p_partido_id) >= v_partido.capacidad_maxima THEN RAISE EXCEPTION 'No quedan cupos'; END IF;
  INSERT INTO public.participantes_partido(partido_id,usuario_id) VALUES (p_partido_id,v_usuario);
  UPDATE public.partidos_activos SET jugadores_actuales=(SELECT count(*) FROM public.participantes_partido WHERE partido_id=p_partido_id) WHERE id=p_partido_id;
END $$;


ALTER FUNCTION "public"."match_unirse_partido"("p_partido_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."puede_ver_video_ejercicio"("ruta_archivo" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.usuarios u
        WHERE u.id = (SELECT auth.uid()) AND u.estado IS TRUE
          AND (
              u.rol_id IN (1, 2)
              OR (
                  u.rol_id = 3
                  AND EXISTS (
                      SELECT 1
                      FROM public.ejercicios e
                      JOIN public.detalle_rutina dr
                        ON dr.ejercicio_id = e.id
                      WHERE e.video_url = 'storage:' || ruta_archivo
                        AND (
                            EXISTS (
                                SELECT 1
                                FROM public.rutina_usuario ru
                                WHERE ru.rutina_id = dr.rutina_id
                                  AND ru.usuario_id = (SELECT auth.uid())
                                  AND ru.activo IS TRUE
                            )
                            OR EXISTS (
                                SELECT 1
                                FROM public.rutina_equipo re
                                JOIN public.usuario_equipo ue
                                  ON ue.equipo_id = re.equipo_id
                                WHERE re.rutina_id = dr.rutina_id
                                  AND re.activo IS TRUE
                                  AND ue.usuario_id = (SELECT auth.uid())
                                  AND ue.activo IS TRUE
                            )
                        )
                  )
              )
          )
    );
$$;


ALTER FUNCTION "public"."puede_ver_video_ejercicio"("ruta_archivo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_asistencia"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_tipo text;
  v_equipo_id integer;
BEGIN
  SELECT tipo, equipo_id
  INTO v_tipo, v_equipo_id
  FROM public.actividades
  WHERE id = NEW.actividad_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'La actividad indicada no existe.';
  END IF;

  IF v_tipo <> 'ENTRENAMIENTO' THEN
    RAISE EXCEPTION
      'Solo se puede registrar asistencia en actividades de tipo ENTRENAMIENTO.';
  END IF;

  IF v_equipo_id IS NULL THEN
    RAISE EXCEPTION
      'El entrenamiento debe estar asociado a un equipo.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.usuario_equipo ue
    WHERE ue.usuario_id = NEW.deportista_id
      AND ue.equipo_id = v_equipo_id
      AND ue.funcion_en_equipo = 'DEPORTISTA'
      AND ue.activo = true
  ) THEN
    RAISE EXCEPTION
      'El deportista no pertenece al equipo de este entrenamiento.';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validar_asistencia"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_sesion_ia_propietario"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
 if not exists (select 1 from public.planes_entrenamiento_ia p where p.id = new.plan_id and p.usuario_id = new.usuario_id) then
  raise exception 'El plan no pertenece al usuario';
 end if;
 if new.usuario_id <> auth.uid() then
  raise exception 'No autorizado';
 end if;
 return new;
end; $$;


ALTER FUNCTION "public"."validar_sesion_ia_propietario"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."actividades" (
    "id" integer NOT NULL,
    "titulo" "text" NOT NULL,
    "fecha_hora" timestamp with time zone NOT NULL,
    "equipo_id" integer,
    "creado_por" "uuid",
    "tipo" "text" DEFAULT 'ENTRENAMIENTO'::"text" NOT NULL,
    "lugar" "text",
    "descripcion" "text",
    "estado" "text" DEFAULT 'PROGRAMADA'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fecha_fin" timestamp with time zone,
    CONSTRAINT "actividades_estado_check" CHECK (("estado" = ANY (ARRAY['PROGRAMADA'::"text", 'MODIFICADA'::"text", 'CANCELADA'::"text"]))),
    CONSTRAINT "actividades_fecha_fin_check" CHECK ((("fecha_fin" IS NULL) OR ("fecha_fin" > "fecha_hora"))),
    CONSTRAINT "actividades_tipo_check" CHECK (("tipo" = ANY (ARRAY['ENTRENAMIENTO'::"text", 'PARTIDO'::"text", 'COMPETENCIA'::"text", 'REUNION'::"text", 'OTRO'::"text"])))
);


ALTER TABLE "public"."actividades" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."actividades_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."actividades_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."actividades_id_seq" OWNED BY "public"."actividades"."id";



CREATE TABLE IF NOT EXISTS "public"."alimentacion_registros" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "tipo_comida" "text" NOT NULL,
    "nota" "text" DEFAULT ''::"text" NOT NULL,
    "alimentos" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "observaciones" "text" DEFAULT ''::"text" NOT NULL,
    "calorias" numeric(12,1) DEFAULT 0 NOT NULL,
    "proteinas_g" numeric(12,1) DEFAULT 0 NOT NULL,
    "carbohidratos_g" numeric(12,1) DEFAULT 0 NOT NULL,
    "grasas_g" numeric(12,1) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "alimentacion_registros_alimentos_check" CHECK (("jsonb_typeof"("alimentos") = 'array'::"text")),
    CONSTRAINT "alimentacion_registros_calorias_check" CHECK (("calorias" >= (0)::numeric)),
    CONSTRAINT "alimentacion_registros_carbohidratos_g_check" CHECK (("carbohidratos_g" >= (0)::numeric)),
    CONSTRAINT "alimentacion_registros_grasas_g_check" CHECK (("grasas_g" >= (0)::numeric)),
    CONSTRAINT "alimentacion_registros_nota_check" CHECK (("char_length"("nota") <= 250)),
    CONSTRAINT "alimentacion_registros_observaciones_check" CHECK (("char_length"("observaciones") <= 600)),
    CONSTRAINT "alimentacion_registros_proteinas_g_check" CHECK (("proteinas_g" >= (0)::numeric)),
    CONSTRAINT "alimentacion_registros_tipo_comida_check" CHECK (("tipo_comida" = ANY (ARRAY['Desayuno'::"text", 'Almuerzo'::"text", 'Once'::"text", 'Cena'::"text", 'Colación'::"text", 'Otra'::"text"])))
);

ALTER TABLE ONLY "public"."alimentacion_registros" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."alimentacion_registros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."asistencias" (
    "id" integer NOT NULL,
    "actividad_id" integer NOT NULL,
    "deportista_id" "uuid" NOT NULL,
    "estado_asistencia" "text" DEFAULT 'AUSENTE'::"text" NOT NULL,
    "registrado_por" "uuid",
    "observacion" "text",
    "fecha_registro" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "asistencias_estado_check" CHECK (("estado_asistencia" = ANY (ARRAY['PRESENTE'::"text", 'AUSENTE'::"text", 'JUSTIFICADO'::"text"])))
);


ALTER TABLE "public"."asistencias" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."asistencias_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."asistencias_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."asistencias_id_seq" OWNED BY "public"."asistencias"."id";



CREATE TABLE IF NOT EXISTS "public"."ath_admin_auditoria" (
    "id" bigint NOT NULL,
    "administrador_id" "uuid" NOT NULL,
    "accion" "text" NOT NULL,
    "recurso" "text" NOT NULL,
    "recurso_id" "text" NOT NULL,
    "motivo" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ath_admin_auditoria" OWNER TO "postgres";


ALTER TABLE "public"."ath_admin_auditoria" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_admin_auditoria_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_asistencia_individual" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entrenador_id" "uuid" NOT NULL,
    "deportista_id" "uuid" NOT NULL,
    "fecha" "date" NOT NULL,
    "estado" "text" NOT NULL,
    "observacion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_asistencia_individual_estado_check" CHECK (("estado" = ANY (ARRAY['PRESENTE'::"text", 'AUSENTE'::"text", 'JUSTIFICADO'::"text"]))),
    CONSTRAINT "ath_asistencia_individual_observacion_check" CHECK (("char_length"("observacion") <= 500))
);


ALTER TABLE "public"."ath_asistencia_individual" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_avisos_individuales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "destinatario_id" "uuid",
    "titulo" "text" NOT NULL,
    "mensaje" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_avisos_individuales_mensaje_check" CHECK ((("char_length"("mensaje") >= 1) AND ("char_length"("mensaje") <= 2000))),
    CONSTRAINT "ath_avisos_individuales_titulo_check" CHECK ((("char_length"("titulo") >= 1) AND ("char_length"("titulo") <= 100)))
);


ALTER TABLE "public"."ath_avisos_individuales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_bloqueos" (
    "usuario_id" "uuid" NOT NULL,
    "bloqueado_id" "uuid" NOT NULL,
    CONSTRAINT "ath_bloqueos_check" CHECK (("usuario_id" <> "bloqueado_id"))
);


ALTER TABLE "public"."ath_bloqueos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chat_estado" (
    "chat_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "leido" timestamp with time zone,
    "publicado" timestamp with time zone,
    "escribiendo" timestamp with time zone
);


ALTER TABLE "public"."ath_chat_estado" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chat_invitaciones" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "invitado_id" "uuid" NOT NULL,
    "invitador_id" "uuid" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "respondido_en" timestamp with time zone,
    CONSTRAINT "ath_chat_invitaciones_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aceptada'::"text", 'rechazada'::"text"]))),
    CONSTRAINT "ath_invitacion_distintos" CHECK (("invitado_id" <> "invitador_id"))
);


ALTER TABLE "public"."ath_chat_invitaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chat_mensajes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "contenido" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_chat_mensajes_contenido_check" CHECK ((("char_length"(TRIM(BOTH FROM "contenido")) >= 1) AND ("char_length"(TRIM(BOTH FROM "contenido")) <= 2000)))
);


ALTER TABLE "public"."ath_chat_mensajes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chat_participantes" (
    "chat_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "unido_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ath_chat_participantes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chat_preferencias" (
    "usuario_id" "uuid" NOT NULL,
    "lectura" boolean DEFAULT false NOT NULL,
    "escritura" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."ath_chat_preferencias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chat_solicitudes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "remitente_id" "uuid" NOT NULL,
    "destinatario_id" "uuid" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "chat_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "respondido_en" timestamp with time zone,
    CONSTRAINT "ath_chat_solicitudes_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aceptada'::"text", 'rechazada'::"text"]))),
    CONSTRAINT "ath_solicitud_distintos" CHECK (("remitente_id" <> "destinatario_id"))
);


ALTER TABLE "public"."ath_chat_solicitudes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "nombre" "text",
    "creador_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_chats_tipo_check" CHECK (("tipo" = ANY (ARRAY['general'::"text", 'privado'::"text", 'grupo'::"text"])))
);


ALTER TABLE "public"."ath_chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_denuncias" (
    "id" bigint NOT NULL,
    "usuario_id" "uuid",
    "tipo" "text" NOT NULL,
    "objeto" "text" NOT NULL,
    "motivo" "text" NOT NULL,
    "evidencia" "text",
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resuelto_por" "uuid",
    "resuelto_en" timestamp with time zone,
    "medida" "text",
    "nota_resolucion" "text",
    "denunciado_id" "uuid"
);


ALTER TABLE "public"."ath_denuncias" OWNER TO "postgres";


ALTER TABLE "public"."ath_denuncias" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_denuncias_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_dispositivos_push" (
    "token" "text" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_dispositivos_push_token_check" CHECK ((("length"("token") >= 20) AND ("length"("token") <= 4096)))
);


ALTER TABLE "public"."ath_dispositivos_push" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_edge_cuotas" (
    "usuario_id" "uuid" NOT NULL,
    "servicio" "text" NOT NULL,
    "ventana" timestamp with time zone NOT NULL,
    "usos" integer DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."ath_edge_cuotas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_evaluaciones_deportivas" (
    "id" bigint NOT NULL,
    "deportista_id" "uuid" NOT NULL,
    "entrenador_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "prueba" "text" NOT NULL,
    "unidad" "text" NOT NULL,
    "valor" numeric NOT NULL,
    "sentido" "text" NOT NULL,
    "observacion" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "ath_evaluaciones_deportivas_observacion_check" CHECK (("char_length"("observacion") <= 500)),
    CONSTRAINT "ath_evaluaciones_deportivas_prueba_check" CHECK ((("char_length"("prueba") >= 1) AND ("char_length"("prueba") <= 100))),
    CONSTRAINT "ath_evaluaciones_deportivas_sentido_check" CHECK (("sentido" = ANY (ARRAY['mayor'::"text", 'menor'::"text"]))),
    CONSTRAINT "ath_evaluaciones_deportivas_unidad_check" CHECK (("unidad" = ANY (ARRAY['s'::"text", 'min'::"text", 'm'::"text", 'cm'::"text", 'kg'::"text", 'repeticiones'::"text", 'puntos'::"text"]))),
    CONSTRAINT "ath_evaluaciones_deportivas_valor_check" CHECK ((("valor" >= (0)::numeric) AND ("valor" <= (1000000)::numeric)))
);


ALTER TABLE "public"."ath_evaluaciones_deportivas" OWNER TO "postgres";


ALTER TABLE "public"."ath_evaluaciones_deportivas" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_evaluaciones_deportivas_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_match_cache_osm" (
    "zona" "text" NOT NULL,
    "elementos" "jsonb" NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_match_cache_osm_elementos_check" CHECK (("jsonb_typeof"("elementos") = 'array'::"text"))
);


ALTER TABLE "public"."ath_match_cache_osm" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_notificaciones" (
    "id" bigint NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "mensaje" "text" NOT NULL,
    "modulo" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "leida" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ath_notificaciones_modulo_check" CHECK (("modulo" = ANY (ARRAY['rutinas'::"text", 'avisos'::"text", 'comunidad'::"text", 'actividades'::"text", 'mapa'::"text", 'vinculos'::"text"])))
);


ALTER TABLE "public"."ath_notificaciones" OWNER TO "postgres";


ALTER TABLE "public"."ath_notificaciones" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_notificaciones_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_nutricion_agua" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "fecha" "date" NOT NULL,
    "ml" integer NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_nutricion_agua_ml_check" CHECK ((("ml" >= 1) AND ("ml" <= 2000)))
);


ALTER TABLE "public"."ath_nutricion_agua" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_nutricion_objetivos" (
    "usuario_id" "uuid" NOT NULL,
    "calorias" numeric,
    "proteinas" numeric,
    "carbohidratos" numeric,
    "grasas" numeric,
    "agua" numeric,
    CONSTRAINT "ath_nutricion_objetivos_agua_check" CHECK ((("agua" > (0)::numeric) AND ("agua" <= (15000)::numeric))),
    CONSTRAINT "ath_nutricion_objetivos_calorias_check" CHECK ((("calorias" > (0)::numeric) AND ("calorias" <= (20000)::numeric))),
    CONSTRAINT "ath_nutricion_objetivos_carbohidratos_check" CHECK ((("carbohidratos" > (0)::numeric) AND ("carbohidratos" <= (3000)::numeric))),
    CONSTRAINT "ath_nutricion_objetivos_grasas_check" CHECK ((("grasas" > (0)::numeric) AND ("grasas" <= (2000)::numeric))),
    CONSTRAINT "ath_nutricion_objetivos_proteinas_check" CHECK ((("proteinas" > (0)::numeric) AND ("proteinas" <= (2000)::numeric)))
);


ALTER TABLE "public"."ath_nutricion_objetivos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_perfil_deportivo" (
    "usuario_id" "uuid" NOT NULL,
    "deporte" "text" DEFAULT ''::"text" NOT NULL,
    "nivel" "text" DEFAULT 'Principiante'::"text" NOT NULL,
    "objetivo" "text" DEFAULT 'Mejorar condición física'::"text" NOT NULL,
    "frecuencia" integer DEFAULT 3 NOT NULL,
    "preferencias" "text" DEFAULT ''::"text" NOT NULL,
    "usar_ia" boolean DEFAULT false NOT NULL,
    CONSTRAINT "ath_perfil_deportivo_deporte_check" CHECK (("char_length"("deporte") <= 80)),
    CONSTRAINT "ath_perfil_deportivo_frecuencia_check" CHECK ((("frecuencia" >= 0) AND ("frecuencia" <= 7))),
    CONSTRAINT "ath_perfil_deportivo_nivel_check" CHECK (("nivel" = ANY (ARRAY['Principiante'::"text", 'Intermedio'::"text", 'Avanzado'::"text"]))),
    CONSTRAINT "ath_perfil_deportivo_objetivo_check" CHECK (("char_length"("objetivo") <= 100)),
    CONSTRAINT "ath_perfil_deportivo_preferencias_check" CHECK (("char_length"("preferencias") <= 400))
);


ALTER TABLE "public"."ath_perfil_deportivo" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_preferencias_privacidad" (
    "usuario_id" "uuid" NOT NULL,
    "notificaciones" boolean DEFAULT true NOT NULL,
    "mostrar_conexion" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."ath_preferencias_privacidad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_purgas_resumen" (
    "id" bigint NOT NULL,
    "completado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resultado" "text" DEFAULT 'completado'::"text" NOT NULL
);


ALTER TABLE "public"."ath_purgas_resumen" OWNER TO "postgres";


ALTER TABLE "public"."ath_purgas_resumen" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_purgas_resumen_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_push_envios" (
    "notificacion_id" bigint NOT NULL,
    "request_id" bigint,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ath_push_envios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_rutina_sesiones" (
    "id" "uuid" NOT NULL,
    "deportista_id" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "rutina_id" bigint NOT NULL,
    "nombre" "text" NOT NULL,
    "fecha" timestamp with time zone DEFAULT "now"() NOT NULL,
    "segundos" integer NOT NULL,
    "ejercicios" "jsonb" NOT NULL,
    CONSTRAINT "ath_rutina_sesiones_ejercicios_check" CHECK ((("jsonb_typeof"("ejercicios") = 'array'::"text") AND ("octet_length"(("ejercicios")::"text") < 100000))),
    CONSTRAINT "ath_rutina_sesiones_nombre_check" CHECK (("length"("nombre") <= 250)),
    CONSTRAINT "ath_rutina_sesiones_segundos_check" CHECK ((("segundos" >= 1) AND ("segundos" <= 86400)))
);


ALTER TABLE "public"."ath_rutina_sesiones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_solicitudes_eliminacion" (
    "usuario_id" "uuid" NOT NULL,
    "solicitado_por" "uuid" NOT NULL,
    "solicitado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "eliminar_despues_de" timestamp with time zone DEFAULT ("now"() + '90 days'::interval) NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "ultimo_error" "text",
    "anonimizado_en" timestamp with time zone,
    "purga_preparada_en" timestamp with time zone,
    CONSTRAINT "ath_solicitudes_eliminacion_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'procesando'::"text", 'completado'::"text", 'error'::"text"])))
);


ALTER TABLE "public"."ath_solicitudes_eliminacion" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ath_soporte" (
    "id" bigint NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "mensaje" "text" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "respuesta" "text",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "categoria" "text" DEFAULT 'otra'::"text" NOT NULL,
    CONSTRAINT "ath_soporte_categoria_check" CHECK (("categoria" = ANY (ARRAY['tecnico'::"text", 'cuenta'::"text", 'privacidad'::"text", 'sugerencia'::"text", 'otra'::"text"]))),
    CONSTRAINT "ath_soporte_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'atencion'::"text", 'resuelto'::"text"]))),
    CONSTRAINT "ath_soporte_mensaje_check" CHECK ((("char_length"("btrim"("mensaje")) >= 10) AND ("char_length"("btrim"("mensaje")) <= 1500))),
    CONSTRAINT "ath_soporte_respuesta_check" CHECK ((("char_length"("btrim"("respuesta")) >= 2) AND ("char_length"("btrim"("respuesta")) <= 1500)))
);


ALTER TABLE "public"."ath_soporte" OWNER TO "postgres";


ALTER TABLE "public"."ath_soporte" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_soporte_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_soporte_mensajes" (
    "id" bigint NOT NULL,
    "solicitud_id" bigint NOT NULL,
    "equipo" boolean NOT NULL,
    "mensaje" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ath_soporte_mensajes_mensaje_check" CHECK ((("length"("btrim"("mensaje")) >= 2) AND ("length"("btrim"("mensaje")) <= 1500)))
);


ALTER TABLE "public"."ath_soporte_mensajes" OWNER TO "postgres";


ALTER TABLE "public"."ath_soporte_mensajes" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."ath_soporte_mensajes_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ath_usuarios_presencia" (
    "usuario_id" "uuid" NOT NULL,
    "ultima_actividad" timestamp with time zone DEFAULT "now"() NOT NULL,
    "en_primer_plano" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."ath_usuarios_presencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."avisos" (
    "id" bigint NOT NULL,
    "autor_id" "uuid" NOT NULL,
    "equipo_id" integer,
    "titulo" "text" NOT NULL,
    "mensaje" "text" NOT NULL,
    "fecha_publicacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    CONSTRAINT "avisos_mensaje_no_vacio" CHECK (("char_length"(TRIM(BOTH FROM "mensaje")) > 0)),
    CONSTRAINT "avisos_titulo_no_vacio" CHECK (("char_length"(TRIM(BOTH FROM "titulo")) > 0))
);


ALTER TABLE "public"."avisos" OWNER TO "postgres";


ALTER TABLE "public"."avisos" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."avisos_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."codigos_entrenador" (
    "entrenador_id" "uuid" NOT NULL,
    "codigo" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."codigos_entrenador" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."detalle_rutina" (
    "id" bigint NOT NULL,
    "rutina_id" integer NOT NULL,
    "ejercicio_id" integer NOT NULL,
    "orden" integer DEFAULT 1 NOT NULL,
    "series" integer,
    "descanso_segundos" integer,
    "indicaciones_adicionales" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "repeticiones" integer,
    "duracion_segundos" integer,
    CONSTRAINT "detalle_rutina_descanso_check" CHECK ((("descanso_segundos" IS NULL) OR ("descanso_segundos" >= 0))),
    CONSTRAINT "detalle_rutina_duracion_check" CHECK ((("duracion_segundos" IS NULL) OR ("duracion_segundos" > 0))),
    CONSTRAINT "detalle_rutina_orden_check" CHECK (("orden" > 0)),
    CONSTRAINT "detalle_rutina_repeticiones_check" CHECK ((("repeticiones" IS NULL) OR ("repeticiones" > 0))),
    CONSTRAINT "detalle_rutina_series_check" CHECK ((("series" IS NULL) OR ("series" > 0)))
);


ALTER TABLE "public"."detalle_rutina" OWNER TO "postgres";


ALTER TABLE "public"."detalle_rutina" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."detalle_rutina_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ejercicios" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "video_url" "text",
    "categoria" "text",
    "indicaciones" "text",
    "creado_por" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."ejercicios" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."ejercicios_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."ejercicios_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."ejercicios_id_seq" OWNED BY "public"."ejercicios"."id";



CREATE TABLE IF NOT EXISTS "public"."entrenamientos_programados" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "sesion_indice" integer NOT NULL,
    "fecha_programada" "date" NOT NULL,
    "hora_programada" time without time zone,
    "estado" "text" DEFAULT 'PENDIENTE'::"text" NOT NULL,
    "sesion_realizada_id" "uuid",
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "entrenamientos_programados_estado_check" CHECK (("estado" = ANY (ARRAY['PENDIENTE'::"text", 'COMPLETADO'::"text", 'CANCELADO'::"text"]))),
    CONSTRAINT "entrenamientos_programados_sesion_indice_check" CHECK (("sesion_indice" >= 0)),
    CONSTRAINT "programacion_completada_requiere_registro" CHECK ((("estado" <> 'COMPLETADO'::"text") OR ("sesion_realizada_id" IS NOT NULL)))
);


ALTER TABLE "public"."entrenamientos_programados" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."equipos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "estado" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."equipos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."equipos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."equipos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."equipos_id_seq" OWNED BY "public"."equipos"."id";



CREATE TABLE IF NOT EXISTS "public"."login_intentos" (
    "rut_clave" "text" NOT NULL,
    "intentos" integer DEFAULT 0 NOT NULL,
    "inicio_ventana" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."login_intentos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."lugares_deportivos" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "direccion" "text",
    "latitud" double precision NOT NULL,
    "longitud" double precision NOT NULL,
    "disciplinas" "text"[],
    "descripcion" "text",
    "osm_id" "text"
);


ALTER TABLE "public"."lugares_deportivos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."lugares_deportivos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."lugares_deportivos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."lugares_deportivos_id_seq" OWNED BY "public"."lugares_deportivos"."id";



CREATE TABLE IF NOT EXISTS "public"."muro_comentarios" (
    "id" bigint NOT NULL,
    "publicacion_id" integer NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "respuesta_a" bigint,
    "mensaje" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "muro_comentarios_mensaje_check" CHECK ((("char_length"("btrim"("mensaje")) >= 1) AND ("char_length"("btrim"("mensaje")) <= 500)))
);


ALTER TABLE "public"."muro_comentarios" OWNER TO "postgres";


ALTER TABLE "public"."muro_comentarios" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."muro_comentarios_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."muro_comunidad" (
    "id" integer NOT NULL,
    "lugar_id" integer,
    "usuario_id" "uuid",
    "mensaje" "text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"(),
    "ciudad" "text",
    "lugar_nombre" "text",
    "lugar_latitud" double precision,
    "lugar_longitud" double precision,
    "lugar_osm_id" "text"
);


ALTER TABLE "public"."muro_comunidad" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."muro_comunidad_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."muro_comunidad_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."muro_comunidad_id_seq" OWNED BY "public"."muro_comunidad"."id";



CREATE TABLE IF NOT EXISTS "public"."participantes_partido" (
    "partido_id" integer NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."participantes_partido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."partidos_activos" (
    "id" integer NOT NULL,
    "lugar_id" integer,
    "deporte" "text" NOT NULL,
    "capacidad_maxima" integer NOT NULL,
    "jugadores_actuales" integer DEFAULT 1,
    "fecha_hora" timestamp with time zone NOT NULL,
    "organizador_id" "uuid"
);


ALTER TABLE "public"."partidos_activos" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."partidos_activos_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."partidos_activos_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."partidos_activos_id_seq" OWNED BY "public"."partidos_activos"."id";



CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "rut" "text" NOT NULL,
    "correo" "text" NOT NULL,
    "rol_id" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fecha_nacimiento" "date",
    "fecha_ingreso" "date" DEFAULT CURRENT_DATE,
    "estado" boolean DEFAULT true NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "apodo_publico" "text",
    "telefono" "text",
    CONSTRAINT "usuarios_apodo_publico_formato" CHECK ((("apodo_publico" IS NULL) OR ("apodo_publico" ~ '^[[:alnum:]_.-]{3,24}$'::"text"))),
    CONSTRAINT "usuarios_correo_no_vacio" CHECK (("char_length"(TRIM(BOTH FROM "correo")) > 0)),
    CONSTRAINT "usuarios_rut_no_vacio" CHECK (("char_length"(TRIM(BOTH FROM "rut")) > 0))
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."perfiles_publicos" WITH ("security_invoker"='false', "security_barrier"='true') AS
 SELECT "id",
    "nombre",
    "rol_id",
    "apodo_publico"
   FROM "public"."usuarios"
  WHERE ((( SELECT "auth"."uid"() AS "uid") IS NOT NULL) AND ( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));


ALTER VIEW "public"."perfiles_publicos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planes_alimentacion_ia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "objetivo" "text" NOT NULL,
    "plan" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "planes_alimentacion_plan_objeto" CHECK (("jsonb_typeof"("plan") = 'object'::"text")),
    CONSTRAINT "planes_alimentacion_titulo" CHECK ((("char_length"("titulo") >= 1) AND ("char_length"("titulo") <= 160)))
);


ALTER TABLE "public"."planes_alimentacion_ia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planes_entrenamiento_ia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "titulo" "text" NOT NULL,
    "objetivo" "text" NOT NULL,
    "deporte" "text",
    "perfil" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "plan" "jsonb" NOT NULL,
    "estado" "text" DEFAULT 'ACTIVO'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_sesiones" CHECK (("jsonb_typeof"(("plan" -> 'sesiones'::"text")) = 'array'::"text")),
    CONSTRAINT "planes_entrenamiento_ia_estado_check" CHECK (("estado" = ANY (ARRAY['ACTIVO'::"text", 'ARCHIVADO'::"text"]))),
    CONSTRAINT "planes_entrenamiento_ia_titulo_check" CHECK ((("char_length"("titulo") >= 3) AND ("char_length"("titulo") <= 150)))
);


ALTER TABLE "public"."planes_entrenamiento_ia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."roles_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."roles_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."roles_id_seq" OWNED BY "public"."roles"."id";



CREATE TABLE IF NOT EXISTS "public"."rutina_equipo" (
    "id" bigint NOT NULL,
    "rutina_id" integer NOT NULL,
    "equipo_id" integer NOT NULL,
    "asignado_por" "uuid",
    "fecha_asignacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."rutina_equipo" OWNER TO "postgres";


ALTER TABLE "public"."rutina_equipo" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."rutina_equipo_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rutina_usuario" (
    "id" bigint NOT NULL,
    "rutina_id" integer NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "asignado_por" "uuid",
    "fecha_asignacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activo" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."rutina_usuario" OWNER TO "postgres";


ALTER TABLE "public"."rutina_usuario" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."rutina_usuario_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rutinas" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "entrenador_id" "uuid" NOT NULL,
    "descripcion" "text",
    "fecha_creacion" timestamp with time zone DEFAULT "now"() NOT NULL,
    "estado" "text" DEFAULT 'ACTIVA'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rutinas_estado_check" CHECK (("estado" = ANY (ARRAY['ACTIVA'::"text", 'INACTIVA'::"text", 'ARCHIVADA'::"text"])))
);


ALTER TABLE "public"."rutinas" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rutinas_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rutinas_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rutinas_id_seq" OWNED BY "public"."rutinas"."id";



CREATE TABLE IF NOT EXISTS "public"."sesiones_entrenamiento_ia" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "sesion_indice" integer NOT NULL,
    "fecha" "date" DEFAULT CURRENT_DATE NOT NULL,
    "esfuerzo" integer NOT NULL,
    "duracion_minutos" integer,
    "observaciones" "text" DEFAULT ''::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ejercicios_realizados" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "ejecucion_id" "uuid",
    "duracion_segundos" integer,
    CONSTRAINT "sesiones_entrenamiento_ia_duracion_minutos_check" CHECK ((("duracion_minutos" >= 1) AND ("duracion_minutos" <= 240))),
    CONSTRAINT "sesiones_entrenamiento_ia_esfuerzo_check" CHECK ((("esfuerzo" >= 1) AND ("esfuerzo" <= 10))),
    CONSTRAINT "sesiones_entrenamiento_ia_observaciones_check" CHECK (("char_length"("observaciones") <= 500)),
    CONSTRAINT "sesiones_entrenamiento_ia_sesion_indice_check" CHECK ((("sesion_indice" >= 0) AND ("sesion_indice" <= 5))),
    CONSTRAINT "sesiones_ia_duracion_segundos_rango" CHECK ((("duracion_segundos" IS NULL) OR (("duracion_segundos" >= 1) AND ("duracion_segundos" <= 14400)))),
    CONSTRAINT "sesiones_ia_ejercicios_formato" CHECK ((("jsonb_typeof"("ejercicios_realizados") = 'array'::"text") AND ("jsonb_array_length"("ejercicios_realizados") <= 12)))
);


ALTER TABLE "public"."sesiones_entrenamiento_ia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuario_equipo" (
    "id" bigint NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "equipo_id" integer NOT NULL,
    "funcion_en_equipo" "text" NOT NULL,
    "fecha_asignacion" "date" DEFAULT CURRENT_DATE NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usuario_equipo_funcion_check" CHECK (("funcion_en_equipo" = ANY (ARRAY['ENTRENADOR'::"text", 'DEPORTISTA'::"text"])))
);


ALTER TABLE "public"."usuario_equipo" OWNER TO "postgres";


ALTER TABLE "public"."usuario_equipo" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."usuario_equipo_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."vinculos_entrenador" (
    "id" bigint NOT NULL,
    "entrenador_id" "uuid" NOT NULL,
    "deportista_id" "uuid" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "respondido_en" timestamp with time zone,
    CONSTRAINT "vinculos_entrenador_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'activo'::"text", 'rechazado'::"text", 'cancelado'::"text"])))
);


ALTER TABLE "public"."vinculos_entrenador" OWNER TO "postgres";


ALTER TABLE "public"."vinculos_entrenador" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."vinculos_entrenador_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."actividades" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."actividades_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."asistencias" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."asistencias_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."ejercicios" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."ejercicios_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."equipos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."equipos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."lugares_deportivos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."lugares_deportivos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."muro_comunidad" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."muro_comunidad_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."partidos_activos" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."partidos_activos_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."roles" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."roles_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rutinas" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rutinas_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."alimentacion_registros"
    ADD CONSTRAINT "alimentacion_registros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_actividad_deportista_unique" UNIQUE ("actividad_id", "deportista_id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_entrenamiento_id_deportista_id_key" UNIQUE ("actividad_id", "deportista_id");



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_admin_auditoria"
    ADD CONSTRAINT "ath_admin_auditoria_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_asistencia_individual"
    ADD CONSTRAINT "ath_asistencia_individual_entrenador_id_deportista_id_fecha_key" UNIQUE ("entrenador_id", "deportista_id", "fecha");



ALTER TABLE ONLY "public"."ath_asistencia_individual"
    ADD CONSTRAINT "ath_asistencia_individual_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_avisos_individuales"
    ADD CONSTRAINT "ath_avisos_individuales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_bloqueos"
    ADD CONSTRAINT "ath_bloqueos_pkey" PRIMARY KEY ("usuario_id", "bloqueado_id");



ALTER TABLE ONLY "public"."ath_chat_estado"
    ADD CONSTRAINT "ath_chat_estado_pkey" PRIMARY KEY ("chat_id", "usuario_id");



ALTER TABLE ONLY "public"."ath_chat_invitaciones"
    ADD CONSTRAINT "ath_chat_invitaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_chat_mensajes"
    ADD CONSTRAINT "ath_chat_mensajes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_chat_participantes"
    ADD CONSTRAINT "ath_chat_participantes_pkey" PRIMARY KEY ("chat_id", "usuario_id");



ALTER TABLE ONLY "public"."ath_chat_preferencias"
    ADD CONSTRAINT "ath_chat_preferencias_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."ath_chat_solicitudes"
    ADD CONSTRAINT "ath_chat_solicitudes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_chats"
    ADD CONSTRAINT "ath_chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_denuncias"
    ADD CONSTRAINT "ath_denuncias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_dispositivos_push"
    ADD CONSTRAINT "ath_dispositivos_push_pkey" PRIMARY KEY ("token");



ALTER TABLE ONLY "public"."ath_edge_cuotas"
    ADD CONSTRAINT "ath_edge_cuotas_pkey" PRIMARY KEY ("usuario_id", "servicio", "ventana");



ALTER TABLE ONLY "public"."ath_evaluaciones_deportivas"
    ADD CONSTRAINT "ath_evaluaciones_deportivas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_chat_invitaciones"
    ADD CONSTRAINT "ath_invitacion_unica" UNIQUE ("chat_id", "invitado_id");



ALTER TABLE ONLY "public"."ath_match_cache_osm"
    ADD CONSTRAINT "ath_match_cache_osm_pkey" PRIMARY KEY ("zona");



ALTER TABLE ONLY "public"."ath_notificaciones"
    ADD CONSTRAINT "ath_notificaciones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_nutricion_agua"
    ADD CONSTRAINT "ath_nutricion_agua_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_nutricion_objetivos"
    ADD CONSTRAINT "ath_nutricion_objetivos_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."ath_perfil_deportivo"
    ADD CONSTRAINT "ath_perfil_deportivo_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."ath_preferencias_privacidad"
    ADD CONSTRAINT "ath_preferencias_privacidad_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."ath_purgas_resumen"
    ADD CONSTRAINT "ath_purgas_resumen_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_push_envios"
    ADD CONSTRAINT "ath_push_envios_pkey" PRIMARY KEY ("notificacion_id");



ALTER TABLE ONLY "public"."ath_rutina_sesiones"
    ADD CONSTRAINT "ath_rutina_sesiones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_chat_solicitudes"
    ADD CONSTRAINT "ath_solicitud_unica" UNIQUE ("remitente_id", "destinatario_id");



ALTER TABLE ONLY "public"."ath_solicitudes_eliminacion"
    ADD CONSTRAINT "ath_solicitudes_eliminacion_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."ath_soporte_mensajes"
    ADD CONSTRAINT "ath_soporte_mensajes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_soporte"
    ADD CONSTRAINT "ath_soporte_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ath_usuarios_presencia"
    ADD CONSTRAINT "ath_usuarios_presencia_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."avisos"
    ADD CONSTRAINT "avisos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."codigos_entrenador"
    ADD CONSTRAINT "codigos_entrenador_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."codigos_entrenador"
    ADD CONSTRAINT "codigos_entrenador_pkey" PRIMARY KEY ("entrenador_id");



ALTER TABLE ONLY "public"."detalle_rutina"
    ADD CONSTRAINT "detalle_rutina_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."detalle_rutina"
    ADD CONSTRAINT "detalle_rutina_rutina_orden_unique" UNIQUE ("rutina_id", "orden");



ALTER TABLE ONLY "public"."ejercicios"
    ADD CONSTRAINT "ejercicios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "entrenamientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entrenamientos_programados"
    ADD CONSTRAINT "entrenamientos_programados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."equipos"
    ADD CONSTRAINT "equipos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_intentos"
    ADD CONSTRAINT "login_intentos_pkey" PRIMARY KEY ("rut_clave");



ALTER TABLE ONLY "public"."lugares_deportivos"
    ADD CONSTRAINT "lugares_deportivos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."muro_comentarios"
    ADD CONSTRAINT "muro_comentarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."muro_comunidad"
    ADD CONSTRAINT "muro_comunidad_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."participantes_partido"
    ADD CONSTRAINT "participantes_partido_pkey" PRIMARY KEY ("partido_id", "usuario_id");



ALTER TABLE ONLY "public"."partidos_activos"
    ADD CONSTRAINT "partidos_activos_pkey" PRIMARY KEY ("id");



ALTER TABLE "public"."partidos_activos"
    ADD CONSTRAINT "partidos_capacidad_valida" CHECK ((("capacidad_maxima" > 0) AND ("jugadores_actuales" IS NOT NULL) AND ("jugadores_actuales" >= 0) AND ("jugadores_actuales" <= "capacidad_maxima"))) NOT VALID;



ALTER TABLE ONLY "public"."planes_alimentacion_ia"
    ADD CONSTRAINT "planes_alimentacion_ia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planes_entrenamiento_ia"
    ADD CONSTRAINT "planes_entrenamiento_ia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rutina_equipo"
    ADD CONSTRAINT "rutina_equipo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rutina_equipo"
    ADD CONSTRAINT "rutina_equipo_unique" UNIQUE ("rutina_id", "equipo_id");



ALTER TABLE ONLY "public"."rutina_usuario"
    ADD CONSTRAINT "rutina_usuario_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rutina_usuario"
    ADD CONSTRAINT "rutina_usuario_unique" UNIQUE ("rutina_id", "usuario_id");



ALTER TABLE ONLY "public"."rutinas"
    ADD CONSTRAINT "rutinas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sesiones_entrenamiento_ia"
    ADD CONSTRAINT "sesiones_entrenamiento_ia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuario_equipo"
    ADD CONSTRAINT "usuario_equipo_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuario_equipo"
    ADD CONSTRAINT "usuario_equipo_unique" UNIQUE ("usuario_id", "equipo_id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_correo_key" UNIQUE ("correo");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_rut_key" UNIQUE ("rut");



ALTER TABLE ONLY "public"."vinculos_entrenador"
    ADD CONSTRAINT "vinculos_entrenador_entrenador_id_deportista_id_key" UNIQUE ("entrenador_id", "deportista_id");



ALTER TABLE ONLY "public"."vinculos_entrenador"
    ADD CONSTRAINT "vinculos_entrenador_pkey" PRIMARY KEY ("id");



CREATE INDEX "alimentacion_usuario_fecha_idx" ON "public"."alimentacion_registros" USING "btree" ("usuario_id", "fecha" DESC, "created_at" DESC);



CREATE INDEX "ath_asistencia_deportista_fecha" ON "public"."ath_asistencia_individual" USING "btree" ("deportista_id", "fecha" DESC);



CREATE INDEX "ath_avisos_autor_fecha" ON "public"."ath_avisos_individuales" USING "btree" ("autor_id", "created_at" DESC);



CREATE INDEX "ath_chat_mensajes_chat_fecha" ON "public"."ath_chat_mensajes" USING "btree" ("chat_id", "creado_en" DESC);



CREATE INDEX "ath_chat_participantes_usuario" ON "public"."ath_chat_participantes" USING "btree" ("usuario_id");



CREATE UNIQUE INDEX "ath_denuncias_pendientes_unicas" ON "public"."ath_denuncias" USING "btree" ("usuario_id", "tipo", "objeto") WHERE (("estado" = 'pendiente'::"text") AND ("usuario_id" IS NOT NULL));



CREATE INDEX "ath_eval_deportista_fecha" ON "public"."ath_evaluaciones_deportivas" USING "btree" ("deportista_id", "fecha" DESC);



CREATE UNIQUE INDEX "ath_match_participante_unico" ON "public"."participantes_partido" USING "btree" ("partido_id", "usuario_id");



CREATE INDEX "ath_notificaciones_pendientes" ON "public"."ath_notificaciones" USING "btree" ("usuario_id") WHERE (NOT "leida");



CREATE INDEX "ath_notificaciones_usuario_fecha" ON "public"."ath_notificaciones" USING "btree" ("usuario_id", "creado_en" DESC);



CREATE INDEX "ath_nutricion_agua_usuario_fecha" ON "public"."ath_nutricion_agua" USING "btree" ("usuario_id", "fecha");



CREATE INDEX "ath_push_usuario_idx" ON "public"."ath_dispositivos_push" USING "btree" ("usuario_id");



CREATE INDEX "ath_soporte_mensajes_idx" ON "public"."ath_soporte_mensajes" USING "btree" ("solicitud_id", "id");



CREATE INDEX "ath_soporte_usuario_idx" ON "public"."ath_soporte" USING "btree" ("usuario_id", "creado_en" DESC);



CREATE UNIQUE INDEX "equipos_nombre_unique_ci" ON "public"."equipos" USING "btree" ("upper"(TRIM(BOTH FROM "nombre")));



CREATE INDEX "idx_actividades_creador" ON "public"."actividades" USING "btree" ("creado_por");



CREATE INDEX "idx_actividades_equipo" ON "public"."actividades" USING "btree" ("equipo_id");



CREATE INDEX "idx_actividades_fecha_hora" ON "public"."actividades" USING "btree" ("fecha_hora");



CREATE INDEX "idx_actividades_tipo" ON "public"."actividades" USING "btree" ("tipo");



CREATE INDEX "idx_asistencias_actividad" ON "public"."asistencias" USING "btree" ("actividad_id");



CREATE INDEX "idx_asistencias_deportista" ON "public"."asistencias" USING "btree" ("deportista_id");



CREATE INDEX "idx_asistencias_registrador" ON "public"."asistencias" USING "btree" ("registrado_por");



CREATE INDEX "idx_ath_avisos_destinatario_fecha" ON "public"."ath_avisos_individuales" USING "btree" ("destinatario_id", "created_at" DESC);



CREATE INDEX "idx_ath_bloqueos_bloqueado" ON "public"."ath_bloqueos" USING "btree" ("bloqueado_id");



CREATE INDEX "idx_ath_chat_invitaciones_invitado" ON "public"."ath_chat_invitaciones" USING "btree" ("invitado_id");



CREATE INDEX "idx_ath_chat_invitaciones_invitador" ON "public"."ath_chat_invitaciones" USING "btree" ("invitador_id");



CREATE INDEX "idx_ath_chat_mensajes_usuario" ON "public"."ath_chat_mensajes" USING "btree" ("usuario_id");



CREATE INDEX "idx_ath_chat_solicitudes_destinatario" ON "public"."ath_chat_solicitudes" USING "btree" ("destinatario_id");



CREATE INDEX "idx_ath_chats_creador" ON "public"."ath_chats" USING "btree" ("creador_id");



CREATE INDEX "idx_ath_denuncias_usuario" ON "public"."ath_denuncias" USING "btree" ("usuario_id");



CREATE INDEX "idx_ath_edge_cuotas_ventana" ON "public"."ath_edge_cuotas" USING "btree" ("ventana");



CREATE INDEX "idx_ath_evaluaciones_entrenador_fecha" ON "public"."ath_evaluaciones_deportivas" USING "btree" ("entrenador_id", "fecha" DESC);



CREATE INDEX "idx_ath_rutina_sesiones_deportista" ON "public"."ath_rutina_sesiones" USING "btree" ("deportista_id");



CREATE INDEX "idx_avisos_autor" ON "public"."avisos" USING "btree" ("autor_id");



CREATE INDEX "idx_avisos_equipo" ON "public"."avisos" USING "btree" ("equipo_id");



CREATE INDEX "idx_avisos_fecha" ON "public"."avisos" USING "btree" ("fecha_publicacion" DESC);



CREATE INDEX "idx_detalle_rutina_ejercicio" ON "public"."detalle_rutina" USING "btree" ("ejercicio_id");



CREATE INDEX "idx_detalle_rutina_rutina" ON "public"."detalle_rutina" USING "btree" ("rutina_id");



CREATE INDEX "idx_ejercicios_creado_por" ON "public"."ejercicios" USING "btree" ("creado_por");



CREATE INDEX "idx_entrenamientos_programados_plan" ON "public"."entrenamientos_programados" USING "btree" ("plan_id");



CREATE INDEX "idx_entrenamientos_programados_usuario_fecha" ON "public"."entrenamientos_programados" USING "btree" ("usuario_id", "fecha_programada");



CREATE INDEX "idx_muro_comentarios_respuesta" ON "public"."muro_comentarios" USING "btree" ("respuesta_a");



CREATE INDEX "idx_muro_comentarios_usuario" ON "public"."muro_comentarios" USING "btree" ("usuario_id");



CREATE INDEX "idx_muro_comunidad_lugar" ON "public"."muro_comunidad" USING "btree" ("lugar_id");



CREATE INDEX "idx_muro_comunidad_usuario" ON "public"."muro_comunidad" USING "btree" ("usuario_id");



CREATE INDEX "idx_partidos_activos_lugar" ON "public"."partidos_activos" USING "btree" ("lugar_id");



CREATE INDEX "idx_partidos_activos_organizador" ON "public"."partidos_activos" USING "btree" ("organizador_id");



CREATE INDEX "idx_rutina_equipo_asignador" ON "public"."rutina_equipo" USING "btree" ("asignado_por");



CREATE INDEX "idx_rutina_equipo_equipo" ON "public"."rutina_equipo" USING "btree" ("equipo_id");



CREATE INDEX "idx_rutina_usuario_asignador" ON "public"."rutina_usuario" USING "btree" ("asignado_por");



CREATE INDEX "idx_rutina_usuario_usuario" ON "public"."rutina_usuario" USING "btree" ("usuario_id");



CREATE INDEX "idx_rutinas_entrenador" ON "public"."rutinas" USING "btree" ("entrenador_id");



CREATE INDEX "idx_sesiones_entrenamiento_ia_plan" ON "public"."sesiones_entrenamiento_ia" USING "btree" ("plan_id");



CREATE INDEX "idx_usuario_equipo_equipo" ON "public"."usuario_equipo" USING "btree" ("equipo_id");



CREATE INDEX "idx_usuario_equipo_usuario" ON "public"."usuario_equipo" USING "btree" ("usuario_id");



CREATE INDEX "idx_usuarios_rol" ON "public"."usuarios" USING "btree" ("rol_id");



CREATE INDEX "idx_vinculos_deportista" ON "public"."vinculos_entrenador" USING "btree" ("deportista_id");



CREATE UNIQUE INDEX "lugares_deportivos_osm_id_uidx" ON "public"."lugares_deportivos" USING "btree" ("osm_id") WHERE ("osm_id" IS NOT NULL);



CREATE INDEX "muro_comentarios_publicacion_idx" ON "public"."muro_comentarios" USING "btree" ("publicacion_id", "creado_en");



CREATE INDEX "participantes_partido_usuario_idx" ON "public"."participantes_partido" USING "btree" ("usuario_id");



CREATE INDEX "planes_alimentacion_ia_usuario_fecha_idx" ON "public"."planes_alimentacion_ia" USING "btree" ("usuario_id", "created_at" DESC);



CREATE INDEX "planes_ia_usuario_fecha" ON "public"."planes_entrenamiento_ia" USING "btree" ("usuario_id", "creado_en" DESC);



CREATE UNIQUE INDEX "roles_nombre_unique_ci" ON "public"."roles" USING "btree" ("upper"(TRIM(BOTH FROM "nombre")));



CREATE UNIQUE INDEX "sesiones_ia_ejecucion_id_unico" ON "public"."sesiones_entrenamiento_ia" USING "btree" ("ejecucion_id") WHERE ("ejecucion_id" IS NOT NULL);



CREATE INDEX "sesiones_ia_usuario_fecha" ON "public"."sesiones_entrenamiento_ia" USING "btree" ("usuario_id", "fecha" DESC);



CREATE UNIQUE INDEX "uq_entrenamientos_programados_activos" ON "public"."entrenamientos_programados" USING "btree" ("usuario_id", "plan_id", "sesion_indice", "fecha_programada") WHERE ("estado" <> 'CANCELADO'::"text");



CREATE UNIQUE INDEX "uq_entrenamientos_programados_registro" ON "public"."entrenamientos_programados" USING "btree" ("sesion_realizada_id") WHERE ("sesion_realizada_id" IS NOT NULL);



CREATE UNIQUE INDEX "usuarios_apodo_publico_unico" ON "public"."usuarios" USING "btree" ("lower"("apodo_publico")) WHERE ("apodo_publico" IS NOT NULL);



CREATE INDEX "vinculo_entrenador_estado" ON "public"."vinculos_entrenador" USING "btree" ("entrenador_id", "estado");



CREATE UNIQUE INDEX "vinculo_un_entrenador_activo" ON "public"."vinculos_entrenador" USING "btree" ("deportista_id") WHERE ("estado" = 'activo'::"text");



CREATE OR REPLACE TRIGGER "ath_asignacion_vinculo" BEFORE INSERT OR UPDATE OF "usuario_id" ON "public"."rutina_usuario" FOR EACH ROW EXECUTE FUNCTION "public"."ath_validar_asignacion_individual"();



CREATE OR REPLACE TRIGGER "ath_auditar_denuncias" AFTER UPDATE ON "public"."ath_denuncias" FOR EACH ROW EXECUTE FUNCTION "public"."ath_auditar_cambio"();



CREATE OR REPLACE TRIGGER "ath_auditar_respuestas" AFTER INSERT ON "public"."ath_soporte_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."ath_auditar_cambio"();



CREATE OR REPLACE TRIGGER "ath_auditar_soporte" AFTER UPDATE ON "public"."ath_soporte" FOR EACH ROW EXECUTE FUNCTION "public"."ath_auditar_cambio"();



CREATE OR REPLACE TRIGGER "ath_auditar_usuarios" AFTER INSERT OR DELETE OR UPDATE ON "public"."usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."ath_auditar_cambio"();



CREATE OR REPLACE TRIGGER "ath_bloqueo_mensaje" BEFORE INSERT ON "public"."ath_chat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."ath_guardar_bloqueo_chat"();



CREATE OR REPLACE TRIGGER "ath_bloqueo_solicitud" BEFORE INSERT OR UPDATE ON "public"."ath_chat_solicitudes" FOR EACH ROW EXECUTE FUNCTION "public"."ath_guardar_bloqueo_chat"();



CREATE OR REPLACE TRIGGER "ath_capturar_autor" BEFORE INSERT ON "public"."ath_denuncias" FOR EACH ROW EXECUTE FUNCTION "public"."ath_capturar_autor_denuncia"();



CREATE OR REPLACE TRIGGER "ath_filtrar_notificacion" BEFORE INSERT ON "public"."ath_notificaciones" FOR EACH ROW EXECUTE FUNCTION "public"."ath_filtrar_notificacion"();



CREATE OR REPLACE TRIGGER "ath_notif_actividad_v2" AFTER INSERT OR UPDATE ON "public"."actividades" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_deporte_v2"();



CREATE OR REPLACE TRIGGER "ath_notif_aviso" AFTER INSERT ON "public"."ath_avisos_individuales" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_evento_v1"();



CREATE OR REPLACE TRIGGER "ath_notif_entreno_v2" AFTER INSERT OR UPDATE ON "public"."entrenamientos_programados" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_deporte_v2"();



CREATE OR REPLACE TRIGGER "ath_notif_general_v2" AFTER INSERT ON "public"."ath_avisos_individuales" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_deporte_v2"();



CREATE OR REPLACE TRIGGER "ath_notif_invitacion" AFTER INSERT ON "public"."ath_chat_invitaciones" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_evento_v1"();



CREATE OR REPLACE TRIGGER "ath_notif_mensaje" AFTER INSERT ON "public"."ath_chat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_evento_v1"();



CREATE OR REPLACE TRIGGER "ath_notif_participante_v2" AFTER INSERT OR DELETE ON "public"."participantes_partido" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_deporte_v2"();



CREATE OR REPLACE TRIGGER "ath_notif_partido_v2" AFTER UPDATE OF "fecha_hora" ON "public"."partidos_activos" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_deporte_v2"();



CREATE OR REPLACE TRIGGER "ath_notif_rutina" AFTER INSERT OR UPDATE OF "activo" ON "public"."rutina_usuario" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_evento_v1"();



CREATE OR REPLACE TRIGGER "ath_notif_solicitud" AFTER INSERT ON "public"."ath_chat_solicitudes" FOR EACH ROW EXECUTE FUNCTION "public"."ath_notificar_evento_v1"();



CREATE OR REPLACE TRIGGER "ath_validar_mensaje_chat_trigger" BEFORE INSERT ON "public"."ath_chat_mensajes" FOR EACH ROW EXECUTE FUNCTION "public"."ath_validar_mensaje_chat"();



CREATE OR REPLACE TRIGGER "trg_actividades_updated_at" BEFORE UPDATE ON "public"."actividades" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ath_enviar_push" AFTER INSERT ON "public"."ath_notificaciones" FOR EACH ROW EXECUTE FUNCTION "public"."ath_enviar_push"();



CREATE OR REPLACE TRIGGER "trg_athletix_validar_programacion" BEFORE INSERT OR UPDATE ON "public"."entrenamientos_programados" FOR EACH ROW EXECUTE FUNCTION "public"."athletix_validar_programacion"();



CREATE OR REPLACE TRIGGER "trg_avisos_updated_at" BEFORE UPDATE ON "public"."avisos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_ejercicios_updated_at" BEFORE UPDATE ON "public"."ejercicios" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_equipos_updated_at" BEFORE UPDATE ON "public"."equipos" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_rutinas_updated_at" BEFORE UPDATE ON "public"."rutinas" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_usuarios_updated_at" BEFORE UPDATE ON "public"."usuarios" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_validar_asistencia" BEFORE INSERT OR UPDATE ON "public"."asistencias" FOR EACH ROW EXECUTE FUNCTION "public"."validar_asistencia"();



CREATE OR REPLACE TRIGGER "trg_validar_sesion_ia_propietario" BEFORE INSERT OR UPDATE ON "public"."sesiones_entrenamiento_ia" FOR EACH ROW EXECUTE FUNCTION "public"."validar_sesion_ia_propietario"();



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "actividades_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."alimentacion_registros"
    ADD CONSTRAINT "alimentacion_registros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_deportista_id_fkey" FOREIGN KEY ("deportista_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_entrenamiento_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "public"."actividades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."asistencias"
    ADD CONSTRAINT "asistencias_registrado_por_fkey" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ath_asistencia_individual"
    ADD CONSTRAINT "ath_asistencia_individual_deportista_id_fkey" FOREIGN KEY ("deportista_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."ath_asistencia_individual"
    ADD CONSTRAINT "ath_asistencia_individual_entrenador_id_fkey" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."ath_avisos_individuales"
    ADD CONSTRAINT "ath_avisos_individuales_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."ath_avisos_individuales"
    ADD CONSTRAINT "ath_avisos_individuales_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."ath_bloqueos"
    ADD CONSTRAINT "ath_bloqueos_bloqueado_id_fkey" FOREIGN KEY ("bloqueado_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_bloqueos"
    ADD CONSTRAINT "ath_bloqueos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_estado"
    ADD CONSTRAINT "ath_chat_estado_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."ath_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_estado"
    ADD CONSTRAINT "ath_chat_estado_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_invitaciones"
    ADD CONSTRAINT "ath_chat_invitaciones_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."ath_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_invitaciones"
    ADD CONSTRAINT "ath_chat_invitaciones_invitado_id_fkey" FOREIGN KEY ("invitado_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_invitaciones"
    ADD CONSTRAINT "ath_chat_invitaciones_invitador_id_fkey" FOREIGN KEY ("invitador_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_mensajes"
    ADD CONSTRAINT "ath_chat_mensajes_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."ath_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_mensajes"
    ADD CONSTRAINT "ath_chat_mensajes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_participantes"
    ADD CONSTRAINT "ath_chat_participantes_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."ath_chats"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_participantes"
    ADD CONSTRAINT "ath_chat_participantes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_preferencias"
    ADD CONSTRAINT "ath_chat_preferencias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_solicitudes"
    ADD CONSTRAINT "ath_chat_solicitudes_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chat_solicitudes"
    ADD CONSTRAINT "ath_chat_solicitudes_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_chats"
    ADD CONSTRAINT "ath_chats_creador_id_fkey" FOREIGN KEY ("creador_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ath_denuncias"
    ADD CONSTRAINT "ath_denuncias_denunciado_id_fkey" FOREIGN KEY ("denunciado_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ath_denuncias"
    ADD CONSTRAINT "ath_denuncias_resuelto_por_fkey" FOREIGN KEY ("resuelto_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ath_denuncias"
    ADD CONSTRAINT "ath_denuncias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ath_dispositivos_push"
    ADD CONSTRAINT "ath_dispositivos_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_evaluaciones_deportivas"
    ADD CONSTRAINT "ath_evaluaciones_deportivas_deportista_id_fkey" FOREIGN KEY ("deportista_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_evaluaciones_deportivas"
    ADD CONSTRAINT "ath_evaluaciones_deportivas_entrenador_id_fkey" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_notificaciones"
    ADD CONSTRAINT "ath_notificaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_nutricion_agua"
    ADD CONSTRAINT "ath_nutricion_agua_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_nutricion_objetivos"
    ADD CONSTRAINT "ath_nutricion_objetivos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_perfil_deportivo"
    ADD CONSTRAINT "ath_perfil_deportivo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_preferencias_privacidad"
    ADD CONSTRAINT "ath_preferencias_privacidad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_push_envios"
    ADD CONSTRAINT "ath_push_envios_notificacion_id_fkey" FOREIGN KEY ("notificacion_id") REFERENCES "public"."ath_notificaciones"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_rutina_sesiones"
    ADD CONSTRAINT "ath_rutina_sesiones_deportista_id_fkey" FOREIGN KEY ("deportista_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."ath_solicitudes_eliminacion"
    ADD CONSTRAINT "ath_solicitudes_eliminacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_soporte_mensajes"
    ADD CONSTRAINT "ath_soporte_mensajes_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "public"."ath_soporte"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_soporte"
    ADD CONSTRAINT "ath_soporte_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ath_usuarios_presencia"
    ADD CONSTRAINT "ath_usuarios_presencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."avisos"
    ADD CONSTRAINT "avisos_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "public"."usuarios"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."avisos"
    ADD CONSTRAINT "avisos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."codigos_entrenador"
    ADD CONSTRAINT "codigos_entrenador_entrenador_id_fkey" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."detalle_rutina"
    ADD CONSTRAINT "detalle_rutina_ejercicio_id_fkey" FOREIGN KEY ("ejercicio_id") REFERENCES "public"."ejercicios"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."detalle_rutina"
    ADD CONSTRAINT "detalle_rutina_rutina_id_fkey" FOREIGN KEY ("rutina_id") REFERENCES "public"."rutinas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ejercicios"
    ADD CONSTRAINT "ejercicios_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "entrenamientos_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id");



ALTER TABLE ONLY "public"."entrenamientos_programados"
    ADD CONSTRAINT "entrenamientos_programados_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."planes_entrenamiento_ia"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."entrenamientos_programados"
    ADD CONSTRAINT "entrenamientos_programados_sesion_realizada_id_fkey" FOREIGN KEY ("sesion_realizada_id") REFERENCES "public"."sesiones_entrenamiento_ia"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entrenamientos_programados"
    ADD CONSTRAINT "entrenamientos_programados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."muro_comentarios"
    ADD CONSTRAINT "muro_comentarios_publicacion_id_fkey" FOREIGN KEY ("publicacion_id") REFERENCES "public"."muro_comunidad"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."muro_comentarios"
    ADD CONSTRAINT "muro_comentarios_respuesta_a_fkey" FOREIGN KEY ("respuesta_a") REFERENCES "public"."muro_comentarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."muro_comentarios"
    ADD CONSTRAINT "muro_comentarios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."muro_comunidad"
    ADD CONSTRAINT "muro_comunidad_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares_deportivos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."muro_comunidad"
    ADD CONSTRAINT "muro_comunidad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."participantes_partido"
    ADD CONSTRAINT "participantes_partido_partido_id_fkey" FOREIGN KEY ("partido_id") REFERENCES "public"."partidos_activos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."participantes_partido"
    ADD CONSTRAINT "participantes_partido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partidos_activos"
    ADD CONSTRAINT "partidos_activos_lugar_id_fkey" FOREIGN KEY ("lugar_id") REFERENCES "public"."lugares_deportivos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."partidos_activos"
    ADD CONSTRAINT "partidos_activos_organizador_id_fkey" FOREIGN KEY ("organizador_id") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."planes_alimentacion_ia"
    ADD CONSTRAINT "planes_alimentacion_ia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planes_entrenamiento_ia"
    ADD CONSTRAINT "planes_entrenamiento_ia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rutina_equipo"
    ADD CONSTRAINT "rutina_equipo_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rutina_equipo"
    ADD CONSTRAINT "rutina_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rutina_equipo"
    ADD CONSTRAINT "rutina_equipo_rutina_id_fkey" FOREIGN KEY ("rutina_id") REFERENCES "public"."rutinas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rutina_usuario"
    ADD CONSTRAINT "rutina_usuario_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "public"."usuarios"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rutina_usuario"
    ADD CONSTRAINT "rutina_usuario_rutina_id_fkey" FOREIGN KEY ("rutina_id") REFERENCES "public"."rutinas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rutina_usuario"
    ADD CONSTRAINT "rutina_usuario_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rutinas"
    ADD CONSTRAINT "rutinas_entrenador_id_fkey" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."sesiones_entrenamiento_ia"
    ADD CONSTRAINT "sesiones_entrenamiento_ia_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."planes_entrenamiento_ia"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."sesiones_entrenamiento_ia"
    ADD CONSTRAINT "sesiones_entrenamiento_ia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuario_equipo"
    ADD CONSTRAINT "usuario_equipo_equipo_id_fkey" FOREIGN KEY ("equipo_id") REFERENCES "public"."equipos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuario_equipo"
    ADD CONSTRAINT "usuario_equipo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_auth_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "public"."roles"("id");



ALTER TABLE ONLY "public"."vinculos_entrenador"
    ADD CONSTRAINT "vinculos_entrenador_deportista_id_fkey" FOREIGN KEY ("deportista_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."vinculos_entrenador"
    ADD CONSTRAINT "vinculos_entrenador_entrenador_id_fkey" FOREIGN KEY ("entrenador_id") REFERENCES "public"."usuarios"("id");



CREATE POLICY "Deportista actualiza su programacion" ON "public"."entrenamientos_programados" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Deportista consulta su programacion" ON "public"."entrenamientos_programados" FOR SELECT TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Deportista programa sus sesiones" ON "public"."entrenamientos_programados" FOR INSERT TO "authenticated" WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("estado" = 'PENDIENTE'::"text") AND ("sesion_realizada_id" IS NULL)));



ALTER TABLE "public"."actividades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "actividades_delete" ON "public"."actividades" FOR DELETE TO "authenticated" USING (("public"."is_admin"() OR "public"."is_team_trainer"("equipo_id")));



CREATE POLICY "actividades_insert" ON "public"."actividades" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND "public"."is_team_trainer"("equipo_id") AND ("creado_por" = "auth"."uid"()))));



CREATE POLICY "actividades_select" ON "public"."actividades" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("creado_por" = "auth"."uid"()) OR ("equipo_id" IS NULL) OR "public"."is_team_member"("equipo_id")));



CREATE POLICY "actividades_update" ON "public"."actividades" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR "public"."is_team_trainer"("equipo_id"))) WITH CHECK (("public"."is_admin"() OR "public"."is_team_trainer"("equipo_id")));



CREATE POLICY "agua_propia" ON "public"."ath_nutricion_agua" TO "authenticated" USING (("auth"."uid"() = "usuario_id")) WITH CHECK (("auth"."uid"() = "usuario_id"));



CREATE POLICY "alimentacion_delete_propio" ON "public"."alimentacion_registros" FOR DELETE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "alimentacion_insert_propio" ON "public"."alimentacion_registros" FOR INSERT TO "authenticated" WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."alimentacion_registros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "alimentacion_select_propio" ON "public"."alimentacion_registros" FOR SELECT TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "alimentacion_update_propio" ON "public"."alimentacion_registros" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ars_insert" ON "public"."ath_rutina_sesiones" FOR INSERT TO "authenticated" WITH CHECK ((("deportista_id" = "auth"."uid"()) AND "public"."ath_eval_permiso"("deportista_id", "auth"."uid"(), false) AND (EXISTS ( SELECT 1
   FROM "public"."rutina_usuario" "a"
  WHERE (("a"."usuario_id" = "auth"."uid"()) AND ("a"."rutina_id" = "ath_rutina_sesiones"."rutina_id") AND "a"."activo")))));



CREATE POLICY "ars_read" ON "public"."ath_rutina_sesiones" FOR SELECT TO "authenticated" USING ("public"."ath_eval_permiso"("deportista_id", "auth"."uid"(), false));



ALTER TABLE "public"."asistencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "asistencias_delete" ON "public"."asistencias" FOR DELETE TO "authenticated" USING ("public"."can_manage_activity"("actividad_id"));



CREATE POLICY "asistencias_insert" ON "public"."asistencias" FOR INSERT TO "authenticated" WITH CHECK (("public"."can_manage_activity"("actividad_id") AND (("registrado_por" IS NULL) OR ("registrado_por" = "auth"."uid"()) OR "public"."is_admin"())));



CREATE POLICY "asistencias_select" ON "public"."asistencias" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("deportista_id" = "auth"."uid"()) OR "public"."can_manage_activity"("actividad_id")));



CREATE POLICY "asistencias_update" ON "public"."asistencias" FOR UPDATE TO "authenticated" USING ("public"."can_manage_activity"("actividad_id")) WITH CHECK ("public"."can_manage_activity"("actividad_id"));



ALTER TABLE "public"."ath_admin_auditoria" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_admin_muro_select" ON "public"."muro_comunidad" FOR SELECT TO "authenticated" USING (( SELECT "public"."ath_es_admin_activo"() AS "ath_es_admin_activo"));



CREATE POLICY "ath_admin_ver_asistencias" ON "public"."ath_asistencia_individual" FOR SELECT TO "authenticated" USING (( SELECT "public"."ath_es_admin_activo"() AS "ath_es_admin_activo"));



CREATE POLICY "ath_admin_ver_rutinas" ON "public"."rutinas" FOR SELECT TO "authenticated" USING (( SELECT "public"."ath_es_admin_activo"() AS "ath_es_admin_activo"));



CREATE POLICY "ath_admin_ver_usuarios" ON "public"."usuarios" FOR SELECT TO "authenticated" USING (( SELECT "public"."ath_es_admin_activo"() AS "ath_es_admin_activo"));



CREATE POLICY "ath_asistencia_editar" ON "public"."ath_asistencia_individual" FOR UPDATE TO "authenticated" USING ((("entrenador_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."deportista_id" = "ath_asistencia_individual"."deportista_id") AND ("v"."estado" = 'activo'::"text")))))) WITH CHECK ((("entrenador_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."deportista_id" = "ath_asistencia_individual"."deportista_id") AND ("v"."estado" = 'activo'::"text"))))));



ALTER TABLE "public"."ath_asistencia_individual" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_asistencia_insertar" ON "public"."ath_asistencia_individual" FOR INSERT TO "authenticated" WITH CHECK ((("entrenador_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."rol_id" = 2) AND ("u"."estado" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."deportista_id" = "ath_asistencia_individual"."deportista_id") AND ("v"."estado" = 'activo'::"text"))))));



CREATE POLICY "ath_asistencia_ver" ON "public"."ath_asistencia_individual" FOR SELECT TO "authenticated" USING ((("deportista_id" = "auth"."uid"()) OR (("entrenador_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."deportista_id" = "ath_asistencia_individual"."deportista_id") AND ("v"."estado" = 'activo'::"text")))))));



CREATE POLICY "ath_auditoria_admin_select" ON "public"."ath_admin_auditoria" FOR SELECT TO "authenticated" USING (( SELECT "public"."ath_es_admin_activo"() AS "ath_es_admin_activo"));



CREATE POLICY "ath_avisos_borrar" ON "public"."ath_avisos_individuales" FOR DELETE TO "authenticated" USING (("autor_id" = "auth"."uid"()));



ALTER TABLE "public"."ath_avisos_individuales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_avisos_insertar" ON "public"."ath_avisos_individuales" FOR INSERT TO "authenticated" WITH CHECK ((("autor_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."rol_id" = 2) AND ("u"."estado" = true)))) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."estado" = 'activo'::"text") AND (("ath_avisos_individuales"."destinatario_id" IS NULL) OR ("v"."deportista_id" = "ath_avisos_individuales"."destinatario_id")))))));



CREATE POLICY "ath_avisos_ver" ON "public"."ath_avisos_individuales" FOR SELECT TO "authenticated" USING ((("autor_id" = "auth"."uid"()) OR (("destinatario_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."deportista_id" = "auth"."uid"()) AND ("v"."estado" = 'activo'::"text"))))) OR (("destinatario_id" IS NULL) AND (EXISTS ( SELECT 1
   FROM "public"."ath_mis_vinculos"() "v"("id", "entrenador_id", "deportista_id", "estado", "nombre_otro", "creado_en")
  WHERE (("v"."deportista_id" = "auth"."uid"()) AND ("v"."entrenador_id" = "ath_avisos_individuales"."autor_id") AND ("v"."estado" = 'activo'::"text")))))));



ALTER TABLE "public"."ath_bloqueos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_chat_estado" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_chat_insert" ON "public"."ath_chats" FOR INSERT TO "authenticated" WITH CHECK ((("tipo" = ANY (ARRAY['privado'::"text", 'grupo'::"text"])) AND ("creador_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."ath_chat_invitaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_chat_mensajes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_chat_participantes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_chat_preferencias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_chat_select" ON "public"."ath_chats" FOR SELECT TO "authenticated" USING ((("tipo" = 'general'::"text") OR "public"."ath_es_participante"("id", ( SELECT "auth"."uid"() AS "uid")) OR ("creador_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."ath_chat_solicitudes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_chats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_denuncias" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_denuncias_admin" ON "public"."ath_denuncias" FOR SELECT TO "authenticated" USING ("public"."ath_mod_admin"());



ALTER TABLE "public"."ath_dispositivos_push" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_edge_cuotas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_eval_borrar" ON "public"."ath_evaluaciones_deportivas" FOR DELETE TO "authenticated" USING ("public"."ath_eval_permiso"("deportista_id", "entrenador_id", true));



CREATE POLICY "ath_eval_crear" ON "public"."ath_evaluaciones_deportivas" FOR INSERT TO "authenticated" WITH CHECK ("public"."ath_eval_permiso"("deportista_id", "entrenador_id", true));



CREATE POLICY "ath_eval_leer" ON "public"."ath_evaluaciones_deportivas" FOR SELECT TO "authenticated" USING ("public"."ath_eval_permiso"("deportista_id", "entrenador_id", false));



ALTER TABLE "public"."ath_evaluaciones_deportivas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_invitaciones_ver" ON "public"."ath_chat_invitaciones" FOR SELECT TO "authenticated" USING ((("invitado_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("invitador_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."ath_match_cache_osm" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_message_insert" ON "public"."ath_chat_mensajes" FOR INSERT TO "authenticated" WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."ath_chats" "c"
  WHERE (("c"."id" = "ath_chat_mensajes"."chat_id") AND (("c"."tipo" = 'general'::"text") OR "public"."ath_es_participante"("c"."id", ( SELECT "auth"."uid"() AS "uid"))))))));



CREATE POLICY "ath_message_select" ON "public"."ath_chat_mensajes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ath_chats" "c"
  WHERE (("c"."id" = "ath_chat_mensajes"."chat_id") AND (("c"."tipo" = 'general'::"text") OR "public"."ath_es_participante"("c"."id", ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "ath_notif_select" ON "public"."ath_notificaciones" FOR SELECT TO "authenticated" USING ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")));



CREATE POLICY "ath_notif_update" ON "public"."ath_notificaciones" FOR UPDATE TO "authenticated" USING ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"))) WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")));



ALTER TABLE "public"."ath_notificaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_nutricion_agua" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_nutricion_objetivos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_part_insert" ON "public"."ath_chat_participantes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ath_chats" "c"
  WHERE (("c"."id" = "ath_chat_participantes"."chat_id") AND ("c"."creador_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("c"."tipo" = ANY (ARRAY['privado'::"text", 'grupo'::"text"]))))));



CREATE POLICY "ath_part_select" ON "public"."ath_chat_participantes" FOR SELECT TO "authenticated" USING ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."ath_es_participante"("chat_id", ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."ath_chats" "c"
  WHERE (("c"."id" = "ath_chat_participantes"."chat_id") AND ("c"."creador_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "ath_perfil_actualizar_propio" ON "public"."usuarios" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."ath_perfil_deportivo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_perfil_propio" ON "public"."ath_perfil_deportivo" TO "authenticated" USING (("usuario_id" = "auth"."uid"())) WITH CHECK (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."ath_preferencias_privacidad" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_presencia_actualizar" ON "public"."ath_usuarios_presencia" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ath_presencia_insertar" ON "public"."ath_usuarios_presencia" FOR INSERT TO "authenticated" WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "ath_presencia_leer" ON "public"."ath_usuarios_presencia" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ath_presencia_privacidad" ON "public"."ath_usuarios_presencia" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."ath_presencia_visible"("usuario_id"));



CREATE POLICY "ath_privacidad_propia" ON "public"."ath_preferencias_privacidad" TO "authenticated" USING (("usuario_id" = "auth"."uid"())) WITH CHECK (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."ath_purgas_resumen" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_push_envios" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_rutina_sesiones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_solicitudes_eliminacion" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_solicitudes_ver" ON "public"."ath_chat_solicitudes" FOR SELECT TO "authenticated" USING ((("remitente_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("destinatario_id" = ( SELECT "auth"."uid"() AS "uid"))));



ALTER TABLE "public"."ath_soporte" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_soporte_mensajes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ath_usuarios_presencia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."actividades" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."alimentacion_registros" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."asistencias" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ath_admin_auditoria" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ath_asistencia_individual" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ath_avisos_individuales" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ath_chat_mensajes" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ath_chat_participantes" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ath_chats" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."avisos" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."codigos_entrenador" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."detalle_rutina" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."ejercicios" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."entrenamientos_programados" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."equipos" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."login_intentos" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."lugares_deportivos" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."muro_comentarios" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."muro_comunidad" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."participantes_partido" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."partidos_activos" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."planes_alimentacion_ia" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."planes_entrenamiento_ia" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."roles" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."rutina_equipo" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."rutina_usuario" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."rutinas" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."sesiones_entrenamiento_ia" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."usuario_equipo" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."usuarios" AS RESTRICTIVE FOR SELECT TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_requiere_cuenta_activa" ON "public"."vinculos_entrenador" AS RESTRICTIVE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_usuario_delete_activa" ON "public"."usuarios" AS RESTRICTIVE FOR DELETE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



CREATE POLICY "ath_v45_usuario_update_activa" ON "public"."usuarios" AS RESTRICTIVE FOR UPDATE TO "authenticated" USING (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls")) WITH CHECK (( SELECT "public"."ath_cuenta_activa_rls"() AS "ath_cuenta_activa_rls"));



ALTER TABLE "public"."avisos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "avisos_insert" ON "public"."avisos" FOR INSERT TO "authenticated" WITH CHECK ((("autor_id" = "auth"."uid"()) AND ("activo" = true) AND ("public"."is_admin"() OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("equipo_id" IS NOT NULL) AND "public"."is_team_trainer"("equipo_id"))) AND (("equipo_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."equipos" "e"
  WHERE (("e"."id" = "avisos"."equipo_id") AND ("e"."estado" = true)))))));



CREATE POLICY "avisos_select" ON "public"."avisos" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("autor_id" = "auth"."uid"())) OR (("activo" = true) AND ("public"."current_app_role"() = ANY (ARRAY['ADMINISTRADOR'::"text", 'ENTRENADOR'::"text", 'DEPORTISTA'::"text"])) AND (("equipo_id" IS NULL) OR "public"."is_team_member"("equipo_id")))));



CREATE POLICY "avisos_update" ON "public"."avisos" FOR UPDATE TO "authenticated" USING (("public"."is_admin"() OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("autor_id" = "auth"."uid"()) AND ("equipo_id" IS NOT NULL) AND "public"."is_team_trainer"("equipo_id")))) WITH CHECK (("public"."is_admin"() OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("autor_id" = "auth"."uid"()) AND ("equipo_id" IS NOT NULL) AND "public"."is_team_trainer"("equipo_id") AND (EXISTS ( SELECT 1
   FROM "public"."equipos" "e"
  WHERE (("e"."id" = "avisos"."equipo_id") AND ("e"."estado" = true)))))));



CREATE POLICY "codigo_propio" ON "public"."codigos_entrenador" FOR SELECT TO "authenticated" USING (("entrenador_id" = "auth"."uid"()));



ALTER TABLE "public"."codigos_entrenador" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."detalle_rutina" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "detalle_rutina_delete" ON "public"."detalle_rutina" FOR DELETE TO "authenticated" USING ("public"."can_manage_routine"("rutina_id"));



CREATE POLICY "detalle_rutina_insert" ON "public"."detalle_rutina" FOR INSERT TO "authenticated" WITH CHECK ("public"."can_manage_routine"("rutina_id"));



CREATE POLICY "detalle_rutina_select" ON "public"."detalle_rutina" FOR SELECT TO "authenticated" USING ("public"."can_view_routine"("rutina_id"));



CREATE POLICY "detalle_rutina_update" ON "public"."detalle_rutina" FOR UPDATE TO "authenticated" USING ("public"."can_manage_routine"("rutina_id")) WITH CHECK ("public"."can_manage_routine"("rutina_id"));



ALTER TABLE "public"."ejercicios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ejercicios_delete" ON "public"."ejercicios" FOR DELETE TO "authenticated" USING ((("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("creado_por" = "auth"."uid"())));



CREATE POLICY "ejercicios_insert" ON "public"."ejercicios" FOR INSERT TO "authenticated" WITH CHECK ((("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("creado_por" = "auth"."uid"())));



CREATE POLICY "ejercicios_select" ON "public"."ejercicios" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ejercicios_update" ON "public"."ejercicios" FOR UPDATE TO "authenticated" USING ((("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("creado_por" = "auth"."uid"()))) WITH CHECK ((("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("creado_por" = "auth"."uid"())));



ALTER TABLE "public"."entrenamientos_programados" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."equipos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "equipos_select" ON "public"."equipos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "equipos_write_admin" ON "public"."equipos" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."login_intentos" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."lugares_deportivos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "match_lugares_lectura" ON "public"."lugares_deportivos" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "match_muro_editar_propio" ON "public"."muro_comunidad" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("char_length"("btrim"("mensaje")) >= 1) AND ("char_length"("btrim"("mensaje")) <= 500)) AND ("ciudad" IS NOT NULL) AND (("char_length"("btrim"("ciudad")) >= 1) AND ("char_length"("btrim"("ciudad")) <= 120))));



CREATE POLICY "match_muro_eliminar_autorizado" ON "public"."muro_comunidad" FOR DELETE TO "authenticated" USING ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."match_es_admin_muro"() AS "match_es_admin_muro")));



CREATE POLICY "match_muro_leer" ON "public"."muro_comunidad" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "match_muro_publicar" ON "public"."muro_comunidad" FOR INSERT TO "authenticated" WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("ciudad" IS NOT NULL) AND (("char_length"("btrim"("ciudad")) >= 1) AND ("char_length"("btrim"("ciudad")) <= 120)) AND (("char_length"("btrim"("mensaje")) >= 1) AND ("char_length"("btrim"("mensaje")) <= 500)) AND (("lugar_id" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."lugares_deportivos" "l"
  WHERE ("l"."id" = "muro_comunidad"."lugar_id")))) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."estado" = true))))));



CREATE POLICY "match_participantes_lectura" ON "public"."participantes_partido" FOR SELECT TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "match_partidos_lectura" ON "public"."partidos_activos" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."muro_comentarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "muro_comentarios_borrar_autorizado" ON "public"."muro_comentarios" FOR DELETE TO "authenticated" USING ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "public"."match_es_admin_muro"() AS "match_es_admin_muro")));



CREATE POLICY "muro_comentarios_crear" ON "public"."muro_comentarios" FOR INSERT TO "authenticated" WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("u"."estado" = true)))) AND (("respuesta_a" IS NULL) OR (EXISTS ( SELECT 1
   FROM "public"."muro_comentarios" "padre"
  WHERE (("padre"."id" = "padre"."respuesta_a") AND ("padre"."publicacion_id" = "padre"."publicacion_id")))))));



CREATE POLICY "muro_comentarios_editar_propio" ON "public"."muro_comentarios" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK ((("usuario_id" = ( SELECT "auth"."uid"() AS "uid")) AND (("char_length"("btrim"("mensaje")) >= 1) AND ("char_length"("btrim"("mensaje")) <= 500))));



CREATE POLICY "muro_comentarios_leer" ON "public"."muro_comentarios" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."muro_comunidad" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "nutricion_propia" ON "public"."ath_nutricion_objetivos" TO "authenticated" USING (("auth"."uid"() = "usuario_id")) WITH CHECK (("auth"."uid"() = "usuario_id"));



ALTER TABLE "public"."participantes_partido" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."partidos_activos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planes_alimentacion_delete_propios" ON "public"."planes_alimentacion_ia" FOR DELETE TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."planes_alimentacion_ia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planes_alimentacion_insert_propios" ON "public"."planes_alimentacion_ia" FOR INSERT TO "authenticated" WITH CHECK (("usuario_id" = "auth"."uid"()));



CREATE POLICY "planes_alimentacion_select_propios" ON "public"."planes_alimentacion_ia" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."planes_entrenamiento_ia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "planes_ia_delete" ON "public"."planes_entrenamiento_ia" FOR DELETE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "planes_ia_insert" ON "public"."planes_entrenamiento_ia" FOR INSERT TO "authenticated" WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "planes_ia_select" ON "public"."planes_entrenamiento_ia" FOR SELECT TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "planes_ia_update" ON "public"."planes_entrenamiento_ia" FOR UPDATE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_select_authenticated" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "roles_write_admin" ON "public"."roles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."rutina_equipo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rutina_equipo_select" ON "public"."rutina_equipo" FOR SELECT TO "authenticated" USING ((("public"."current_app_role"() IS NOT NULL) AND ("public"."is_admin"() OR "public"."is_team_member"("equipo_id") OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND "public"."can_manage_routine"("rutina_id")))));



CREATE POLICY "rutina_equipo_write" ON "public"."rutina_equipo" TO "authenticated" USING (("public"."can_manage_routine"("rutina_id") AND ("public"."is_admin"() OR "public"."is_team_trainer"("equipo_id")))) WITH CHECK (("public"."can_manage_routine"("rutina_id") AND ("public"."is_admin"() OR "public"."is_team_trainer"("equipo_id"))));



ALTER TABLE "public"."rutina_usuario" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rutina_usuario_select" ON "public"."rutina_usuario" FOR SELECT TO "authenticated" USING ((("public"."current_app_role"() IS NOT NULL) AND ("public"."is_admin"() OR ("usuario_id" = "auth"."uid"()) OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND "public"."can_manage_routine"("rutina_id")))));



CREATE POLICY "rutina_usuario_write" ON "public"."rutina_usuario" TO "authenticated" USING ("public"."can_manage_routine"("rutina_id")) WITH CHECK ("public"."can_manage_routine"("rutina_id"));



ALTER TABLE "public"."rutinas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rutinas_delete" ON "public"."rutinas" FOR DELETE TO "authenticated" USING ("public"."can_manage_routine"("id"));



CREATE POLICY "rutinas_insert" ON "public"."rutinas" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_admin"() OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("entrenador_id" = "auth"."uid"()))));



CREATE POLICY "rutinas_select" ON "public"."rutinas" FOR SELECT TO "authenticated" USING (((("public"."current_app_role"() = 'ENTRENADOR'::"text") AND ("entrenador_id" = "auth"."uid"())) OR "public"."can_view_routine"("id")));



CREATE POLICY "rutinas_update" ON "public"."rutinas" FOR UPDATE TO "authenticated" USING ("public"."can_manage_routine"("id")) WITH CHECK ("public"."can_manage_routine"("id"));



ALTER TABLE "public"."sesiones_entrenamiento_ia" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sesiones_ia_delete" ON "public"."sesiones_entrenamiento_ia" FOR DELETE TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "sesiones_ia_insert" ON "public"."sesiones_entrenamiento_ia" FOR INSERT TO "authenticated" WITH CHECK (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "sesiones_ia_select" ON "public"."sesiones_entrenamiento_ia" FOR SELECT TO "authenticated" USING (("usuario_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "soporte_crear" ON "public"."ath_soporte" FOR INSERT TO "authenticated" WITH CHECK ((("usuario_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."estado" IS TRUE))))));



CREATE POLICY "soporte_leer" ON "public"."ath_soporte" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."estado" IS TRUE) AND (("u"."rol_id" = 1) OR ("ath_soporte"."usuario_id" = "auth"."uid"()))))));



CREATE POLICY "soporte_responder" ON "public"."ath_soporte" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."estado" IS TRUE) AND ("u"."rol_id" = 1))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."usuarios" "u"
  WHERE (("u"."id" = "auth"."uid"()) AND ("u"."estado" IS TRUE) AND ("u"."rol_id" = 1)))) AND ("estado" = 'resuelto'::"text") AND ("respuesta" IS NOT NULL)));



ALTER TABLE "public"."usuario_equipo" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuario_equipo_select" ON "public"."usuario_equipo" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("usuario_id" = "auth"."uid"()) OR "public"."is_team_trainer"("equipo_id")));



CREATE POLICY "usuario_equipo_write_admin" ON "public"."usuario_equipo" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "usuarios_select" ON "public"."usuarios" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("id" = "auth"."uid"()) OR (("public"."current_app_role"() = 'ENTRENADOR'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."usuario_equipo" "objetivo"
  WHERE (("objetivo"."usuario_id" = "usuarios"."id") AND ("objetivo"."activo" = true) AND "public"."is_team_trainer"("objetivo"."equipo_id")))))));



CREATE POLICY "usuarios_write_admin" ON "public"."usuarios" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."vinculos_entrenador" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vinculos_participantes" ON "public"."vinculos_entrenador" FOR SELECT TO "authenticated" USING ((("entrenador_id" = "auth"."uid"()) OR ("deportista_id" = "auth"."uid"())));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ath_chat_mensajes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."ath_notificaciones";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";




































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































































REVOKE ALL ON FUNCTION "public"."actualizar_rutina_entrenador"("p_rutina_id" integer, "p_nombre" "text", "p_descripcion" "text", "p_detalles" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."actualizar_rutina_entrenador"("p_rutina_id" integer, "p_nombre" "text", "p_descripcion" "text", "p_detalles" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."actualizar_rutina_entrenador"("p_rutina_id" integer, "p_nombre" "text", "p_descripcion" "text", "p_detalles" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."actualizar_rutina_entrenador"("p_rutina_id" integer, "p_nombre" "text", "p_descripcion" "text", "p_detalles" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_actualizar_video_ejercicio"("p_ejercicio_id" integer, "p_video_anterior" "text", "p_video_nuevo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_actualizar_video_ejercicio"("p_ejercicio_id" integer, "p_video_anterior" "text", "p_video_nuevo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_actualizar_video_ejercicio"("p_ejercicio_id" integer, "p_video_anterior" "text", "p_video_nuevo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_admin_cambiar_estado_usuario"("p_usuario_id" "uuid", "p_estado" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_admin_cambiar_estado_usuario"("p_usuario_id" "uuid", "p_estado" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_admin_cambiar_estado_usuario"("p_usuario_id" "uuid", "p_estado" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_admin_cancelar_partido"("p_partido_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_admin_cancelar_partido"("p_partido_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_admin_cancelar_partido"("p_partido_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_admin_listar_denuncias"("p_bajas" boolean, "p_pendientes" boolean, "p_tipo" "text", "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_admin_listar_denuncias"("p_bajas" boolean, "p_pendientes" boolean, "p_tipo" "text", "p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_admin_listar_denuncias"("p_bajas" boolean, "p_pendientes" boolean, "p_tipo" "text", "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_admin_moderar_contenido"("p_tipo" "text", "p_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_admin_moderar_contenido"("p_tipo" "text", "p_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_admin_moderar_contenido"("p_tipo" "text", "p_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_admin_reporte_global"("p_desde" "date", "p_hasta" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_admin_reporte_global"("p_desde" "date", "p_hasta" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_admin_reporte_global"("p_desde" "date", "p_hasta" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_admin_resolver_denuncia"("p_id" bigint, "p_medida" "text", "p_nota" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_admin_resolver_denuncia"("p_id" bigint, "p_medida" "text", "p_nota" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_admin_resolver_denuncia"("p_id" bigint, "p_medida" "text", "p_nota" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_auditar_cambio"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_auditar_cambio"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_autor_denuncia"("t" "text", "o" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_autor_denuncia"("t" "text", "o" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_bloquear"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_bloquear"("p_usuario" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_bloquear"("p_usuario" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_capturar_autor_denuncia"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_capturar_autor_denuncia"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_chat_estado_rpc"("p_chat" "uuid", "p_mensaje" "text", "p_escribir" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_chat_estado_rpc"("p_chat" "uuid", "p_mensaje" "text", "p_escribir" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_chat_estado_rpc"("p_chat" "uuid", "p_mensaje" "text", "p_escribir" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_chat_preferencia"("p_lectura" boolean, "p_escritura" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_chat_preferencia"("p_lectura" boolean, "p_escritura" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_chat_preferencia"("p_lectura" boolean, "p_escritura" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_codigo_entrenador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_codigo_entrenador"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_codigo_entrenador"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_codigo_entrenador"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_consumir_cuota_edge"("p_usuario" "uuid", "p_servicio" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_consumir_cuota_edge"("p_usuario" "uuid", "p_servicio" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_crear_grupo_solicitudes"("p_nombre" "text", "p_invitados" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_crear_grupo_solicitudes"("p_nombre" "text", "p_invitados" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_crear_grupo_solicitudes"("p_nombre" "text", "p_invitados" "uuid"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_cuenta_activa_rls"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_cuenta_activa_rls"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_cuenta_activa_rls"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_denunciar"("p_tipo" "text", "p_objeto" "text", "p_motivo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_denunciar"("p_tipo" "text", "p_objeto" "text", "p_motivo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_denunciar"("p_tipo" "text", "p_objeto" "text", "p_motivo" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_desbloquear"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_desbloquear"("p_usuario" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_desbloquear"("p_usuario" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_desvincular_entrenador"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_desvincular_entrenador"("p_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."ath_desvincular_entrenador"("p_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_desvincular_entrenador"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_desvincular_push"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_desvincular_push"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_desvincular_push"("p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_edge_crear_perfil"("p_actor" "uuid", "p_id" "uuid", "p_nombre" "text", "p_rut" "text", "p_correo" "text", "p_rol" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_edge_crear_perfil"("p_actor" "uuid", "p_id" "uuid", "p_nombre" "text", "p_rut" "text", "p_correo" "text", "p_rol" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_edge_solicitar_eliminacion"("p_actor" "uuid", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_edge_solicitar_eliminacion"("p_actor" "uuid", "p_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_enviar_push"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_enviar_push"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_es_admin_activo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_es_admin_activo"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_es_admin_activo"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_es_admin_activo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_es_participante"("p_chat" "uuid", "p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_es_participante"("p_chat" "uuid", "p_usuario" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ath_es_participante"("p_chat" "uuid", "p_usuario" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_es_participante"("p_chat" "uuid", "p_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_eval_permiso"("d" "uuid", "e" "uuid", "escritura" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_eval_permiso"("d" "uuid", "e" "uuid", "escritura" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_eval_permiso"("d" "uuid", "e" "uuid", "escritura" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_filtrar_notificacion"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_filtrar_notificacion"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_guardar_bloqueo_chat"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_guardar_bloqueo_chat"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_marcar_presencia"("p_primer_plano" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_marcar_presencia"("p_primer_plano" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_marcar_presencia"("p_primer_plano" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_match_editar_encuentro"("p_partido_id" integer, "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_match_editar_encuentro"("p_partido_id" integer, "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_match_editar_encuentro"("p_partido_id" integer, "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_mis_bloqueos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_mis_bloqueos"() TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_mis_bloqueos"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_mis_vinculos"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_mis_vinculos"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_mis_vinculos"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_mis_vinculos"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_mod_activo"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_mod_activo"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_mod_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_mod_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_mod_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_notificar_deporte_v2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_notificar_deporte_v2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_notificar_evento_v1"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_notificar_evento_v1"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_presencia_visible"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_presencia_visible"("p_usuario" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_presencia_visible"("p_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_registrar_push"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_registrar_push"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_registrar_push"("p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_responder_chat"("p_solicitud" "uuid", "p_aceptar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_responder_chat"("p_solicitud" "uuid", "p_aceptar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_responder_chat"("p_solicitud" "uuid", "p_aceptar" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_responder_invitacion"("p_invitacion" "uuid", "p_aceptar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_responder_invitacion"("p_invitacion" "uuid", "p_aceptar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_responder_invitacion"("p_invitacion" "uuid", "p_aceptar" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_responder_solicitud"("p_id" bigint, "p_aceptar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_responder_solicitud"("p_id" bigint, "p_aceptar" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."ath_responder_solicitud"("p_id" bigint, "p_aceptar" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_responder_solicitud"("p_id" bigint, "p_aceptar" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_resumen_mis_deportistas"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_resumen_mis_deportistas"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_resumen_mis_deportistas"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_resumen_mis_deportistas"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_revisar_denuncia"("p_id" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_revisar_denuncia"("p_id" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_solicitar_chat"("p_destinatario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_solicitar_chat"("p_destinatario" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_solicitar_chat"("p_destinatario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_solicitar_entrenador"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_solicitar_entrenador"("p_codigo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."ath_solicitar_entrenador"("p_codigo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_solicitar_entrenador"("p_codigo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_soporte_crear"("p_categoria" "text", "p_mensaje" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_soporte_crear"("p_categoria" "text", "p_mensaje" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_soporte_crear"("p_categoria" "text", "p_mensaje" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_soporte_listar"("p_admin" boolean, "p_estado" "text", "p_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_soporte_listar"("p_admin" boolean, "p_estado" "text", "p_offset" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_soporte_listar"("p_admin" boolean, "p_estado" "text", "p_offset" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_soporte_responder"("p_id" bigint, "p_admin" boolean, "p_mensaje" "text", "p_resolver" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_soporte_responder"("p_id" bigint, "p_admin" boolean, "p_mensaje" "text", "p_resolver" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."ath_soporte_responder"("p_id" bigint, "p_admin" boolean, "p_mensaje" "text", "p_resolver" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."ath_v29_historial_vinculado"("p_deportista_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_v29_historial_vinculado"("p_deportista_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."ath_v29_historial_vinculado"("p_deportista_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_v29_historial_vinculado"("p_deportista_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_v29_resumen_vinculados"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_v29_resumen_vinculados"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_v29_resumen_vinculados"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_v29_resumen_vinculados"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_v48_anonimizar"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_v48_anonimizar"("p_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_v48_preparar_purga"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_v48_preparar_purga"("p_usuario" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."ath_v48_referencias_pendientes"("p_usuario" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."ath_v48_referencias_pendientes"("p_usuario" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."ath_validar_asignacion_individual"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_validar_asignacion_individual"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_validar_asignacion_individual"() TO "service_role";



GRANT ALL ON FUNCTION "public"."ath_validar_mensaje_chat"() TO "anon";
GRANT ALL ON FUNCTION "public"."ath_validar_mensaje_chat"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ath_validar_mensaje_chat"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."athletix_historial_deportista_entrenador"("p_deportista_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."athletix_historial_deportista_entrenador"("p_deportista_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."athletix_historial_deportista_entrenador"("p_deportista_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."athletix_resumen_deportistas_entrenador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."athletix_resumen_deportistas_entrenador"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."athletix_resumen_deportistas_entrenador"() TO "service_role";



GRANT ALL ON FUNCTION "public"."athletix_validar_programacion"() TO "anon";
GRANT ALL ON FUNCTION "public"."athletix_validar_programacion"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."athletix_validar_programacion"() TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_activity"("p_actividad_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_activity"("p_actividad_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_activity"("p_actividad_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_manage_routine"("p_rutina_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."can_manage_routine"("p_rutina_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_manage_routine"("p_rutina_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."can_view_routine"("p_rutina_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."can_view_routine"("p_rutina_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."can_view_routine"("p_rutina_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."comunidad_guardar_apodo"("nuevo_apodo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."comunidad_guardar_apodo"("nuevo_apodo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."comunidad_guardar_apodo"("nuevo_apodo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consumir_intento_login"("p_clave" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consumir_intento_login"("p_clave" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."current_app_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_app_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_app_role"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."eliminar_rutina_entrenador"("p_rutina_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."eliminar_rutina_entrenador"("p_rutina_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."eliminar_rutina_entrenador"("p_rutina_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."eliminar_rutina_entrenador"("p_rutina_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_member"("p_equipo_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_equipo_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_member"("p_equipo_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_team_trainer"("p_equipo_id" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."is_team_trainer"("p_equipo_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_team_trainer"("p_equipo_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."listar_integrantes_equipo_deportista"("p_equipo_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."listar_integrantes_equipo_deportista"("p_equipo_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."listar_integrantes_equipo_deportista"("p_equipo_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_cancelar_partido"("p_partido_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_cancelar_partido"("p_partido_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_cancelar_partido"("p_partido_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_crear_partido"("p_osm_id" "text", "p_nombre" "text", "p_direccion" "text", "p_latitud" double precision, "p_longitud" double precision, "p_disciplinas" "text"[], "p_deporte" "text", "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_crear_partido"("p_osm_id" "text", "p_nombre" "text", "p_direccion" "text", "p_latitud" double precision, "p_longitud" double precision, "p_disciplinas" "text"[], "p_deporte" "text", "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_crear_partido"("p_osm_id" "text", "p_nombre" "text", "p_direccion" "text", "p_latitud" double precision, "p_longitud" double precision, "p_disciplinas" "text"[], "p_deporte" "text", "p_fecha_hora" timestamp with time zone, "p_capacidad" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_es_admin_muro"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_es_admin_muro"() TO "anon";
GRANT ALL ON FUNCTION "public"."match_es_admin_muro"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_es_admin_muro"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_salir_partido"("p_partido_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_salir_partido"("p_partido_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_salir_partido"("p_partido_id" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."match_unirse_partido"("p_partido_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."match_unirse_partido"("p_partido_id" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."match_unirse_partido"("p_partido_id" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."puede_ver_video_ejercicio"("ruta_archivo" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."puede_ver_video_ejercicio"("ruta_archivo" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."puede_ver_video_ejercicio"("ruta_archivo" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_asistencia"() TO "anon";
GRANT ALL ON FUNCTION "public"."validar_asistencia"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_asistencia"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validar_sesion_ia_propietario"() TO "anon";
GRANT ALL ON FUNCTION "public"."validar_sesion_ia_propietario"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validar_sesion_ia_propietario"() TO "service_role";























































































GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."actividades" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."actividades" TO "authenticated";
GRANT ALL ON TABLE "public"."actividades" TO "service_role";



GRANT ALL ON SEQUENCE "public"."actividades_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."actividades_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."actividades_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."alimentacion_registros" TO "authenticated";
GRANT ALL ON TABLE "public"."alimentacion_registros" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."asistencias" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."asistencias" TO "authenticated";
GRANT ALL ON TABLE "public"."asistencias" TO "service_role";



GRANT ALL ON SEQUENCE "public"."asistencias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."asistencias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."asistencias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ath_admin_auditoria" TO "service_role";
GRANT SELECT ON TABLE "public"."ath_admin_auditoria" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ath_admin_auditoria_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_admin_auditoria_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_admin_auditoria_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_asistencia_individual" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_asistencia_individual" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_asistencia_individual" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_avisos_individuales" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_avisos_individuales" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_avisos_individuales" TO "service_role";



GRANT ALL ON TABLE "public"."ath_bloqueos" TO "service_role";



GRANT ALL ON TABLE "public"."ath_chat_estado" TO "service_role";



GRANT ALL ON TABLE "public"."ath_chat_invitaciones" TO "service_role";
GRANT SELECT ON TABLE "public"."ath_chat_invitaciones" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_chat_mensajes" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_chat_mensajes" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_chat_mensajes" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_chat_participantes" TO "anon";
GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."ath_chat_participantes" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_chat_participantes" TO "service_role";



GRANT ALL ON TABLE "public"."ath_chat_preferencias" TO "service_role";



GRANT ALL ON TABLE "public"."ath_chat_solicitudes" TO "service_role";
GRANT SELECT ON TABLE "public"."ath_chat_solicitudes" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_chats" TO "anon";
GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."ath_chats" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_chats" TO "service_role";



GRANT ALL ON TABLE "public"."ath_denuncias" TO "service_role";
GRANT SELECT ON TABLE "public"."ath_denuncias" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ath_denuncias_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_denuncias_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_denuncias_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ath_dispositivos_push" TO "service_role";



GRANT ALL ON TABLE "public"."ath_edge_cuotas" TO "service_role";



GRANT ALL ON TABLE "public"."ath_evaluaciones_deportivas" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."ath_evaluaciones_deportivas" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ath_evaluaciones_deportivas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_evaluaciones_deportivas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_evaluaciones_deportivas_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ath_match_cache_osm" TO "service_role";



GRANT ALL ON TABLE "public"."ath_notificaciones" TO "service_role";
GRANT SELECT ON TABLE "public"."ath_notificaciones" TO "authenticated";



GRANT UPDATE("leida") ON TABLE "public"."ath_notificaciones" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ath_notificaciones_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_notificaciones_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_notificaciones_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_nutricion_agua" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_nutricion_agua" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ath_nutricion_objetivos" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_nutricion_objetivos" TO "service_role";



GRANT ALL ON TABLE "public"."ath_perfil_deportivo" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."ath_perfil_deportivo" TO "authenticated";



GRANT ALL ON TABLE "public"."ath_preferencias_privacidad" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."ath_preferencias_privacidad" TO "authenticated";



GRANT ALL ON TABLE "public"."ath_purgas_resumen" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ath_purgas_resumen_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_purgas_resumen_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_purgas_resumen_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ath_push_envios" TO "service_role";



GRANT ALL ON TABLE "public"."ath_rutina_sesiones" TO "service_role";
GRANT SELECT,INSERT ON TABLE "public"."ath_rutina_sesiones" TO "authenticated";



GRANT ALL ON TABLE "public"."ath_solicitudes_eliminacion" TO "service_role";



GRANT ALL ON TABLE "public"."ath_soporte" TO "service_role";
GRANT SELECT ON TABLE "public"."ath_soporte" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."ath_soporte_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_soporte_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_soporte_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ath_soporte_mensajes" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ath_soporte_mensajes_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ath_soporte_mensajes_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ath_soporte_mensajes_id_seq" TO "service_role";



GRANT SELECT,DELETE,MAINTAIN ON TABLE "public"."ath_usuarios_presencia" TO "authenticated";
GRANT ALL ON TABLE "public"."ath_usuarios_presencia" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."avisos" TO "anon";
GRANT SELECT,INSERT,MAINTAIN,UPDATE ON TABLE "public"."avisos" TO "authenticated";
GRANT ALL ON TABLE "public"."avisos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."avisos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."avisos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."avisos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."codigos_entrenador" TO "service_role";
GRANT SELECT ON TABLE "public"."codigos_entrenador" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."detalle_rutina" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."detalle_rutina" TO "authenticated";
GRANT ALL ON TABLE "public"."detalle_rutina" TO "service_role";



GRANT ALL ON SEQUENCE "public"."detalle_rutina_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."detalle_rutina_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."detalle_rutina_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ejercicios" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."ejercicios" TO "authenticated";
GRANT ALL ON TABLE "public"."ejercicios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."ejercicios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."ejercicios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."ejercicios_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."entrenamientos_programados" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."entrenamientos_programados" TO "authenticated";
GRANT ALL ON TABLE "public"."entrenamientos_programados" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."equipos" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."equipos" TO "authenticated";
GRANT ALL ON TABLE "public"."equipos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."equipos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."equipos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."equipos_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."login_intentos" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."lugares_deportivos" TO "authenticated";
GRANT ALL ON TABLE "public"."lugares_deportivos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."lugares_deportivos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."lugares_deportivos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."lugares_deportivos_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."muro_comentarios" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."muro_comentarios" TO "authenticated";
GRANT ALL ON TABLE "public"."muro_comentarios" TO "service_role";



GRANT ALL ON SEQUENCE "public"."muro_comentarios_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."muro_comentarios_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."muro_comentarios_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."muro_comunidad" TO "authenticated";
GRANT ALL ON TABLE "public"."muro_comunidad" TO "service_role";



GRANT ALL ON SEQUENCE "public"."muro_comunidad_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."muro_comunidad_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."muro_comunidad_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."participantes_partido" TO "authenticated";
GRANT ALL ON TABLE "public"."participantes_partido" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."partidos_activos" TO "authenticated";
GRANT ALL ON TABLE "public"."partidos_activos" TO "service_role";



GRANT ALL ON SEQUENCE "public"."partidos_activos_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."partidos_activos_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."partidos_activos_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN ON TABLE "public"."usuarios" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN ON TABLE "public"."usuarios" TO "authenticated";
GRANT ALL ON TABLE "public"."usuarios" TO "service_role";



GRANT UPDATE("nombre") ON TABLE "public"."usuarios" TO "authenticated";



GRANT UPDATE("fecha_nacimiento") ON TABLE "public"."usuarios" TO "authenticated";



GRANT UPDATE("apodo_publico") ON TABLE "public"."usuarios" TO "authenticated";



GRANT UPDATE("telefono") ON TABLE "public"."usuarios" TO "authenticated";



GRANT ALL ON TABLE "public"."perfiles_publicos" TO "service_role";
GRANT SELECT ON TABLE "public"."perfiles_publicos" TO "authenticated";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."planes_alimentacion_ia" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."planes_alimentacion_ia" TO "authenticated";
GRANT ALL ON TABLE "public"."planes_alimentacion_ia" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."planes_entrenamiento_ia" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."planes_entrenamiento_ia" TO "authenticated";
GRANT ALL ON TABLE "public"."planes_entrenamiento_ia" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."roles" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";



GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."roles_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rutina_equipo" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rutina_equipo" TO "authenticated";
GRANT ALL ON TABLE "public"."rutina_equipo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rutina_equipo_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rutina_equipo_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rutina_equipo_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rutina_usuario" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rutina_usuario" TO "authenticated";
GRANT ALL ON TABLE "public"."rutina_usuario" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rutina_usuario_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rutina_usuario_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rutina_usuario_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rutinas" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."rutinas" TO "authenticated";
GRANT ALL ON TABLE "public"."rutinas" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rutinas_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rutinas_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rutinas_id_seq" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."sesiones_entrenamiento_ia" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."sesiones_entrenamiento_ia" TO "authenticated";
GRANT ALL ON TABLE "public"."sesiones_entrenamiento_ia" TO "service_role";



GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."usuario_equipo" TO "anon";
GRANT SELECT,INSERT,DELETE,MAINTAIN,UPDATE ON TABLE "public"."usuario_equipo" TO "authenticated";
GRANT ALL ON TABLE "public"."usuario_equipo" TO "service_role";



GRANT ALL ON SEQUENCE "public"."usuario_equipo_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."usuario_equipo_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."usuario_equipo_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."vinculos_entrenador" TO "service_role";
GRANT SELECT ON TABLE "public"."vinculos_entrenador" TO "authenticated";



GRANT ALL ON SEQUENCE "public"."vinculos_entrenador_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."vinculos_entrenador_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."vinculos_entrenador_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































