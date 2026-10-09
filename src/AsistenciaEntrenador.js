import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './Asistencia.css';

const ESTADOS = [
  { valor: 'PRESENTE', texto: 'Presente' },
  { valor: 'AUSENTE', texto: 'Ausente' },
  { valor: 'JUSTIFICADO', texto: 'Justificado' },
];

function fechaActividad(fecha) {
  if (!fecha) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(fecha));
}

function explicarError(error, prefijo) {
  if (error?.code === '42501') {
    return 'Supabase rechazó la operación por permisos. Revisa las políticas RLS de asistencias y equipos.';
  }
  return `${prefijo}: ${error?.message || 'Error desconocido.'}`;
}

function normalizarRegistro(registro) {
  return {
    estado: registro?.estado_asistencia || '',
    observacion: registro?.observacion || '',
  };
}

export default function AsistenciaEntrenador({ usuarioId }) {
  const [equipos, setEquipos] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [actividadId, setActividadId] = useState(null);
  const [filtroEquipo, setFiltroEquipo] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorDetalle, setErrorDetalle] = useState('');
  const [errorGuardado, setErrorGuardado] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [miembros, setMiembros] = useState([]);
  const [historicos, setHistoricos] = useState([]);
  const [originales, setOriginales] = useState({});
  const [borrador, setBorrador] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [revision, setRevision] = useState(0);
  const [revisionDetalle, setRevisionDetalle] = useState(0);

  useEffect(() => {
    let cancelado = false;
    async function cargarEntrenamientos() {
      setCargando(true);
      setErrorCarga('');
      try {
        const respuestaAsignaciones = await supabase
          .from('usuario_equipo')
          .select('equipo_id')
          .eq('usuario_id', usuarioId)
          .eq('funcion_en_equipo', 'ENTRENADOR')
          .eq('activo', true);
        if (respuestaAsignaciones.error) throw respuestaAsignaciones.error;
        const ids = [...new Set((respuestaAsignaciones.data || []).map((item) => item.equipo_id))];
        if (!ids.length) {
          if (!cancelado) {
            setEquipos([]);
            setActividades([]);
            setActividadId(null);
          }
          return;
        }
        const [respuestaEquipos, respuestaActividades] = await Promise.all([
          supabase.from('equipos').select('id, nombre, estado').in('id', ids).order('nombre'),
          supabase.from('actividades')
            .select('id, titulo, tipo, fecha_hora, fecha_fin, estado, equipo_id, lugar')
            .in('equipo_id', ids)
            .eq('tipo', 'ENTRENAMIENTO')
            .order('fecha_hora', { ascending: false })
            .limit(300),
        ]);
        if (respuestaEquipos.error) throw respuestaEquipos.error;
        if (respuestaActividades.error) throw respuestaActividades.error;
        if (cancelado) return;
        const siguientes = respuestaActividades.data || [];
        setEquipos(respuestaEquipos.data || []);
        setActividades(siguientes);
        setActividadId((actual) => siguientes.some((item) => item.id === actual) ? actual : null);
      } catch (error) {
        if (!cancelado) setErrorCarga(explicarError(error, 'No se pudieron cargar los entrenamientos'));
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargarEntrenamientos();
    return () => { cancelado = true; };
  }, [usuarioId, revision]);

  const seleccionada = actividades.find((item) => item.id === actividadId) || null;
  const equipoSeleccionado = equipos.find((item) => item.id === seleccionada?.equipo_id) || null;
  const puedeRegistrar = Boolean(seleccionada && equipoSeleccionado?.estado === true && seleccionada.estado !== 'CANCELADA');

  useEffect(() => {
    let cancelado = false;
    async function cargarDetalle() {
      setMiembros([]);
      setHistoricos([]);
      setOriginales({});
      setBorrador({});
      setErrorDetalle('');
      setErrorGuardado('');
      if (!seleccionada) { setCargandoDetalle(false); return; }
      setCargandoDetalle(true);
      try {
        const [respuestaMiembros, respuestaRegistros] = await Promise.all([
          supabase.from('usuario_equipo')
            .select('usuario_id')
            .eq('equipo_id', seleccionada.equipo_id)
            .eq('funcion_en_equipo', 'DEPORTISTA')
            .eq('activo', true),
          supabase.from('asistencias')
            .select('actividad_id, deportista_id, estado_asistencia, observacion, fecha_registro')
            .eq('actividad_id', seleccionada.id),
        ]);
        if (respuestaMiembros.error) throw respuestaMiembros.error;
        if (respuestaRegistros.error) throw respuestaRegistros.error;
        const idsActivos = [...new Set((respuestaMiembros.data || []).map((item) => item.usuario_id))];
        const registros = respuestaRegistros.data || [];
        const idsHistoricos = [...new Set(registros.map((item) => item.deportista_id))]
          .filter((id) => !idsActivos.includes(id));
        const idsUsuarios = [...new Set([...idsActivos, ...idsHistoricos])];
        let personas = [];
        if (idsUsuarios.length) {
          const respuestaUsuarios = await supabase
            .from('usuarios').select('id, nombre').in('id', idsUsuarios);
          if (respuestaUsuarios.error) throw respuestaUsuarios.error;
          personas = respuestaUsuarios.data || [];
        }
        if (cancelado) return;
        const nombres = new Map(personas.map((persona) => [persona.id, persona.nombre]));
        const ordenar = (a, b) => a.nombre.localeCompare(b.nombre, 'es');
        const actuales = idsActivos.map((id) => ({
          id, nombre: nombres.get(id) || 'Deportista sin nombre visible',
        })).sort(ordenar);
        const anteriores = idsHistoricos.map((id) => ({
          id, nombre: nombres.get(id) || 'Deportista desvinculado',
          registro: registros.find((item) => item.deportista_id === id),
        })).sort(ordenar);
        const mapaRegistros = Object.fromEntries(
          registros.map((item) => [item.deportista_id, normalizarRegistro(item)])
        );
        const mapaBorrador = Object.fromEntries(
          actuales.map((item) => [item.id, mapaRegistros[item.id] || { estado: '', observacion: '' }])
        );
        setMiembros(actuales);
        setHistoricos(anteriores);
        setOriginales(mapaRegistros);
        setBorrador(mapaBorrador);
      } catch (error) {
        if (!cancelado) setErrorDetalle(explicarError(error, 'No se pudieron cargar las asistencias'));
      } finally {
        if (!cancelado) setCargandoDetalle(false);
      }
    }
    cargarDetalle();
    return () => { cancelado = true; };
  }, [seleccionada?.id, seleccionada?.equipo_id, revisionDetalle]);

  const actividadesFiltradas = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es');
    return actividades.filter((item) => {
      const equipo = equipos.find((valor) => valor.id === item.equipo_id);
      return (filtroEquipo === 'TODOS' || String(item.equipo_id) === filtroEquipo) &&
        (!texto || `${item.titulo} ${equipo?.nombre || ''}`.toLocaleLowerCase('es').includes(texto));
    });
  }, [actividades, equipos, filtroEquipo, busqueda]);

  const pendientes = miembros.filter((persona) => !originales[persona.id]?.estado).length;
  const cambios = miembros.filter((persona) => {
    const actual = borrador[persona.id] || { estado: '', observacion: '' };
    const original = originales[persona.id] || { estado: '', observacion: '' };
    return Boolean(actual.estado) &&
      (actual.estado !== original.estado || actual.observacion.trim() !== original.observacion.trim());
  });

  function actualizarBorrador(id, campo, valor) {
    setBorrador((anterior) => ({
      ...anterior,
      [id]: { ...(anterior[id] || { estado: '', observacion: '' }), [campo]: valor },
    }));
    setErrorGuardado('');
    setMensaje('');
  }

  function marcarPendientesPresentes() {
    if (!puedeRegistrar || guardando) return;
    setBorrador((anterior) => {
      const siguiente = { ...anterior };
      miembros.forEach((persona) => {
        if (!originales[persona.id]?.estado && !siguiente[persona.id]?.estado) {
          siguiente[persona.id] = { ...siguiente[persona.id], estado: 'PRESENTE' };
        }
      });
      return siguiente;
    });
    setMensaje('Los pendientes quedaron marcados en el formulario. Presiona «Guardar asistencia» para confirmar.');
  }

  function descartarCambios() {
    setBorrador(Object.fromEntries(miembros.map((persona) => [
      persona.id, originales[persona.id] || { estado: '', observacion: '' },
    ])));
    setErrorGuardado('');
    setMensaje('Se descartaron los cambios sin guardar.');
  }

  async function guardarAsistencia() {
    if (!puedeRegistrar || guardando || cargandoDetalle || !seleccionada) return;
    setErrorGuardado('');
    setMensaje('');
    const sinEstado = miembros.find((persona) => {
      const valor = borrador[persona.id];
      return valor?.observacion?.trim() && !valor?.estado;
    });
    if (sinEstado) {
      setErrorGuardado(`Selecciona un estado de asistencia para ${sinEstado.nombre} antes de guardar su observación.`);
      return;
    }
    if (!cambios.length) {
      setMensaje('No hay cambios nuevos para guardar.');
      return;
    }
    setGuardando(true);
    try {
      const registros = cambios.map((persona) => ({
        actividad_id: seleccionada.id,
        deportista_id: persona.id,
        estado_asistencia: borrador[persona.id].estado,
        observacion: borrador[persona.id].observacion.trim() || null,
        registrado_por: usuarioId,
        fecha_registro: new Date().toISOString(),
      }));
      const { error } = await supabase.from('asistencias')
        .upsert(registros, { onConflict: 'actividad_id,deportista_id' });
      if (error) throw error;
      setMensaje(`${registros.length} ${registros.length === 1 ? 'registro guardado' : 'registros guardados'} correctamente.`);
      setRevisionDetalle((valor) => valor + 1);
    } catch (error) {
      setErrorGuardado(explicarError(error, 'No se pudo guardar la asistencia'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ath-as">
      <header className="ath-as-header">
        <div>
          <span className="ath-as-eyebrow">ESPACIO DEL ENTRENADOR</span>
          <h2>Control de asistencia</h2>
          <p>Registra la participación de tus deportistas en los entrenamientos de cada equipo.</p>
        </div>
        <button type="button" className="ath-as-button ath-as-button-light"
          disabled={cargando || guardando || cambios.length > 0}
          title={cambios.length > 0 ? 'Guarda o deshaz los cambios antes de actualizar.' : 'Actualizar entrenamientos'}
          onClick={() => { setRevision((valor) => valor + 1); setMensaje(''); }}>
          {cargando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </header>

      {errorCarga && <div className="ath-as-alert ath-as-alert-error" role="alert">{errorCarga}</div>}
      <div className="ath-as-stats">
        <div><span>Equipos asignados</span><strong>{equipos.length}</strong></div>
        <div><span>Entrenamientos disponibles</span><strong>{actividades.length}</strong></div>
        <div><span>Pendientes del entrenamiento</span><strong>{seleccionada && !cargandoDetalle ? pendientes : '—'}</strong></div>
      </div>

      <div className="ath-as-layout">
        <aside className="ath-as-panel ath-as-list">
          <div className="ath-as-panel-heading"><h3>Entrenamientos</h3><span>{actividadesFiltradas.length}</span></div>
          <label className="ath-as-field">
            <span>Equipo</span>
            <select value={filtroEquipo} onChange={(evento) => setFiltroEquipo(evento.target.value)}>
              <option value="TODOS">Todos mis equipos</option>
              {equipos.map((equipo) => <option key={equipo.id} value={String(equipo.id)}>{equipo.nombre}</option>)}
            </select>
          </label>
          <label className="ath-as-field">
            <span className="ath-as-sr-only">Buscar entrenamiento</span>
            <input type="search" placeholder="Buscar entrenamiento..." value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}/>
          </label>
          <div className="ath-as-events">
            {cargando && !actividades.length ? (
              <p className="ath-as-muted">Cargando entrenamientos...</p>
            ) : !actividadesFiltradas.length ? (
              <div className="ath-as-no-results">No hay entrenamientos para mostrar. Programa uno desde Calendario o cambia los filtros.</div>
            ) : actividadesFiltradas.map((item) => {
              const equipo = equipos.find((valor) => valor.id === item.equipo_id);
              return (
                <button type="button" key={item.id}
                  className={`ath-as-event ${actividadId === item.id ? 'selected' : ''}`}
                  aria-pressed={actividadId === item.id}
                  disabled={guardando}
                  onClick={() => {
                    if (item.id !== actividadId && cambios.length > 0) {
                      setErrorGuardado('Guarda o deshaz los cambios pendientes antes de elegir otro entrenamiento.');
                      return;
                    }
                    setActividadId(item.id); setMensaje(''); setErrorGuardado('');
                  }}>
                  <span className="ath-as-event-dot" aria-hidden="true"/>
                  <span className="ath-as-event-text">
                    <strong>{item.titulo}</strong>
                    <small>{fechaActividad(item.fecha_hora)}</small>
                    <small>{equipo?.nombre || 'Equipo no disponible'}</small>
                    {item.estado === 'CANCELADA' && <em>Cancelado</em>}
                  </span>
                  <span className="ath-as-event-chevron" aria-hidden="true">›</span>
                </button>
              );
            })}
          </div>
          <p className="ath-as-list-note">Se muestran hasta 300 entrenamientos recientes de tus equipos.</p>
        </aside>

        <div className="ath-as-panel ath-as-detail">
          {!seleccionada ? (
            <div className="ath-as-placeholder">
              <span className="ath-as-placeholder-icon" aria-hidden="true">✓</span>
              <h3>Selecciona un entrenamiento</h3>
              <p>Elige una actividad de la lista para consultar o registrar la asistencia de sus deportistas.</p>
            </div>
          ) : (
            <>
              <div className="ath-as-detail-heading">
                <div>
                  <span className="ath-as-eyebrow">REGISTRO DE ASISTENCIA</span>
                  <h3>{seleccionada.titulo}</h3>
                  <p>{fechaActividad(seleccionada.fecha_hora)} · {equipoSeleccionado?.nombre || 'Equipo no disponible'}</p>
                  {seleccionada.lugar && <p>Lugar: {seleccionada.lugar}</p>}
                </div>
                <span className={`ath-as-pill ${puedeRegistrar ? 'active' : 'inactive'}`}>
                  {seleccionada.estado === 'CANCELADA' ? 'CANCELADO' : equipoSeleccionado?.estado === false ? 'EQUIPO INACTIVO' : 'ENTRENAMIENTO'}
                </span>
              </div>
              {!puedeRegistrar && (
                <div className="ath-as-alert ath-as-alert-warning">
                  {seleccionada.estado === 'CANCELADA'
                    ? 'Este entrenamiento fue cancelado. Puedes consultar los registros existentes, pero no modificarlos.'
                    : 'El equipo está inactivo o ya no está disponible. La asistencia se muestra en modo lectura.'}
                </div>
              )}
              {errorDetalle && <div className="ath-as-alert ath-as-alert-error" role="alert">{errorDetalle}</div>}
              {errorGuardado && <div className="ath-as-alert ath-as-alert-error" role="alert">{errorGuardado}</div>}
              {mensaje && <div className="ath-as-alert ath-as-alert-success" role="status">{mensaje}</div>}
              {cargandoDetalle ? <p className="ath-as-muted">Cargando deportistas y registros...</p> : (
                <>
                  <div className="ath-as-roster-heading">
                    <div><h4>Deportistas del equipo</h4><p>Solo se guardan los estados que selecciones o modifiques.</p></div>
                    <span>{miembros.length} deportistas</span>
                  </div>
                  {!miembros.length ? (
                    <div className="ath-as-no-results">Este equipo no tiene deportistas activos actualmente.</div>
                  ) : (
                    <div className="ath-as-roster">
                      {miembros.map((persona) => {
                        const actual = borrador[persona.id] || { estado: '', observacion: '' };
                        const yaRegistrado = Boolean(originales[persona.id]?.estado);
                        return (
                          <div className="ath-as-person" key={persona.id}>
                            <div className="ath-as-person-name">
                              <span className="ath-as-avatar" aria-hidden="true">{persona.nombre.charAt(0).toUpperCase()}</span>
                              <span><strong>{persona.nombre}</strong><small>{yaRegistrado ? 'Asistencia registrada' : 'Sin registrar'}</small></span>
                            </div>
                            <label className="ath-as-person-status">
                              <span>Estado</span>
                              <select value={actual.estado} disabled={!puedeRegistrar || guardando}
                                className={actual.estado ? `status-${actual.estado.toLowerCase()}` : ''}
                                onChange={(evento) => actualizarBorrador(persona.id, 'estado', evento.target.value)}>
                                <option value="" disabled={yaRegistrado}>Sin registrar</option>
                                {ESTADOS.map((estado) => <option key={estado.valor} value={estado.valor}>{estado.texto}</option>)}
                              </select>
                            </label>
                            <label className="ath-as-person-note">
                              <span>Observación (opcional)</span>
                              <input type="text" maxLength={250} value={actual.observacion}
                                placeholder="Ej. Avisó que llegaría tarde"
                                disabled={!puedeRegistrar || guardando}
                                onChange={(evento) => actualizarBorrador(persona.id, 'observacion', evento.target.value)}/>
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {historicos.length > 0 && (
                    <div className="ath-as-historical">
                      <h4>Registros de deportistas desvinculados</h4>
                      <p>Se conservan como historial, pero no se pueden editar desde esta lista.</p>
                      {historicos.map((persona) => (
                        <div key={persona.id} className="ath-as-historical-row">
                          <span>{persona.nombre}</span>
                          <span>{ESTADOS.find((estado) => estado.valor === persona.registro?.estado_asistencia)?.texto || 'Sin registrar'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {puedeRegistrar && miembros.length > 0 && (
                    <div className="ath-as-actions">
                      <div className="ath-as-action-hint">{cambios.length} {cambios.length === 1 ? 'cambio pendiente' : 'cambios pendientes'} de guardar.</div>
                      <div className="ath-as-action-buttons">
                        <button type="button" className="ath-as-button ath-as-button-light" disabled={guardando || pendientes === 0}
                          onClick={marcarPendientesPresentes}>Marcar pendientes presentes</button>
                        <button type="button" className="ath-as-button ath-as-button-light" disabled={guardando || cambios.length === 0}
                          onClick={descartarCambios}>Deshacer cambios</button>
                        <button type="button" className="ath-as-button ath-as-button-primary" disabled={guardando || cambios.length === 0}
                          onClick={guardarAsistencia}>{guardando ? 'Guardando...' : 'Guardar asistencia'}</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
