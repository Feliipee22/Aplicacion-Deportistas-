import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './Avisos.css';

const BORRADOR_INICIAL = { titulo: '', mensaje: '', destino: '' };

function formatearFecha(valor) {
  if (!valor) return 'Fecha no disponible';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(fecha);
}

function explicarError(error, operacion) {
  if (error?.code === '42501') {
    return 'Supabase rechazó la operación por permisos. Comprueba que ejecutaste Politicas_Avisos.sql.';
  }
  if (error?.code === '23503') {
    return 'El equipo o el autor relacionado ya no está disponible.';
  }
  return `${operacion}: ${error?.message || 'Error desconocido.'}`;
}

export default function Avisos({ perfil }) {
  const administrador = perfil.rol_id === 1;
  const entrenador = perfil.rol_id === 2;
  const deportista = perfil.rol_id === 3;
  const puedePublicar = administrador || entrenador;

  const [avisos, setAvisos] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [mensajeAccion, setMensajeAccion] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtroDestino, setFiltroDestino] = useState('TODOS');
  const [filtroEstado, setFiltroEstado] = useState('TODOS');
  const [avisoId, setAvisoId] = useState(null);
  const [modal, setModal] = useState(null);
  const [borrador, setBorrador] = useState(BORRADOR_INICIAL);
  const [confirmacion, setConfirmacion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelado = false;

    async function cargar() {
      setCargando(true);
      setErrorCarga('');
      try {
        let listaEquipos = [];
        if (administrador) {
          const respuesta = await supabase
            .from('equipos')
            .select('id, nombre, estado')
            .order('nombre', { ascending: true });
          if (respuesta.error) throw respuesta.error;
          listaEquipos = respuesta.data || [];
        } else {
          const respuestaVinculos = await supabase
            .from('usuario_equipo')
            .select('equipo_id')
            .eq('usuario_id', perfil.id)
            .eq('funcion_en_equipo', entrenador ? 'ENTRENADOR' : 'DEPORTISTA')
            .eq('activo', true);
          if (respuestaVinculos.error) throw respuestaVinculos.error;
          const ids = [...new Set((respuestaVinculos.data || []).map((item) => item.equipo_id))];
          if (ids.length) {
            const respuesta = await supabase
              .from('equipos')
              .select('id, nombre, estado')
              .in('id', ids)
              .order('nombre', { ascending: true });
            if (respuesta.error) throw respuesta.error;
            listaEquipos = respuesta.data || [];
          }
        }

        const respuestaAvisos = await supabase
          .from('avisos')
          .select('id, titulo, mensaje, autor_id, equipo_id, fecha_publicacion, updated_at, activo')
          .order('fecha_publicacion', { ascending: false })
          .limit(300);
        if (respuestaAvisos.error) throw respuestaAvisos.error;

        if (cancelado) return;
        const siguientes = respuestaAvisos.data || [];
        setEquipos(listaEquipos);
        setAvisos(siguientes);
        setAvisoId((actual) => siguientes.some((item) => item.id === actual) ? actual : null);
      } catch (error) {
        if (!cancelado) setErrorCarga(explicarError(error, 'No se pudieron cargar los avisos'));
      } finally {
        if (!cancelado) setCargando(false);
      }
    }

    cargar();
    return () => { cancelado = true; };
  }, [administrador, entrenador, perfil.id, revision]);

  const equiposPorId = useMemo(() => new Map(equipos.map((equipo) => [equipo.id, equipo])), [equipos]);
  const equiposActivos = useMemo(() => equipos.filter((equipo) => equipo.estado === true), [equipos]);
  const idsDeEquipos = useMemo(() => new Set(equipos.map((equipo) => equipo.id)), [equipos]);

  const avisosAccesibles = useMemo(() => avisos.filter((aviso) => {
    // El servidor filtra por RLS; esto refuerza la presentación según el rol.
    if (administrador) return true;
    if (entrenador && aviso.autor_id === perfil.id) return true;
    if (!aviso.activo) return false;
    return aviso.equipo_id == null || idsDeEquipos.has(aviso.equipo_id);
  }), [avisos, administrador, entrenador, perfil.id, idsDeEquipos]);

  const avisosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLocaleLowerCase('es');
    return avisosAccesibles.filter((aviso) => {
      const destinoCorrecto = filtroDestino === 'TODOS'
        || (filtroDestino === 'GENERAL' && aviso.equipo_id == null)
        || String(aviso.equipo_id) === filtroDestino;
      const estadoCorrecto = !puedePublicar || filtroEstado === 'TODOS'
        || (filtroEstado === 'ACTIVOS' && aviso.activo)
        || (filtroEstado === 'ARCHIVADOS' && !aviso.activo);
      const nombreEquipo = equiposPorId.get(aviso.equipo_id)?.nombre || '';
      const textoCorrecto = !texto || `${aviso.titulo} ${aviso.mensaje} ${nombreEquipo}`
        .toLocaleLowerCase('es').includes(texto);
      return destinoCorrecto && estadoCorrecto && textoCorrecto;
    });
  }, [avisosAccesibles, busqueda, filtroDestino, filtroEstado, equiposPorId, puedePublicar]);

  const avisoSeleccionado = avisosFiltrados.find((aviso) => aviso.id === avisoId) || null;
  const activos = avisosAccesibles.filter((aviso) => aviso.activo).length;
  const archivados = avisosAccesibles.length - activos;
  const generales = avisosAccesibles.filter((aviso) => aviso.activo && aviso.equipo_id == null).length;
  const deEquipos = avisosAccesibles.filter((aviso) => aviso.activo && aviso.equipo_id != null).length;

  function nombreDestino(aviso) {
    return aviso.equipo_id == null
      ? 'Todo el club'
      : equiposPorId.get(aviso.equipo_id)?.nombre || 'Equipo no disponible';
  }

  function esDestinoActivo(aviso) {
    return aviso.equipo_id == null || equiposPorId.get(aviso.equipo_id)?.estado === true;
  }

  function puedeGestionarAviso(aviso) {
    if (!aviso || !puedePublicar) return false;
    if (administrador) return true;
    return aviso.autor_id === perfil.id
      && aviso.equipo_id != null
      && idsDeEquipos.has(aviso.equipo_id)
      && esDestinoActivo(aviso);
  }

  function abrirNuevo() {
    if (guardando || !puedePublicar) return;
    setBorrador({ ...BORRADOR_INICIAL, destino: administrador ? 'GENERAL' : '' });
    setErrorAccion('');
    setMensajeAccion('');
    setModal({ modo: 'nuevo' });
  }

  function abrirEditar(aviso) {
    if (guardando || !puedeGestionarAviso(aviso)) return;
    setBorrador({
      titulo: aviso.titulo,
      mensaje: aviso.mensaje,
      destino: aviso.equipo_id == null ? 'GENERAL' : String(aviso.equipo_id),
    });
    setErrorAccion('');
    setMensajeAccion('');
    setModal({ modo: 'editar', id: aviso.id });
  }

  async function guardarAviso(evento) {
    evento.preventDefault();
    if (guardando || !modal || !puedePublicar) return;
    setErrorAccion('');
    setMensajeAccion('');

    const titulo = borrador.titulo.trim();
    const mensaje = borrador.mensaje.trim();
    const equipoId = borrador.destino === 'GENERAL' ? null : Number(borrador.destino);
    if (!titulo || !mensaje || titulo.length > 120 || mensaje.length > 5000) {
      setErrorAccion('Completa el título (máximo 120 caracteres) y el mensaje (máximo 5000 caracteres).');
      return;
    }
    if (!borrador.destino || (equipoId == null && !administrador)) {
      setErrorAccion('Selecciona el equipo destinatario. Solo el administrador puede publicar para todo el club.');
      return;
    }
    if (equipoId != null && !equiposActivos.some((equipo) => equipo.id === equipoId)) {
      setErrorAccion('Selecciona un equipo activo al que tengas acceso.');
      return;
    }
    if (modal.modo === 'editar') {
      const original = avisos.find((aviso) => aviso.id === modal.id);
      if (!puedeGestionarAviso(original)) {
        setErrorAccion('No tienes permisos para modificar este aviso.');
        return;
      }
    }

    setGuardando(true);
    try {
      let respuesta;
      if (modal.modo === 'nuevo') {
        respuesta = await supabase.from('avisos')
          .insert({ autor_id: perfil.id, equipo_id: equipoId, titulo, mensaje, activo: true })
          .select('id').single();
      } else {
        respuesta = await supabase.from('avisos')
          .update({ equipo_id: equipoId, titulo, mensaje })
          .eq('id', modal.id)
          .select('id').maybeSingle();
      }
      if (respuesta.error) throw respuesta.error;
      if (!respuesta.data?.id) throw new Error('No se pudo confirmar el guardado. Revisa los permisos de tu cuenta.');
      setAvisoId(respuesta.data.id);
      setModal(null);
      setFiltroDestino('TODOS');
      setFiltroEstado('TODOS');
      setBusqueda('');
      setMensajeAccion(modal.modo === 'nuevo' ? 'Aviso publicado correctamente.' : 'Aviso actualizado correctamente.');
      setRevision((actual) => actual + 1);
    } catch (error) {
      setErrorAccion(explicarError(error, 'No se pudo guardar el aviso'));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEstado() {
    if (!confirmacion || guardando) return;
    const aviso = avisos.find((item) => item.id === confirmacion.id);
    if (!puedeGestionarAviso(aviso)) {
      setErrorAccion('No tienes permiso para modificar este aviso.');
      setConfirmacion(null);
      return;
    }
    if (!aviso.activo && !esDestinoActivo(aviso)) {
      setErrorAccion('No puedes reactivar un aviso de un equipo inactivo.');
      setConfirmacion(null);
      return;
    }
    setGuardando(true);
    setErrorAccion('');
    setMensajeAccion('');
    try {
      const respuesta = await supabase.from('avisos')
        .update({ activo: !aviso.activo })
        .eq('id', aviso.id)
        .select('id').maybeSingle();
      if (respuesta.error) throw respuesta.error;
      if (!respuesta.data?.id) throw new Error('No se pudo confirmar el cambio de estado.');
      setConfirmacion(null);
      setMensajeAccion(aviso.activo ? 'Aviso archivado. Ya no aparece para los destinatarios.' : 'Aviso reactivado correctamente.');
      setRevision((actual) => actual + 1);
    } catch (error) {
      setConfirmacion(null);
      setErrorAccion(explicarError(error, 'No se pudo cambiar el estado del aviso'));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="ath-av">
      <header className="ath-av-header">
        <div>
          <span className="ath-av-eyebrow">COMUNICACIONES DEL CLUB</span>
          <h2>Avisos</h2>
          <p>{administrador
            ? 'Publica comunicados para todo el club o para equipos específicos.'
            : entrenador
              ? 'Comunica novedades a tus equipos y consulta los avisos del club.'
              : 'Mantente al día con las novedades de tu club y tus equipos.'}</p>
        </div>
        <div className="ath-av-header-actions">
          <button type="button" className="ath-av-btn ath-av-btn-light" disabled={cargando || guardando}
            onClick={() => { setErrorAccion(''); setRevision((actual) => actual + 1); }}>
            Actualizar
          </button>
          {puedePublicar && (
            <button type="button" className="ath-av-btn ath-av-btn-primary"
              disabled={cargando || guardando || (entrenador && !equiposActivos.length)}
              onClick={abrirNuevo}>
              + Nuevo aviso
            </button>
          )}
        </div>
      </header>

      {errorCarga && <div className="ath-av-error" role="alert">{errorCarga}</div>}
      {errorAccion && !modal && <div className="ath-av-error" role="alert">{errorAccion}</div>}
      {mensajeAccion && <div className="ath-av-success" role="status">{mensajeAccion}</div>}

      <div className="ath-av-stats">
        <div><span>{deportista ? 'Avisos disponibles' : administrador ? 'Avisos registrados' : 'Avisos visibles'}</span><strong>{deportista ? activos : avisosAccesibles.length}</strong></div>
        <div><span>{deportista ? 'Generales' : 'Publicados'}</span><strong>{deportista ? generales : activos}</strong></div>
        <div><span>{deportista ? 'De mis equipos' : 'Archivados'}</span><strong>{deportista ? deEquipos : archivados}</strong></div>
      </div>

      <div className="ath-av-layout">
        <div className="ath-av-panel ath-av-sidebar">
          <div className="ath-av-panel-title"><h3>Comunicados</h3><span>{avisosFiltrados.length}</span></div>
          <label className="ath-av-field">
            <span className="ath-av-sr-only">Buscar avisos</span>
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar aviso..." maxLength={120} />
          </label>
          <div className="ath-av-filters">
            <label className="ath-av-field">
              <span>Destinatarios</span>
              <select value={filtroDestino} onChange={(e) => setFiltroDestino(e.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="GENERAL">Todo el club</option>
                {equipos.map((equipo) => (
                  <option key={equipo.id} value={String(equipo.id)}>{equipo.nombre}</option>
                ))}
              </select>
            </label>
            {puedePublicar && (
              <label className="ath-av-field">
                <span>Estado</span>
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                  <option value="TODOS">Todos</option>
                  <option value="ACTIVOS">Publicados</option>
                  <option value="ARCHIVADOS">Archivados</option>
                </select>
              </label>
            )}
          </div>
          <div className="ath-av-list">
            {cargando ? (
              <p className="ath-av-muted">Cargando avisos...</p>
            ) : avisosFiltrados.length === 0 ? (
              <div className="ath-av-list-empty">No hay avisos con los filtros seleccionados.</div>
            ) : avisosFiltrados.map((aviso) => (
              <button key={aviso.id} type="button"
                className={`ath-av-item ${avisoSeleccionado?.id === aviso.id ? 'selected' : ''}`}
                onClick={() => { setAvisoId(aviso.id); setErrorAccion(''); setMensajeAccion(''); }}
                aria-pressed={avisoSeleccionado?.id === aviso.id}>
                <span className={`ath-av-item-icon ${aviso.equipo_id == null ? 'general' : ''}`} aria-hidden="true">
                  {aviso.equipo_id == null ? 'C' : 'E'}
                </span>
                <span className="ath-av-item-body">
                  <strong>{aviso.titulo}</strong>
                  <small>{nombreDestino(aviso)}</small>
                  <small>{formatearFecha(aviso.fecha_publicacion)}</small>
                  {!aviso.activo && <em>Archivado</em>}
                </span>
                <span className="ath-av-item-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
          <p className="ath-av-list-note">Se muestran hasta 300 avisos recientes.</p>
        </div>

        <article className="ath-av-panel ath-av-detail">
          {avisoSeleccionado ? (
            <>
              <div className="ath-av-detail-head">
                <div>
                  <div className="ath-av-tags">
                    <span className={`ath-av-tag ${avisoSeleccionado.activo ? 'active' : 'archived'}`}>
                      {avisoSeleccionado.activo ? 'PUBLICADO' : 'ARCHIVADO'}
                    </span>
                    <span className="ath-av-tag destination">
                      {avisoSeleccionado.equipo_id == null ? 'GENERAL' : 'EQUIPO'}
                    </span>
                  </div>
                  <h3>{avisoSeleccionado.titulo}</h3>
                  <p className="ath-av-date">Publicado el {formatearFecha(avisoSeleccionado.fecha_publicacion)}</p>
                </div>
                {puedeGestionarAviso(avisoSeleccionado) && (
                  <div className="ath-av-detail-actions">
                    {esDestinoActivo(avisoSeleccionado) && (
                      <button type="button" className="ath-av-btn ath-av-btn-light" disabled={guardando}
                        onClick={() => abrirEditar(avisoSeleccionado)}>Editar</button>
                    )}
                    <button type="button" className="ath-av-btn ath-av-btn-outline" disabled={guardando || (!avisoSeleccionado.activo && !esDestinoActivo(avisoSeleccionado))}
                      onClick={() => { setConfirmacion({ id: avisoSeleccionado.id }); setErrorAccion(''); }}>
                      {avisoSeleccionado.activo ? 'Archivar' : 'Reactivar'}
                    </button>
                  </div>
                )}
              </div>
              <div className="ath-av-destination">
                <span>Dirigido a</span>
                <strong>{nombreDestino(avisoSeleccionado)}</strong>
                {avisoSeleccionado.autor_id === perfil.id && <small>Publicado por ti</small>}
              </div>
              {!esDestinoActivo(avisoSeleccionado) && (
                <p className="ath-av-warning">Este equipo está inactivo. El aviso se conserva como historial.</p>
              )}
              <div className="ath-av-message">{avisoSeleccionado.mensaje}</div>
              {avisoSeleccionado.updated_at && new Date(avisoSeleccionado.updated_at).getTime() > new Date(avisoSeleccionado.fecha_publicacion).getTime() + 60000 && (
                <p className="ath-av-edited">Última modificación: {formatearFecha(avisoSeleccionado.updated_at)}</p>
              )}
            </>
          ) : (
            <div className="ath-av-placeholder">
              <span className="ath-av-placeholder-icon" aria-hidden="true">✉</span>
              <h3>Selecciona un aviso</h3>
              <p>Elige un comunicado de la lista para leer su contenido y consultar sus destinatarios.</p>
            </div>
          )}
        </article>
      </div>

      {modal && (
        <div className="ath-av-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) setModal(null); }}>
          <div className="ath-av-modal" role="dialog" aria-modal="true" aria-labelledby="ath-av-modal-title">
            <div className="ath-av-modal-header">
              <div>
                <span className="ath-av-eyebrow">COMUNICACIONES DEL CLUB</span>
                <h3 id="ath-av-modal-title">{modal.modo === 'nuevo' ? 'Nuevo aviso' : 'Editar aviso'}</h3>
              </div>
              <button type="button" className="ath-av-modal-close" disabled={guardando}
                aria-label="Cerrar formulario" onClick={() => setModal(null)}>×</button>
            </div>
            <form onSubmit={guardarAviso}>
              <label className="ath-av-field">
                <span>Título *</span>
                <input required maxLength={120} value={borrador.titulo}
                  onChange={(e) => setBorrador((anterior) => ({ ...anterior, titulo: e.target.value }))}
                  placeholder="Ej. Cambio de horario de entrenamiento" />
              </label>
              <label className="ath-av-field">
                <span>Dirigido a *</span>
                <select required value={borrador.destino}
                  onChange={(e) => setBorrador((anterior) => ({ ...anterior, destino: e.target.value }))}>
                  {!administrador && <option value="">Selecciona un equipo</option>}
                  {administrador && <option value="GENERAL">Todo el club (aviso general)</option>}
                  {equiposActivos.map((equipo) => (
                    <option key={equipo.id} value={String(equipo.id)}>{equipo.nombre}</option>
                  ))}
                </select>
              </label>
              <label className="ath-av-field">
                <span>Mensaje *</span>
                <textarea required rows={7} maxLength={5000} value={borrador.mensaje}
                  onChange={(e) => setBorrador((anterior) => ({ ...anterior, mensaje: e.target.value }))}
                  placeholder="Escribe aquí el comunicado para los destinatarios..." />
                <small>{borrador.mensaje.length} / 5000 caracteres</small>
              </label>
              {errorAccion && <div className="ath-av-error" role="alert">{errorAccion}</div>}
              <div className="ath-av-modal-actions">
                <button type="button" className="ath-av-btn ath-av-btn-light" disabled={guardando}
                  onClick={() => setModal(null)}>Cancelar</button>
                <button type="submit" className="ath-av-btn ath-av-btn-primary" disabled={guardando}>
                  {guardando ? 'Guardando...' : modal.modo === 'nuevo' ? 'Publicar aviso' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmacion && (
        <div className="ath-av-backdrop" role="presentation">
          <div className="ath-av-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ath-av-confirm-title">
            <h3 id="ath-av-confirm-title">{avisos.find((item) => item.id === confirmacion.id)?.activo ? '¿Archivar este aviso?' : '¿Reactivar este aviso?'}</h3>
            <p>{avisos.find((item) => item.id === confirmacion.id)?.activo
              ? 'Dejará de mostrarse a los destinatarios, pero conservarás su contenido y podrás reactivarlo.'
              : 'El comunicado volverá a ser visible para los destinatarios que correspondan.'}</p>
            <div className="ath-av-modal-actions">
              <button type="button" className="ath-av-btn ath-av-btn-light" disabled={guardando}
                onClick={() => setConfirmacion(null)}>Cancelar</button>
              <button type="button" className="ath-av-btn ath-av-btn-primary" disabled={guardando}
                onClick={cambiarEstado}>{guardando ? 'Guardando...' : 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
