
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import VideoEjercicio, { VIDEO_BUCKET, VIDEO_PREFIX } from './VideoEjercicio';

const categorias = [
  'Fuerza',
  'Resistencia',
  'Movilidad',
  'Flexibilidad',
  'Velocidad',
  'Coordinación',
  'Técnica',
  'Otros',
];

const formularioVacio = {
  nombre: '',
  categoria: 'Fuerza',
  descripcion: '',
  indicaciones: '',
  video_url: '',
};

function esEnlaceValido(valor) {
  try {
    const url = new URL(valor);
    return ['https:', 'http:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export default function EjerciciosEntrenador({ usuarioId }) {
  const [archivoVideo, setArchivoVideo] = useState(null);
  const [modoVideo, setModoVideo] = useState('enlace');
  const [ejercicios, setEjercicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const formularioRef = useRef(null);
  const [solicitudDesplazamiento, setSolicitudDesplazamiento] = useState(0);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [editandoId, setEditandoId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [errorEliminacion, setErrorEliminacion] = useState('');
  const [ejercicioPorEliminar, setEjercicioPorEliminar] = useState(null);

  const cargarEjercicios = useCallback(async () => {
    setCargando(true);
    setErrorCarga('');

    const { data, error } = await supabase
      .from('ejercicios')
      .select(
        'id, nombre, descripcion, categoria, indicaciones, video_url, creado_por, created_at'
      )
      .order('id', { ascending: false });

    if (error) {
      console.error('Error al cargar ejercicios:', error);
      setErrorCarga('No se pudieron cargar los ejercicios.');
      setEjercicios([]);
    } else {
      setEjercicios(data || []);
    }

    setCargando(false);
  }, []);

  useEffect(() => {
    cargarEjercicios();
  }, [cargarEjercicios]);

  const cambiarCampo = (campo, valor) => {
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: valor,
    }));
  };

  useEffect(() => {
    if (solicitudDesplazamiento > 0 && mostrarFormulario && editandoId !== null) {
      formularioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [solicitudDesplazamiento, mostrarFormulario, editandoId]);

  const iniciarEdicion = (ejercicio) => {
  if (ejercicio.creado_por !== usuarioId) return;

  setFormulario({
    nombre: ejercicio.nombre || '',
    categoria: ejercicio.categoria || 'Fuerza',
    descripcion: ejercicio.descripcion || '',
    indicaciones: ejercicio.indicaciones || '',
    video_url: ejercicio.video_url || '',
  });

  setArchivoVideo(null);
  setModoVideo(ejercicio.video_url?.startsWith(VIDEO_PREFIX) ? 'archivo' : 'enlace');
  setEditandoId(ejercicio.id);
  setMostrarFormulario(true);
  setSolicitudDesplazamiento((anterior) => anterior + 1);
  setErrorFormulario('');
  setMensaje('');
};
  
const eliminarEjercicio = async (ejercicio) => {
  if (ejercicio.creado_por !== usuarioId) return;
  if (eliminandoId !== null || guardando) return;


  setEliminandoId(ejercicio.id);
  setErrorEliminacion('');
  setMensaje('');

  try {
    let consulta = supabase.from('ejercicios').delete().eq('id', ejercicio.id);
    consulta = consulta.eq('creado_por', usuarioId);
    const { data, error } = await consulta.select('id');

    if (error) {
      console.error('Error al eliminar ejercicio:', error);

      if (error.code === '23503') {
        setErrorEliminacion(
          'No puedes eliminar este ejercicio porque ya está incluido en una rutina.'
        );
      } else {
        setErrorEliminacion(
          'No se pudo eliminar el ejercicio. Revisa los permisos o inténtalo nuevamente.'
        );
      }

      return;
    }

    if (!data?.length) {
      setErrorEliminacion(
        'No se eliminó el ejercicio. Puede que ya no exista o que no tengas permisos.'
      );
      return;
    }

    if (editandoId === ejercicio.id) {
      setEditandoId(null);
      setMostrarFormulario(false);
      setFormulario(formularioVacio);
      setErrorFormulario('');
    }

    if (ejercicio.video_url?.startsWith(VIDEO_PREFIX)) {
      const rutaAnterior = ejercicio.video_url.slice(VIDEO_PREFIX.length);
      const { error: errorVideo } = await supabase.storage.from(VIDEO_BUCKET).remove([rutaAnterior]);
      if (errorVideo) console.warn('El ejercicio se eliminó, pero no se pudo limpiar su video:', errorVideo);
    }
    setMensaje(`Se eliminó correctamente "${ejercicio.nombre}".`);
    setEjercicioPorEliminar(null);

    await cargarEjercicios();
  } catch (error) {
    console.error('Error inesperado:', error);
    setErrorEliminacion(
      'Ocurrió un problema al intentar eliminar el ejercicio.'
    );
  } finally {
    setEliminandoId(null);
  }
};

  const guardarEjercicio = async (evento) => {
    evento.preventDefault();

    if (guardando) return;

    setErrorFormulario('');
    setMensaje('');

    const nombre = formulario.nombre.trim();
    const video = formulario.video_url.trim();
    const subirArchivo = modoVideo === 'archivo' && archivoVideo;
    const conservarArchivo = modoVideo === 'archivo' && !archivoVideo && formulario.video_url.startsWith(VIDEO_PREFIX);

    if (!nombre) {
      setErrorFormulario('Debes ingresar el nombre del ejercicio.');
      return;
    }

    if (modoVideo === 'enlace' && video && !esEnlaceValido(video)) {
      setErrorFormulario(
        'El video debe tener un enlace válido que comience con https:// o http://.'
      );
      return;
    }

    if (!usuarioId) {
      setErrorFormulario(
        'No se pudo identificar al entrenador. Inicia sesión nuevamente.'
      );
      return;
    }

    if (archivoVideo && (!['video/mp4', 'video/webm'].includes(archivoVideo.type) || archivoVideo.size > 50 * 1024 * 1024)) {
      setErrorFormulario('Selecciona un video MP4 o WebM de máximo 50 MB.');
      return;
    }
    setGuardando(true);
    let rutaNueva = null;
    try {
      if (subirArchivo) {
        const extension = archivoVideo.type === 'video/webm' ? 'webm' : 'mp4';
        rutaNueva = `${usuarioId}/${crypto.randomUUID()}.${extension}`;
        const { error: errorSubida } = await supabase.storage.from(VIDEO_BUCKET).upload(rutaNueva, archivoVideo, { contentType: archivoVideo.type, upsert: false });
        if (errorSubida) throw errorSubida;
      }

const datosEjercicio = {
  nombre,
  categoria: formulario.categoria,
  descripcion: formulario.descripcion.trim() || null,
  indicaciones: formulario.indicaciones.trim() || null,
  video_url: rutaNueva ? VIDEO_PREFIX + rutaNueva : (conservarArchivo ? formulario.video_url : (modoVideo === 'enlace' ? video || null : null)),
};

const estabaEditando = editandoId !== null;

let resultado;

if (estabaEditando) {
  let consulta = supabase.from('ejercicios').update(datosEjercicio).eq('id', editandoId);
  consulta = consulta.eq('creado_por', usuarioId);
  resultado = await consulta.select('id');
} else {
  resultado = await supabase
    .from('ejercicios')
    .insert({
      ...datosEjercicio,
      creado_por: usuarioId,
    })
    .select('id');
}

if (resultado.error || !resultado.data?.length) {
  console.error(
    'Error al guardar ejercicio:',
    resultado.error
  );

  if (rutaNueva) await supabase.storage.from(VIDEO_BUCKET).remove([rutaNueva]);
  rutaNueva = null;
  setErrorFormulario(
    'No se pudo guardar el ejercicio. Comprueba los datos y permisos.'
  );
  return;
}

if (estabaEditando) {
  const anterior = ejercicios.find((item) => item.id === editandoId)?.video_url;
  if (anterior?.startsWith(VIDEO_PREFIX) && anterior !== datosEjercicio.video_url) {
    const { error: errorLimpieza } = await supabase.storage.from(VIDEO_BUCKET).remove([anterior.slice(VIDEO_PREFIX.length)]);
    if (errorLimpieza) console.warn('No se pudo eliminar el video reemplazado:', errorLimpieza);
  }
}
setFormulario(formularioVacio);
setArchivoVideo(null);
setModoVideo('enlace');
setMostrarFormulario(false);
setEditandoId(null);

setMensaje(
  estabaEditando
    ? 'El ejercicio se actualizó correctamente.'
    : 'El ejercicio se registró correctamente.'
);

await cargarEjercicios();

    } catch (error) {
      console.error('Error inesperado:', error);
      if (rutaNueva) await supabase.storage.from(VIDEO_BUCKET).remove([rutaNueva]);
      setErrorFormulario('Ocurrió un problema al guardar el ejercicio o subir el video.');
    } finally {
      setGuardando(false);
    }
  };

  const ejerciciosFiltrados = ejercicios.filter((ejercicio) => {
    const texto = busqueda.toLowerCase().trim();

    return (
      ejercicio.nombre?.toLowerCase().includes(texto) ||
      ejercicio.categoria?.toLowerCase().includes(texto) ||
      ejercicio.descripcion?.toLowerCase().includes(texto)
    );
  });

  const misEjercicios = ejercicios.filter(
    (ejercicio) => ejercicio.creado_por === usuarioId
  ).length;

  const ejerciciosConVideo = ejercicios.filter(
    (ejercicio) =>
      ejercicio.video_url && (ejercicio.video_url.startsWith(VIDEO_PREFIX) || esEnlaceValido(ejercicio.video_url))
  ).length;

  return (
    <section className="ath-exlib">
      <div className="ath-exlib-heading">
        <div>
          
          <p>
            Registra ejercicios y utilízalos después en tus rutinas.
          </p>
        </div>

        <button
          type="button"
          className="ath-exlib-primary"
          onClick={() => {
            setMostrarFormulario((actual) => !actual);
            setEditandoId(null);
            setFormulario(formularioVacio);
            setArchivoVideo(null);
            setModoVideo('enlace');
            setErrorFormulario('');
            setMensaje('');
          }}
          disabled={guardando}
        >
          {mostrarFormulario ? 'Cancelar' : '+ Nuevo ejercicio'}
        </button>
      </div>

      <div className="ath-exlib-stats">
        <div className="ath-exlib-stat">
          <span>Ejercicios disponibles</span>
          <strong>{ejercicios.length}</strong>
        </div>

        <div className="ath-exlib-stat">
          <span>Mis ejercicios</span>
          <strong>{misEjercicios}</strong>
        </div>

        <div className="ath-exlib-stat">
          <span>Con video</span>
          <strong>{ejerciciosConVideo}</strong>
        </div>
      </div>

      {mensaje && (
        <div className="ath-exlib-success" role="status">
          {mensaje}
        </div>
      )}
      {errorEliminacion && (
  <div className="ath-exlib-error" role="alert">
    {errorEliminacion}
  </div>
)}

      {mostrarFormulario && (
        <form ref={formularioRef} className="ath-exlib-form" onSubmit={guardarEjercicio} style={{ scrollMarginTop: 24 }}>
          <h3>
  {editandoId === null
    ? 'Registrar nuevo ejercicio'
    : 'Editar ejercicio'}
</h3>
          <p>Completa los datos del ejercicio.</p>

          {errorFormulario && (
            <div className="ath-exlib-error" role="alert">
              {errorFormulario}
            </div>
          )}

          <div className="ath-exlib-form-grid">
            <label className="ath-exlib-field">
              Nombre del ejercicio
              <input
                type="text"
                placeholder="Ej.: Sentadillas"
                value={formulario.nombre}
                onChange={(e) =>
                  cambiarCampo('nombre', e.target.value)
                }
                maxLength={120}
                required
                disabled={guardando}
              />
            </label>

            <label className="ath-exlib-field">
              Categoría
              <select
                value={formulario.categoria}
                onChange={(e) =>
                  cambiarCampo('categoria', e.target.value)
                }
                disabled={guardando}
              >
                {categorias.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>
            </label>

            <label className="ath-exlib-field ath-exlib-full">
              Descripción
              <textarea
                placeholder="Explica en qué consiste el ejercicio..."
                value={formulario.descripcion}
                onChange={(e) =>
                  cambiarCampo('descripcion', e.target.value)
                }
                rows={3}
                maxLength={1500}
                disabled={guardando}
              />
            </label>

            <label className="ath-exlib-field ath-exlib-full">
              Indicaciones
              <textarea
                placeholder="Explica cómo realizarlo correctamente..."
                value={formulario.indicaciones}
                onChange={(e) =>
                  cambiarCampo('indicaciones', e.target.value)
                }
                rows={3}
                maxLength={1500}
                disabled={guardando}
              />
            </label>

            <div className="ath-exlib-field ath-exlib-full">
              <strong>Video demostrativo (opcional)</strong>
              <div className="ath-video-options">
                <label><input type="radio" name="modoVideo" checked={modoVideo === 'archivo'} onChange={() => { setModoVideo('archivo'); setArchivoVideo(null); }} disabled={guardando} /> Subir video propio</label>
                <label><input type="radio" name="modoVideo" checked={modoVideo === 'enlace'} onChange={() => { setModoVideo('enlace'); setArchivoVideo(null); }} disabled={guardando} /> Enlace de YouTube u otro video</label>
              </div>
              {modoVideo === 'archivo' ? (
                <>
                  <input type="file" accept="video/mp4,video/webm" onChange={(evento) => setArchivoVideo(evento.target.files?.[0] || null)} disabled={guardando} />
                  <small>MP4 o WebM, máximo 50 MB. {formulario.video_url.startsWith(VIDEO_PREFIX) && !archivoVideo ? 'Se conservará el video actual.' : ''}</small>
                </>
              ) : (
                <input type="url" placeholder="https://www.youtube.com/watch?v=..." value={formulario.video_url.startsWith(VIDEO_PREFIX) ? '' : formulario.video_url} onChange={(evento) => cambiarCampo('video_url', evento.target.value)} maxLength={2000} disabled={guardando} />
              )}
            </div>
          </div>

          <div className="ath-exlib-form-actions">
            <button
              type="submit"
              className="ath-exlib-primary"
              disabled={guardando}
            >
              {guardando
  ? 'Guardando...'
  : editandoId === null
    ? 'Guardar ejercicio'
    : 'Guardar cambios'}
            </button>
          </div>
        </form>
      )}

      <div className="ath-exlib-panel">
        <div className="ath-exlib-toolbar">
          <div>
            <h3>Ejercicios registrados</h3>
            <p>Biblioteca conectada con Supabase.</p>
          </div>

          <button
            type="button"
            className="ath-exlib-secondary"
            onClick={cargarEjercicios}
            disabled={cargando}
          >
            Actualizar
          </button>
        </div>

        <input
          type="search"
          className="ath-exlib-search"
          placeholder="Buscar ejercicios o categorías..."
          aria-label="Buscar ejercicios"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        {cargando ? (
          <div className="ath-exlib-empty">
            Cargando ejercicios...
          </div>
        ) : errorCarga ? (
          <div className="ath-exlib-error" role="alert">
            {errorCarga}
          </div>
        ) : ejerciciosFiltrados.length === 0 ? (
          <div className="ath-exlib-empty">
            <div className="ath-exlib-empty-icon">◎</div>
            <h3>
              {busqueda
                ? 'No encontramos ejercicios'
                : 'Todavía no hay ejercicios registrados'}
            </h3>
            <p>
              {busqueda
                ? 'Prueba con otra palabra.'
                : 'Crea tu primer ejercicio para comenzar.'}
            </p>
          </div>
        ) : (
          <div className="ath-exlib-list">
            {ejerciciosFiltrados.map((ejercicio) => (
              <article
                key={ejercicio.id}
                className="ath-exlib-card"
              >
                <div className="ath-exlib-tags">
                  <span className="ath-exlib-tag">
                    {ejercicio.categoria || 'Sin categoría'}
                  </span>

                  {ejercicio.creado_por === usuarioId && (
                    <span className="ath-exlib-own">
                      Creado por ti
                    </span>
                  )}
                </div>

                <h3>{ejercicio.nombre}</h3>

                {ejercicio.descripcion && (
                  <p>{ejercicio.descripcion}</p>
                )}

                {ejercicio.indicaciones && (
                  <div className="ath-exlib-instructions">
                    <strong>Indicaciones</strong>
                    <p>{ejercicio.indicaciones}</p>
                  </div>
                )}

                {ejercicio.video_url && <VideoEjercicio valor={ejercicio.video_url} />}
                  
{(ejercicio.creado_por === usuarioId) && (
  <div className="ath-exlib-card-actions">
    <button
      type="button"
      className="ath-exlib-edit"
      onClick={() => iniciarEdicion(ejercicio)}
      disabled={eliminandoId !== null || guardando}
    >
      Editar ejercicio
    </button>

    <button
  type="button"
  className="ath-exlib-delete"
  onClick={() => {
    setErrorEliminacion('');
    setEjercicioPorEliminar(ejercicio);
  }}
  disabled={eliminandoId !== null || guardando}
>
  Eliminar
</button>
  </div>
)}

              </article>
            ))}
          </div>
        )}
      
      </div>

      {ejercicioPorEliminar && (
        <div className="ath-exlib-modal-backdrop">
          <div
            className="ath-exlib-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ath-delete-title"
            aria-describedby="ath-delete-description"
          >
            <div className="ath-exlib-modal-icon">
              <span>!</span>
            </div>

            <h2 id="ath-delete-title">
              ¿Eliminar ejercicio?
            </h2>

            <p id="ath-delete-description">
              ¿Quieres eliminar{' '}
              <strong>{ejercicioPorEliminar.nombre}</strong>?
            </p>

            <p className="ath-exlib-modal-warning">
              Esta acción no se puede deshacer.
              Si el ejercicio está incluido en una rutina,
              no podrá eliminarse.
            </p>

            <div className="ath-exlib-modal-actions">
              <button
                type="button"
                className="ath-exlib-modal-cancel"
                onClick={() => setEjercicioPorEliminar(null)}
                disabled={eliminandoId !== null}
                autoFocus
              >
                Cancelar
              </button>

              <button
                type="button"
                className="ath-exlib-modal-confirm"
                onClick={() =>
                  eliminarEjercicio(ejercicioPorEliminar)
                }
                disabled={eliminandoId !== null}
              >
                {eliminandoId !== null
                  ? 'Eliminando...'
                  : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
