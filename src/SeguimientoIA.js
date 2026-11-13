import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import './SeguimientoIA.css';

const fechaLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fechaBonita = f => new Date(`${f}T12:00:00`).toLocaleDateString('es-CL');
const formatoDuracion = valor => { const n = Math.max(0, Math.round(Number(valor)||0)); return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':'); };
const numero = v => v === '' || v == null ? null : Number(v);
const inicialEjercicios = sesion => (Array.isArray(sesion?.ejercicios) ? sesion.ejercicios : []).map((e,i) => ({
  indice: i, nombre: String(e.nombre || `Ejercicio ${i+1}`).slice(0,120),
  completado: true, series: String(e.series ?? ''), repeticiones: String(e.repeticiones ?? ''),
  carga_kg: '', notas: ''
}));

export default function SeguimientoIA({ planId, sesiones = [], estado, segundosEntrenados = null, sesionEntrenada = 0, modoRegistroGuiado = false, soloHistorial = false, soloFormulario = false, onRegistrarManual, onGuardado, programacionId = null }) {
  // Identificador estable para reintentos de un mismo guardado; cambia tras confirmar.
  const ejecucionRef = useRef(null);
  const nuevaEjecucion = () => {
    if (!ejecucionRef.current) ejecucionRef.current = crypto.randomUUID();
    return ejecucionRef.current;
  };
  const [registros, setRegistros] = useState([]);
  const [indice, setIndice] = useState(sesionEntrenada);
  const [esfuerzo, setEsfuerzo] = useState('5');
  const [duracion, setDuracion] = useState('');
  const segundosGuiados = modoRegistroGuiado && segundosEntrenados != null ? Math.round(Number(segundosEntrenados)) : null;
  const duracionSegundos = segundosGuiados != null ? segundosGuiados : duracion.trim() ? Math.round(Number(duracion)*60) : null;
  const [observaciones, setObservaciones] = useState('');
  const [fecha, setFecha] = useState(fechaLocal);
  const [ejercicios, setEjercicios] = useState(() => inicialEjercicios(sesiones[0]));
  const [detallar, setDetallar] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(!modoRegistroGuiado && !soloFormulario);
  const [expandido, setExpandido] = useState(null);
  const [esperando, setEsperando] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const hoy = fechaLocal();

  const cargar = useCallback(async () => {
    if (!planId) return;
    const { data, error: e } = await supabase.from('sesiones_entrenamiento_ia')
      .select('id,sesion_indice,fecha,esfuerzo,duracion_minutos,duracion_segundos,observaciones,ejercicios_realizados,creado_en')
      .eq('plan_id', planId).order('fecha', { ascending: false }).limit(200);
    if (e) setError('No se pudo consultar el seguimiento: ' + e.message);
    else { setRegistros(data || []); setError(''); }
  }, [planId]);
  useEffect(() => { setRegistros([]); setIndice(sesionEntrenada); setOk(''); cargar(); }, [cargar]);
  // La fecha real de ejecución nunca se hereda de la programación futura.
  useEffect(() => { if (modoRegistroGuiado) setFecha(fechaLocal()); }, [modoRegistroGuiado, programacionId, sesionEntrenada]);
  useEffect(() => { setEjercicios(inicialEjercicios(sesiones[indice])); }, [indice, sesiones]);

  const resumen = useMemo(() => {
    const ultimos7 = registros.filter(r => { const diff = (new Date(`${hoy}T12:00:00`) - new Date(`${r.fecha}T12:00:00`)) / 86400000; return diff >= 0 && diff < 7; });
    const segundosTotales = registros.reduce((a,r) => a + (r.duracion_segundos ?? ((r.duracion_minutos || 0)*60)), 0);
    const promedio = registros.length ? (registros.reduce((a,r) => a + r.esfuerzo, 0) / registros.length).toFixed(1) : '—';
    const dias = Array.from({length:7},(_,i) => { const d = new Date(`${hoy}T12:00:00`); d.setDate(d.getDate() - (6-i)); const f=fechaLocal(d); return {fecha:f,etiqueta:d.toLocaleDateString('es-CL',{weekday:'short'}).replace('.',''),cantidad:registros.filter(r=>r.fecha===f).length}; });
    const max = Math.max(1,...dias.map(d=>d.cantidad));
    return {ultimos7, segundosTotales, promedio, dias, max};
  }, [registros, hoy]);

  function cambiarEjercicio(i, campo, valor) { setEjercicios(prev => prev.map((e,j) => j===i ? {...e,[campo]:valor} : e)); }

  async function registrar(ev) {
    ev.preventDefault();
    if (esperando || estado !== 'ACTIVO') return;
    setError(''); setOk('');
    if (!sesiones[indice] || !fecha || fecha > hoy || !Number.isInteger(Number(esfuerzo)) || Number(esfuerzo)<1 || Number(esfuerzo)>10) { setError('Revisa la sesión, fecha y esfuerzo.'); return; }
    if (duracionSegundos != null && (!Number.isInteger(duracionSegundos) || duracionSegundos<1 || duracionSegundos>14400)) { setError('La duración debe estar entre 1 y 240 minutos.'); return; }
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
      let {data:registroNuevo,error:db} = await supabase.from('sesiones_entrenamiento_ia').insert({
        ejecucion_id:nuevaEjecucion(),plan_id:planId,usuario_id:user.id,sesion_indice:indice,fecha,esfuerzo:Number(esfuerzo),
        duracion_minutos:duracionSegundos != null ? Math.ceil(duracionSegundos/60) : null, duracion_segundos:duracionSegundos,observaciones:observaciones.trim().slice(0,500),
        ejercicios_realizados:detalle
      }).select('id').single();
      if (db) {
        // Una respuesta perdida después del INSERT no debe generar un segundo registro.
        if (db.code === '23505') {
          const {data:existente,error:consulta} = await supabase.from('sesiones_entrenamiento_ia')
            .select('id').eq('ejecucion_id',ejecucionRef.current).eq('usuario_id',user.id).maybeSingle();
          if (!consulta && existente?.id) registroNuevo = existente;
          else throw new Error('No se pudo guardar: existe una restricción de duplicados. Verifica que ejecutaste el SQL de la v18.');
        } else throw new Error(db.message);
      }
      if (programacionId && registroNuevo?.id) {
        const {data:programacionActualizada,error:actualizacion} = await supabase.from('entrenamientos_programados')
          .update({estado:'COMPLETADO',sesion_realizada_id:registroNuevo.id})
          .eq('id',programacionId).eq('usuario_id',user.id).eq('estado','PENDIENTE').select('id');
        if (actualizacion || !programacionActualizada?.length) {
          setError('Tu entrenamiento quedó guardado, pero el calendario no se actualizó: '+(actualizacion?.message || 'La programación ya no está pendiente o no tienes permiso para actualizarla.'));
          setObservaciones('');setDuracion('');setDetallar(false);
          ejecucionRef.current = null;onGuardado?.();await cargar();return;
        }
      }

      ejecucionRef.current = null;setObservaciones('');setDuracion('');setDetallar(false);setOk('¡Entrenamiento guardado en tu historial!');setMostrarHistorial(true);onGuardado?.();
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
    {!modoRegistroGuiado && !soloFormulario && <div className="sia-heading"><div><h3>Tu actividad deportiva</h3><p>Consulta tus entrenamientos y revisa tu constancia.</p></div><button type="button" onClick={cargar}>Actualizar</button></div>}
    {!modoRegistroGuiado && !soloFormulario && <div className="sia-metrics">
      <div><strong>{registros.length}</strong><span>Sesiones totales</span></div>
      <div><strong>{resumen.ultimos7.length}</strong><span>Últimos 7 días</span></div>
      <div><strong>{formatoDuracion(resumen.segundosTotales)}</strong><span>Tiempo registrado</span></div>
      <div><strong>{resumen.promedio}</strong><span>Esfuerzo medio /10</span></div>
    </div>}
    {!modoRegistroGuiado && !soloFormulario && <div className="sia-panel"><div className="sia-panel-title"><h4>Actividad de los últimos 7 días</h4><span>{resumen.ultimos7.length} sesiones</span></div>
      <div className="sia-bars" role="img" aria-label={`Entrenamientos de los últimos siete días: ${resumen.dias.map(d=>`${d.etiqueta} ${d.cantidad}`).join(', ')}`}>
        {resumen.dias.map(d=><div className="sia-bar-item" key={d.fecha}><strong>{d.cantidad || ''}</strong><div className="sia-bar-track"><div style={{height:`${d.cantidad ? Math.max(12, d.cantidad/resumen.max*100):0}%`}} /></div><small>{d.etiqueta}</small></div>)}
      </div><p className="sia-note">El gráfico muestra sesiones registradas, no mide rendimiento físico ni progreso clínico.</p>
    </div>}
    {modoRegistroGuiado && <div className="sia-guided-summary"><span>✓ Sesión completada</span><strong>{sesiones[sesionEntrenada]?.titulo || sesiones[sesionEntrenada]?.dia || 'Tu entrenamiento'}</strong><div><span>{segundosGuiados != null ? formatoDuracion(segundosGuiados) : '—'}</span><span>Sesión {sesionEntrenada+1} de {sesiones.length}</span></div><small>Tiempo exacto calculado por el cronómetro. No se puede modificar en el registro guiado.</small></div>}
    {soloHistorial && estado==='ACTIVO' && <button className="sia-manual-action" type="button" onClick={onRegistrarManual}>+ Registrar otra actividad</button>}
    {!soloHistorial && estado==='ACTIVO' ? <form className="sia-form" onSubmit={registrar}>
      <div className="sia-panel-title"><h4>{modoRegistroGuiado ? "Confirma tu entrenamiento" : "Registrar entrenamiento"}</h4><span>{modoRegistroGuiado ? "Último paso" : "Plan personal IA"}</span></div>
      <label className={modoRegistroGuiado ? "sia-guided-hidden" : ""}>Sesión realizada<select value={indice} onChange={e=>setIndice(Number(e.target.value))}>{sesiones.map((s,i)=><option key={i} value={i}>{s.dia || `Sesión ${i+1}`} · {s.titulo || 'Entrenamiento'}</option>)}</select></label>
      <div className="sia-grid"><label>Fecha<input type="date" required value={fecha} max={hoy} onChange={e=>setFecha(e.target.value)}/></label><label>Esfuerzo percibido (1–10)<select value={esfuerzo} onChange={e=>setEsfuerzo(e.target.value)}>{Array.from({length:10},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label></div>
      {segundosGuiados != null ? <div className="sia-guided-duration"><strong>Duración exacta</strong><span>{formatoDuracion(segundosGuiados)}</span><small>Registrada automáticamente desde el cronómetro.</small></div> : <label>Duración (minutos)<input type="number" min="1" max="240" value={duracion} onChange={e=>setDuracion(e.target.value)} placeholder="Ej. 45"/></label>}
      <button className="sia-detail-toggle" type="button" aria-expanded={detallar} onClick={()=>setDetallar(v=>!v)}>{detallar?'− Ocultar detalle de ejercicios':'+ Registrar ejercicios, series y cargas'}</button>
      {detallar && <div className="sia-exercises"><p className="sia-note">Marca lo que realmente hiciste. Las cargas son opcionales.</p>{ejercicios.map((e,i)=><div className="sia-exercise" key={`${indice}-${i}`}>
        <label className="sia-check"><input type="checkbox" checked={e.completado} onChange={ev=>cambiarEjercicio(i,'completado',ev.target.checked)}/><strong>{e.nombre}</strong></label>
        {e.completado && <><div className="sia-grid"><label>Series realizadas<input type="number" min="0" max="30" value={e.series} onChange={ev=>cambiarEjercicio(i,'series',ev.target.value)}/></label><label>Repeticiones / tiempo<input maxLength="60" value={e.repeticiones} onChange={ev=>cambiarEjercicio(i,'repeticiones',ev.target.value)}/></label></div><label>Carga (kg, opcional)<input type="number" min="0" max="500" step="0.5" value={e.carga_kg} onChange={ev=>cambiarEjercicio(i,'carga_kg',ev.target.value)} placeholder="Sin carga"/></label><label>Nota del ejercicio<input maxLength="180" value={e.notas} onChange={ev=>cambiarEjercicio(i,'notas',ev.target.value)} placeholder="Ej. técnica mejorada"/></label></>}
      </div>)}</div>}
      <label>Observaciones de la sesión<textarea maxLength={500} value={observaciones} onChange={e=>setObservaciones(e.target.value)} placeholder="¿Cómo te sentiste? ¿Qué mejorarías?"/></label>
      <button className="sia-save" type="submit" disabled={esperando}>{esperando?'Guardando…':'Guardar entrenamiento'}</button>
    </form> : !soloHistorial && <p className="sia-note">Este plan está archivado: puedes consultar su historial, pero no registrar sesiones nuevas.</p>}
    {error && <p className="sia-error" role="alert">{error}</p>}{ok && <p className="sia-ok" role="status">{ok}</p>}
    {modoRegistroGuiado && !mostrarHistorial && <button className="sia-show-history" type="button" onClick={() => setMostrarHistorial(true)}>Ver historial de entrenamientos</button>}
    {mostrarHistorial && !soloFormulario && <><div className="sia-panel-title sia-history-title"><h4>Historial de entrenamientos</h4><span>{registros.length} registros</span></div>
    {!registros.length ? <p className="sia-note">Todavía no hay entrenamientos registrados en este plan.</p> : <div className="sia-history">{registros.map(r=>{
      const detalles=Array.isArray(r.ejercicios_realizados)?r.ejercicios_realizados:[];
      return <article key={r.id}><div className="sia-history-main"><strong>{sesiones[r.sesion_indice]?.titulo || `Sesión ${r.sesion_indice+1}`}</strong><small>{fechaBonita(r.fecha)} · Esfuerzo {r.esfuerzo}/10{(r.duracion_segundos != null || r.duracion_minutos) ? ` · ${formatoDuracion(r.duracion_segundos ?? r.duracion_minutos*60)}` : ''}</small>{r.observaciones&&<p>{r.observaciones}</p>}
        {!!detalles.length&&<><button className="sia-link" type="button" onClick={()=>setExpandido(v=>v===r.id?null:r.id)}>{expandido===r.id?'Ocultar ejercicios':`Ver ejercicios (${detalles.filter(d=>d.completado).length}/${detalles.length})`}</button>{expandido===r.id&&<ul className="sia-exercise-history">{detalles.map((e,i)=><li key={i}><strong>{e.completado?'✓':'—'} {e.nombre}</strong>{e.completado&&<span>{e.series??'—'} series · {e.repeticiones||'—'}{e.carga_kg!=null?` · ${e.carga_kg} kg`:''}</span>}{e.notas&&<small>{e.notas}</small>}</li>)}</ul>}</>}
      </div><button type="button" onClick={()=>borrar(r.id)} aria-label="Eliminar registro">Eliminar</button></article>;
    })}</div>}
    </>}
    <p className="sia-note">El esfuerzo es una percepción personal. Ante dolor, mareos o malestar importante, detén la actividad y consulta a un profesional.</p>
  </section>;
}
