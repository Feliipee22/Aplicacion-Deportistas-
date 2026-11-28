import { createClient } from "npm:@supabase/supabase-js@2";
const ORIGENES_PERMITIDOS = new Set([
  "http://localhost:3000",
  "http://localhost",
  "https://localhost"
]);
const REDIRECCION_ANDROID = "athletix://auth/confirm";
const REDIRECCION_PC = "http://localhost:3000";
function obtenerCorsHeaders(req) {
  const origen = req.headers.get("origin") || "";
  const headers = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
  if (ORIGENES_PERMITIDOS.has(origen)) {
    headers["Access-Control-Allow-Origin"] = origen;
  }
  return headers;
}
function normalizarRut(valor) {
  if (typeof valor !== "string") return null;
  const limpio = valor.toUpperCase().replace(/[^0-9K]/g, "");
  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) {
    return null;
  }
  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0;
  let factor = 2;
  for(let i = numero.length - 1; i >= 0; i--){
    suma += Number(numero[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const calculo = 11 - suma % 11;
  const esperado = calculo === 11 ? "0" : calculo === 10 ? "K" : String(calculo);
  return dv === esperado ? `${numero}-${dv}` : null;
}
Deno.serve(async (req)=>{
  const headers = obtenerCorsHeaders(req);
  function responder(mensaje, status = 200) {
    return new Response(JSON.stringify(mensaje), {
      status,
      headers
    });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers
    });
  }
  if (req.method !== "POST") {
    return responder({
      error: "Método no permitido"
    }, 405);
  }
  try {
    const body = await req.json();
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    const correo = typeof body?.correo === "string" ? body.correo.trim().toLowerCase() : "";
    const rut = normalizarRut(body?.rut);
    const password = body?.password;
    const captchaToken = body?.captchaToken;
    if (nombre.length < 2 || nombre.length > 100 || !rut || correo.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || typeof password !== "string" || password.length < 6 || password.length > 128 || typeof captchaToken !== "string" || !captchaToken) {
      return responder({
        error: "Revisa los datos ingresados"
      }, 400);
    }
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secret) {
      return responder({
        error: "Servicio no configurado"
      }, 503);
    }
    const captchaResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        secret,
        response: captchaToken
      })
    });
    if (!captchaResponse.ok) {
      return responder({
        error: "No se pudo verificar el CAPTCHA"
      }, 503);
    }
    const captcha = await captchaResponse.json();
    if (!captcha.success || captcha.hostname !== "localhost") {
      return responder({
        error: "Verificación de seguridad fallida"
      }, 403);
    }
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return responder({
        error: "Servicio no disponible"
      }, 503);
    }
    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const publico = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    const { data: existente, error: errorBusqueda } = await admin.from("usuarios").select("id").eq("rut", rut).maybeSingle();
    if (errorBusqueda) {
      return responder({
        error: "No se pudo validar el registro"
      }, 500);
    }
    if (existente) {
      return responder({
        error: "No se pudo completar el registro"
      }, 409);
    }
    // Elegir la redirección según el dispositivo.
    const origen = req.headers.get("origin") || "";
    const emailRedirectTo = origen === "http://localhost:3000" ? REDIRECCION_PC : REDIRECCION_ANDROID;
    const { data, error: errorRegistro } = await publico.auth.signUp({
      email: correo,
      password,
      options: {
        emailRedirectTo
      }
    });
    if (errorRegistro || !data.user) {
      return responder({
        error: "No se pudo completar el registro"
      }, 400);
    }
    if (!data.user.identities?.length) {
      return responder({
        mensaje: "Si corresponde a una cuenta nueva, recibirás un correo de confirmación."
      });
    }
    const { error: errorPerfil } = await admin.from("usuarios").insert({
      id: data.user.id,
      nombre,
      rut,
      correo,
      rol_id: 3,
      estado: true
    });
    if (errorPerfil) {
      const { error: errorReversion } = await admin.auth.admin.deleteUser(data.user.id);
      if (errorReversion) {
        console.error("Revisar registro incompleto:", data.user.id);
      }
      return responder({
        error: "No se pudo completar el registro"
      }, 409);
    }
    return responder({
      mensaje: "Cuenta creada. Revisa tu correo para confirmarla."
    }, 201);
  } catch (error) {
    console.error("Error en registro-deportista:", error);
    return responder({
      error: "No fue posible procesar el registro"
    }, 500);
  }
});
