import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import VideoEjercicio from './VideoEjercicio';
import './VideoSugerido.css';

const limpiar = v => String(v || '').toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const grupos = [
 ['sentadilla','sentadillas','sentadilla al aire','sentadillas al aire','sentadilla con peso corporal'],
 ['puente de gluteos','puente de gluteo','elevacion de cadera'],
 ['plancha','plancha abdominal','plancha frontal'],
 ['flexiones','flexion de brazos','flexiones de brazos','lagartijas'],
 ['zancadas','zancada','estocadas','estocada'],
 ['abdominales bicicleta','bicicleta abdominal','crunch bicicleta'],
 ['jumping jacks','saltos de tijera'],
 ['elevacion de talones','elevaciones de talones']
].map(g=>g.map(limpiar));
const equivalentes=(a,b)=>{const x=limpiar(a),y=limpiar(b);return !!x && (x===y || grupos.some(g=>g.includes(x)&&g.includes(y)));};

export default function VideoSugerido({ nombre }) {
 const ejercicio=useMemo(()=>String(nombre||'').trim().slice(0,120),[nombre]);
 const [estado,setEstado]=useState('cargando');
 const [video,setVideo]=useState('');
 const [titulo,setTitulo]=useState('');
 const [fuente,setFuente]=useState('');
 const [abierto,setAbierto]=useState(false);
 const [buscando,setBuscando]=useState(false);
 const [aviso,setAviso]=useState('');
 useEffect(()=>{
  let activo=true;setEstado('cargando');setVideo('');setTitulo('');setFuente('');setAbierto(false);setAviso('');
  if(!ejercicio){setEstado('vacio');return ()=>{activo=false;};}
  (async()=>{
   try{
    const {data,error}=await supabase.from('ejercicios').select('nombre,video_url').not('video_url','is',null).order('nombre',{ascending:true}).limit(500);
    if(!activo)return;
    if(error){setEstado('vacio');return;}
    const encontrado=(data||[]).find(e=>e.video_url && equivalentes(e.nombre,ejercicio));
    if(encontrado){setVideo(encontrado.video_url);setTitulo(encontrado.nombre);setFuente('Biblioteca Athletix');setEstado('listo');}
    else setEstado('vacio');
   }catch(_){if(activo)setEstado('vacio');}
  })();
  return ()=>{activo=false;};
 },[ejercicio]);
 async function buscarExterno(){
  setBuscando(true);setAviso('');
  try{
   const {data,error}=await supabase.functions.invoke('buscar-video-ejercicio',{body:{nombre:ejercicio}});
   if(error){let detalle='';try{detalle=(await error.context?.json())?.error||'';}catch(_){}throw new Error(detalle||'No se pudo buscar una demostración ahora.');}
   if(data?.video_url){setVideo(data.video_url);setTitulo(data.titulo||ejercicio);setFuente('YouTube · Fuente externa');setEstado('listo');setAbierto(true);}
   else setAviso(data?.mensaje||'No encontramos una demostración suficientemente confiable.');
  }catch(e){setAviso(e.message||'No se pudo buscar el video.');}
  finally{setBuscando(false);}
 }
 const busqueda=`https://www.youtube.com/results?search_query=${encodeURIComponent(`${ejercicio} técnica correcta ejercicio`)}`;
 return <section className="ath-video-sugerido" aria-label={`Demostración de ${ejercicio}`}>
  {estado==='cargando' && <p className="ath-video-estado" role="status">Buscando en la biblioteca…</p>}
  {estado==='listo' && <>
   <button className="ath-video-abrir" type="button" aria-expanded={abierto} onClick={()=>setAbierto(v=>!v)}>
    <span className="ath-video-icono" aria-hidden="true">▶</span><span><strong>{abierto?'Ocultar demostración':'Ver cómo se hace'}</strong><small>{titulo} · {fuente}</small></span><span aria-hidden="true">{abierto?'−':'›'}</span>
   </button>
   {abierto && <div className="ath-video-reproductor"><VideoEjercicio valor={video}/><p className="ath-video-disclaimer">Comprueba las indicaciones de tu entrenador. El video es una referencia, no una evaluación de tu técnica.</p></div>}
  </>}
  {estado==='vacio' && <div className="ath-video-vacio"><strong>¿Quieres ver cómo se hace?</strong><p>Buscaremos una demostración de este ejercicio sin que tengas que subir videos.</p><button type="button" className="ath-video-abrir ath-video-buscar" disabled={buscando||!ejercicio} onClick={buscarExterno}>{buscando?'Buscando demostración…':'▶ Buscar video demostrativo'}</button></div>}
  {aviso && <p className="ath-video-estado" role="status">{aviso}</p>}
  {estado!=='cargando' && <a className="ath-video-enlace" href={busqueda} target="_blank" rel="noopener noreferrer">Buscar más videos en YouTube ↗</a>}
 </section>;
}
