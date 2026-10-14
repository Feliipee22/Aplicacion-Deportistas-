import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import VideoEjercicio from './VideoEjercicio';

// Biblioteca de solo lectura; las asignaciones activas se obtienen de Supabase.
export default function VideosDeportista({ usuarioId }) {
  const [videos, setVideos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => {
    let activo = true;
    async function cargar() {
      setCargando(true); setError('');
      try {
        const [individual, equipos] = await Promise.all([
          supabase.from('rutina_usuario').select('rutina_id').eq('usuario_id', usuarioId).eq('activo', true),
          supabase.from('usuario_equipo').select('equipo_id').eq('usuario_id', usuarioId).eq('funcion_en_equipo', 'DEPORTISTA').eq('activo', true),
        ]);
        if (individual.error) throw individual.error;
        if (equipos.error) throw equipos.error;
        const idsEquipo = (equipos.data || []).map(x => x.equipo_id);
        let porEquipo = [];
        if (idsEquipo.length) {
          const resultado = await supabase.from('rutina_equipo').select('rutina_id').in('equipo_id', idsEquipo).eq('activo', true);
          if (resultado.error) throw resultado.error;
          porEquipo = resultado.data || [];
        }
        const ids = [...new Set([...(individual.data || []), ...porEquipo].map(x => x.rutina_id))];
        if (!ids.length) { if (activo) setVideos([]); return; }
        const rutinas = await supabase.from('rutinas').select('id, nombre').in('id', ids).eq('estado', 'ACTIVA');
        if (rutinas.error) throw rutinas.error;
        if (!rutinas.data?.length) { if (activo) setVideos([]); return; }
        const detalles = await supabase.from('detalle_rutina')
          .select('rutina_id, ejercicio:ejercicios(id, nombre, descripcion, categoria, indicaciones, video_url)')
          .in('rutina_id', rutinas.data.map(x => x.id));
        if (detalles.error) throw detalles.error;
        const nombresRutinas = new Map(rutinas.data.map(r => [r.id, r.nombre]));
        const mapa = new Map();
        (detalles.data || []).forEach(d => {
          const e = d.ejercicio;
          if (!e?.video_url) return;
          if (!mapa.has(e.id)) mapa.set(e.id, { ...e, rutinas: [] });
          const nombreRutina = nombresRutinas.get(d.rutina_id);
          if (nombreRutina && !mapa.get(e.id).rutinas.includes(nombreRutina)) mapa.get(e.id).rutinas.push(nombreRutina);
        });
        if (activo) setVideos([...mapa.values()]);
      } catch (fallo) {
        console.error('Error al consultar videos asignados:', fallo);
        if (activo) setError('No se pudieron cargar tus videos asignados.');
      } finally { if (activo) setCargando(false); }
    }
    if (usuarioId) cargar();
    else { setError('No se pudo identificar al deportista.'); setCargando(false); }
    return () => { activo = false; };
  }, [usuarioId]);

  const visibles = videos.filter(v => `${v.nombre} ${v.categoria || ''} ${v.rutinas.join(' ')}`.toLowerCase().includes(busqueda.toLowerCase()));
  return (
    <section className="ath-exlib">
      <div className="ath-exlib-heading"><div><p>Reproduce los videos de tus rutinas asignadas. Esta sección es solo de consulta.</p></div></div>
      <div className="ath-exlib-panel">
        {error && <div className="ath-exlib-error" role="alert">{error}</div>}
        <input type="search" className="ath-exlib-search" placeholder="Buscar entre mis ejercicios" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        {cargando ? <p>Cargando videos...</p> : visibles.length === 0 ? <p>No tienes videos disponibles en tus rutinas activas.</p> : (
          <div className="ath-exlib-list">
            {visibles.map(v => <article className="ath-exlib-card" key={v.id}>
              <span className="ath-exlib-tag">{v.categoria || 'Ejercicio'}</span>
              <h3>{v.nombre}</h3>
              <p>Rutina: {v.rutinas.join(', ')}</p>
              {v.descripcion && <p>{v.descripcion}</p>}
              {v.indicaciones && <p><strong>Indicaciones:</strong> {v.indicaciones}</p>}
              <VideoEjercicio valor={v.video_url} />
            </article>)}
          </div>
        )}
      </div>
    </section>
  );
}
