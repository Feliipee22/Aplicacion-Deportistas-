import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './MisEquiposEntrenador.css';

function mensajeError(error) {
  if (error?.code === '42501') {
    return 'No tienes permisos para consultar estos datos. Revisa las políticas de lectura (RLS) en Supabase.';
  }
  return `No se pudieron cargar tus equipos: ${error?.message || 'Ocurrió un error inesperado.'}`;
}

export default function MisEquiposEntrenador({ usuarioId }) {
  const [equipos, setEquipos] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [equipoId, setEquipoId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelado = false;

    async function cargarMisEquipos() {
      setCargando(true);
      setErrorCarga('');

      try {
        // La consulta comienza por las asignaciones ACTIVAS del entrenador.
        // Las políticas RLS de Supabase también restringen el acceso.
        const { data: asignaciones, error: errorAsignaciones } = await supabase
          .from('usuario_equipo')
          .select('equipo_id')
          .eq('usuario_id', usuarioId)
          .eq('funcion_en_equipo', 'ENTRENADOR')
          .eq('activo', true);

        if (errorAsignaciones) throw errorAsignaciones;

        const idsEquipos = [...new Set((asignaciones || []).map((item) => item.equipo_id))];
        if (idsEquipos.length === 0) {
          if (!cancelado) {
            setEquipos([]);
            setMiembros([]);
            setUsuarios([]);
            setEquipoId(null);
          }
          return;
        }

        const [respuestaEquipos, respuestaMiembros] = await Promise.all([
          supabase
            .from('equipos')
            .select('id, nombre, descripcion, estado')
            .in('id', idsEquipos)
            .order('nombre', { ascending: true }),
          supabase
            .from('usuario_equipo')
            .select('id, usuario_id, equipo_id, funcion_en_equipo, activo')
            .in('equipo_id', idsEquipos)
            .eq('activo', true),
        ]);

        if (respuestaEquipos.error) throw respuestaEquipos.error;
        if (respuestaMiembros.error) throw respuestaMiembros.error;

        const nuevosEquipos = respuestaEquipos.data || [];
        const nuevosMiembros = respuestaMiembros.data || [];
        const idsUsuarios = [...new Set(nuevosMiembros.map((item) => item.usuario_id))];
        let nuevosUsuarios = [];

        if (idsUsuarios.length > 0) {
          const { data, error } = await supabase
            .from('usuarios')
            .select('id, nombre, estado')
            .in('id', idsUsuarios);

          if (error) throw error;
          nuevosUsuarios = data || [];
        }

        if (!cancelado) {
          setEquipos(nuevosEquipos);
          setMiembros(nuevosMiembros);
          setUsuarios(nuevosUsuarios);
          setEquipoId((actual) =>
            nuevosEquipos.some((equipo) => equipo.id === actual)
              ? actual
              : null
          );
        }
      } catch (error) {
        if (!cancelado) setErrorCarga(mensajeError(error));
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargarMisEquipos();
    return () => { cancelado = true; };
  }, [usuarioId, revision]);

  const usuariosPorId = useMemo(
    () => new Map(usuarios.map((usuario) => [usuario.id, usuario])),
    [usuarios]
  );

  const equiposFiltrados = useMemo(
    () => equipos.filter((equipo) =>
      equipo.nombre.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
    ),
    [equipos, busqueda]
  );

  const equipoActual = equipos.find((equipo) => equipo.id === equipoId) || null;
  const integrantes = miembros.filter((item) => item.equipo_id === equipoId);
  const entrenadores = integrantes.filter((item) => item.funcion_en_equipo === 'ENTRENADOR');
  const deportistas = integrantes.filter((item) => item.funcion_en_equipo === 'DEPORTISTA');
  const deportistasDistintos = new Set(
    miembros.filter((item) => item.funcion_en_equipo === 'DEPORTISTA').map((item) => item.usuario_id)
  ).size;

  const nombrePersona = (id) => usuariosPorId.get(id)?.nombre || 'Integrante sin datos visibles';
  const ordenarPorNombre = (a, b) => nombrePersona(a.usuario_id).localeCompare(nombrePersona(b.usuario_id), 'es');

  const renderIntegrantes = (lista, vacio) => {
    if (lista.length === 0) return <p className="ath-me-muted">{vacio}</p>;

    return (
      <div className="ath-me-members">
        {[...lista].sort(ordenarPorNombre).map((item) => {
          const persona = usuariosPorId.get(item.usuario_id);
          const nombre = nombrePersona(item.usuario_id);
          return (
            <div className="ath-me-member" key={item.id}>
              <span className="ath-me-person-avatar" aria-hidden="true">{nombre.charAt(0).toUpperCase()}</span>
              <span className="ath-me-person-info">
                <strong>{nombre}</strong>
                {persona?.estado === false && <small>Cuenta inactiva</small>}
              </span>
              {item.usuario_id === usuarioId && <span className="ath-me-self">Tú</span>}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <section className="ath-me">
      <div className="ath-me-intro">
        <div>
          <span className="ath-me-eyebrow">ESPACIO DEL ENTRENADOR</span>
          <h2>Mis equipos</h2>
          <p>Consulta tus equipos asignados y conoce a los deportistas y entrenadores que los integran.</p>
        </div>
        <button
          type="button"
          className="ath-me-refresh"
          disabled={cargando}
          onClick={() => setRevision((actual) => actual + 1)}
        >
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>

      {errorCarga && <div className="ath-me-error" role="alert">{errorCarga}</div>}

      <div className="ath-me-summary">
        <div><span>Equipos asignados</span><strong>{equipos.length}</strong></div>
        <div><span>Equipos activos</span><strong>{equipos.filter((equipo) => equipo.estado).length}</strong></div>
        <div><span>Deportistas distintos</span><strong>{deportistasDistintos}</strong></div>
      </div>

      {cargando && equipos.length === 0 ? (
        <div className="ath-me-empty" role="status">Cargando tus equipos...</div>
      ) : equipos.length === 0 ? (
        <div className="ath-me-empty">
          <h3>Todavía no tienes equipos asignados</h3>
          <p>Cuando el administrador te incorpore como entrenador a un equipo, aparecerá aquí.</p>
        </div>
      ) : (
        <div className="ath-me-layout">
          <div className="ath-me-panel ath-me-list-panel">
            <div className="ath-me-panel-heading">
              <h3>Equipos</h3>
              <span>{equiposFiltrados.length}</span>
            </div>
            <label className="ath-me-search">
              <span className="ath-me-sr-only">Buscar equipos</span>
              <input
                type="search"
                placeholder="Buscar equipo..."
                value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}
              />
            </label>
            <div className="ath-me-team-list">
              {equiposFiltrados.map((equipo) => (
                <button
                  type="button"
                  key={equipo.id}
                  className={`ath-me-team ${equipo.id === equipoId ? 'selected' : ''}`}
                  aria-pressed={equipo.id === equipoId}
                  onClick={() => setEquipoId(equipo.id)}
                >
                  <span className="ath-me-team-avatar" aria-hidden="true">{equipo.nombre.charAt(0).toUpperCase()}</span>
                  <span className="ath-me-team-info">
                    <strong>{equipo.nombre}</strong>
                    <small>{equipo.estado ? 'Activo' : 'Inactivo'}</small>
                  </span>
                  <span className="ath-me-team-arrow" aria-hidden="true">›</span>
                </button>
              ))}
              {equiposFiltrados.length === 0 && <p className="ath-me-muted">No hay equipos con ese nombre.</p>}
            </div>
          </div>

          {equipoActual ? (
            <div className="ath-me-panel ath-me-detail">
              <div className="ath-me-detail-header">
                <span className={`ath-me-status ${equipoActual.estado ? 'active' : 'inactive'}`}>
                  {equipoActual.estado ? 'EQUIPO ACTIVO' : 'EQUIPO INACTIVO'}
                </span>
                <h3>{equipoActual.nombre}</h3>
                <p>{equipoActual.descripcion || 'Sin descripción registrada.'}</p>
              </div>

              {!equipoActual.estado && (
                <div className="ath-me-notice">
                  Este equipo está inactivo. Puedes consultar sus integrantes, pero su administración corresponde al administrador.
                </div>
              )}

              <div className="ath-me-counts">
                <div><strong>{entrenadores.length}</strong><span>Entrenadores</span></div>
                <div><strong>{deportistas.length}</strong><span>Deportistas</span></div>
              </div>

              <div className="ath-me-section-heading"><h4>Entrenadores</h4></div>
              {renderIntegrantes(entrenadores, 'Este equipo no tiene entrenadores activos registrados.')}

              <div className="ath-me-section-heading"><h4>Deportistas</h4></div>
              {renderIntegrantes(deportistas, 'Este equipo no tiene deportistas activos registrados.')}

              <p className="ath-me-footer-note">La incorporación y el retiro de integrantes se realizan desde la cuenta del administrador.</p>
            </div>
          ) : (
            <div className="ath-me-panel ath-me-detail ath-me-placeholder" role="status">
              <div className="ath-me-placeholder-icon" aria-hidden="true">E</div>
              <h3>Selecciona un equipo</h3>
              <p>Elige uno de tus equipos de la lista para consultar sus integrantes y detalles.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
