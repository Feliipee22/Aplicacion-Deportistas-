import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import './Login.css';
import logoAthletix from './assets/athletix-logo.jpg';
import bannerAthletix from './assets/athletix-banner.jpg';

const SITE_KEY = process.env.REACT_APP_TURNSTILE_SITE_KEY;

function normalizarRut(valor) {
  const limpio = String(valor || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (!/^[0-9]{7,8}[0-9K]$/.test(limpio)) return null;
  const numero = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  let suma = 0;
  let factor = 2;
  for (let i = numero.length - 1; i >= 0; i--) {
    suma += Number(numero[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resultado = 11 - (suma % 11);
  const esperado = resultado === 11 ? '0' : resultado === 10 ? 'K' : String(resultado);
  return dv === esperado ? `${numero}-${dv}` : null;
}

function Turnstile({ onToken, resetKey }) {
  const contenedor = useRef(null);
  const widgetId = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [problema, setProblema] = useState('');

  useEffect(() => {
    if (!SITE_KEY) {
      setProblema('Falta configurar REACT_APP_TURNSTILE_SITE_KEY en .env.');
      return undefined;
    }
    let cancelado = false;
    let intervalo;
    const mostrar = () => {
      if (cancelado || !contenedor.current || !window.turnstile || widgetId.current !== null) return;
      try {
        widgetId.current = window.turnstile.render(contenedor.current, {
          sitekey: SITE_KEY,
          callback: (token) => { setProblema(''); onTokenRef.current(token); },
          'expired-callback': () => onTokenRef.current(''),
          'error-callback': () => { onTokenRef.current(''); setProblema('No se pudo verificar Turnstile. Recarga la página.'); },
        });
        setProblema('');
      } catch (e) {
        setProblema('No se pudo cargar la verificación. Recarga la página.');
      }
    };
    if (!document.querySelector('script[data-athletix-turnstile]')) {
      const script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.dataset.athletixTurnstile = 'true';
      script.onerror = () => { if (!cancelado) setProblema('No se pudo cargar Turnstile. Comprueba tu conexión.'); };
      document.head.appendChild(script);
    }
    mostrar();
    intervalo = window.setInterval(mostrar, 250);
    return () => {
      cancelado = true;
      window.clearInterval(intervalo);
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch (_) { /* ya eliminado */ }
      }
      widgetId.current = null;
    };
  }, []);

  useEffect(() => {
    if (resetKey > 0 && widgetId.current !== null && window.turnstile) {
      try { window.turnstile.reset(widgetId.current); } catch (_) { /* sin widget */ }
    }
  }, [resetKey]);

  return (
    <div className="ath-auth-captcha">
      <div ref={contenedor} />
      {problema && <p className="ath-auth-error" role="alert">{problema}</p>}
    </div>
  );
}

export default function Login() {
  const [vista, setVista] = useState('ingresar');
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [registro, setRegistro] = useState({ nombre: '', rut: '', correo: '', password: '', confirmar: '' });
  const [registroExitoso, setRegistroExitoso] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaReset, setCaptchaReset] = useState(0);

  const cambiarVista = (nuevaVista) => {
    setVista(nuevaVista);
    setMensajeError('');
    setPassword('');
    setMostrarPassword(false);
    setCaptchaToken('');
    setRegistroExitoso('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (cargando) return;
    setMensajeError('');
    setCargando(true);
    try {
      // Se conserva la autenticación existente por RUT.
      const { data, error } = await supabase.functions.invoke('login-rut', {
        body: { rut: rut.trim(), password },
      });
      if (error || !data?.access_token || !data?.refresh_token) {
        throw new Error('No fue posible iniciar sesión');
      }
      const { error: errorSesion } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (errorSesion) throw errorSesion;
      setPassword('');
      // App.js detecta la sesión automáticamente.
    } catch (error) {
      setMensajeError('No se pudo iniciar sesión. Revisa tu RUT y contraseña o inténtalo más tarde.');
    } finally {
      setCargando(false);
    }
  };

  const actualizarRegistro = (campo, valor) => {
    setRegistro((actual) => ({ ...actual, [campo]: valor }));
  };

  const handleRegistro = async (e) => {
    e.preventDefault();
    if (cargando) return;
    setMensajeError('');
    const rutValido = normalizarRut(registro.rut);
    if (!rutValido) return setMensajeError('Ingresa un RUT válido, sin puntos y con guion.');
    if (registro.nombre.trim().length < 2) return setMensajeError('Ingresa tu nombre.');
    if (registro.password.length < 6) return setMensajeError('La contraseña debe tener al menos 6 caracteres.');
    if (registro.password !== registro.confirmar) return setMensajeError('Las contraseñas no coinciden.');
    if (!captchaToken) return setMensajeError('Completa la verificación de seguridad.');
    setCargando(true);
    try {
      const { data, error } = await supabase.functions.invoke('registro-deportista', {
        body: {
          nombre: registro.nombre.trim(),
          rut: rutValido,
          correo: registro.correo.trim().toLowerCase(),
          password: registro.password,
          captchaToken,
        },
      });
      if (error || data?.error) {
        let mensaje = data?.error || 'No se pudo completar el registro. Revisa tus datos e inténtalo nuevamente.';
        if (error?.context && typeof error.context.json === 'function') {
          try { const detalle = await error.context.json(); mensaje = detalle?.error || mensaje; } catch (_) { /* respuesta sin JSON */ }
        }
        throw new Error(mensaje);
      }
      setRegistroExitoso(data?.mensaje || 'Revisa tu correo para confirmar tu cuenta.');
      setRegistro({ nombre: '', rut: '', correo: '', password: '', confirmar: '' });
    } catch (error) {
      setMensajeError(error?.message || 'No fue posible completar el registro.');
    } finally {
      setCargando(false);
      setCaptchaToken('');
      setCaptchaReset((actual) => actual + 1);
    }
  };

  return (
    <main className="ath-auth-page">
      <section className="ath-auth-intro" aria-label="Bienvenida a Athletix">
        <div className="ath-auth-brand"><img className="ath-auth-logo" src={logoAthletix} alt="Logo de Athletix" /> <span>ATHLETIX</span></div>
        <div className="ath-auth-intro-copy">
          <span className="ath-auth-eyebrow">TU ESPACIO DEPORTIVO</span>
          <h1>Tu progreso comienza aquí.</h1>
          <p>Entrenamientos, rutinas y objetivos en un mismo lugar.</p>
          <div className="ath-auth-accent" />

        </div>
        <span className="ath-auth-intro-footer">Entrena. Avanza. Supera tus límites.</span>
      </section>

      <section className={`ath-auth-panel ${vista === 'registro' ? 'ath-auth-panel--register' : ''}`}>
        <div className="ath-auth-card">
          <div className="ath-auth-mobile-brand"><img className="ath-auth-logo" src={logoAthletix} alt="Logo de Athletix" /> <span>ATHLETIX</span></div>
          <div className="ath-auth-banner-stage ath-auth-banner-stage--welcome">
            <img className="ath-auth-banner" src={bannerAthletix} alt="Athletix: deportes, entrenamiento y actividad física" />
          </div>
          <h2>Bienvenido a Athletix</h2>
          <p className="ath-auth-subtitle">Accede a tu espacio deportivo.</p>
          <div className="ath-auth-tabs" role="tablist" aria-label="Acceso a Athletix">
            <button type="button" role="tab" aria-selected={vista === 'ingresar'} className={vista === 'ingresar' ? 'active' : ''} onClick={() => cambiarVista('ingresar')} disabled={cargando}>Iniciar sesión</button>
            <button type="button" role="tab" aria-selected={vista === 'registro'} className={vista === 'registro' ? 'active' : ''} onClick={() => cambiarVista('registro')} disabled={cargando}>Crear cuenta</button>
          </div>

          {vista === 'ingresar' ? (
            <form onSubmit={handleLogin} className="ath-auth-form">
              <label htmlFor="ath-login-rut">RUT</label>
              <input id="ath-login-rut" type="text" value={rut} onChange={(e) => setRut(e.target.value)} placeholder="12345678-9" autoComplete="username" required disabled={cargando} />
              <label htmlFor="ath-login-password">Contraseña</label>
              <div className="ath-auth-password-wrap">
                <input id="ath-login-password" type={mostrarPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ingresa tu contraseña" autoComplete="current-password" required disabled={cargando} />
                <button type="button" className="ath-auth-show-password" onClick={() => setMostrarPassword((actual) => !actual)} aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} disabled={cargando}>{mostrarPassword ? 'Ocultar' : 'Mostrar'}</button>
              </div>
              {mensajeError && <p className="ath-auth-error" role="alert">{mensajeError}</p>}
              <button className="ath-auth-primary" type="submit" disabled={cargando}>{cargando ? 'Ingresando...' : 'Ingresar a Athletix →'}</button>
            </form>
          ) : registroExitoso ? (
            <div className="ath-auth-registration-info" role="status">
              <div className="ath-auth-registration-icon" aria-hidden="true">✓</div>
              <h3>¡Revisa tu correo!</h3>
              <p>{registroExitoso}</p>
              <button type="button" className="ath-auth-primary" onClick={() => cambiarVista('ingresar')}>Volver a iniciar sesión →</button>
            </div>
          ) : (
            <form onSubmit={handleRegistro} className="ath-auth-form" aria-label="Registro de deportistas">
              <p className="ath-auth-register-hint">Crea tu cuenta de deportista. Los entrenadores y administradores son registrados por un administrador.</p>
              <label htmlFor="ath-reg-nombre">Nombre completo</label>
              <input id="ath-reg-nombre" type="text" value={registro.nombre} onChange={(e) => actualizarRegistro('nombre', e.target.value)} autoComplete="name" maxLength={100} required disabled={cargando} placeholder="Tu nombre y apellido" />
              <label htmlFor="ath-reg-rut">RUT</label>
              <input id="ath-reg-rut" type="text" value={registro.rut} onChange={(e) => actualizarRegistro('rut', e.target.value)} autoComplete="off" required disabled={cargando} placeholder="12345678-9" />
              <label htmlFor="ath-reg-correo">Correo electrónico</label>
              <input id="ath-reg-correo" type="email" value={registro.correo} onChange={(e) => actualizarRegistro('correo', e.target.value)} autoComplete="email" maxLength={254} required disabled={cargando} placeholder="tu@correo.com" />
              <label htmlFor="ath-reg-password">Contraseña</label>
              <input id="ath-reg-password" type="password" value={registro.password} onChange={(e) => actualizarRegistro('password', e.target.value)} autoComplete="new-password" minLength={6} maxLength={128} required disabled={cargando} placeholder="Mínimo 6 caracteres" />
              <label htmlFor="ath-reg-confirmar">Confirmar contraseña</label>
              <input id="ath-reg-confirmar" type="password" value={registro.confirmar} onChange={(e) => actualizarRegistro('confirmar', e.target.value)} autoComplete="new-password" minLength={6} maxLength={128} required disabled={cargando} placeholder="Repite tu contraseña" />
              <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />
              {mensajeError && <p className="ath-auth-error" role="alert">{mensajeError}</p>}
              <button className="ath-auth-primary" type="submit" disabled={cargando || !captchaToken}>{cargando ? 'Creando cuenta...' : 'Crear cuenta de deportista →'}</button>
            </form>
          )}
          <p className="ath-auth-bottom-note">Athletix · Plataforma de gestión deportiva</p>
        </div>
      </section>
    </main>
  );
}
