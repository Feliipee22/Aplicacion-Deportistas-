import React,{useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import './ComunidadChat.css';
const GLOBAL='00000000-0000-0000-0000-000000000001';
export default function ComunidadChat({perfil}){
 const [tipo,setTipo]=useState('general'),[conversaciones,setConversaciones]=useState([]),[usuarios,setUsuarios]=useState([]),[chat,setChat]=useState(GLOBAL),[mensajes,setMensajes]=useState([]),[texto,setTexto]=useState(''),[nombreGrupo,setNombreGrupo]=useState(''),[invitados,setInvitados]=useState([]),[crear,setCrear]=useState(false),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const final=useRef(null);
 const cargarConversaciones=useCallback(async()=>{
  const {data,error:e}=await supabase.from('ath_chat_participantes').select('chat_id,ath_chats(id,tipo,nombre,creador_id)').eq('usuario_id',perfil.id);
  if(e){setError('No se pudieron cargar los chats. Ejecuta primero el SQL de Comunidad.');return;}
  setConversaciones((data||[]).map(x=>x.ath_chats).filter(Boolean));
 },[perfil.id]);
 useEffect(()=>{cargarConversaciones();const cargarUsuarios=async()=>{const {data,error:eu}=await supabase.from('perfiles_publicos').select('id,nombre,apodo_publico').order('nombre').limit(1000);if(eu){console.warn('No se pudieron cargar perfiles públicos para el chat:',eu.message);return;}setUsuarios((data||[]).map(u=>({...u,nombreVisible:u.apodo_publico?.trim()||u.nombre?.trim()||'Usuario'})));};cargarUsuarios();},[cargarConversaciones,perfil.id]);
 const cargarMensajes=useCallback(async()=>{if(!chat)return;const {data,error:e}=await supabase.from('ath_chat_mensajes').select('id,chat_id,usuario_id,contenido,creado_en').eq('chat_id',chat).order('creado_en',{ascending:false}).limit(100);if(e)setError(e.message);else{setMensajes((data||[]).reverse());setError('');}},[chat]);
 useEffect(()=>{cargarMensajes();const canal=supabase.channel('ath-chat-'+chat).on('postgres_changes',{event:'INSERT',schema:'public',table:'ath_chat_mensajes',filter:`chat_id=eq.${chat}`},()=>cargarMensajes()).subscribe();return()=>supabase.removeChannel(canal);},[chat,cargarMensajes]);
 useEffect(()=>{final.current?.scrollIntoView({behavior:'smooth'});},[mensajes.length]);
 const esAdmin=Number(perfil.rol_id)===1;
 const [moderando,setModerando]=useState(null);
 const retirarGeneral=async m=>{
  if(!esAdmin||chat!==GLOBAL)return;
  if(!window.confirm('¿Retirar este mensaje del chat general? La acción quedará registrada.'))return;
  setModerando(m.id);setError('');
  const {error:e}=await supabase.rpc('ath_admin_moderar_contenido',{p_tipo:'chat_general',p_id:String(m.id)});
  if(e)setError('No se pudo retirar: '+e.message);
  else await cargarMensajes();
  setModerando(null);
 };
 const enviar=async e=>{e.preventDefault();if(!texto.trim()||enviando)return;setEnviando(true);const {error:e2}=await supabase.from('ath_chat_mensajes').insert({chat_id:chat,usuario_id:perfil.id,contenido:texto.trim().slice(0,2000)});if(e2)setError(e2.message);else{setTexto('');await cargarMensajes();}setEnviando(false);};
 const iniciarPrivado=async otro=>{const existente=conversaciones.find(c=>c.tipo==='privado'&&c.nombre===[perfil.id,otro].sort().join(':'));if(existente){setChat(existente.id);setTipo('privado');return;}
  const {data,error:e}=await supabase.from('ath_chats').insert({tipo:'privado',nombre:[perfil.id,otro].sort().join(':'),creador_id:perfil.id}).select('id').single();if(e){setError(e.message);return;}
  const {error:ep}=await supabase.from('ath_chat_participantes').insert([{chat_id:data.id,usuario_id:perfil.id},{chat_id:data.id,usuario_id:otro}]);if(ep){setError('No se pudieron agregar participantes: '+ep.message);return;}await cargarConversaciones();setChat(data.id);setTipo('privado');};
 const crearGrupo=async e=>{e.preventDefault();if(!nombreGrupo.trim()||!invitados.length)return;const {data,error:er}=await supabase.from('ath_chats').insert({tipo:'grupo',nombre:nombreGrupo.trim().slice(0,80),creador_id:perfil.id}).select('id').single();if(er){setError(er.message);return;}const {error:ep}=await supabase.from('ath_chat_participantes').insert([{chat_id:data.id,usuario_id:perfil.id},...invitados.map(id=>({chat_id:data.id,usuario_id:id}))]);if(ep){setError(ep.message);return;}setCrear(false);setNombreGrupo('');setInvitados([]);await cargarConversaciones();setChat(data.id);setTipo('grupo');};
 const mostrar=c=>c.tipo==='privado'?(usuarios.find(u=>u.id===c.nombre?.split(':').find(x=>x!==perfil.id))?.nombreVisible||'Chat privado'):c.nombre;
 const visibles=conversaciones.filter(c=>c.tipo===tipo);
 return <section className="ath-chat"><nav className="ath-chat-tabs" aria-label="Tipos de chat">{[['general','Chat general'],['privado','Chat privado'],['grupo','Chats grupales']].map(([k,v])=><button key={k} className={tipo===k?'active':''} onClick={()=>{setTipo(k);setChat(k==='general'?GLOBAL:null);setCrear(false);}}>{v}</button>)}</nav>
 {tipo==='privado'&&<div className="ath-chat-contacts"><h3>Iniciar conversación</h3><select aria-label="Elegir usuario" defaultValue="" onChange={e=>{if(e.target.value)iniciarPrivado(e.target.value);e.target.value='';}}><option value="">Seleccionar usuario…</option>{usuarios.map(u=><option key={u.id} value={u.id}>{u.nombreVisible}</option>)}</select></div>}
 {tipo==='grupo'&&<><button className="ath-chat-new" onClick={()=>setCrear(!crear)}>{crear?'Cancelar':'＋ Crear grupo'}</button>{crear&&<form className="ath-chat-create" onSubmit={crearGrupo}><label>Nombre del grupo<input value={nombreGrupo} maxLength={80} onChange={e=>setNombreGrupo(e.target.value)} required/></label><label>Invitar personas<select multiple value={invitados} onChange={e=>setInvitados([...e.target.selectedOptions].map(o=>o.value))}>{usuarios.map(u=><option key={u.id} value={u.id}>{u.nombreVisible}</option>)}</select></label><button disabled={!invitados.length}>Crear grupo</button></form>}</>}
 {tipo!=='general'&&<div className="ath-chat-list">{visibles.map(c=><button className={chat===c.id?'active':''} key={c.id} onClick={()=>setChat(c.id)}>{mostrar(c)}</button>)}{!visibles.length&&<p>No tienes conversaciones de este tipo todavía.</p>}</div>}
 {error&&<p className="ath-chat-error" role="alert">{error}</p>}
 {chat&&<div className="ath-chat-window"><div className="ath-chat-window-head"><span className="ath-chat-avatar">{chat===GLOBAL?"#":"✦"}</span><div><h3>{chat===GLOBAL?'Chat general':mostrar(conversaciones.find(c=>c.id===chat)||{tipo,nombre:'Conversación'})}</h3><small>{chat===GLOBAL?'Espacio de la comunidad':'Conversación de Athletix'}</small></div></div><div className="ath-chat-messages" aria-live="polite">{mensajes.map(m=><article key={m.id} className={m.usuario_id===perfil.id?'mine':''}><small>{m.usuario_id===perfil.id?'Tú':usuarios.find(u=>u.id===m.usuario_id)?.nombreVisible||(m.usuario_id===perfil.id?(usuarios.find(u=>u.id===perfil.id)?.nombreVisible||perfil.apodo_publico||perfil.nombre||'Tú'):'Usuario')} · {new Date(m.creado_en).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</small><p>{m.contenido}</p>{esAdmin&&chat===GLOBAL&&<button type="button" className="ath-chat-moderate" disabled={moderando!==null} onClick={()=>retirarGeneral(m)}>{moderando===m.id?'Retirando…':'Retirar mensaje'}</button>}</article>)}<div ref={final}/></div><form className="ath-chat-compose" onSubmit={enviar}><input aria-label="Escribir mensaje" placeholder="Escribe un mensaje…" value={texto} maxLength={2000} onChange={e=>setTexto(e.target.value)}/><button disabled={enviando||!texto.trim()}>Enviar</button></form></div>}</section>;
}
