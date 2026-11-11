import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './SeguimientoIA.css';

const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fechaBonita = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-CL');
const numero = v => v === '' || v == null ? null : Number(v);
const inicialEjercicios = sesion => (Array.isArray(sesion?.ejercicios) ? sesion.ejercicios : []).map((e,i) => ({
  indice: i, nombre: String(e.nombre || `Ejercicio ${i+1}`).slice(0,120),
  completado: true, series: String(e.series ?? ''), repeticiones: String(e.repeticiones ?? ''),
  carga_kg: '', notas: ''
}));

export default function SeguimientoIA({ planId, sesiones = [], estado }) {
  const [registros, setRegistros] = useState([]);
  const [indice, setIndice] = useState(0);
  const [esfuerzo, setEsfuerzo] = useState('5');
  const [duracion, setDuracion] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [fecha, setFecha] = useState(fechaLocal);
  const [ejercicios, setEjercicios] = useState(() => inicialEjercicios(sesiones[0]));
  const [detallar, setDetallar] = useState(false);
  const [expandido, setExpandido] = useState(null);
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const hoy = fechaLocal();

  const cargar = useCallback(async () => {
    if (!planId) return;
    const { data, error: e } = await supabase.from('sesiones_entrenamiento_ia')
      .select('id,sesion_indice,fecha,esfuerzo,duracion_minutos,observaciones,ejercicios_realizados,creado_en')
      .eq('plan_id', planId).order('fecha', { ascending: false }).limit(200);
    if (e) setError('No se pudo consultar el seguimiento: ' + e.message);
    else { setRegistros(data || []); setError(''); }
  }, [planId]);
  useEffect(() => { setRegistros([]); setIndice(0); setOk(''); cargar(); }, [cargar]);
  useEffect(() => { setEjercicios(inicialEjercicios(sesiones[indice])); }, [indice, sesiones]);

  const resumen = useMemo(() => {
    const ultimos7 = registros.filter(r => { const diff = (new Date(`${hoy}T12:00:00`) - new Date(`${r.fecha}T12:00:00`)) / 86400000; return diff >= 0 && diff < 7; });
    const minutos = registros.reduce((a,r) => a + (r.duracion_minutos || 0), 0);
    const promedio = registros.length ? (registros.reduce((a,r) => a + r.esfuerzo, 0) / registros.length).toFixed(1) : '—';
    const dias = Array.from({length:7},(_,i) => { const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - (6-i)); const f=fechaLocal(d); return {fecha:f,etiqueta:d.toLocaleDateString('es-CL',{weekday:'short'}).replace('.',''),cantidad:registros.filter(r=>r.fecha===f).length}; });
    const max = Math.max(1,...dias.map(d=>d.cantidad));
    return {ultimos7, minutos, promedio, dias, max};
  }, [registros, hoy]);

  function cambiarEjercicio(i, campo, valor) { setEjercicios(prev => prev.map((e,j) => j===i ? {...e,[campo]:valor} : e)); }

  async function registrar(ev) {
    ev.preventDefault();
    if (esperando || estado !== 'ACTIVO') return;
    setError(''); setOk('');
    if (!sesiones[indice] || !fecha || fecha > hoy || !Number.isInteger(Number(esfuerzo)) || Number(esfuerzo)<1 || Number(esfuerzo)>10) { setError('Revisa la sesión, fecha y esfuerzo.'); return; }
    if (duracion && (!Number.isInteger(Number(duracion)) || Number(duracion)<1 || Number(duracion)>240)) { setError('La duración debe estar entre 1 y 240 minutos.'); return; }
    const detalle = detallar ? ejercicios.map(e => ({
      indice:e.indice, nombre:e.nombre, completado:e.completado,
      series: e.completado ? numero(e.series) : null,
      repeticiones: e.repeticiones.trim().slice(0,60),
      carga_kg: e.completado ? numero(e.carga_kg) : null,
      notas:e.notas.trim().slice(0,180)
    })) : [];
    if (detalle.some(e => (e.series!==null && (!Number.isInteger(e.series)||e.series<0||e.series>30)) || (e.carga_kg!==null && (!Number.isFinite(e.carga_kg)||e.carga_kg<0||e.carga_kg>500)))) { setError('Revisa las series (0 a 30) y cargas (0 a 500 kg).'); return; }
    setEsperando(true);
    try {
      const {data:{user},error:authError} = await supabase.auth.getUser();
      if (authError || !user) throw new Error('Debes iniciar sesión.');
      const {error:db} = await supabase.from('sesiones_entrenamiento_ia').insert({
        plan_id:planId,usuario_id:user.id,sesion_indice:indice,fecha,esfuerzo:Number(esfuerzo),
        duracion_minutos:duracion ? Number(duracion):null,observaciones:observaciones.trim().slice(0,500),
        ejercicios_realizados:detalle
      });
      if (db) throw new Error(db.code==='23505'?'Ya registraste esta sesión en esa fecha.':db.message);
      setObservaciones('');setDuracion('');setDetallar(false);setOk('Entrenamiento registrado y añadido a tu progreso.');
      await cargar();
    } catch (ex) { setError(ex.message || 'No se pudo guardar.'); }
    finally {setEsperando(false);}
  }
  async function borrar(id) {
    if (!window.confirm('¿Eliminar este entrenamiento del historial?')) return;
    const {error:e} = await supabase.from('sesiones_entrenamiento_ia').delete().eq('id',id).eq('plan_id',planId);
    if(e) setError(e.message); else {setOk('Registro eliminado.');await cargar();}
  }
  return <section className="sia" aria-label="Seguimiento deportivo">
    <div className="sia-heading"><div><h3>Tu progreso deportivo</h3><p>Entrena, registra lo realizado y revisa tu constancia. Tu plan original se mantiene intacto.</p></div><button type="button" onClick={cargar}>Actualizar</button></div>
    <div className="sia-metrics">
      <div><strong>{registros.length}</strong><span>Sesiones totales</span></div>
      <div><strong>{resumen.ultimos7.length}</strong><span>Últimos 7 días</span></div>
      <div><strong>{resumen.minutos}</strong><span>Minutos registrados</span></div>
      <div><strong>{resumen.promedio}</strong><span>Esfuerzo medio /10</span></div>
    </div>
    <div className="sia-panel"><div className="sia-panel-title"><h4>Actividad de los últimos 7 días</h4><span>{resumen.ultimos7.length} sesiones</span></div>
      <div className="sia-bars" role="img" aria-label={`Entrenamientos de los últimos siete días: ${resumen.dias.map(d=>`${d.etiqueta} ${d.cantidad}`).join(', ')}`}>
        {resumen.dias.map(d=><div className="sia-bar-item" key={d.fecha}><strong>{d.cantidad || ''}</strong><div className="sia-bar-track"><div style={{height:`${d.cantidad ? Math.max(12, d.cantidad/resumen.max*100):0}%`}} /></div><small>{d.etiqueta}</small></div>)}
      </div><p className="sia-note">El gráfico muestra sesiones registradas, no mide rendimiento físico ni progreso clínico.</p>
    </div>
    {estado==='ACTIVO' ? <form className="sia-form" onSubmit={registrar}>
      <div className="sia-panel-title"><h4>Registrar entrenamiento</h4><span>Plan personal IA</span></div>
      <label>Sesión realizada<select value={indice} onChange={e=>setIndice(Number(e.target.value))}>{sesiones.map((s,i)=><option key={i} value={i}>{s.dia || `Sesión ${i+1}`} · {s.titulo || 'Entrenamiento'}</option>)}</select></label>
      <div className="sia-grid"><label>Fecha<input type="date" required value={fecha} max={hoy} onChange={e=>setFecha(e.target.value)}/></label><label>Esfuerzo percibido (1–10)<select value={esfuerzo} onChange={e=>setEsfuerzo(e.target.value)}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></div>
      <label>Duración real (minutos)<input type="number" min="1" max="240" value={duracion} onChange={e=>setDuracion(e.target.value)} placeholder="Ej. 45"/></label>
      <button className="sia-detail-toggle" type="button" aria-expanded={detallar} onClick={()=>setDetallar(v=>!v)}>{detallar?'− Ocultar detalle de ejercicios':'+ Registrar ejercicios, series y cargas'}</button>
      {detallar && <div className="sia-exercises"><p className="sia-note">Marca lo que realmente hiciste. Las cargas son opcionales.</p>{ejercicios.map((e,i)=><div className="sia-exercise" key={`${indice}-${i}`}>
        <label className="sia-check"><input type="checkbox" checked={e.completado} onChange={ev=>cambiarEjercicio(i,'completado',ev.target.checked)}/><strong>{e.nombre}</strong></label>
        {e.completado && <><div className="sia-grid"><label>Series realizadas<input type="number" min="0" max="30" value={e.series} onChange={ev=>cambiarEjercicio(i,'series',ev.target.value)}/></label><label>Repeticiones / tiempo<input maxLength="60" value={e.repeticiones} onChange={ev=>cambiarEjercicio(i,'repeticiones',ev.target.value)}/></label></div><label>Carga (kg, opcional)<input type="number" min="0" max="500" step="0.5" value={e.carga_kg} onChange={ev=>cambiarEjercicio(i,'carga_kg',ev.target.value)} placeholder="Sin carga"/></label><label>Nota del ejercicio<input maxLength="180" value={e.notas} onChange={ev=>cambiarEjercicio(i,'notas',ev.target.value)} placeholder="Ej. técnica mejorada"/></label></>}
      </div>)}</div>}
      <label>Observaciones de la sesión<textarea maxLength={500} value={observaciones} onChange={e=>setObservaciones(e.target.value)} placeholder="¿Cómo te sentiste? ¿Qué mejorarías?"/></label>
      <button className="sia-save" type="submit" disabled={esperando}>{esperando?'Guardando…':'Guardar entrenamiento'}</button>
    </form> : <p className="sia-note">Este plan está archivado: puedes consultar su historial, pero no registrar sesiones nuevas.</p>}
    {error && <p className="sia-error" role="alert">{error}</p>}{ok && <p className="sia-ok" role="status">{ok}</p>}
    <div className="sia-panel-title sia-history-title"><h4>Historial de entrenamientos</h4><span>{registros.length} registros</span></div>
    {!registros.length ? <p className="sia-note">Todavía no hay entrenamientos registrados en este plan.</p> : <div className="sia-history">{registros.map(r=>{
      const detalles=Array.isArray(r.ejercicios_realizados)?r.ejercicios_realizados:[];
      return <article key={r.id}><div className="sia-history-main"><strong>{sesiones[r.sesion_indice]?.titulo || `Sesión ${r.sesion_indice+1}`}</strong><small>{fechaBonita(r.fecha)} · Esfuerzo {r.esfuerzo}/10{r.duracion_minutos?` · ${r.duracion_minutos} min`:''}</small>{r.observaciones&&<p>{r.observaciones}</p>}
        {!!detalles.length&&<><button className="sia-link" type="button" onClick={()=>setExpandido(v=>v===r.id?null:r.id)}>{expandido===r.id?'Ocultar ejercicios':`Ver ejercicios (${detalles.filter(d=>d.completado).length}/${detalles.length})`}</button>{expandido===r.id&&<ul className="sia-exercise-history">{detalles.map((e,i)=><li key={i}><strong>{e.completado?'✓':'—'} {e.nombre}</strong>{e.completado&&<span>{e.series??'—'} series · {e.repeticiones||'—'}{e.carga_kg!=null?` · ${e.carga_kg} kg`:''}</span>}{e.notas&&<small>{e.notas}</small>}</li>)}</ul>}</>}
      </div><button type="button" onClick={()=>borrar(r.id)} aria-label="Eliminar registro">Eliminar</button></article>;
    })}</div>}
    <p className="sia-note">El esfuerzo es una percepción personal. Ante dolor, mareos o malestar importante, detén la actividad y consulta a un profesional.</p>
  </section>;
}
