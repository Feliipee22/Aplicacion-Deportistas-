
import React, { useEffect, useState } from 'react';
import './Dashboard.css';
import MisRutinas from './MisRutinas';
import GestionUsuarios from './GestionUsuarios';
import EjerciciosEntrenador from './EjerciciosEntrenador';
import GestionVideosAdmin from './GestionVideosAdmin';
import VideosDeportista from './VideosDeportista';
import MiAlimentacion from './MiAlimentacion';
import RutinasEntrenador from './RutinasEntrenador';
import ProgresoEntrenador from './ProgresoEntrenador';
import CalendarioDeportivo from './CalendarioDeportivo';
import AsistenciaEntrenador from './AsistenciaEntrenador';
import MiAsistencia from './MiAsistencia';
import Avisos from './Avisos';
import ReportesAdmin from './ReportesAdmin';
import AthletixMatch from './AthletixMatch';
import InicioAthletix from './InicioAthletix';
import ComunidadChat from './ComunidadChat';
import MiPerfil from './MiPerfil';
import MiEntrenador from './MiEntrenador';
import logoAthletix from "./assets/athletix-logo.jpg";

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
    videos: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m10 9 5 3-5 3z" />
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
    alimentacion: (
      <>
        <path d="M4 12a8 8 0 0 0 16 0" />
        <path d="M4 12h16M8 18l-1 3M16 18l1 3" />
        <path d="M12 4v5M9 6l3 3 3-3" />
      </>
    ),
    comunidad: (<><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></>),
    mapa: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
        <path d="M9 3v15M15 6v15" />
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
    descripcion: 'Administra usuarios, contenido y reportes de Athletix.',
    modulos: [
      { id: 'ejercicios', nombre: 'Gestión de videos', descripcion: 'Administrar ejercicios y videos de los entrenadores.' },
      { id: 'usuarios', nombre: 'Usuarios', descripcion: 'Administrar cuentas y permisos.' },

      { id: 'actividades', nombre: 'Calendario', descripcion: 'Planificar actividades deportivas.' },
      { id: 'avisos', nombre: 'Avisos', descripcion: 'Publicar comunicaciones.' },
      { id: 'reportes', nombre: 'Reportes', descripcion: 'Consultar estadísticas.' },
      { id: 'comunidad', nombre: 'Comunidad', descripcion: 'Chat general, mensajes privados y grupos.' },
      { id: 'mapa', nombre: 'Athletix Match', descripcion: 'Explorar lugares deportivos y organizar partidos.' },
    ],
  },
  2: {
    rol: 'Entrenador',
    descripcion: 'Organiza tus entrenamientos y acompaña a tus deportistas.',
    modulos: [

      { id: 'vinculos', nombre: 'Mis deportistas', descripcion: 'Gestionar solicitudes y vínculos con deportistas.' },
      { id: 'progreso', nombre: 'Progreso deportivo', descripcion: 'Revisar actividad y seguimiento de tus deportistas.' },
      { id: 'ejercicios', nombre: 'Ejercicios y videos', descripcion: 'Crear ejercicios y subir videos demostrativos.' },
      { id: 'rutinas', nombre: 'Rutinas', descripcion: 'Preparar planes de entrenamiento.' },
      { id: 'alimentacion', nombre: 'Mi alimentación', descripcion: 'Registrar comidas y consultar sus macronutrientes.' },
      { id: 'actividades', nombre: 'Calendario', descripcion: 'Organizar sesiones y actividades.' },
      { id: 'asistencia', nombre: 'Asistencia', descripcion: 'Registrar participación.' },
      { id: 'avisos', nombre: 'Avisos', descripcion: 'Comunicar novedades.' },
      { id: 'comunidad', nombre: 'Comunidad', descripcion: 'Chat general, mensajes privados y grupos.' },
      { id: 'mapa', nombre: 'Athletix Match', descripcion: 'Explorar lugares deportivos y organizar partidos.' },
    ],
  },
  3: {
    rol: 'Deportista',
    descripcion: 'Tu entrenamiento, actividades y progreso en un solo lugar.',
    modulos: [
      { id: 'vinculos', nombre: 'Mi entrenador', descripcion: 'Vincularte con un entrenador personal.' },
      { id: 'rutinas', nombre: 'Mis rutinas', descripcion: 'Consultar tus entrenamientos.' },
      { id: 'videos', nombre: 'Videos de ejercicios', descripcion: 'Ver los videos de los ejercicios de tus rutinas.' },
      { id: 'alimentacion', nombre: 'Mi alimentación', descripcion: 'Registrar comidas y consultar sus macronutrientes.' },

      { id: 'actividades', nombre: 'Calendario', descripcion: 'Revisar próximas actividades.' },
      { id: 'asistencia', nombre: 'Mi asistencia', descripcion: 'Consultar tu participación.' },
      { id: 'avisos', nombre: 'Avisos', descripcion: 'Revisar novedades de tu entrenador.' },
      { id: 'comunidad', nombre: 'Comunidad', descripcion: 'Chat general, mensajes privados y grupos.' },
      { id: 'mapa', nombre: 'Athletix Match', descripcion: 'Explorar lugares deportivos y organizar partidos.' },
    ],
  },
};

