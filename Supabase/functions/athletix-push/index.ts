import { createClient } from "npm:@supabase/supabase-js@2";
import { SignJWT, importPKCS8 } from "npm:jose@6";
const json = (data, status = 200)=>Response.json(data, {
    status
  });
Deno.serve(async (req)=>{
  if (req.method !== "POST") {
    return json({
      error: "Método no permitido"
    }, 405);
  }
  const secret = Deno.env.get("ATHLETIX_PUSH_SECRET");
  if (!secret || req.headers.get("x-athletix-secret") !== secret) {
    return json({
      error: "No autorizado"
    }, 401);
  }
  try {
    const body = await req.json();
    const id = String(body.notification_id ?? "");
    if (!/^[1-9]\d*$/.test(id)) {
      return json({
        error: "ID inválido"
      }, 400);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: {
        persistSession: false
      }
    });
    const { data: notification, error: notificationError } = await supabase.from("ath_notificaciones").select("id, usuario_id, titulo, mensaje, modulo").eq("id", id).maybeSingle();
    if (notificationError) throw notificationError;
    if (!notification) {
      return json({
        error: "Notificación no encontrada"
      }, 404);
    }
    const { data: devices, error: devicesError } = await supabase.from("ath_dispositivos_push").select("token").eq("usuario_id", notification.usuario_id);
    if (devicesError) throw devicesError;
    if (!devices?.length) {
      return json({
        success: true,
        sent: 0,
        message: "Sin dispositivos registrados"
      });
    }
    const credentials = JSON.parse(Deno.env.get("FIREBASE_SERVICE_ACCOUNT"));
    const privateKey = await importPKCS8(credentials.private_key, "RS256");
    const assertion = await new SignJWT({
      scope: "https://www.googleapis.com/auth/firebase.messaging"
    }).setProtectedHeader({
      alg: "RS256",
      typ: "JWT"
    }).setIssuer(credentials.client_email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt().setExpirationTime("1h").sign(privateKey);
    const authResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });
    if (!authResponse.ok) {
      throw new Error("Error de autenticación con Firebase");
    }
    const { access_token } = await authResponse.json();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`;
    let sent = 0;
    let failed = 0;
    let removed = 0;
    for (const device of devices){
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: {
                title: notification.titulo,
                body: notification.mensaje
              },
              data: {
                notification_id: String(notification.id),
                modulo: notification.modulo
              },
              android: {
                priority: "high",
                notification: {
                  sound: "default",
                  tag: `athletix-${notification.id}`
                }
              }
            }
          })
        });
        if (response.ok) {
          sent++;
        } else {
          failed++;
          const result = await response.json();
          const invalidToken = result.error?.details?.some((detail)=>detail.errorCode === "UNREGISTERED");
          if (invalidToken) {
            const { error } = await supabase.from("ath_dispositivos_push").delete().eq("token", device.token).eq("usuario_id", notification.usuario_id);
            if (!error) removed++;
          }
          console.error("FCM status:", response.status);
        }
      } catch  {
        failed++;
        console.error("Error enviando notificación");
      }
    }
    return json({
      success: failed === 0,
      sent,
      failed,
      removed
    });
  } catch  {
    console.error("Error interno en athletix-push");
    return json({
      error: "No fue posible procesar la notificación"
    }, 500);
  }
});
