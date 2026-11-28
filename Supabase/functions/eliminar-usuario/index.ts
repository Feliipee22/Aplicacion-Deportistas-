import { createClient } from 'npm:@supabase/supabase-js@2';
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const reply = (status, body)=>new Response(JSON.stringify(body), {
    status,
    headers
  });
const activo = (v)=>v === true || v === 'true' || v === 'activo';
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response(null, {
    status: 204,
    headers
  });
  if (req.method !== 'POST') return reply(405, {
    error: 'Método no permitido'
  });
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return reply(503, {
    error: 'Servicio no configurado'
  });
  const token = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(401, {
    error: 'Sesión requerida'
  });
  const db = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  if (authErr || !auth.user) return reply(401, {
    error: 'Sesión inválida'
  });
  const { data: admin, error: adminErr } = await db.from('usuarios').select('id, rol_id, estado').eq('id', auth.user.id).maybeSingle();
  if (adminErr || !admin || Number(admin.rol_id) !== 1 || !activo(admin.estado)) return reply(403, {
    error: 'Solo administradores activos'
  });
  let payload;
  try {
    payload = await req.json();
  } catch  {
    return reply(400, {
      error: 'Solicitud inválida'
    });
  }
  const id = payload?.usuario_id;
  if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return reply(400, {
    error: 'ID inválido'
  });
  if (id === auth.user.id) return reply(403, {
    error: 'No puedes eliminar tu propia cuenta'
  });
  const { data: target, error: targetErr } = await db.from('usuarios').select('id, rol_id, estado').eq('id', id).maybeSingle();
  if (targetErr || !target) return reply(404, {
    error: 'Cuenta no encontrada'
  });
  if (Number(target.rol_id) === 1) return reply(403, {
    error: 'Las cuentas administrativas están protegidas'
  });
  const { error: queueErr } = await db.rpc('ath_edge_solicitar_eliminacion', {
    p_actor: auth.user.id,
    p_id: id
  });
  if (queueErr) return reply(500, {
    error: 'No se pudo registrar la solicitud de eliminación'
  });
  return reply(200, {
    ok: true,
    mensaje: 'Cuenta desactivada y solicitud de eliminación registrada.'
  });
});
