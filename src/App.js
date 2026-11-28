import {AthletixPresenceProvider} from './AthletixPresence';

import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import Login from './Login';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { NuevaClave } from './AthletixCuenta';
import Dashboard from './Dashboard';

const cuentaActiva = (valor) => valor === true || ['true', 'activo', 'activa', 'active', '1'].includes(String(valor).trim().toLowerCase());

const nombresRoles = {
  1: 'Administrador',
  2: 'Entrenador',
  3: 'Deportista',
};

function App() {
  const [intento, setIntento] = useState(0);
  const [errorSesion, setErrorSesion] = useState('');
  const [recuperacion, setRecuperacion] = useState(false);
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');

  const idUsuario = sesion?.user?.id;
  const [avisoEnlace, setAvisoEnlace] = useState('');

  // La confirmación ocurre en el servidor antes de la redirección.
  // No aceptar sesiones ni tokens provenientes de un esquema externo.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let vigente = true;
    let listener;
    const recibir = ({ url } = {}) => {
      if (!vigente || !url) return;
      try {
        const enlace = new URL(url);
        if (enlace.protocol !== 'athletix:' || enlace.hostname !== 'auth' || enlace.pathname !== '/confirm') return;
        const fragmento = new URLSearchParams(enlace.hash.slice(1));
        const fallo = enlace.searchParams.has('error') || enlace.searchParams.has('error_code') || fragmento.has('error') || fragmento.has('error_code');
        setAvisoEnlace(fallo
          ? 'El enlace no pudo completarse o ha expirado. Revisa tu correo.'
          : 'Si confirmaste tu correo, ya puedes iniciar sesión con tu RUT y contraseña.');
      } catch (_) { /* No registrar enlaces ni credenciales. */ }
    };
    const iniciar = async () => {
      try {
        listener = await CapacitorApp.addListener('appUrlOpen', recibir);
        if (!vigente) { await listener.remove(); return; }
        recibir(await CapacitorApp.getLaunchUrl());
      } catch (_) { /* El acceso manual permanece disponible. */ }
    };
    iniciar();
    return () => { vigente = false; if (listener) listener.remove().catch(() => {}); };
  }, []);

  // Detectar si el usuario inició o cerró sesión
  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (activo) {
        clearTimeout(limite);
        if (error) setErrorSesion('No se pudo comprobar la sesión. Intenta nuevamente.');
        else { setErrorSesion(''); setSesion(data.session); }
      }
    }).catch(() => { if (activo) setErrorSesion('No se pudo conectar. Intenta nuevamente.'); });
    const limite = setTimeout(() => { if (activo) setErrorSesion('La conexión está tardando demasiado.'); }, 20000);

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
        if (activo) {
          clearTimeout(limite);
          setErrorSesion('');
          if (!nuevaSesion) setRecuperacion(false);
          if (evento === "PASSWORD_RECOVERY") setRecuperacion(true);
          setSesion(nuevaSesion);
        }
      });

    return () => {
      activo = false;
      clearTimeout(limite);
      subscription.unsubscribe();
    };
  }, [intento]);

  // Buscar el perfil correspondiente al usuario autenticado
  useEffect(() => {
    let activo = true;

    if (!idUsuario) {
      setPerfil(null);
      setErrorPerfil('');
      setCargandoPerfil(false);
      return;
    }

    const obtenerPerfil = async () => {
      setCargandoPerfil(true);
      setPerfil(null);
      setErrorPerfil('');

      try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, rol_id, estado, correo, telefono')
        .eq('id', idUsuario)
        .maybeSingle();

      if (!activo) return;

      if (error) {
        setErrorPerfil('No se pudo verificar tu perfil.');
      } else if (
        !data ||
        !cuentaActiva(data.estado) ||
        !nombresRoles[data.rol_id]
      ) {
        setErrorPerfil(
          'Tu cuenta no tiene un perfil activo con un rol válido.'
        );
      } else {
        setPerfil(data);
      }

      } catch (_) { if (activo) setErrorPerfil('No se pudo conectar. Intenta nuevamente.'); }
      finally { if (activo) setCargandoPerfil(false); }
    };

    obtenerPerfil();

    return () => {
      activo = false;
    };
  }, [idUsuario, intento]);

  // Revalidar el estado del perfil durante sesiones ya abiertas.
  // No reemplaza las políticas RLS ni las verificaciones del servidor.
  useEffect(() => {
    if (!idUsuario) return undefined;
    let vigente = true;
    let comprobando = false;
    const comprobarAcceso = async () => {
      if (comprobando || !vigente) return;
      comprobando = true;
      try {
        const { data, error } = await supabase.from('usuarios')
          .select('id, rol_id, estado').eq('id', idUsuario).maybeSingle();
        if (!vigente) return;
        if (!error && (!data || !cuentaActiva(data.estado) || !nombresRoles[data.rol_id])) {
          setPerfil(null);
          setErrorPerfil('Tu cuenta está inactiva o ya no tiene acceso a Athletix.');
          await supabase.auth.signOut();
        } else if (!error) {
          setPerfil(anterior => anterior && anterior.id === idUsuario
            ? { ...anterior, rol_id: data.rol_id, estado: data.estado } : anterior);
        }
      } catch (_) {
        // Fallas de red no deben cerrar una sesión válida sin confirmación.
      } finally { comprobando = false; }
    };
    const alVolver = () => { if (document.visibilityState === 'visible') comprobarAcceso(); };
    const intervalo = window.setInterval(comprobarAcceso, 45000);
    document.addEventListener('visibilitychange', alVolver);
    window.addEventListener('focus', comprobarAcceso);
    return () => {
      vigente = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alVolver);
      window.removeEventListener('focus', comprobarAcceso);
    };
  }, [idUsuario]);

  useEffect(() => { if (idUsuario) setAvisoEnlace(''); }, [idUsuario]);

  const actualizarPerfil = (cambios) => setPerfil((actual) => actual ? { ...actual, ...cambios } : actual);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  if (sesion === undefined) {
    return <main style={{padding:24}}><p>{errorSesion || 'Iniciando Athletix...'}</p>{errorSesion && <button onClick={()=>{setErrorSesion('');setIntento(n=>n+1);}}>Reintentar</button>}</main>;
  }

  if (recuperacion && sesion) return <NuevaClave finalizar={async()=>{await supabase.auth.signOut();setRecuperacion(false);}}/>;

  if (!sesion) {
    return <>
      {avisoEnlace && <div role="status" style={{padding: '12px 16px', background: '#eef4fb', color: '#17365d'}}>
        {avisoEnlace} <button type="button" onClick={() => setAvisoEnlace('')}>Cerrar</button>
      </div>}
      <Login />
    </>;
  }

  if (
    cargandoPerfil ||
    (!errorPerfil && perfil?.id !== idUsuario)
  ) {
    return <p>Verificando tu perfil...</p>;
  }

  if (!perfil) {
    return (
      <main style={{ padding: '40px' }}>
        <h1>ATHLETIX</h1>
        <p>{errorPerfil}</p>
        <button onClick={()=>setIntento(n=>n+1)}>Reintentar</button>
        <button onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  return (
  <AthletixPresenceProvider perfil={perfil}>
  <Dashboard
    perfil={perfil}
    onCerrarSesion={cerrarSesion}
    onPerfilActualizado={actualizarPerfil}
  />
  </AthletixPresenceProvider>
);
}

export default App;
