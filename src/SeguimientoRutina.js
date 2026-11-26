import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import EntrenamientoGuiado from './EntrenamientoGuiado';
import './SeguimientoRutina.css';
export function HistorialRutinas({usuarioId,version=0}){
 const [rows,setRows]=useState([]),[status,setStatus]=useState('loading');
 useEffect(()=>{let live=true;setStatus('loading');supabase.from('ath_rutina_sesiones').select('*').eq('deportista_id',usuarioId).order('fecha',{ascending:false}).limit(30).then(({data,error})=>{if(live){setRows(data||[]);setStatus(error?'error':'ok');}});return()=>{live=false;};},[usuarioId,version]);
 return <section className="sr-panel"><h3>Rutinas realizadas</h3>{status==='loading'?<p>Cargando…</p>:status==='error'?<p>No se pudo cargar el historial.</p>:!rows.length?<p>Aún no hay rutinas registradas.</p>:rows.map(r=><details key={r.id}><summary>{r.nombre} · {new Date(r.fecha).toLocaleDateString('es-CL')} · {Math.ceil(r.segundos/60)} min</summary>{r.ejercicios.map((e,i)=><p key={i}>{e.nombre}: {e.series} series · {e.repeticiones||'—'} rep. {e.carga!==''?`· ${e.carga} kg`:''}</p>)}</details>)}</section>;
}
export default function SeguimientoRutina({rutina,ejercicios,onBack,onSaved}){
 const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [id]=useState(()=>crypto.randomUUID());
 const sesion={titulo:rutina.nombre,ejercicios:ejercicios.map(e=>({...e,nombre:e.ejercicio?.nombre,indicaciones:[e.ejercicio?.indicaciones,e.indicaciones_adicionales,e.duracion_segundos?`Duración: ${e.duracion_segundos} s`:null].filter(Boolean).join(' · ')}))};
 const guardar=async()=>{if(busy)return;setBusy(true);setError('');try{const {error}=await supabase.from('ath_rutina_sesiones').insert({id,rutina_id:rutina.id,nombre:rutina.nombre,segundos:result.segundos,ejercicios:result.items});if(error){if(error.code!=='23505')throw error;const {data}=await supabase.from('ath_rutina_sesiones').select('id').eq('id',id).maybeSingle();if(!data)throw error;}try { const {data}=await supabase.auth.getUser(); localStorage.removeItem(`athletix:guided:v3:${data.user.id}:asignada-${rutina.id}:0:libre`); } catch (_) {} onSaved();}catch(e){setError('No se pudo guardar. Intenta nuevamente.');}finally{setBusy(false);}};
 if(!result)return <EntrenamientoGuiado planId={`asignada-${rutina.id}`} sesionIndex={0} sesion={sesion} onBack={onBack} onRegister={(segundos,detalle)=>setResult({segundos,items:detalle.map(e=>({...e,carga:'',repeticiones:''}))})}/>;
 return <section className="sr-panel"><h3>Registrar entrenamiento</h3><p>{rutina.nombre} · {Math.ceil(result.segundos/60)} min</p>{result.items.map((e,i)=><div className="sr-item" key={i}><strong>{e.nombre} · {e.series} series</strong><div className="sr-fields">{[['repeticiones','Repeticiones por serie'],['carga','Peso (kg)']].map(([k,label])=><label key={k}>{label}<input type="number" min="0" step={k==='carga'?'0.1':'1'} value={e[k]} onChange={ev=>setResult(r=>({...r,items:r.items.map((x,j)=>j===i?{...x,[k]:ev.target.value}:x)}))}/></label>)}</div></div>)}{error&&<p role="alert">{error}</p>}<button disabled={busy||!result.items.length} onClick={guardar}>{busy?'Guardando…':'Guardar entrenamiento'}</button><button disabled={busy} onClick={()=>setResult(null)}>Volver a la sesión</button></section>;
}
