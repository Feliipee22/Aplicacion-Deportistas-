
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

function normalizarRut(valor: unknown): string | null {
  if (typeof valor !== "string") return null;

  const limpio = valor
    .toUpperCase()
    .replace(/[^0-9K]/g, "");

  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) {
    return null;
  }

  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  let suma = 0;
  let factor = 2;

  for (let i = numero.length - 1; i >= 0; i--) {
    suma += Number(numero[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }

  const calculo = 11 - (suma % 11);
  const dvEsperado =
    calculo === 11 ? "0" :
    calculo === 10 ? "K" :
    String(calculo);

  if (dv !== dvEsperado) return null;

  return `${numero}-${dv}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return responder(
      { error: "Método no permitido" },
      405
    );
  }

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!url || !serviceRoleKey) {
      return responder(
        { error: "Servicio no disponible" },
        503
      );
    }

    // Verificar la identidad del usuario solicitante.
    const authorization =
      req.headers.get("authorization") || "";

    const token = authorization.match(
      /^Bearer\s+(.+)$/i
    )?.[1];

    if (!token) {
      return responder(
        { error: "Debes iniciar sesión" },
        401
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: identidad, error: errorIdentidad } =
      await admin.auth.getUser(token);

    if (errorIdentidad || !identidad.user) {
      return responder(
        { error: "Sesión inválida" },
        401
      );
    }

    // Comprobar el rol directamente en la base de datos.
    const { data: solicitante, error: errorRol } =
      await admin
        .from("usuarios")
        .select("rol_id, estado")
        .eq("id", identidad.user.id)
        .maybeSingle();

    if (
      errorRol ||
      !solicitante ||
      solicitante.estado !== true ||
      solicitante.rol_id !== 1
    ) {
      return responder(
        { error: "No tienes permisos para crear usuarios" },
        403
      );
    }

    let cuerpo;

    try {
      cuerpo = await req.json();
    } catch {
      return responder(
        { error: "Solicitud inválida" },
        400
      );
    }

    const nombre =
      typeof cuerpo?.nombre === "string"
        ? cuerpo.nombre.trim()
        : "";

    const correo =
      typeof cuerpo?.correo === "string"
        ? cuerpo.correo.trim().toLowerCase()
        : "";

    const rut = normalizarRut(cuerpo?.rut);
    const rolId = cuerpo?.rol_id;
    const password = cuerpo?.password;

    if (
      nombre.length < 2 ||
      nombre.length > 100 ||
      !rut ||
      correo.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) ||
      ![2, 3].includes(rolId) ||
      typeof password !== "string" ||
      password.length < 6 ||
      password.length > 128
    ) {
      return responder(
        { error: "Revisa los datos ingresados" },
        400
      );
    }

    // Crear la cuenta en Supabase Auth.
    // Confirmación automática solo para esta fase de pruebas.
    const { data: nuevaCuenta, error: errorCuenta } =
      await admin.auth.admin.createUser({
        email: correo,
        password,
        email_confirm: true,
      });

    if (errorCuenta || !nuevaCuenta.user) {
      return responder(
        { error: "No se pudo crear la cuenta. Revisa el correo." },
        409
      );
    }

    // Vincular la cuenta con su perfil y rol.
    const { error: errorPerfil } = await admin
      .from("usuarios")
      .insert({
        id: nuevaCuenta.user.id,
        nombre,
        rut,
        correo,
        rol_id: rolId,
        estado: true,
      });

    if (errorPerfil) {
      // Evitar dejar una cuenta sin perfil.
      const { error: errorReversion } =
        await admin.auth.admin.deleteUser(
          nuevaCuenta.user.id
        );

      if (errorReversion) {
        console.error(
          "Se requiere revisar una cuenta sin perfil",
          nuevaCuenta.user.id
        );

        return responder(
          { error: "El registro quedó incompleto. Requiere revisión." },
          500
        );
      }

      return responder(
        { error: "No se pudo guardar el perfil. Revisa RUT y correo." },
        409
      );
    }

    return responder(
      {
        mensaje: "Usuario creado correctamente",
        usuario: {
          id: nuevaCuenta.user.id,
          nombre,
          correo,
          rol_id: rolId,
        },
      },
      201
    );

  } catch (error) {
    console.error("Error al crear usuario:", error);

    return responder(
      { error: "Servicio no disponible" },
      503
    );
  }
});
