
import React, { useState } from 'react';
import './Dashboard.css';
import MisRutinas from './MisRutinas';
import GestionUsuarios from './GestionUsuarios';
import EjerciciosEntrenador from './EjerciciosEntrenador';
import RutinasEntrenador from './RutinasEntrenador';
import GestionEquipos from './GestionEquipos';
import MisEquiposEntrenador from './MisEquiposEntrenador';
import MisEquiposDeportista from './MisEquiposDeportista';
import CalendarioDeportivo from './CalendarioDeportivo';
import AsistenciaEntrenador from './AsistenciaEntrenador';
import MiAsistencia from './MiAsistencia';
import Avisos from './Avisos';


// Iconos del panel: no requieren librerías adicionales.
function IconoModulo({ tipo }) {
  const iconos = {
    inicio: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9v12h14V9" />
        <path d="M9 21v-7h6v7" />
      </>
    ),
    usuarios: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
        <path d="M17 5a3 3 0 0 1 0 6" />
        <path d="M19 15a5 5 0 0 1 2 4v1" />
      </>
    ),
    equipos: (
      <>
        <circle cx="12" cy="6" r="3" />
        <circle cx="5" cy="11" r="2" />
        <circle cx="19" cy="11" r="2" />
        <path d="M6 20v-2a6 6 0 0 1 12 0v2" />
        <path d="M1 20v-2a4 4 0 0 1 3-3.9" />
        <path d="M23 20v-2a4 4 0 0 0-3-3.9" />
      </>
    ),
    actividades: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M7 3v4M17 3v4M3 10h18" />
        <path d="m9 16 2 2 4-4" />
      </>
    ),
    avisos: (
      <>
        <path d="M3 11v2a2 2 0 0 0 2 2h3l3 5h3l-3-5" />
        <path d="m8 9 11-5v16L8 15H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h3Z" />
        <path d="M22 9v6" />
      </>
    ),
    reportes: (
      <>
        <path d="M4 20V10M10 20V4M16 20v-8M22 20v-5" />
        <path d="M2 20h21" />
      </>
    ),
    ejercicios: (
      <>
        <path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12" />
      </>
    ),
    rutinas: (
      <>
        <rect x="5" y="4" width="14" height="17" rx="2" />
        <path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h4" />
      </>
    ),
    asistencia: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 10-4.5" />
        <path d="m15 17 2 2 4-5" />
      </>
    ),
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="21"
      height="21"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {iconos[tipo] || iconos.inicio}
    </svg>
  );
}

const configuracion = {
  1: {
    rol: 'Administrador',
    descripcion: 'Gestiona tu organización deportiva desde un solo lugar.',
    modulos: [
      { id: 'usuarios', nombre: 'Usuarios', descripcion: 'Administrar cuentas y permisos.' },
      { id: 'equipos', nombre: 'Equipos', descripcion: 'Organizar equipos y deportistas.' },
      { id: 'actividades', nombre: 'Calendario', descripcion: 'Planificar actividades deportivas.' },
      { id: 'avisos', nombre: 'Avisos', descripcion: 'Publicar comunicaciones.' },
      { id: 'reportes', nombre: 'Reportes', descripcion: 'Consultar estadísticas.' },
    ],
  },
  2: {
    rol: 'Entrenador',
    descripcion: 'Organiza tus entrenamientos y acompaña a tus deportistas.',
    modulos: [
      { id: 'equipos', nombre: 'Mis equipos', descripcion: 'Consultar los equipos asignados.' },
      { id: 'ejercicios', nombre: 'Ejercicios', descripcion: 'Crear y administrar ejercicios de entrenamiento.' },
      { id: 'rutinas', nombre: 'Rutinas', descripcion: 'Preparar planes de entrenamiento.' },
      { id: 'actividades', nombre: 'Calendario', descripcion: 'Organizar sesiones y actividades.' },
      { id: 'asistencia', nombre: 'Asistencia', descripcion: 'Registrar participación.' },
      { id: 'avisos', nombre: 'Avisos', descripcion: 'Comunicar novedades.' },
    ],
  },
  3: {
    rol: 'Deportista',
    descripcion: 'Tu entrenamiento, actividades y progreso en un solo lugar.',
    modulos: [
      { id: 'rutinas', nombre: 'Mis rutinas', descripcion: 'Consultar tus entrenamientos.' },
      { id: 'equipos', nombre: 'Mis equipos', descripcion: 'Consultar tus equipos, entrenadores y compañeros.' },
      { id: 'actividades', nombre: 'Calendario', descripcion: 'Revisar próximas actividades.' },
      { id: 'asistencia', nombre: 'Mi asistencia', descripcion: 'Consultar tu participación.' },
      { id: 'avisos', nombre: 'Avisos', descripcion: 'Revisar novedades de tu club.' },
    ],
  },
};

