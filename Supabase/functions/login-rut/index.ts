import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "http://localhost:3000",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function responder(datos: object, estado = 200) {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizarRut(valor: string) {
  const limpio = valor
    .toUpperCase()
    .replace(/[^0-9K]/g, "");

  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) {
    return null;
  }

  return `${limpio.slice(0, -1)}-${limpio.slice(-1)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return responder({ error: "Método no permitido" }, 405);
  }

  let cuerpo;

  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "Solicitud inválida" }, 400);
  }

  const rut = normalizarRut(cuerpo?.rut ?? "");
  const password = cuerpo?.password;

  if (
    !rut ||
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 128
  ) {
    return responder(
      { error: "RUT o contraseña incorrectos" },
      401
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL")!;

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    
const pepper = Deno.env.get("LOGIN_RUT_PEPPER");

if (!url || !serviceRoleKey || !anonKey || !pepper) {
  return responder(
    { error: "Servicio no disponible" },
    503
  );
}

    
const admin = createClient(
  url,
  serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


    
const autenticacion = createClient(
  url,
  anonKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);


// Crear un identificador protegido del RUT.
// El RUT real no se guarda en la tabla de intentos.
const claveHmac = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(pepper),
  {
    name: "HMAC",
    hash: "SHA-256",
  },
  false,
  ["sign"]
);

const firma = await crypto.subtle.sign(
  "HMAC",
  claveHmac,
  new TextEncoder().encode(rut)
);

const rutClave = Array.from(new Uint8Array(firma))
  .map((byte) => byte.toString(16).padStart(2, "0"))
  .join("");

// Registrar el intento y comprobar si está permitido.
const {
  data: intentoPermitido,
  error: errorIntento,
} = await admin.rpc("consumir_intento_login", {
  p_clave: rutClave,
});

if (errorIntento) {
  return responder(
    { error: "Servicio no disponible" },
    503
  );
}

if (intentoPermitido !== true) {
  return responder(
    {
      error: "Demasiados intentos. Intenta nuevamente en unos minutos.",
    },
    429
  );
}


    const { data: perfil, error: errorPerfil } =
      await admin
        .from("usuarios")
        .select("id, correo, estado")
        .eq("rut", rut)
        .maybeSingle();

    if (errorPerfil) {
      return responder(
        { error: "Servicio no disponible" },
        503
      );
    }

    if (!perfil || !perfil.estado) {
      return responder(
        { error: "RUT o contraseña incorrectos" },
        401
      );
    }

    const { data, error } =
      await autenticacion.auth.signInWithPassword({
        email: perfil.correo,
        password,
      });

    if (
      error ||
      !data.session ||
      data.user?.id !== perfil.id
    ) {
      return responder(
        { error: "RUT o contraseña incorrectos" },
        401
      );
    }

    return responder({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

  } catch {
    return responder(
      { error: "Servicio no disponible" },
      503
    );
  }
});
