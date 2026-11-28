import { createClient } from 'npm:@supabase/supabase-js@2';
// Athletix v48. Worker EXCLUSIVO del servidor. Nunca invocar desde React.
// Modo predeterminado: simulación. Requiere aprobación explícita para producción.
const json = (data, status = 200)=>Response.json(data, {
    status
  });
const uuid = (value)=>typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const errorText = (e)=>e instanceof Error ? e.message : String(e);
Deno.serve(async (req)=>{
  if (req.method !== 'POST') return json({
    error: 'Método no permitido'
  }, 405);
  const expected = Deno.env.get('V48_WORKER_SECRET');
  const supplied = req.headers.get('x-v48-worker-secret');
  if (!expected || !supplied || supplied !== expected) return json({
    error: 'Unauthorized'
  }, 401);
  if (Deno.env.get('V48_EXECUTION_ENABLED') !== 'true') {
    return json({
      simulacion: true,
      mensaje: 'Ejecución deshabilitada. No se modificaron datos.'
    });
  }
  const scope = Deno.env.get('V48_EXECUTION_SCOPE');
  const testId = Deno.env.get('V48_TEST_USER_ID');
  if (scope !== 'test' && scope !== 'production') return json({
    error: 'Alcance no autorizado'
  }, 412);
  if (scope === 'test' && !uuid(testId)) return json({
    error: 'V48_TEST_USER_ID inválido'
  }, 412);
  if (scope === 'production' && Deno.env.get('V48_PRODUCTION_APPROVED') !== 'true') {
    return json({
      error: 'Producción no aprobada'
    }, 412);
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return json({
    error: 'Configuración incompleta'
  }, 503);
  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  let query = db.from('ath_solicitudes_eliminacion').select('usuario_id,estado,anonimizado_en,eliminar_despues_de,purga_preparada_en').in('estado', [
    'pendiente',
    'error',
    'procesando'
  ]).order('solicitado_en', {
    ascending: true
  }).limit(scope === 'test' ? 1 : 25);
  if (scope === 'test') query = query.eq('usuario_id', testId);
  const { data: items, error } = await query;
  if (error) return json({
    error: 'No se pudo leer la cola'
  }, 500);
  const result = {
    revisadas: 0,
    minimizadas: 0,
    en_espera: 0,
    purgadas: 0,
    errores: 0
  };
  for (const item of items ?? []){
    const id = item.usuario_id;
    if (!uuid(id) || scope === 'test' && id !== testId) continue;
    result.revisadas++;
    try {
      // Cuenta administradora protegida incluso si alguien altera la cola.
      const { data: profile, error: profileError } = await db.from('usuarios').select('id,rol_id').eq('id', id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile || Number(profile.rol_id) === 1) throw new Error('Cuenta inexistente o administradora protegida');
      if (!item.anonimizado_en) {
        const { error: minError } = await db.rpc('ath_v48_anonimizar', {
          p_usuario: id
        });
        if (minError) throw minError;
        result.minimizadas++;
      }
      // El servidor SQL vuelve a comprobar el plazo antes de preparar la purga.
      if (!item.eliminar_despues_de || new Date(item.eliminar_despues_de).getTime() > Date.now()) {
        result.en_espera++;
        continue;
      }
      if (!item.purga_preparada_en) {
        const { error: prepError } = await db.rpc('ath_v48_preparar_purga', {
          p_usuario: id
        });
        if (prepError) throw prepError;
      }
      const { data: refs, error: refsError } = await db.rpc('ath_v48_referencias_pendientes', {
        p_usuario: id
      });
      if (refsError) throw refsError;
      if ((refs ?? []).length > 0) {
        throw new Error('Referencias pendientes: ' + (refs ?? []).map((r)=>`${r.tabla}.${r.columna}`).join(', ').slice(0, 250));
      }
      // Crear rastro sin identificadores ANTES de borrar Auth: la cola usa ON DELETE CASCADE.
      const { data: summary, error: summaryError } = await db.from('ath_purgas_resumen').insert({
        resultado: 'iniciado'
      }).select('id').single();
      if (summaryError || !summary) throw summaryError ?? new Error('No se pudo registrar la operación');
      const { error: authError } = await db.auth.admin.deleteUser(id);
      if (authError && !/not found|user not found/i.test(authError.message)) throw authError;
      const { error: deleteError } = await db.from('usuarios').delete().eq('id', id).neq('rol_id', 1);
      if (deleteError) throw deleteError;
      const { error: completeError } = await db.from('ath_purgas_resumen').update({
        resultado: 'completado'
      }).eq('id', summary.id);
      if (completeError) throw completeError;
      result.purgadas++;
    } catch (e) {
      result.errores++;
      const message = errorText(e).slice(0, 400);
      // Reintento si la cola sigue existiendo; si desapareció por cascada, queda el resumen.
      await db.from('ath_solicitudes_eliminacion').update({
        estado: 'error',
        ultimo_error: message
      }).eq('usuario_id', id);
      console.error('Fallo v48:', message); // Sin RUT, correo ni UUID en el log.
    }
  }
  return json(result);
});