export default function Dashboard({ perfil, onCerrarSesion, onPerfilActualizado }) {
  const [seccion, setSeccion] = useState('inicio');
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [destinoCalendario, setDestinoCalendario] = useState(null);
  const [fechaCalendario, setFechaCalendario] = useState(null);
  const [partidoDesdeAviso, setPartidoDesdeAviso] = useState(null);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);

  const navegar = (destino) => {
    setSeccion(destino);
    setMenuMovilAbierto(false);
  };

  useEffect(() => {
    if (!menuMovilAbierto) return undefined;
    const cerrarConEscape = (evento) => {
      if (evento.key === 'Escape') setMenuMovilAbierto(false);
    };
    document.addEventListener('keydown', cerrarConEscape);
    return () => document.removeEventListener('keydown', cerrarConEscape);
  }, [menuMovilAbierto]);

  useEffect(() => {
    const abrir = (evento) => {
      const d = evento.detail || {};
      if (d.seccion === 'actividades') { setFechaCalendario(d.fecha || null); navegar('actividades'); }
      if (d.seccion === 'rutinas' && d.programacionId) {
        setDestinoCalendario({id:d.programacionId, planId:d.planId, sesionIndice:d.sesionIndice});
        navegar('rutinas');
      }
    };
    window.addEventListener('athletix:navegar', abrir);
    return () => window.removeEventListener('athletix:navegar', abrir);
  }, []);

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
      <div className="ath-mobile-bar">
        <div className="ath-mobile-brand">
          <img src={logoAthletix} alt="" />
          <strong>ATHLETIX</strong>
        </div>
        <button
          type="button"
          className="ath-menu-toggle"
          aria-label={menuMovilAbierto ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuMovilAbierto}
          aria-controls="ath-navigation-sidebar"
          onClick={() => setMenuMovilAbierto((abierto) => !abierto)}
        >
          {menuMovilAbierto ? '✕ Cerrar' : '☰ Menú'}
        </button>
      </div>
      {menuMovilAbierto && (
        <button
          type="button"
          className="ath-mobile-backdrop"
          aria-label="Cerrar menú de navegación"
          onClick={() => setMenuMovilAbierto(false)}
        />
      )}
      <aside id="ath-navigation-sidebar" className={`ath-sidebar ${menuMovilAbierto ? 'ath-sidebar--open' : ''}`}>

        <div className="ath-brand">
          <div className="ath-brand-icon">
  <img src={logoAthletix} alt="Logo de Athletix" />
