import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import './ProgresoEntrenador.css';

const numero = value => Number(value || 0);
const fechaBonita = value => {
  if (!value) return 'Sin registros';
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? 'Sin registros' : d.toLocaleDateString('es-CL');
};
const valorFecha = value => value ? String(value).slice(0, 10) : '';
const promedio = value => value == null || value === '' ? '—' : `${Number(value).toFixed(1)}/10`;

export default function ProgresoEntrenador() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [equipo, setEquipo] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [seleccionado, setSeleccionado] = useState(null);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState('');
  const [periodo, setPeriodo] = useState(30);
  const fichaRef = useRef(null);
  const fichaAbiertaRef = useRef(false);
  const listadoRef = useRef(null);
  const abrirFicha = (id) => { setPeriodo(30); setSeleccionado(String(id)); };
  const volver = () => { setSeleccionado(null); };
  useEffect(() => {
    const destino = seleccionado ? fichaRef.current : listadoRef.current;
    if (!destino || (!seleccionado && !fichaAbiertaRef.current)) return;
    fichaAbiertaRef.current = Boolean(seleccionado);
    const frame = window.requestAnimationFrame(() => destino.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [seleccionado]);
  useEffect(() => {
    if (!seleccionado) { setHistorial([]); setErrorHistorial(''); return; }
    let vigente = true;
    const cargarHistorial = async () => {
      setCargandoHistorial(true); setErrorHistorial(''); setHistorial([]);
      const { data, error: fallo } = await supabase.rpc('athletix_historial_deportista_entrenador', { p_deportista_id: seleccionado });
      if (!vigente) return;
      if (fallo) setErrorHistorial(fallo.message || 'No fue posible cargar el historial.');
      else setHistorial(Array.isArray(data) ? data : []);
      setCargandoHistorial(false);
    };
    cargarHistorial();
    return () => { vigente = false; };
  }, [seleccionado]);
  const sesionesPeriodo = useMemo(() => historial.filter(s => {
    const dia = new Date(String(s.fecha).slice(0, 10) + 'T12:00:00');
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const dias = Math.round((hoy - dia) / 86400000);
    return dias >= 0 && dias < periodo;
  }), [historial, periodo]);
  const semanas = useMemo(() => {
    const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
    const inicioSemana = new Date(hoy);
    inicioSemana.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
    return Array.from({ length: 6 }, (_, i) => {
      const desde = new Date(inicioSemana);
      desde.setDate(desde.getDate() - (5 - i) * 7);
      const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 6);
      const sesiones = historial.filter(s => {
        const d = new Date(String(s.fecha).slice(0, 10) + 'T12:00:00');
        return d >= desde && d <= hasta;
      });
      return { label: `${desde.getDate()}/${desde.getMonth() + 1}`, sesiones: sesiones.length, minutos: sesiones.reduce((n, s) => n + numero(s.duracion_minutos), 0) };
    });
  }, [historial]);
  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const { data, error: fallo } = await supabase.rpc('athletix_resumen_deportistas_entrenador');
      if (fallo) throw fallo;
      if (!Array.isArray(data)) throw new Error('La consulta no devolvió una lista válida.');
      setFilas(data);
    } catch (e) {
      setError(e?.message || 'No fue posible consultar el progreso.');
    } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const equipos = useMemo(() => [...new Map(filas.filter(f => f.equipo_id != null).map(f => [String(f.equipo_id), f.equipo || 'Equipo'])).entries()], [filas]);
  // La RPC devuelve una fila por relación equipo-deportista. Las estadísticas pertenecen
  // al deportista, por lo que SUMAR las filas duplicaría sus sesiones y minutos.
  const deportistas = useMemo(() => {
    const mapa = new Map();
    filas.forEach(f => {
      const id = String(f.deportista_id ?? '');
      if (!id) return;
      if (!mapa.has(id)) mapa.set(id, { ...f, equipos: [], _filas: [] });
      const actual = mapa.get(id);
      actual._filas.push(f);
      if (f.equipo_id != null && !actual.equipos.some(e => e.id === String(f.equipo_id))) {
        actual.equipos.push({ id: String(f.equipo_id), nombre: f.equipo || 'Equipo' });
      }
      // Todas las filas de un mismo deportista deberían devolver el mismo resumen.
      // Si hay diferencias por versión de la RPC, se conserva la más reciente.
      if (valorFecha(f.ultima_sesion) > valorFecha(actual.ultima_sesion)) {
        Object.assign(actual, { sesiones_7d: f.sesiones_7d, sesiones_30d: f.sesiones_30d,
          minutos_30d: f.minutos_30d, esfuerzo_promedio_30d: f.esfuerzo_promedio_30d,
          ultima_sesion: f.ultima_sesion });
      }
    });
    return [...mapa.values()];
  }, [filas]);
  const filtrados = useMemo(() => deportistas.filter(f =>
    (equipo === 'todos' || f.equipos.some(e => e.id === equipo)) &&
    String(f.deportista || '').toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  ), [deportistas, equipo, busqueda]);
  const totales = useMemo(() => ({
    deportistas: filtrados.length,
    sesiones: filtrados.reduce((a, f) => a + numero(f.sesiones_30d), 0),
    minutos: filtrados.reduce((a, f) => a + numero(f.minutos_30d), 0),
    activos: filtrados.filter(f => numero(f.sesiones_7d) > 0).length,
  }), [filtrados]);
  const ficha = filtrados.find(f => String(f.deportista_id) === String(seleccionado));
  const porcentaje = totales.deportistas ? Math.round(totales.activos / totales.deportistas * 100) : 0;

  return <section className="pe" aria-label="Progreso de deportistas">
    {!seleccionado && <div ref={listadoRef} className="pe-overview">
    <header className="pe-head"><div><span className="pe-eyebrow">ATHLETIX · ENTRENADOR</span><h2>Progreso de mis deportistas</h2><p>Actividad personal registrada en planes IA. Últimos 30 días.</p></div><button type="button" onClick={cargar} disabled={cargando}>{cargando ? 'Cargando…' : 'Actualizar'}</button></header>
    {error && <div className="pe-error" role="alert">{error}</div>}
    <div className="pe-controls"><label>Equipo<select value={equipo} onChange={e => { setEquipo(e.target.value); setSeleccionado(null); }}><option value="todos">Todos mis equipos</option>{equipos.map(([id, nombre]) => <option key={id} value={id}>{nombre}</option>)}</select></label><label>Buscar deportista<input value={busqueda} onChange={e => { setBusqueda(e.target.value); setSeleccionado(null); }} placeholder="Nombre del deportista" /></label></div>
    <div className="pe-stats"><div><strong>{totales.deportistas}</strong><span>Deportistas únicos</span></div><div><strong>{totales.sesiones}</strong><span>Sesiones · 30 días</span></div><div><strong>{totales.minutos}</strong><span>Minutos · 30 días</span></div><div><strong>{totales.activos}</strong><span>Activos · 7 días</span></div></div>
    <div className="pe-activity"><div><strong>Actividad reciente del equipo</strong><span>{porcentaje}% con registros en 7 días</span></div><div className="pe-activity-track"><div style={{width: `${porcentaje}%`}} /></div><p>{totales.activos} de {totales.deportistas} deportistas registraron al menos una sesión en los últimos siete días.</p></div>
    {cargando && !filas.length ? <p className="pe-empty">Cargando seguimiento…</p> : !filtrados.length ? <div className="pe-empty"><strong>No hay deportistas para mostrar</strong><p>Prueba otro equipo o nombre. Solo se muestran deportistas autorizados por Supabase.</p></div> : <div className="pe-list">{filtrados.map(f => <article className="pe-athlete" key={String(f.deportista_id)}><div className="pe-athlete-top"><div className="pe-avatar" aria-hidden="true">{String(f.deportista || '?').charAt(0).toUpperCase()}</div><div className="pe-person"><h3>{f.deportista || 'Deportista'}</h3><p>{f.equipos.map(e => e.nombre).join(' · ')}</p></div></div><span className={numero(f.sesiones_7d) ? 'pe-status active' : 'pe-status'}>{numero(f.sesiones_7d) ? `${numero(f.sesiones_7d)} sesiones esta semana` : 'Sin sesiones esta semana'}</span><div className="pe-athlete-metrics"><div><strong>{numero(f.sesiones_30d)}</strong><span>Sesiones / 30 días</span></div><div><strong>{numero(f.minutos_30d)}</strong><span>Minutos / 30 días</span></div><div><strong>{promedio(f.esfuerzo_promedio_30d)}</strong><span>Esfuerzo medio</span></div></div><p className="pe-last">Último entrenamiento: <strong>{fechaBonita(f.ultima_sesion)}</strong></p><button type="button" className="pe-open" onClick={() => abrirFicha(f.deportista_id)}>Ver ficha deportiva</button></article>)}</div>}
    </div>}
    {ficha && <section ref={fichaRef} className="pe-detail" aria-label="Ficha deportiva del deportista"><div className="pe-detail-heading"><div><span className="pe-eyebrow">FICHA DEPORTIVA</span><h3>{ficha.deportista}</h3><p>{ficha.equipos.map(e => e.nombre).join(' · ')}</p></div><button type="button" onClick={volver} aria-label="Volver al listado de deportistas">← Volver a deportistas</button></div><div className="pe-detail-grid"><div><span>Sesiones / 7 días</span><strong>{numero(ficha.sesiones_7d)}</strong></div><div><span>Sesiones / 30 días</span><strong>{numero(ficha.sesiones_30d)}</strong></div><div><span>Tiempo / 30 días</span><strong>{numero(ficha.minutos_30d)} min</strong></div><div><span>Esfuerzo percibido</span><strong>{promedio(ficha.esfuerzo_promedio_30d)}</strong></div></div><div className="pe-detail-note"><strong>Última sesión registrada</strong><p>{fechaBonita(ficha.ultima_sesion)}</p><p>El historial de sesiones y ejercicios se consulta con permisos de Supabase para este entrenador. Las observaciones personales del deportista permanecen privadas.</p></div>
      <div className="pe-history">
        <div className="pe-history-head"><h4>Historial de entrenamiento</h4><label>Período <select value={periodo} onChange={e => setPeriodo(Number(e.target.value))}><option value={30}>30 días</option><option value={60}>60 días</option><option value={90}>90 días</option></select></label></div>
        {cargandoHistorial ? <p>Cargando sesiones…</p> : errorHistorial ? <p role="alert" className="pe-error">{errorHistorial}</p> : <>
          <div className="pe-history-summary"><span><strong>{sesionesPeriodo.length}</strong> sesiones</span><span><strong>{sesionesPeriodo.reduce((n, s) => n + numero(s.duracion_minutos), 0)}</strong> minutos</span></div>
          <h4>Actividad por semana · últimas 6 semanas</h4>
          <div className="pe-week-chart" role="img" aria-label={semanas.map(s => `${s.label}: ${s.sesiones} sesiones`).join(', ')}>{semanas.map((s, i) => <div className="pe-week" key={i}><span>{s.sesiones || ''}</span><div className="pe-week-track"><div style={{height: `${s.sesiones ? Math.max(12, s.sesiones / Math.max(1, ...semanas.map(x => x.sesiones)) * 100) : 0}%`}} /></div><small>{s.label}</small></div>)}</div>
          {sesionesPeriodo.length === 0 ? <p className="pe-history-empty">No hay sesiones registradas en este período.</p> : <div className="pe-session-list">{sesionesPeriodo.map(s => <article key={s.id} className="pe-session"><div className="pe-session-title"><strong>{fechaBonita(s.fecha)}</strong><span>{numero(s.duracion_minutos)} min · Esfuerzo {s.esfuerzo}/10</span></div>{Array.isArray(s.ejercicios_realizados) && s.ejercicios_realizados.length ? <details><summary>Ver ejercicios ({s.ejercicios_realizados.length})</summary><div className="pe-exercises">{s.ejercicios_realizados.map((e, i) => <div key={i}><strong>{e.nombre || `Ejercicio ${i + 1}`}</strong><span>{e.series ?? '—'} series · {e.repeticiones ?? e.repeticiones_realizadas ?? '—'} repeticiones{e.carga ? ` · ${e.carga}` : ''}</span></div>)}</div></details> : <small>Sin detalle de ejercicios registrado.</small>}</article>)}</div>}
        </>}
        <p className="pe-history-privacy">Se muestran sesiones y ejercicios de los últimos 90 días; el gráfico presenta siempre las últimas 6 semanas. Las observaciones privadas no se comparten con el entrenador.</p>
      </div>
    </section>}
    {!seleccionado && <p className="pe-foot">Las métricas representan sesiones voluntariamente registradas en planes IA, no asistencia oficial ni evaluación clínica. La ausencia de registros no demuestra que un deportista no haya entrenado.</p>}
  </section>;
}
