import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './MisEquiposDeportista.css';

function mensajeError(error, contexto) {
  if (error?.code === '42501') {
    return 'No tienes permisos para consultar esta información. Revisa la función de lectura en Supabase.';
  }
  if (error?.code === 'PGRST202' || error?.code === '42883') {
    return 'Falta instalar la función de lectura de integrantes en Supabase. Ejecuta el archivo SQL incluido.';
  }
  return `${contexto}: ${error?.message || 'Ocurrió un error inesperado.'}`;
}

export default function MisEquiposDeportista({ usuarioId }) {
  const [equipos, setEquipos] = useState([]);
  const [equipoId, setEquipoId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [revision, setRevision] = useState(0);

  const [integrantes, setIntegrantes] = useState([]);
  const [cargandoIntegrantes, setCargandoIntegrantes] = useState(false);
  const [errorIntegrantes, setErrorIntegrantes] = useState('');

  useEffect(() => {
    let cancelado = false;

    async function cargarMisEquipos() {
      setCargando(true);
      setErrorCarga('');

      try {
        if (!usuarioId) throw new Error('No se pudo identificar tu cuenta.');

        // Solo buscamos las membresías activas del deportista autenticado.
        const { data: membresias, error: errorMembresias } = await supabase
          .from('usuario_equipo')
          .select('equipo_id')
          .eq('usuario_id', usuarioId)
          .eq('funcion_en_equipo', 'DEPORTISTA')
          .eq('activo', true);

        if (errorMembresias) throw errorMembresias;

        const ids = [...new Set((membresias || []).map((item) => item.equipo_id))];
        if (ids.length === 0) {
          if (!cancelado) {
            setEquipos([]);
            setEquipoId(null);
          }
          return;
        }

        const { data, error } = await supabase
          .from('equipos')
          .select('id, nombre, descripcion, estado')
          .in('id', ids)
          .order('nombre', { ascending: true });

        if (error) throw error;

        if (!cancelado) {
          const nuevosEquipos = data || [];
          setEquipos(nuevosEquipos);
          // No se selecciona ningún equipo por defecto.
          setEquipoId((actual) =>
            nuevosEquipos.some((equipo) => equipo.id === actual) ? actual : null
          );
        }
      } catch (error) {
        if (!cancelado) setErrorCarga(mensajeError(error, 'No se pudieron cargar tus equipos'));
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargarMisEquipos();
    return () => { cancelado = true; };
  }, [usuarioId, revision]);

  useEffect(() => {
    let cancelado = false;
    setIntegrantes([]);
    setErrorIntegrantes('');

    if (equipoId === null) {
      setCargandoIntegrantes(false);
      return undefined;
    }

    async function cargarIntegrantes() {
      setCargandoIntegrantes(true);
      try {
        // Esta función valida la pertenencia del deportista y devuelve
        // únicamente nombres, funciones y estado de los integrantes.
        const { data, error } = await supabase.rpc(
          'listar_integrantes_equipo_deportista',
          { p_equipo_id: equipoId }
        );
        if (error) throw error;
        if (!cancelado) setIntegrantes(data || []);
      } catch (error) {
        if (!cancelado) {
          setErrorIntegrantes(mensajeError(error, 'No se pudieron cargar los integrantes'));
        }
      } finally {
        if (!cancelado) setCargandoIntegrantes(false);
      }
    }

    cargarIntegrantes();
    return () => { cancelado = true; };
  }, [equipoId, revision]);

  const equiposFiltrados = equipos.filter((equipo) =>
    equipo.nombre.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  );
  const equipoActual = equipos.find((equipo) => equipo.id === equipoId) || null;
  const entrenadores = integrantes.filter((item) => item.funcion_en_equipo === 'ENTRENADOR');
  const deportistas = integrantes.filter((item) => item.funcion_en_equipo === 'DEPORTISTA');
  const equiposActivos = equipos.filter((equipo) => equipo.estado === true).length;

  const renderIntegrantes = (lista, mensajeVacio) => {
    if (lista.length === 0) return <p className="ath-md-muted">{mensajeVacio}</p>;

    return (
      <div className="ath-md-members">
        {lista.map((item) => (
          <div className="ath-md-member" key={item.asignacion_id}>
            <span className="ath-md-person-avatar" aria-hidden="true">
              {(item.nombre || '?').charAt(0).toUpperCase()}
            </span>
            <span className="ath-md-person-info">
              <strong>{item.nombre || 'Integrante sin nombre registrado'}</strong>
              {item.cuenta_activa === false && <small>Cuenta inactiva</small>}
            </span>
            {item.soy_yo && <span className="ath-md-self">Tú</span>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <section className="ath-md">
      <div className="ath-md-intro">
        <div>
          <span className="ath-md-eyebrow">ESPACIO DEL DEPORTISTA</span>
          <h2>Mis equipos</h2>
          <p>Consulta los equipos a los que perteneces y conoce a tus entrenadores y compañeros.</p>
        </div>
        <button
          type="button"
          className="ath-md-refresh"
          disabled={cargando || cargandoIntegrantes}
          onClick={() => setRevision((actual) => actual + 1)}
        >
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {errorCarga && <div className="ath-md-error" role="alert">{errorCarga}</div>}

      <div className="ath-md-summary">
        <div><span>Equipos asignados</span><strong>{equipos.length}</strong></div>
        <div><span>Equipos activos</span><strong>{equiposActivos}</strong></div>
        <div><span>Equipos inactivos</span><strong>{equipos.length - equiposActivos}</strong></div>
      </div>

      {cargando && equipos.length === 0 ? (
        <div className="ath-md-empty" role="status">Cargando tus equipos...</div>
      ) : errorCarga ? null : equipos.length === 0 ? (
        <div className="ath-md-empty">
          <h3>Todavía no perteneces a ningún equipo</h3>
          <p>Cuando el administrador te incorpore a un equipo, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="ath-md-layout">
          <div className="ath-md-panel ath-md-list-panel">
            <div className="ath-md-panel-heading">
              <h3>Equipos</h3>
              <span>{equiposFiltrados.length}</span>
            </div>
            <label className="ath-md-search">
              <span className="ath-md-sr-only">Buscar equipos</span>
              <input
                type="search"
                placeholder="Buscar equipo..."
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
              />
            </label>
            <div className="ath-md-team-list">
              {equiposFiltrados.map((equipo) => (
                <button
                  type="button"
                  key={equipo.id}
                  className={`ath-md-team ${equipo.id === equipoId ? 'selected' : ''}`}
                  aria-pressed={equipo.id === equipoId}
                  onClick={() => setEquipoId(equipo.id)}
                >
                  <span className="ath-md-team-avatar" aria-hidden="true">
                    {equipo.nombre.charAt(0).toUpperCase()}
                  </span>
                  <span className="ath-md-team-info">
                    <strong>{equipo.nombre}</strong>
                    <small>{equipo.estado ? 'Activo' : 'Inactivo'}</small>
                  </span>
                  <span className="ath-md-team-arrow" aria-hidden="true">›</span>
                </button>
              ))}
              {equiposFiltrados.length === 0 && (
                <p className="ath-md-muted">No hay equipos con ese nombre.</p>
              )}
            </div>
          </div>

          {equipoActual ? (
            <div className="ath-md-panel ath-md-detail">
              <div className="ath-md-detail-header">
                <span className={`ath-md-status ${equipoActual.estado ? 'active' : 'inactive'}`}>
                  {equipoActual.estado ? 'EQUIPO ACTIVO' : 'EQUIPO INACTIVO'}
                </span>
                <h3>{equipoActual.nombre}</h3>
                <p>{equipoActual.descripcion || 'Sin descripción registrada.'}</p>
              </div>

              {!equipoActual.estado && (
                <div className="ath-md-notice">
                  Este equipo está inactivo. Su información se conserva y puedes seguir consultando sus integrantes.
                </div>
              )}

              {cargandoIntegrantes ? (
                <p className="ath-md-muted" role="status">Cargando integrantes...</p>
              ) : errorIntegrantes ? (
                <div className="ath-md-error" role="alert">{errorIntegrantes}</div>
              ) : (
                <>
                  <div className="ath-md-counts">
                    <div><strong>{entrenadores.length}</strong><span>Entrenadores</span></div>
                    <div><strong>{deportistas.length}</strong><span>Deportistas</span></div>
                  </div>

                  <div className="ath-md-section-heading"><h4>Entrenadores</h4></div>
                  {renderIntegrantes(entrenadores, 'Este equipo no tiene entrenadores registrados.')}

                  <div className="ath-md-section-heading"><h4>Deportistas</h4></div>
                  {renderIntegrantes(deportistas, 'Este equipo no tiene deportistas registrados.')}
                </>
              )}

              <p className="ath-md-footer-note">
                La gestión de equipos e integrantes corresponde al administrador del club.
              </p>
            </div>
          ) : (
            <div className="ath-md-panel ath-md-detail ath-md-placeholder" role="status">
              <div className="ath-md-placeholder-icon" aria-hidden="true">E</div>
              <h3>Selecciona un equipo</h3>
              <p>Elige uno de tus equipos de la lista para consultar sus entrenadores, compañeros y detalles.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
