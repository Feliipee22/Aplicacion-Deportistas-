
import React, { useState } from 'react';
import { supabase } from './supabase';

export default function Login() {
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');
  const [cargando, setCargando] = useState(false);
  const [mensajeError, setMensajeError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();

    if (cargando) return;

    setMensajeError('');
    setCargando(true);

    try {
      // Enviar el RUT y la contraseña a nuestra Edge Function.
      // El navegador NO consulta la tabla usuarios directamente.
      const { data, error } = await supabase.functions.invoke(
        'login-rut',
        {
          body: {
            rut: rut.trim(),
            password: password,
          },
        }
      );

      if (
        error ||
        !data?.access_token ||
        !data?.refresh_token
      ) {
        throw new Error('No fue posible iniciar sesión');
      }

      // Guardar la sesión validada por Supabase Auth.
      const { error: errorSesion } =
        await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        });

      if (errorSesion) {
        throw errorSesion;
      }

      setPassword('');

      // App.js detectará automáticamente la nueva sesión.
    } catch (error) {
      setMensajeError(
        'No se pudo iniciar sesión. Revisa tu RUT y contraseña o inténtalo más tarde.'
      );
    } finally {
      setCargando(false);
    }
  };

  return (
    <div
      style={{
        padding: '50px',
        textAlign: 'center',
        fontFamily: 'sans-serif',
      }}
    >
      <h2>Iniciar sesión en Athletix</h2>

      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="rut">RUT:</label>
          <br />

          <input
            id="rut"
            type="text"
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="12345678-9"
            autoComplete="username"
            required
            disabled={cargando}
            style={{
              padding: '8px',
              width: '200px',
            }}
          />
        </div>

        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="password">Contraseña:</label>
          <br />

          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña"
            autoComplete="current-password"
            required
            disabled={cargando}
            style={{
              padding: '8px',
              width: '200px',
            }}
          />
        </div>

        {mensajeError && (
          <p style={{ color: '#c62828' }} role="alert">
            {mensajeError}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          style={{
            padding: '10px 20px',
            cursor: cargando ? 'wait' : 'pointer',
          }}
        >
          {cargando ? 'Ingresando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