</div>
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
            onClick={() => navegar('inicio')}
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
              onClick={() => navegar(modulo.id)}
            >
              <span className="ath-nav-symbol">
                <IconoModulo tipo={modulo.id} />
              </span>
              {modulo.nombre}
            </button>
          ))}
        </nav>

        <div className="ath-sidebar-bottom">
          <button type="button" className="ath-sidebar-profile ath-sidebar-profile-button" onClick={() => navegar('perfil')} aria-label="Abrir mi perfil">
            <div className="ath-avatar">
              {primerNombre.charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{perfil.nombre}</strong>
              <span>{config.rol}</span>
            </div>
          </button>
          <button type="button" className="ath-sidebar-account-link" onClick={() => navegar('perfil')}>⚙ Mi perfil y configuración</button>
          <button type="button" className="ath-sidebar-logout" onClick={() => setConfirmarSalida(true)}>↪ Cerrar sesión</button>
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
                : seccion === 'perfil' ? 'Mi perfil' : moduloActual?.nombre}
            </h1>
          </div>


        </header>

        {seccion === 'perfil' ? (
          <MiPerfil perfil={perfil} onPerfilActualizado={onPerfilActualizado} onCerrarSesion={onCerrarSesion} />
        ) : seccion === 'inicio' ? (
          <InicioAthletix perfil={perfil} onNavegar={navegar} />
) : seccion === 'comunidad' ? (
  <ComunidadChat perfil={perfil} />
) : seccion === 'mapa' && [1, 2, 3].includes(perfil.rol_id) ? (
  <AthletixMatch perfil={perfil} partidoDestacadoId={partidoDesdeAviso} />
) : seccion === 'usuarios' && perfil.rol_id === 1 ? (
  <GestionUsuarios />

) : seccion === 'vinculos' && [2,3].includes(perfil.rol_id) ? (
  <MiEntrenador perfil={perfil} />
) : seccion === 'progreso' && perfil.rol_id === 2 ? (
  <ProgresoEntrenador />
) : seccion === 'actividades' && [1, 2, 3].includes(perfil.rol_id) ? (
  <CalendarioDeportivo perfil={perfil} fechaInicial={fechaCalendario} />
) : seccion === 'ejercicios' && perfil.rol_id === 1 ? (
  <GestionVideosAdmin />
) : seccion === 'ejercicios' && perfil.rol_id === 2 ? (
  <EjerciciosEntrenador usuarioId={perfil.id} />
) : seccion === 'rutinas' && perfil.rol_id === 2 ? (
  <RutinasEntrenador usuarioId={perfil.id} />
) : seccion === 'rutinas' && perfil.rol_id === 3 ? (
  <MisRutinas usuarioId={perfil.id} programacionInicial={destinoCalendario} />
) : seccion === 'videos' && perfil.rol_id === 3 ? (
  <VideosDeportista usuarioId={perfil.id} />
) : seccion === 'asistencia' && perfil.rol_id === 2 ? (
  <AsistenciaEntrenador usuarioId={perfil.id} />
) : seccion === 'asistencia' && perfil.rol_id === 3 ? (
  <MiAsistencia usuarioId={perfil.id} />
) : seccion === 'alimentacion' && [2, 3].includes(perfil.rol_id) ? (
   <MiAlimentacion usuarioId={perfil.id} />
) : seccion === 'reportes' && perfil.rol_id === 1 ? (
  <ReportesAdmin perfil={perfil} />
) : seccion === 'avisos' && [1, 2, 3].includes(perfil.rol_id) ? (
  <Avisos perfil={perfil} onVerPartido={(id) => { setPartidoDesdeAviso(id); navegar('mapa'); }} />
) : (

          <section className="ath-module">
            <div className="ath-module-icon">
              {moduloActual?.nombre.charAt(0)}
            </div>


            <p>{moduloActual?.descripcion}</p>

            <div className="ath-module-notice">
              Estamos preparando este módulo.
              Próximamente mostraremos aquí
              la información real de Supabase.
            </div>

            <button
              className="ath-back-button"
              onClick={() => navegar('inicio')}
            >
              ← Volver al inicio
            </button>
          </section>
        )}
      </main>
      {confirmarSalida && (
        <div className="ath-logout-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmarSalida(false); }}>
          <section className="ath-logout-dialog" role="dialog" aria-modal="true" aria-labelledby="ath-logout-title" aria-describedby="ath-logout-description">
            <div className="ath-logout-symbol" aria-hidden="true">↪</div>
            <h2 id="ath-logout-title">¿Cerrar sesión?</h2>
            <p id="ath-logout-description">¿Quieres salir de tu cuenta de Athletix? Podrás volver a iniciar sesión cuando quieras.</p>
            <div className="ath-logout-actions">
              <button type="button" className="ath-logout-cancel" onClick={() => setConfirmarSalida(false)}>Cancelar</button>
              <button type="button" className="ath-logout-accept" onClick={() => { setConfirmarSalida(false); onCerrarSesion(); }}>Sí, cerrar sesión</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
