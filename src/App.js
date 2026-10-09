
import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import Login from './Login';
import Dashboard from './Dashboard';

const nombresRoles = {
  1: 'Administrador',
  2: 'Entrenador',
  3: 'Deportista',
};

function App() {
  const [sesion, setSesion] = useState(undefined);
  const [perfil, setPerfil] = useState(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(false);
  const [errorPerfil, setErrorPerfil] = useState('');

  const idUsuario = sesion?.user?.id;

  // Detectar si el usuario inició o cerró sesión
  useEffect(() => {
    let activo = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (activo) {
        setSesion(error ? null : data.session);
      }
    });

    const { data: { subscription } } =
      supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
        if (activo) {
          setSesion(nuevaSesion);
        }
      });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

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

      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, rol_id, estado')
        .eq('id', idUsuario)
        .maybeSingle();

      if (!activo) return;

      if (error) {
        setErrorPerfil('No se pudo verificar tu perfil.');
      } else if (
        !data ||
        data.estado !== true ||
        !nombresRoles[data.rol_id]
      ) {
        setErrorPerfil(
          'Tu cuenta no tiene un perfil activo con un rol válido.'
        );
      } else {
        setPerfil(data);
      }

      setCargandoPerfil(false);
    };

    obtenerPerfil();

    return () => {
      activo = false;
    };
  }, [idUsuario]);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  if (sesion === undefined) {
    return <p>Iniciando Athletix...</p>;
  }

  if (!sesion) {
    return <Login />;
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
        <button onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  return (
  <Dashboard
    perfil={perfil}
    onCerrarSesion={cerrarSesion}
  />
);
}

export default App;
