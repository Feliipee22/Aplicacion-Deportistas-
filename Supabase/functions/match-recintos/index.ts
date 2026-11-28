import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const reply = (body, status = 200)=>Response.json(body, {
    status,
    headers: cors
  });
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response(null, {
    headers: cors
  });
  if (req.method !== 'POST') return reply({
    error: 'Método no permitido'
  }, 405);
  try {
    const db = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const token = req.headers.get('Authorization')?.replace(/^Bearer /i, '');
    if (!token) return reply({
      error: 'No autorizado'
    }, 401);
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return reply({
      error: 'No autorizado'
    }, 401);
    const quotaUrl = Deno.env.get("SUPABASE_URL");
    const quotaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!quotaUrl || !quotaKey) return reply({
      error: "Servicio no disponible."
    }, 503);
    const quotaDb = createClient(quotaUrl, quotaKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data: quota, error: quotaError } = await quotaDb.rpc("ath_consumir_cuota_edge", {
      p_usuario: auth.user.id,
      p_servicio: "match-recintos"
    });
    if (quotaError) return reply({
      error: "Servicio no disponible."
    }, 503);
    if (quota === "inactivo") return reply({
      error: "Cuenta no disponible."
    }, 403);
    if (quota === "limite") return reply({
      error: "Alcanzaste el límite temporal de consultas. Intenta más tarde."
    }, 429);
    if (quota !== "ok") return reply({
      error: "Servicio no disponible."
    }, 503);
    const body = await req.json();
    const lat = Number(body.latitud), lon = Number(body.longitud), radius = Math.min(16, Math.max(1, Number(body.radioKm) || 5));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -56.5 || lat > -17 || lon < -110 || lon > -65) return reply({
      error: 'Zona inválida'
    }, 400);
    const dy = radius / 111.2, dx = dy / Math.cos(lat * Math.PI / 180);
    let bounds = [
      lat - dy,
      lon - dx,
      lat + dy,
      lon + dx
    ];
    if (Array.isArray(body.limites) && body.limites.length === 4 && body.limites.every((v)=>typeof v === 'number' && Number.isFinite(v))) {
      const [s, w, n, e] = body.limites;
      if (s <= lat && lat <= n && w <= lon && lon <= e && n - s <= 0.4 && e - w <= 0.6) bounds = [
        s,
        w,
        n,
        e
      ];
    }
    const key = "geoapify-v3:" + bounds.map((v)=>v.toFixed(4)).join(',');
    const { data: cached, error: cacheError } = await db.from('ath_match_cache_osm').select('elementos,actualizado_en').eq('zona', key).maybeSingle();
    if (cacheError) throw cacheError;
    if (cached && Date.now() - Date.parse(cached.actualizado_en) < (cached.elementos.length ? 86400000 : 300000)) return reply({
      elements: cached.elementos
    });
    const apiKey = Deno.env.get('GEOAPIFY_API_KEY');
    if (!apiKey) return reply({
      error: 'Proveedor no configurado'
    }, 503);
    try {
      const [south, west, north, east] = bounds;
      const elements = [];
      const seen = new Set();
      for (const category of [
        "sport.pitch,sport.sports_centre,sport.sports_hall,sport.stadium,sport.swimming_pool,sport.track,sport.fitness,sport.skateboard,sport.dojo,activity.sport_club",
        "leisure.park"
      ]){
        for(let offset = 0; offset < (category !== "leisure.park" ? 1000 : 500); offset += 500){
          const params = new URLSearchParams({
            categories: category,
            filter: `rect:${west},${north},${east},${south}`,
            limit: '500',
            offset: String(offset),
            apiKey
          });
          const response = await fetch('https://api.geoapify.com/v2/places?' + params, {
            signal: AbortSignal.timeout(20000)
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const result = await response.json();
          if (!Array.isArray(result.features)) throw new Error('Respuesta inválida');
          for (const feature of result.features){
            const p = feature.properties || {}, raw = p.datasource?.raw || {};
            const [lon, lat] = feature.geometry?.coordinates || [];
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < south || lat > north || lon < west || lon > east) continue;
            const cats = Array.isArray(p.categories) ? p.categories : [];
            const osmType = raw.osm_type, osmId = raw.osm_id;
            const validOsm = [
              'node',
              'way',
              'relation'
            ].includes(osmType) && osmId != null;
            const id = validOsm ? String(osmId) : p.place_id;
            if (!id) continue;
            const type = validOsm ? osmType : 'geoapify';
            const identity = `${type}/${id}`;
            if (seen.has(identity)) continue;
            seen.add(identity);
            const isSport = category !== 'leisure.park' || cats.some((c)=>c === 'sport' || c.startsWith('sport.'));
            const kind = cats.find((c)=>c.startsWith('sport.') && c !== 'sport.fitness')?.split('.').pop();
            const tags = {
              ...raw,
              name: p.name || raw.name,
              'addr:full': p.formatted || p.address_line2 || '',
              leisure: raw.leisure || (isSport ? kind === 'gym' ? 'fitness_centre' : kind || 'sports_centre' : 'park'),
              sport: raw.sport || p.sport || '',
              geo_categories: cats,
              geo_sport: isSport
            };
            elements.push({
              type,
              id,
              lat,
              lon,
              tags
            });
          }
          if (result.features.length < 500) break;
        }
      }
      const { error } = await db.from('ath_match_cache_osm').upsert({
        zona: key,
        elementos: elements,
        actualizado_en: new Date().toISOString()
      });
      if (error) console.error('Cache:', error.message);
      console.info('Recintos por tipo:', {
        deportivos: elements.filter((e)=>e.tags.geo_sport).length,
        recreativos: elements.filter((e)=>!e.tags.geo_sport).length
      });
      return reply({
        elements
      });
    } catch (e) {
      console.warn('Geoapify:', String(e));
    }
    if (cached) return reply({
      elements: cached.elementos,
      stale: true
    });
    return reply({
      error: 'Proveedor de recintos temporalmente no disponible'
    }, 503);
  } catch (e) {
    console.error(String(e));
    return reply({
      error: 'No fue posible consultar recintos'
    }, 500);
  }
});
