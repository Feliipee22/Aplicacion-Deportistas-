import {HistorialRutinas} from './SeguimientoRutina';
import EvaluacionesDeportivas from './EvaluacionesDeportivas';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import './ProgresoEntrenador.css';

const numero = value => Number(value || 0);
const fechaBonita = value => {
  if (!value) return 'Sin registros';
  const d = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? 'Sin registros' : d.toLocaleDateString('es-CL');
};
const promedio = value => value == null || value === '' ? '—' : `${Number(value).toFixed(1)}/10`;

export default function ProgresoEntrenador() {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
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
      const { data, error: fallo } = await supabase.rpc('ath_v29_historial_vinculado', { p_deportista_id: seleccionado });
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
      const { data, error: fallo } = await supabase.rpc('ath_v29_resumen_vinculados');
      if (fallo) throw fallo;
      if (!Array.isArray(data)) throw new Error('La consulta no devolvió una lista válida.');
      setFilas(data);
    } catch (e) {
      setError(e?.message || 'No fue posible consultar el progreso.');
    } finally { setCargando(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // La RPC v29 devuelve una fila por deportista vinculado, sin equipos.
  const deportistas = useMemo(() => filas, [filas]);
  const filtrados = useMemo(() => deportistas.filter(f =>
    String(f.deportista || '').toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es'))
  ), [deportistas, busqueda]);
  const limpiarBusqueda = () => setBusqueda('');
  const ficha = deportistas.find(f => String(f.deportista_id) === String(seleccionado));

  return <section className="pe" aria-label="Progreso de deportistas">
    {!seleccionado && <div ref={listadoRef} className="pe-overview">
    <header className="pe-head"><div><h2>Mis deportistas</h2><p>Consulta sus evaluaciones y evolución deportiva.</p></div></header>
    {error && <div className="pe-error" role="alert">No fue posible cargar los deportistas. <button type="button" onClick={cargar}>Reintentar</button></div>}
    <div className="pe-controls pe-controls-single"><label htmlFor="pe-buscar">Buscar deportista</label><div className="pe-v29-search"><input id="pe-buscar" type="search" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre del deportista" autoComplete="off" />{busqueda && <button type="button" onClick={limpiarBusqueda} aria-label="Limpiar búsqueda">✕</button>}</div><p className="pe-v29-results" aria-live="polite">{cargando ? 'Cargando…' : `${filtrados.length} ${filtrados.length === 1 ? 'deportista' : 'deportistas'}`}</p></div>
    {cargando && !filas.length ? <p className="pe-empty">Cargando seguimiento…</p> : !filtrados.length ? <div className="pe-empty"><strong>{busqueda.trim() ? 'No encontramos deportistas con ese nombre' : 'Aún no tienes deportistas vinculados'}</strong><p>{busqueda.trim() ? 'Prueba otro nombre o limpia la búsqueda.' : 'Cuando aceptes una solicitud de vinculación, el deportista aparecerá aquí.'}</p>{busqueda.trim() && <button type="button" className="pe-v29-clear" onClick={limpiarBusqueda}>Limpiar búsqueda</button>}</div> : <div className="pe-list">{filtrados.map(f => <article className="pe-athlete" key={String(f.deportista_id)}><button type="button" className="pe-athlete-link" onClick={() => abrirFicha(f.deportista_id)}><span className="pe-avatar" aria-hidden="true">{String(f.deportista || '?').charAt(0).toUpperCase()}</span><span className="pe-person"><strong>{f.deportista || 'Deportista'}</strong><small>{numero(f.sesiones_30d)} sesiones registradas · 30 días</small><small>Última sesión: {fechaBonita(f.ultima_sesion)}</small></span><span className="pe-chevron" aria-hidden="true">›</span></button></article>)}</div>}

    </div>}
    {ficha && <section ref={fichaRef} className="pe-detail" aria-label="Ficha deportiva del deportista"><div className="pe-detail-heading"><div><span className="pe-eyebrow">FICHA DEPORTIVA</span><h3>{ficha.deportista}</h3><p>Deportista</p></div><button type="button" onClick={volver} aria-label="Volver al listado de deportistas">← Volver a deportistas</button></div>      <EvaluacionesDeportivas key={seleccionado} deportistaId={seleccionado} entrenador />
      <HistorialRutinas usuarioId={seleccionado}/>
      <details className="pe-session-summary"><summary>Resumen de actividad</summary><div className="pe-detail-grid"><div><span>Sesiones / 7 días</span><strong>{numero(ficha.sesiones_7d)}</strong></div><div><span>Sesiones / 30 días</span><strong>{numero(ficha.sesiones_30d)}</strong></div><div><span>Tiempo / 30 días</span><strong>{numero(ficha.minutos_30d)} min</strong></div><div><span>Esfuerzo percibido</span><strong>{promedio(ficha.esfuerzo_promedio_30d)}</strong></div></div><div className="pe-detail-note"><strong>Última sesión registrada</strong><p>{fechaBonita(ficha.ultima_sesion)}</p><p>Las observaciones personales del deportista son privadas.</p></div>
</details>
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
