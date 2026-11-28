import { createClient } from "npm:@supabase/supabase-js@2";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json"
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MIME_PERMITIDOS = [
  "image/jpeg",
  "image/png",
  "image/webp"
];
function responder(datos, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers
  });
}
Deno.serve(async (req)=>{
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers
    });
  }
  if (req.method !== "POST") {
    return responder({
      error: "Método no permitido."
    }, 405);
  }
  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) {
      return responder({
        error: "Debes iniciar sesión."
      }, 401);
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!supabaseUrl || !supabaseAnonKey || !geminiKey) {
      return responder({
        error: "Falta configuración del servidor."
      }, 500);
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data: usuario, error: errorUsuario } = await supabase.auth.getUser(token);
    if (errorUsuario || !usuario.user) {
      return responder({
        error: "Sesión no válida."
      }, 401);
    }
    const quotaUrl = Deno.env.get("SUPABASE_URL");
    const quotaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!quotaUrl || !quotaKey) return responder({
      error: "Servicio no disponible."
    }, 503);
    const quotaDb = createClient(quotaUrl, quotaKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data: quota, error: quotaError } = await quotaDb.rpc("ath_consumir_cuota_edge", {
      p_usuario: usuario.user.id,
      p_servicio: "analizar-alimento"
    });
    if (quotaError) return responder({
      error: "Servicio no disponible."
    }, 503);
    if (quota === "inactivo") return responder({
      error: "Cuenta no disponible."
    }, 403);
    if (quota === "limite") return responder({
      error: "Alcanzaste el límite temporal de consultas. Intenta más tarde."
    }, 429);
    if (quota !== "ok") return responder({
      error: "Servicio no disponible."
    }, 503);
    const body = await req.json();
    const mimeType = body?.mimeType;
    const imageBase64 = body?.imageBase64;
    if (!MIME_PERMITIDOS.includes(mimeType)) {
      return responder({
        error: "Formato de imagen no permitido."
      }, 400);
    }
    if (typeof imageBase64 !== "string" || imageBase64.length === 0 || imageBase64.length > Math.ceil(MAX_IMAGE_BYTES * 4 / 3) + 8 || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
      return responder({
        error: "Imagen inválida o demasiado grande."
      }, 400);
    }
    const prompt = `
Analiza esta fotografía de comida para una aplicación deportiva.

Identifica los alimentos visibles y estima sus porciones en gramos.
Calcula aproximadamente calorías, proteínas, carbohidratos y grasas.

Devuelve únicamente un objeto JSON con esta estructura:
{
  "alimentos": [
    {
      "nombre": "Nombre del alimento",
      "cantidad_g": 100,
      "calorias": 150,
      "proteinas_g": 10,
      "carbohidratos_g": 15,
      "grasas_g": 5
    }
  ],
  "totales": {
    "calorias": 150,
    "proteinas_g": 10,
    "carbohidratos_g": 15,
    "grasas_g": 5
  },
  "observaciones": "Explica brevemente las principales incertidumbres."
}

Reglas:
- Todos los valores nutricionales deben ser números no negativos.
- No inventes ingredientes que no puedan inferirse razonablemente.
- Si no hay comida identificable, devuelve alimentos vacío y totales en cero.
- Reconoce que las porciones, aceites e ingredientes ocultos son inciertos.
- No presentes los resultados como mediciones exactas.
`;
    const respuestaGemini = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": geminiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
          maxOutputTokens: 2048
        }
      })
    });
    if (!respuestaGemini.ok) {
      console.error("Error de Gemini:", respuestaGemini.status);
      if (respuestaGemini.status === 429) {
        return responder({
          error: "Se alcanzó el límite gratuito de análisis. Intenta más tarde."
        }, 429);
      }
      return responder({
        error: "No se pudo analizar la fotografía. Intenta nuevamente."
      }, 502);
    }
    const resultado = await respuestaGemini.json();
    const texto = resultado?.candidates?.[0]?.content?.parts?.map((parte)=>parte.text ?? "").join("");
    if (!texto) {
      return responder({
        error: "La IA no devolvió un análisis válido."
      }, 502);
    }
    const analisis = JSON.parse(texto);
    if (!Array.isArray(analisis.alimentos) || !analisis.totales || analisis.alimentos.length > 100 || !analisis.alimentos.every((a)=>a && typeof a.nombre === "string" && [
        "cantidad_g",
        "calorias",
        "proteinas_g",
        "carbohidratos_g",
        "grasas_g"
      ].every((k)=>typeof a[k] === "number" && Number.isFinite(a[k]) && a[k] >= 0)) || ![
      "calorias",
      "proteinas_g",
      "carbohidratos_g",
      "grasas_g"
    ].every((k)=>typeof analisis.totales[k] === "number" && Number.isFinite(analisis.totales[k]) && analisis.totales[k] >= 0)) {
      return responder({
        error: "El análisis tiene un formato incorrecto."
      }, 502);
    }
    return responder({
      ...analisis,
      aviso: "Estimación orientativa. Las cantidades y nutrientes pueden variar."
    });
  } catch (error) {
    console.error("Error en analizar-alimento:", error);
    return responder({
      error: "Ocurrió un error al procesar la fotografía."
    }, 500);
  }
});
