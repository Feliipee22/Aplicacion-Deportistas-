import React, {useState,useEffect,useCallback,useRef} from 'react';
import {supabase} from './supabase';
import './AthletixNotificaciones.css';
import { actualizacionVisible } from './actualizacionVisible';
export default function AthletixNotificaciones({usuarioId,onNavegar}) {
 const [items,setItems]=useState([]),[total,setTotal]=useState(0),[abierto,setAbierto]=useState(false),[error,setError]=useState(''),[cargando,setCargando]=useState(true),[ocupado,setOcupado]=useState(false);
 const secuencia=useRef(0), activo=useRef(false), caja=useRef(null);
 const cargar=useCallback(async()=>{
  const turno=++secuencia.current;
  const [lista,contador]=await Promise.all([
   supabase.from('ath_notificaciones').select('*').eq('usuario_id',usuarioId).order('creado_en',{ascending:false}).order('id',{ascending:false}).limit(50),
   supabase.from('ath_notificaciones').select('id',{count:'exact',head:true}).eq('usuario_id',usuarioId).eq('leida',false)
  ]);
  if(!activo.current||turno!==secuencia.current)return;
  setCargando(false);
  if(lista.error||contador.error){setError('No se pudieron cargar las notificaciones.');return;}
  setItems(lista.data||[]);setTotal(contador.count||0);setError('');
 },[usuarioId]);
 useEffect(()=>{
  const invalidar=()=>{secuencia.current++;};
  activo.current=true;setItems([]);setTotal(0);setCargando(true);
  let pendiente;
  const programar=()=>{clearTimeout(pendiente);pendiente=setTimeout(()=>{if(!document.hidden)cargar();},250);};
  const canal=supabase.channel('ath-notificaciones-'+usuarioId).on('postgres_changes',{event:'*',schema:'public',table:'ath_notificaciones',filter:'usuario_id=eq.'+usuarioId},()=>programar()).subscribe(s=>{if(s==='SUBSCRIBED')programar();});
  const detener=actualizacionVisible(cargar,60000);
  return()=>{activo.current=false;invalidar();clearTimeout(pendiente);detener();supabase.removeChannel(canal);};
 },[usuarioId,cargar]);
 useEffect(()=>{if(!abierto)return;const cerrar=e=>{if(e.key==='Escape'||(e.type==='pointerdown'&&!caja.current?.contains(e.target)))setAbierto(false);};document.addEventListener('keydown',cerrar);document.addEventListener('pointerdown',cerrar);return()=>{document.removeEventListener('keydown',cerrar);document.removeEventListener('pointerdown',cerrar);};},[abierto]);
 async function leer(item){if(ocupado)return;setOcupado(true);try{let q=supabase.from('ath_notificaciones').update({leida:true}).eq('usuario_id',usuarioId).eq('leida',false);if(item)q=q.eq('id',item.id);const {error:e}=await q;if(e){setError('No se pudo marcar como leída.');return;}await cargar();if(item){setAbierto(false);onNavegar(item.modulo);}}finally{setOcupado(false);}}
 return <div className="ath-notif" ref={caja}><button type="button" className="ath-notif-bell" aria-label={`Notificaciones, ${total} pendientes`} aria-expanded={abierto} onClick={()=>{setAbierto(!abierto);if(!abierto)cargar();}}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" strokeLinecap="round" strokeLinejoin="round"/></svg>{total>0&&<span className="ath-notif-count">{total>99?'99+':total}</span>}</button>{abierto&&<section className="ath-notif-panel" aria-label="Centro de notificaciones"><div className="ath-notif-head"><strong>Notificaciones</strong><button type="button" onClick={()=>setAbierto(false)} aria-label="Cerrar notificaciones">×</button></div><div className="ath-notif-actions"><span>{total} pendientes</span><button type="button" disabled={!total||ocupado} onClick={()=>leer(null)}>Marcar todas como leídas</button></div>{error&&<p role="alert">{error} <button type="button" onClick={cargar}>Reintentar</button></p>}<div className="ath-notif-list">{cargando?<p>Cargando…</p>:!items.length?<p>No tienes notificaciones todavía.</p>:items.map(n=><button type="button" key={n.id} disabled={ocupado} className={'ath-notif-item'+(n.leida?'':' ath-notif-unread')} onClick={()=>n.leida?(setAbierto(false),onNavegar(n.modulo)):leer(n)}><span className="ath-notif-dot"/><span><strong>{n.titulo}</strong><span>{n.mensaje}</span><small>{new Date(n.creado_en).toLocaleString('es-CL')}</small></span></button>)}</div><small className="ath-notif-footer">Últimas 50 notificaciones</small></section>}</div>;
}
