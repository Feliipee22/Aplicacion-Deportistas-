import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './Asistencia.css';

const ETIQUETAS = {
  PRESENTE: 'Presente', AUSENTE: 'Ausente', JUSTIFICADO: 'Justificado',
};

function fechaLegible(fecha) {
  if (!fecha) return 'Fecha no disponible';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(fecha));
}

export default function MiAsistencia({ usuarioId }) {
  const [registros, setRegistros] = useState([]);
  const [actividades, setActividades] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [filtro, setFiltro] = useState('TODOS');
  const [busqueda, setBusqueda] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelado = false;
    async function cargarHistorial() {
      setCargando(true);
      setErrorCarga('');
      try {
        const respuestaRegistros = await supabase.from('asistencias')
          .select('actividad_id, estado_asistencia, observacion, fecha_registro')
          .eq('deportista_id', usuarioId)
          .order('fecha_registro', { ascending: false })
          .limit(300);
        if (respuestaRegistros.error) throw respuestaRegistros.error;
        const nuevosRegistros = respuestaRegistros.data || [];
        const ids = [...new Set(nuevosRegistros.map((item) => item.actividad_id))];
        let nuevasActividades = [];
        let nuevosEquipos = [];
        if (ids.length) {
          const respuestaActividades = await supabase.from('actividades')
            .select('id, titulo, fecha_hora, lugar, equipo_id, estado')
            .in('id', ids);
          if (respuestaActividades.error) throw respuestaActividades.error;
          nuevasActividades = respuestaActividades.data || [];
          const idsEquipos = [...new Set(nuevasActividades.map((item) => item.equipo_id).filter((id) => id != null))];
          if (idsEquipos.length) {
            const respuestaEquipos = await supabase.from('equipos')
              .select('id, nombre').in('id', idsEquipos);
            if (respuestaEquipos.error) throw respuestaEquipos.error;
            nuevosEquipos = respuestaEquipos.data || [];
          }
        }
        if (!cancelado) {
          setRegistros(nuevosRegistros);
          setActividades(nuevasActividades);
          setEquipos(nuevosEquipos);
        }
      } catch (error) {
        if (!cancelado) {
          setErrorCarga(error?.code === '42501'
            ? 'No se pudo consultar tu historial por permisos. Revisa las políticas RLS en Supabase.'
            : `No se pudo cargar tu historial: ${error?.message || 'Error inesperado.'}`);
        }
      } finally {
        if (!cancelado) setCargando(false);
      }
    }
    cargarHistorial();
    return () => { cancelado = true; };
  }, [usuarioId, revision]);

  const actividadesPorId = useMemo(() => new Map(actividades.map((item) => [item.id, item])), [actividades]);
  const equiposPorId = useMemo(() => new Map(equipos.map((item) => [item.id, item.nombre])), [equipos]);
  const historial = useMemo(() => [...registros].sort((a, b) => {
    const fechaA = actividadesPorId.get(a.actividad_id)?.fecha_hora || a.fecha_registro;
    const fechaB = actividadesPorId.get(b.actividad_id)?.fecha_hora || b.fecha_registro;
    return new Date(fechaB) - new Date(fechaA);
  }), [registros, actividadesPorId]);
  const filtrados = historial.filter((item) => {
    const actividad = actividadesPorId.get(item.actividad_id);
    const texto = busqueda.trim().toLocaleLowerCase('es');
    const equipo = equiposPorId.get(actividad?.equipo_id) || '';
    return (filtro === 'TODOS' || item.estado_asistencia === filtro) &&
      (!texto || `${actividad?.titulo || ''} ${equipo}`.toLocaleLowerCase('es').includes(texto));
  });

  return (
    <section className="ath-as ath-as-my">
      <header className="ath-as-header">
        <div>
          <span className="ath-as-eyebrow">ESPACIO DEL DEPORTISTA</span>
          <h2>Mi asistencia</h2>
          <p>Consulta tus registros de participación. Solo tu entrenador puede modificarlos.</p>
        </div>
        <button type="button" className="ath-as-button ath-as-button-light" disabled={cargando}
          onClick={() => setRevision((valor) => valor + 1)}>{cargando ? 'Actualizando...' : 'Actualizar'}</button>
      </header>
      {errorCarga && <div className="ath-as-alert ath-as-alert-error" role="alert">{errorCarga}</div>}
      <div className="ath-as-stats ath-as-my-stats">
        <div><span>Registros totales</span><strong>{registros.length}</strong></div>
        <div><span>Presentes</span><strong>{registros.filter((item) => item.estado_asistencia === 'PRESENTE').length}</strong></div>
        <div><span>Ausentes</span><strong>{registros.filter((item) => item.estado_asistencia === 'AUSENTE').length}</strong></div>
        <div><span>Justificados</span><strong>{registros.filter((item) => item.estado_asistencia === 'JUSTIFICADO').length}</strong></div>
      </div>
      <div className="ath-as-panel ath-as-history">
        <div className="ath-as-history-header">
          <div><h3>Historial de entrenamientos</h3><p>Se muestran únicamente las asistencias que ya fueron registradas.</p></div>
          <div className="ath-as-history-filters">
            <label className="ath-as-field"><span>Estado</span>
              <select value={filtro} onChange={(evento) => setFiltro(evento.target.value)}>
                <option value="TODOS">Todos</option>
                <option value="PRESENTE">Presentes</option>
                <option value="AUSENTE">Ausentes</option>
                <option value="JUSTIFICADO">Justificados</option>
              </select>
            </label>
            <label className="ath-as-field"><span className="ath-as-sr-only">Buscar actividad</span>
              <input type="search" placeholder="Buscar entrenamiento..." value={busqueda}
                onChange={(evento) => setBusqueda(evento.target.value)}/>
            </label>
          </div>
        </div>
        {cargando && !registros.length ? (
          <div className="ath-as-placeholder"><p>Cargando tu historial...</p></div>
        ) : !filtrados.length ? (
          <div className="ath-as-placeholder">
            <span className="ath-as-placeholder-icon" aria-hidden="true">✓</span>
            <h3>{registros.length ? 'No hay resultados' : 'Todavía no tienes asistencias registradas'}</h3>
            <p>{registros.length ? 'Prueba cambiando el filtro o la búsqueda.' : 'Cuando tu entrenador registre una asistencia, aparecerá aquí. No tener registros no significa estar ausente.'}</p>
          </div>
        ) : (
          <div className="ath-as-history-list">
            {filtrados.map((item) => {
              const actividad = actividadesPorId.get(item.actividad_id);
              const equipo = equiposPorId.get(actividad?.equipo_id);
              return (
                <article key={item.actividad_id} className="ath-as-history-item">
                  <div className="ath-as-history-date"><span className="ath-as-avatar" aria-hidden="true">✓</span></div>
                  <div className="ath-as-history-content">
                    <h4>{actividad?.titulo || 'Entrenamiento no disponible'}</h4>
                    <p>{fechaLegible(actividad?.fecha_hora || item.fecha_registro)}</p>
                    {equipo && <p>{equipo}</p>}
                    {actividad?.estado === 'CANCELADA' && <small>Actividad cancelada</small>}
                    {item.observacion && <p className="ath-as-history-note">Observación: {item.observacion}</p>}
                  </div>
                  <span className={`ath-as-status status-${item.estado_asistencia.toLowerCase()}`}>
                    {ETIQUETAS[item.estado_asistencia] || item.estado_asistencia}
                  </span>
                </article>
              );
            })}
          </div>
        )}
        <p className="ath-as-list-note">El historial muestra hasta 300 registros recientes. Las actividades sin asistencia registrada no se contabilizan como ausencias.</p>
      </div>
    </section>
  );
}
