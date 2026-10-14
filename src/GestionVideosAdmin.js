import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import VideoEjercicio, { VIDEO_BUCKET, VIDEO_PREFIX } from './VideoEjercicio';

// Administración de videos: no crea ejercicios ni permite subir archivos.
export default function GestionVideosAdmin() {
  const [ejercicios, setEjercicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [editando, setEditando] = useState(null);
  const [enlace, setEnlace] = useState('');
  const [procesando, setProcesando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: fallo } = await supabase.from('ejercicios')
      .select('id, nombre, categoria, descripcion, video_url, creado_por')
      .not('video_url', 'is', null)
      .order('id', { ascending: false });
    if (fallo) setError('No se pudieron consultar los videos. Revisa los permisos.');
    else { setEjercicios((data || []).filter(e => e.video_url)); setError(''); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const actualizarVideo = async (ejercicio, nuevoValor) => {
    if (procesando) return;
    setProcesando(true);
    setError('');
    setMensaje('');
    const anterior = ejercicio.video_url;
    try {
      // El administrador no edita ejercicios directamente: usa una función
      // que comprueba su rol y permite cambiar solamente video_url.
      const { data: actualizado, error: fallo } = await supabase.rpc(
        'admin_actualizar_video_ejercicio',
        {
          p_ejercicio_id: ejercicio.id,
          p_video_anterior: anterior,
          p_video_nuevo: nuevoValor,
        }
      );
      if (fallo) throw fallo;
      if (!actualizado) {
        setError('El video cambió desde que abriste la pantalla. Presiona Actualizar e inténtalo de nuevo.');
        return;
      }

      // Si el archivo anterior estaba en Storage, se limpia después de
      // confirmar la actualización, sin eliminar el ejercicio ni sus rutinas.
      let avisoLimpieza = '';
      if (anterior?.startsWith(VIDEO_PREFIX) && anterior !== nuevoValor) {
        const ruta = anterior.slice(VIDEO_PREFIX.length);
        const { error: falloBorrado } = await supabase.storage
          .from(VIDEO_BUCKET).remove([ruta]);
        if (falloBorrado) {
          console.warn('No se pudo eliminar el archivo antiguo:', falloBorrado);
          avisoLimpieza = ' El archivo anterior no se pudo borrar de Storage.';
        }
      }
      setEditando(null);
      setEnlace('');
      await cargar();
      setMensaje((nuevoValor ? 'Video actualizado.' : 'Video eliminado del ejercicio.') + avisoLimpieza);
    } catch (fallo) {
      console.error('Error al gestionar el video:', fallo);
      setError('No se pudo modificar el video. Comprueba que el SQL de seguridad esté instalado.');
    } finally {
      setProcesando(false);
    }
  };

  const guardarEnlace = async (e) => {
    e.preventDefault();
    if (!editando || procesando) return;
    const valor = enlace.trim();
    try {
      const url = new URL(valor);
      if (url.protocol !== 'https:') throw new Error('Protocolo no permitido');
    } catch (_) { setError('Ingresa un enlace HTTPS válido.'); return; }
    await actualizarVideo(editando, valor);
  };

  const eliminar = async (ejercicio) => {
    if (procesando || !window.confirm(`¿Eliminar el video de «${ejercicio.nombre}»? El ejercicio y sus rutinas se conservarán.`)) return;
    await actualizarVideo(ejercicio, null);
  };

  const visibles = ejercicios.filter(e => `${e.nombre} ${e.categoria || ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  return (
    <section className="ath-exlib">
      <div className="ath-exlib-heading">
        <div><h2>Gestión de videos</h2><p>Revisa y administra los videos publicados por entrenadores. No puedes crear ejercicios ni subir archivos.</p></div>
        <button type="button" className="ath-exlib-secondary" onClick={cargar} disabled={cargando || procesando}>Actualizar</button>
      </div>
      {error && <div className="ath-exlib-error" role="alert">{error}</div>}
      {mensaje && <div className="ath-exlib-success" role="status">{mensaje}</div>}
      <div className="ath-exlib-panel">
        <input className="ath-exlib-search" type="search" placeholder="Buscar videos por ejercicio o categoría" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {cargando ? <p>Cargando videos...</p> : visibles.length === 0 ? <p>No hay videos disponibles.</p> : (
          <div className="ath-exlib-list">
            {visibles.map(e => (
              <article className="ath-exlib-card" key={e.id}>
                <span className="ath-exlib-tag">{e.categoria || 'Sin categoría'}</span>
                <h3>{e.nombre}</h3>
                {e.descripcion && <p>{e.descripcion}</p>}
                <VideoEjercicio valor={e.video_url} />
                <div className="ath-exlib-card-actions">
                  <button className="ath-exlib-edit" type="button" disabled={procesando} onClick={() => { setEditando(e); setEnlace(e.video_url.startsWith(VIDEO_PREFIX) ? '' : e.video_url); setError(''); }}>Editar enlace</button>
                  <button className="ath-exlib-delete" type="button" disabled={procesando} onClick={() => eliminar(e)}>Eliminar video</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
      {editando && (
        <div className="ath-exlib-modal-backdrop">
          <form className="ath-exlib-modal" onSubmit={guardarEnlace}>
            <h2>Editar video de {editando.nombre}</h2>
            <p>Introduce un enlace HTTPS (por ejemplo, YouTube). No se permite subir archivos desde administración.</p>
            <input type="url" required placeholder="https://www.youtube.com/watch?v=..." value={enlace} onChange={e => setEnlace(e.target.value)} disabled={procesando} />
            <div className="ath-exlib-modal-actions">
              <button type="button" className="ath-exlib-modal-cancel" onClick={() => setEditando(null)} disabled={procesando}>Cancelar</button>
              <button type="submit" className="ath-exlib-primary" disabled={procesando}>Guardar enlace</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
