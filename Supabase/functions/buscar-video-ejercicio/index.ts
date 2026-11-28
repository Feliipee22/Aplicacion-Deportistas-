import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json'
};
const res = (data, status = 200)=>new Response(JSON.stringify(data), {
    status,
    headers: cors
  });
const normalizar = (s)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const cache = new Map();
const equivalencias = [
  [
    'sentadilla al aire',
    'sentadilla con peso corporal',
    'sentadillas al aire'
  ],
  [
    'puente de gluteos',
    'elevacion de cadera'
  ],
  [
    'plancha abdominal',
    'plancha frontal'
  ],
  [
    'flexiones de brazos',
    'flexiones',
    'lagartijas'
  ],
  [
    'zancadas',
    'estocadas'
  ],
  [
    'jumping jacks',
    'saltos de tijera'
  ]
].map((g)=>g.map(normalizar));
function coincide(nombre, titulo) {
  const n = normalizar(nombre), t = normalizar(titulo);
  if (!n || !t) return false;
  const variantes = [
    n,
    ...equivalencias.find((g)=>g.includes(n)) || []
  ];
  return variantes.some((v)=>t.includes(v));
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response(null, {
    headers: cors
  });
  if (req.method !== 'POST') return res({
    error: 'Método no permitido.'
  }, 405);
  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!token || !url || !anon) return res({
      error: 'Inicia sesión para buscar videos.'
    }, 401);
    const client = createClient(url, anon, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      auth: {
        persistSession: false
      }
    });
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return res({
      error: 'Sesión no válida.'
    }, 401);
    const quotaUrl = Deno.env.get("SUPABASE_URL");
    const quotaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!quotaUrl || !quotaKey) return res({
      error: "Servicio no disponible."
    }, 503);
    const quotaDb = createClient(quotaUrl, quotaKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data: quota, error: quotaError } = await quotaDb.rpc("ath_consumir_cuota_edge", {
      p_usuario: user.id,
      p_servicio: "buscar-video-ejercicio"
    });
    if (quotaError) return res({
      error: "Servicio no disponible."
    }, 503);
    if (quota === "inactivo") return res({
      error: "Cuenta no disponible."
    }, 403);
    if (quota === "limite") return res({
      error: "Alcanzaste el límite temporal de consultas. Intenta más tarde."
    }, 429);
    if (quota !== "ok") return res({
      error: "Servicio no disponible."
    }, 503);
    const body = await req.json();
    const nombre = String(body?.nombre || '').trim();
    if (nombre.length < 3 || nombre.length > 120 || !/[a-záéíóúñ]/i.test(nombre)) return res({
      error: 'Nombre de ejercicio inválido.'
    }, 400);
    const key = Deno.env.get('YOUTUBE_API_KEY');
    if (!key) return res({
      error: 'La búsqueda externa aún no está configurada.'
    }, 503);
    const k = normalizar(nombre);
    const guardado = cache.get(k);
    if (guardado && guardado.expires > Date.now()) return res(guardado.result);
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: `${nombre} ejercicio técnica correcta`,
      maxResults: '8',
      videoEmbeddable: 'true',
      safeSearch: 'strict',
      relevanceLanguage: 'es',
      key
    });
    const respuesta = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    if (!respuesta.ok) {
      console.error('YouTube API', respuesta.status);
      return res({
        error: respuesta.status === 403 ? 'La búsqueda de videos no está disponible por ahora.' : 'No se pudieron consultar videos en este momento.'
      }, 503);
    }
    const json = await respuesta.json();
    const candidatos = (json.items || []).filter((item)=>/^[\w-]{11}$/.test(item.id?.videoId || '') && coincide(nombre, item.snippet?.title || ''));
    let resultado = {
      video_url: null,
      mensaje: 'No encontramos una demostración suficientemente coincidente. Puedes buscarla manualmente.'
    };
    if (candidatos.length) {
      const ids = candidatos.map((x)=>x.id.videoId).join(',');
      const meta = await fetch(`https://www.googleapis.com/youtube/v3/videos?${new URLSearchParams({
        part: 'status,snippet',
        id: ids,
        key
      })}`);
      if (meta.ok) {
        const m = await meta.json();
        const valido = (m.items || []).find((v)=>v.status?.embeddable === true && v.status?.privacyStatus === 'public' && coincide(nombre, v.snippet?.title || ''));
        if (valido) resultado = {
          video_url: `https://www.youtube.com/watch?v=${valido.id}`,
          titulo: valido.snippet.title
        };
      }
    }
    if (cache.size > 250) cache.clear();
    cache.set(k, {
      expires: Date.now() + 24 * 60 * 60 * 1000,
      result: resultado
    });
    return res(resultado);
  } catch (e) {
    console.error('buscar-video-ejercicio', String(e));
    return res({
      error: 'No se pudo completar la búsqueda.'
    }, 500);
  }
});