export default function Dashboard({ perfil, onCerrarSesion }) {
  const [seccion, setSeccion] = useState('inicio');

  const config = configuracion[perfil.rol_id];

  if (!config) {
    return <p>No se encontró un rol válido.</p>;
  }

  const primerNombre = perfil.nombre.trim().split(/\s+/)[0];
  const moduloActual = config.modulos.find(
    (modulo) => modulo.id === seccion
  );

  return (
    <div className="ath-shell">
      <aside className="ath-sidebar">
        <div className="ath-brand">
          <div className="ath-brand-icon">A</div>
          <div>
            <div className="ath-brand-name">ATHLETIX</div>
            <div className="ath-brand-subtitle">
              Gestión deportiva
            </div>
          </div>
        </div>

        <div className="ath-sidebar-label">NAVEGACIÓN</div>

        <nav className="ath-navigation">
          <button
            className={`ath-nav-button ${
              seccion === 'inicio' ? 'active' : ''
            }`}
            onClick={() => setSeccion('inicio')}
          >
            <span className="ath-nav-symbol"><IconoModulo tipo="inicio" /></span>
            Inicio
          </button>

          {config.modulos.map((modulo) => (
            <button
              key={modulo.id}
              className={`ath-nav-button ${
                seccion === modulo.id ? 'active' : ''
              }`}
              onClick={() => setSeccion(modulo.id)}
            >
              <span className="ath-nav-symbol">
                <IconoModulo tipo={modulo.id} />
              </span>
              {modulo.nombre}
            </button>
          ))}
        </nav>

        <div className="ath-sidebar-bottom">
          <div className="ath-sidebar-profile">
            <div className="ath-avatar">
              {primerNombre.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{perfil.nombre}</strong>
              <span>{config.rol}</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="ath-main">
        <header className="ath-topbar">
          <div>
            <span className="ath-eyebrow">
              PLATAFORMA DE GESTIÓN DEPORTIVA
            </span>
            <h1>
              {seccion === 'inicio'
                ? 'Panel principal'
                : moduloActual?.nombre}
            </h1>
          </div>

          <button
            className="ath-logout"
            onClick={onCerrarSesion}
          >
            Cerrar sesión
          </button>
        </header>

        {seccion === 'inicio' ? (
          <>
            <section className="ath-hero">
              <span className="ath-hero-label">
                ESPACIO DE {config.rol.toUpperCase()}
              </span>

              <h2>Hola, {primerNombre}.</h2>

              <p>{config.descripcion}</p>

              <div className="ath-hero-footer">
                <span className="ath-status-dot" />
                Tu sesión está activa
              </div>
            </section>

            <section className="ath-section">
              <div className="ath-section-heading">
                <div>
                  <h2>Accesos rápidos</h2>
                  <p>
                    Explora las herramientas disponibles
                    para tu rol.
                  </p>
                </div>
              </div>

              <div className="ath-cards">
                {config.modulos.map((modulo) => (
                  <button
                    className="ath-card"
                    key={modulo.id}
                    onClick={() => setSeccion(modulo.id)}
                  >
                    <div className="ath-card-icon">
                      <IconoModulo tipo={modulo.id} />
                    </div>

                    <h3>{modulo.nombre}</h3>
                    <p>{modulo.descripcion}</p>

                    <span className="ath-card-link">
                      Explorar <span>→</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </>
                        
) : seccion === 'usuarios' && perfil.rol_id === 1 ? (
  <GestionUsuarios />
) : seccion === 'equipos' && perfil.rol_id === 1 ? (
  <GestionEquipos />
) : seccion === 'equipos' && perfil.rol_id === 2 ? (
  <MisEquiposEntrenador usuarioId={perfil.id} />
) : seccion === 'equipos' && perfil.rol_id === 3 ? (
  <MisEquiposDeportista usuarioId={perfil.id} />
) : seccion === 'actividades' && [1, 2, 3].includes(perfil.rol_id) ? (
  <CalendarioDeportivo perfil={perfil} />
) : seccion === 'ejercicios' && perfil.rol_id === 2 ? (
  <EjerciciosEntrenador usuarioId={perfil.id} />
) : seccion === 'rutinas' && perfil.rol_id === 2 ? (
  <RutinasEntrenador usuarioId={perfil.id} />
) : seccion === 'rutinas' && perfil.rol_id === 3 ? (
  <MisRutinas usuarioId={perfil.id} />
) : seccion === 'asistencia' && perfil.rol_id === 2 ? (
  <AsistenciaEntrenador usuarioId={perfil.id} />
) : seccion === 'asistencia' && perfil.rol_id === 3 ? (
  <MiAsistencia usuarioId={perfil.id} />
) : seccion === 'avisos' && [1, 2, 3].includes(perfil.rol_id) ? (
  <Avisos perfil={perfil} />
) : (

          <section className="ath-module">
            <div className="ath-module-icon">
              {moduloActual?.nombre.charAt(0)}
            </div>

            <h2>{moduloActual?.nombre}</h2>

            <p>{moduloActual?.descripcion}</p>

            <div className="ath-module-notice">
              Estamos preparando este módulo.
              Próximamente mostraremos aquí
              la información real de Supabase.
            </div>

            <button
              className="ath-back-button"
              onClick={() => setSeccion('inicio')}
            >
              ← Volver al inicio
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
