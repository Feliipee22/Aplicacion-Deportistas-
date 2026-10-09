import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './GestionEquipos.css';

const formularioVacio = { nombre: '', descripcion: '' };

function mensajeError(error, contexto) {
  if (error?.code === '23505') {
    return 'Ya existe un equipo con ese nombre o esa asignación.';
  }
  if (error?.code === '42501') {
    return 'Tu cuenta no tiene permisos para realizar esta acción. Revisa las políticas RLS en Supabase.';
  }
  return `${contexto}: ${error?.message || 'Ocurrió un error inesperado.'}`;
}

export default function GestionEquipos() {
  const [equipos, setEquipos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [miembros, setMiembros] = useState([]);
  const [equipoId, setEquipoId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoMiembros, setCargandoMiembros] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorMiembros, setErrorMiembros] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [revisionMiembros, setRevisionMiembros] = useState(0);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [guardandoEquipo, setGuardandoEquipo] = useState(false);
  const [usuarioElegido, setUsuarioElegido] = useState('');
  const [guardandoMiembro, setGuardandoMiembro] = useState(false);
  const [confirmacion, setConfirmacion] = useState(null);
  const [procesandoConfirmacion, setProcesandoConfirmacion] = useState(false);

  const cargarDatos = useCallback(async (preferidoId = null) => {
    setCargando(true);
    setErrorCarga('');
    try {
      const [respuestaEquipos, respuestaUsuarios] = await Promise.all([
        supabase.from('equipos')
          .select('id, nombre, descripcion, estado')
          .order('nombre', { ascending: true }),
        supabase.from('usuarios')
          .select('id, nombre, rol_id, estado')
          .in('rol_id', [2, 3])
          .order('nombre', { ascending: true }),
      ]);
      if (respuestaEquipos.error) throw respuestaEquipos.error;
      if (respuestaUsuarios.error) throw respuestaUsuarios.error;

      const nuevosEquipos = respuestaEquipos.data || [];
      setEquipos(nuevosEquipos);
      setUsuarios(respuestaUsuarios.data || []);
      setEquipoId((actual) => {
        const deseado = preferidoId ?? actual;
        return nuevosEquipos.some((item) => item.id === deseado)
          ? deseado
          : null;
      });
    } catch (error) {
      setErrorCarga(mensajeError(error, 'No se pudieron cargar los equipos'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    let vigente = true;
    setMiembros([]);
    setErrorMiembros('');
    setUsuarioElegido('');

    if (equipoId === null) {
      setCargandoMiembros(false);
      return undefined;
    }

    const cargarMiembros = async () => {
      setCargandoMiembros(true);
      const { data, error } = await supabase.from('usuario_equipo')
        .select('id, usuario_id, equipo_id, funcion_en_equipo, activo')
        .eq('equipo_id', equipoId)
        .order('id', { ascending: true });
      if (!vigente) return;
      if (error) {
        setErrorMiembros(mensajeError(error, 'No se pudieron cargar los integrantes'));
      } else {
        setMiembros(data || []);
      }
      setCargandoMiembros(false);
    };

    cargarMiembros();
    return () => { vigente = false; };
  }, [equipoId, revisionMiembros]);

  const equipoActual = equipos.find((item) => item.id === equipoId) || null;
  const integrantes = useMemo(() => miembros.filter((item) => item.activo), [miembros]);
  const entrenadores = integrantes.filter((item) => item.funcion_en_equipo === 'ENTRENADOR');
  const deportistas = integrantes.filter((item) => item.funcion_en_equipo === 'DEPORTISTA');
  const idsAsignados = new Set(integrantes.map((item) => item.usuario_id));
  const disponibles = usuarios.filter((item) => item.estado && !idsAsignados.has(item.id));
  const equiposFiltrados = equipos.filter((item) =>
    item.nombre.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  );
  const ocupado = guardandoEquipo || guardandoMiembro || procesandoConfirmacion;

  const nombreUsuario = (id) => usuarios.find((item) => item.id === id)?.nombre || 'Usuario no disponible';

  const comenzarCreacion = () => {
    if (ocupado) return;
    setEditandoId(null);
    setFormulario(formularioVacio);
    setErrorAccion('');
    setMensaje('');
    setMostrarFormulario(true);
  };

  const comenzarEdicion = () => {
    if (!equipoActual || ocupado) return;
    setEditandoId(equipoActual.id);
    setFormulario({ nombre: equipoActual.nombre, descripcion: equipoActual.descripcion || '' });
    setErrorAccion('');
    setMensaje('');
    setMostrarFormulario(true);
  };

  const guardarEquipo = async (evento) => {
    evento.preventDefault();
    if (ocupado) return;
    const nombre = formulario.nombre.trim();
    const descripcion = formulario.descripcion.trim();
    if (nombre.length < 2 || nombre.length > 80) {
      setErrorAccion('El nombre debe tener entre 2 y 80 caracteres.');
      return;
    }
    if (descripcion.length > 500) {
      setErrorAccion('La descripción no puede superar los 500 caracteres.');
      return;
    }

    setGuardandoEquipo(true);
    setErrorAccion('');
    setMensaje('');
    try {
      const datos = { nombre, descripcion: descripcion || null };
      const consulta = editandoId === null
        ? supabase.from('equipos').insert({ ...datos, estado: true })
        : supabase.from('equipos').update(datos).eq('id', editandoId);
      const { data, error } = await consulta.select('id').single();
      if (error) throw error;
      setMostrarFormulario(false);
      setEditandoId(null);
      setFormulario(formularioVacio);
      setMensaje(editandoId === null ? 'Equipo creado correctamente.' : 'Equipo actualizado correctamente.');
      await cargarDatos(data.id);
    } catch (error) {
      setErrorAccion(mensajeError(error, 'No se pudo guardar el equipo'));
    } finally {
      setGuardandoEquipo(false);
    }
  };

  const agregarIntegrante = async (evento) => {
    evento.preventDefault();
    if (ocupado || !equipoActual?.estado) return;
    const usuario = usuarios.find((item) => item.id === usuarioElegido);
    if (!usuario || !usuario.estado || ![2, 3].includes(usuario.rol_id)) {
      setErrorAccion('Selecciona un entrenador o deportista activo.');
      return;
    }
    if (idsAsignados.has(usuario.id)) {
      setErrorAccion('Esta persona ya pertenece al equipo.');
      return;
    }

    setGuardandoMiembro(true);
    setErrorAccion('');
    setMensaje('');
    try {
      const { error } = await supabase.from('usuario_equipo').upsert({
        usuario_id: usuario.id,
        equipo_id: equipoActual.id,
        funcion_en_equipo: usuario.rol_id === 2 ? 'ENTRENADOR' : 'DEPORTISTA',
        activo: true,
      }, { onConflict: 'usuario_id,equipo_id' });
      if (error) throw error;
      setMensaje(`${usuario.nombre} fue incorporado al equipo.`);
      setUsuarioElegido('');
      setRevisionMiembros((actual) => actual + 1);
    } catch (error) {
      setErrorAccion(mensajeError(error, 'No se pudo incorporar al integrante'));
    } finally {
      setGuardandoMiembro(false);
    }
  };

  const confirmarAccion = async () => {
    if (!confirmacion || ocupado) return;
    setProcesandoConfirmacion(true);
    setErrorAccion('');
    setMensaje('');
    try {
      if (confirmacion.tipo === 'retirar') {
        const { data, error } = await supabase.from('usuario_equipo')
          .update({ activo: false })
          .eq('id', confirmacion.miembro.id)
          .eq('equipo_id', confirmacion.equipoId)
          .select('id').single();
        if (error || !data) throw error || new Error('No se encontró la asignación.');
        setMensaje('Integrante retirado del equipo. Su historial no fue eliminado.');
        setRevisionMiembros((actual) => actual + 1);
      } else if (confirmacion.tipo === 'estado') {
        const { data, error } = await supabase.from('equipos')
          .update({ estado: !confirmacion.equipo.estado })
          .eq('id', confirmacion.equipo.id)
          .select('id').single();
        if (error || !data) throw error || new Error('No se encontró el equipo.');
        setMensaje(confirmacion.equipo.estado ? 'Equipo desactivado.' : 'Equipo activado.');
        await cargarDatos(confirmacion.equipo.id);
      }
      setConfirmacion(null);
    } catch (error) {
      setErrorAccion(mensajeError(error, 'No se pudo completar la acción'));
      setConfirmacion(null);
    } finally {
      setProcesandoConfirmacion(false);
    }
  };

  return (
    <section className="ath-ge">
      <div className="ath-ge-intro">
        <div>
          <span className="ath-ge-eyebrow">ADMINISTRACIÓN DEL CLUB</span>
          <h2>Gestión de equipos</h2>
          <p>Crea equipos, asigna entrenadores y organiza a tus deportistas.</p>
        </div>
        <button className="ath-ge-button ath-ge-button-primary" type="button" onClick={comenzarCreacion} disabled={ocupado}>
          + Crear equipo
        </button>
      </div>

      {mensaje && <div className="ath-ge-success" role="status">{mensaje}</div>}
      {errorCarga && <div className="ath-ge-error" role="alert">{errorCarga}</div>}
      {errorAccion && <div className="ath-ge-error" role="alert">{errorAccion}</div>}

      {mostrarFormulario && (
        <form className="ath-ge-form" onSubmit={guardarEquipo}>
          <div className="ath-ge-form-top">
            <h3>{editandoId === null ? 'Nuevo equipo' : 'Editar equipo'}</h3>
            <button type="button" className="ath-ge-button ath-ge-button-quiet" disabled={guardandoEquipo} onClick={() => { setMostrarFormulario(false); setErrorAccion(''); }}>
              Cerrar
            </button>
          </div>
          <div className="ath-ge-form-grid">
            <label className="ath-ge-field">
              <span>Nombre del equipo *</span>
              <input value={formulario.nombre} onChange={(evento) => setFormulario((actual) => ({ ...actual, nombre: evento.target.value }))} maxLength={80} placeholder="Ej. Juvenil femenino" required />
            </label>
            <label className="ath-ge-field">
              <span>Descripción (opcional)</span>
              <textarea value={formulario.descripcion} onChange={(evento) => setFormulario((actual) => ({ ...actual, descripcion: evento.target.value }))} maxLength={500} rows={3} placeholder="Categoría, disciplina u observaciones" />
            </label>
          </div>
          <button type="submit" className="ath-ge-button ath-ge-button-dark" disabled={guardandoEquipo}>
            {guardandoEquipo ? 'Guardando...' : editandoId === null ? 'Crear equipo' : 'Guardar cambios'}
          </button>
        </form>
      )}

      <div className="ath-ge-summary">
        <div><span>Equipos registrados</span><strong>{equipos.length}</strong></div>
        <div><span>Equipos activos</span><strong>{equipos.filter((item) => item.estado).length}</strong></div>
        <div><span>Personas disponibles</span><strong>{usuarios.filter((item) => item.estado).length}</strong></div>
      </div>

      {cargando ? (
        <div className="ath-ge-empty">Cargando equipos...</div>
      ) : equipos.length === 0 ? (
        <div className="ath-ge-empty">Todavía no hay equipos. Presiona «Crear equipo» para comenzar.</div>
      ) : (
        <div className="ath-ge-layout">
          <div className="ath-ge-panel ath-ge-list-panel">
            <div className="ath-ge-panel-heading"><h3>Equipos</h3><span>{equiposFiltrados.length}</span></div>
            <label className="ath-ge-search">
              <span className="ath-ge-sr-only">Buscar equipos</span>
              <input type="search" value={busqueda} onChange={(evento) => setBusqueda(evento.target.value)} placeholder="Buscar equipo..." />
            </label>
            <div className="ath-ge-team-list">
              {equiposFiltrados.map((equipo) => (
                <button key={equipo.id} type="button" className={`ath-ge-team ${equipo.id === equipoId ? 'selected' : ''}`} onClick={() => { if (!ocupado) { setEquipoId(equipo.id); setMensaje(''); setErrorAccion(''); setMostrarFormulario(false); } }}>
                  <span className="ath-ge-team-avatar">{equipo.nombre.slice(0, 1).toUpperCase()}</span>
                  <span className="ath-ge-team-info"><strong>{equipo.nombre}</strong><small>{equipo.estado ? 'Activo' : 'Inactivo'}</small></span>
                  <span className="ath-ge-team-arrow">›</span>
                </button>
              ))}
              {equiposFiltrados.length === 0 && <p className="ath-ge-no-results">No hay equipos con ese nombre.</p>}
            </div>
          </div>

          {equipoActual ? (
            <div className="ath-ge-panel ath-ge-detail">
              <div className="ath-ge-detail-header">
                <div>
                  <span className={`ath-ge-status ${equipoActual.estado ? 'active' : 'inactive'}`}>
                    {equipoActual.estado ? 'EQUIPO ACTIVO' : 'EQUIPO INACTIVO'}
                  </span>
                  <h3>{equipoActual.nombre}</h3>
                  <p>{equipoActual.descripcion || 'Sin descripción registrada.'}</p>
                </div>
                <div className="ath-ge-actions">
                  <button type="button" className="ath-ge-button ath-ge-button-quiet" onClick={comenzarEdicion} disabled={ocupado}>Editar</button>
                  <button type="button" className="ath-ge-button ath-ge-button-outline" disabled={ocupado} onClick={() => setConfirmacion({ tipo: 'estado', equipo: equipoActual })}>
                    {equipoActual.estado ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>

              <div className="ath-ge-counts">
                <div><strong>{entrenadores.length}</strong><span>Entrenadores</span></div>
                <div><strong>{deportistas.length}</strong><span>Deportistas</span></div>
              </div>

              {errorMiembros && <div className="ath-ge-error" role="alert">{errorMiembros}</div>}
              {cargandoMiembros ? (
                <p className="ath-ge-muted">Cargando integrantes...</p>
              ) : (
                <>
                  <div className="ath-ge-section-heading"><h4>Entrenadores</h4></div>
                  {entrenadores.length === 0 ? <p className="ath-ge-muted">Este equipo todavía no tiene entrenadores.</p> : (
                    <div className="ath-ge-members">
                      {entrenadores.map((item) => (
                        <div className="ath-ge-member" key={item.id}>
                          <span className="ath-ge-person-avatar">{nombreUsuario(item.usuario_id).slice(0, 1).toUpperCase()}</span>
                          <span className="ath-ge-person-name">{nombreUsuario(item.usuario_id)}</span>
                          <button type="button" className="ath-ge-remove" disabled={ocupado} onClick={() => setConfirmacion({ tipo: 'retirar', miembro: item, nombre: nombreUsuario(item.usuario_id), equipoId })}>Retirar</button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="ath-ge-section-heading"><h4>Deportistas</h4></div>
                  {deportistas.length === 0 ? <p className="ath-ge-muted">Este equipo todavía no tiene deportistas.</p> : (
                    <div className="ath-ge-members">
                      {deportistas.map((item) => (
                        <div className="ath-ge-member" key={item.id}>
                          <span className="ath-ge-person-avatar">{nombreUsuario(item.usuario_id).slice(0, 1).toUpperCase()}</span>
                          <span className="ath-ge-person-name">{nombreUsuario(item.usuario_id)}</span>
                          <button type="button" className="ath-ge-remove" disabled={ocupado} onClick={() => setConfirmacion({ tipo: 'retirar', miembro: item, nombre: nombreUsuario(item.usuario_id), equipoId })}>Retirar</button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <form className="ath-ge-add" onSubmit={agregarIntegrante}>
                <div><h4>Agregar integrante</h4><p>Selecciona un entrenador o deportista registrado en Athletix.</p></div>
                {!equipoActual.estado && <p className="ath-ge-warning">Activa el equipo antes de incorporar personas.</p>}
                <div className="ath-ge-add-row">
                  <label className="ath-ge-field ath-ge-select">
                    <span>Persona</span>
                    <select value={usuarioElegido} onChange={(evento) => setUsuarioElegido(evento.target.value)} disabled={ocupado || !equipoActual.estado || cargandoMiembros || disponibles.length === 0} required>
                      <option value="">Selecciona una persona...</option>
                      <optgroup label="Entrenadores">
                        {disponibles.filter((item) => item.rol_id === 2).map((item) => <option value={item.id} key={item.id}>{item.nombre}</option>)}
                      </optgroup>
                      <optgroup label="Deportistas">
                        {disponibles.filter((item) => item.rol_id === 3).map((item) => <option value={item.id} key={item.id}>{item.nombre}</option>)}
                      </optgroup>
                    </select>
                  </label>
                  <button type="submit" className="ath-ge-button ath-ge-button-dark" disabled={ocupado || !equipoActual.estado || cargandoMiembros || !usuarioElegido}>
                    {guardandoMiembro ? 'Agregando...' : 'Agregar'}
                  </button>
                </div>
                {disponibles.length === 0 && !cargandoMiembros && <p className="ath-ge-muted">No hay más usuarios activos disponibles para este equipo.</p>}
              </form>
            </div>
          ) : (
            <div className="ath-ge-panel ath-ge-detail ath-ge-placeholder" role="status">
              <div className="ath-ge-placeholder-icon" aria-hidden="true">E</div>
              <h3>Selecciona un equipo</h3>
              <p>Elige un equipo de la lista para ver sus integrantes y administrarlo.</p>
            </div>
          )}
        </div>
      )}

      {confirmacion && (
        <div className="ath-ge-backdrop">
          <div className="ath-ge-modal" role="alertdialog" aria-modal="true" aria-labelledby="ath-ge-confirm-title" aria-describedby="ath-ge-confirm-description">
            <h3 id="ath-ge-confirm-title">{confirmacion.tipo === 'retirar' ? '¿Retirar integrante?' : confirmacion.equipo.estado ? '¿Desactivar equipo?' : '¿Activar equipo?'}</h3>
            <p id="ath-ge-confirm-description">
              {confirmacion.tipo === 'retirar'
                ? `Se retirará a ${confirmacion.nombre} del equipo. Su asignación quedará inactiva, sin borrar el registro.`
                : confirmacion.equipo.estado
                  ? `El equipo «${confirmacion.equipo.nombre}» dejará de aceptar nuevas incorporaciones desde este módulo. Los integrantes y las asignaciones anteriores se conservarán.`
                  : `El equipo «${confirmacion.equipo.nombre}» volverá a estar disponible para incorporar integrantes.`}
            </p>
            <div className="ath-ge-modal-actions">
              <button type="button" className="ath-ge-button ath-ge-button-quiet" disabled={procesandoConfirmacion} onClick={() => setConfirmacion(null)}>Cancelar</button>
              <button type="button" className="ath-ge-button ath-ge-button-dark" disabled={procesandoConfirmacion} onClick={confirmarAccion}>
                {procesandoConfirmacion ? 'Procesando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
