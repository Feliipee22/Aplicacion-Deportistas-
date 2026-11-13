import {useAthletixPresence} from './AthletixPresence';
import React,{useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import './ComunidadChat.css';
const GLOBAL='00000000-0000-0000-0000-000000000001';
export default function ComunidadChat({perfil}){
 const [tipo,setTipo]=useState('general'),[conversaciones,setConversaciones]=useState([]),[usuarios,setUsuarios]=useState([]),[chat,setChat]=useState(GLOBAL),[mensajes,setMensajes]=useState([]),[texto,setTexto]=useState(''),[nombreGrupo,setNombreGrupo]=useState(''),[invitados,setInvitados]=useState([]),[crear,setCrear]=useState(false),[error,setError]=useState(''),[enviando,setEnviando]=useState(false);
 const final=useRef(null);
 const {onlineIds: allOnlineIds, connected: selfConnected, estadoDe} = useAthletixPresence();
 const selfOnline = estadoDe(perfil.id) === 'en-linea';
 const onlineIds=allOnlineIds.filter(id=>id!==String(perfil.id));
 const presenceReady=true;
 const [onlineUsers,setOnlineUsers]=useState([]);
 const [busqueda,setBusqueda]=useState(''),[busquedaGrupo,setBusquedaGrupo]=useState(''),[buscando,setBuscando]=useState(false);
 const [contactos,setContactos]=useState([]);
 // Obtener nombres solo de los UUID anunciados como conectados.
 useEffect(()=>{
  let activo=true;
  if(!onlineIds.length){setOnlineUsers([]);return()=>{activo=false;};}
  supabase.from('perfiles_publicos').select('id,nombre,apodo_publico')
   .in('id',onlineIds.slice(0,100)).then(({data,error:e})=>{
    if(!activo)return;
    if(e){setOnlineUsers([]);return;}
    const items=(data||[]).map(u=>({...u,nombreVisible:u.apodo_publico?.trim()||u.nombre?.trim()||'Usuario'}));
    setOnlineUsers(items);
    setUsuarios(old=>[...old.filter(u=>!items.some(d=>d.id===u.id)),...items]);
   });
  return()=>{activo=false;};
 },[onlineIds.join('|')]);
 const onlineSet=new Set(onlineIds);
 const nombrePropio=perfil?.apodo_publico?.trim()||perfil?.nombre?.trim()||'Tú';
 const estadoContacto=(id)=> { const estado=estadoDe(id); const etiqueta=estado==='en-linea'?'En línea':estado==='ausente'?'Ausente':'Desconectado'; return <span className={'ath-chat-contact-status '+(estado==='en-linea'?'is-online':estado==='ausente'?'is-away':'is-offline')}><span className="ath-chat-status-dot" aria-hidden="true"/>{etiqueta}</span>; };
 const miPresencia=<div className="ath-chat-self"><span className="ath-chat-person-avatar">{nombrePropio.charAt(0).toUpperCase()}</span><span className="ath-chat-self-name">{nombrePropio} <strong>(Tú)</strong></span><span className={'ath-chat-contact-status '+(selfOnline?'is-online':'is-offline')}><span className="ath-chat-status-dot" aria-hidden="true"/>{selfOnline?'En línea':estadoDe(perfil.id)==='ausente'?'Ausente':selfConnected?'Conectando…':'Sin conexión'}</span></div>;
 const cargarConversaciones=useCallback(async()=>{
  const {data,error:e}=await supabase.from('ath_chat_participantes').select('chat_id,ath_chats(id,tipo,nombre,creador_id)').eq('usuario_id',perfil.id);
  if(e){setError('No se pudieron cargar los chats. Ejecuta primero el SQL de Comunidad.');return;}
  setConversaciones((data||[]).map(x=>x.ath_chats).filter(Boolean));
 },[perfil.id]);
 useEffect(()=>{cargarConversaciones();},[cargarConversaciones]);
 // Consultas bajo demanda: nunca descargar el directorio completo al abrir Comunidad.
 const buscarPersonas=useCallback(async termino=>{
  const q=termino.trim();
  if(q.length<2){setContactos([]);return;}
  setBuscando(true);
  const limpio=q.replace(/[%,()]/g,' ').trim();
  const {data,error:e}=await supabase.from('perfiles_publicos')
   .select('id,nombre,apodo_publico')
   .or(`nombre.ilike.%${limpio}%,apodo_publico.ilike.%${limpio}%`)
   .limit(12);
  if(e){setError('No se pudo buscar personas.');setContactos([]);}
  else setContactos((data||[]).filter(u=>u.id!==perfil.id).map(u=>({...u,nombreVisible:u.apodo_publico?.trim()||u.nombre?.trim()||'Usuario'})));
  setBuscando(false);
 },[perfil.id]);
 useEffect(()=>{const q=tipo==='grupo'?busquedaGrupo:busqueda;if(q.trim().length<2){setContactos([]);return;}const timer=setTimeout(()=>buscarPersonas(q),300);return()=>clearTimeout(timer);},[busqueda,busquedaGrupo,tipo,buscarPersonas]);
 useEffect(()=>{
  const ids=[...new Set(conversaciones.filter(c=>c.tipo==='privado').map(c=>c.nombre?.split(':').find(x=>x!==String(perfil.id))).filter(Boolean))];
  if(!ids.length)return;
  supabase.from('perfiles_publicos').select('id,nombre,apodo_publico').in('id',ids.slice(0,100)).then(({data})=>{
   if(data)setUsuarios(old=>[...old.filter(u=>!data.some(d=>d.id===u.id)),...data.map(u=>({...u,nombreVisible:u.apodo_publico?.trim()||u.nombre?.trim()||'Usuario'}))]);
  });
 },[conversaciones,perfil.id]);
 const cargarMensajes=useCallback(async()=>{if(!chat)return;const {data,error:e}=await supabase.from('ath_chat_mensajes').select('id,chat_id,usuario_id,contenido,creado_en').eq('chat_id',chat).order('creado_en',{ascending:false}).limit(100);if(e)setError(e.message);else{setMensajes((data||[]).reverse());setError('');}},[chat]);
 // Los autores del chat general no tienen por qué estar en la lista de contactos.
 // Resolver sus perfiles por IDs de mensajes evita mostrar "Usuario" por defecto.
 useEffect(()=>{
  const ids=[...new Set(mensajes.map(m=>m.usuario_id).filter(id=>id&&id!==perfil.id&&!usuarios.some(u=>u.id===id)))];
  if(!ids.length)return;
  let activo=true;
  supabase.from('perfiles_publicos').select('id,nombre,apodo_publico').in('id',ids.slice(0,100))
   .then(({data})=>{if(!activo||!data?.length)return;
    setUsuarios(old=>[...old.filter(u=>!data.some(d=>d.id===u.id)),...data.map(u=>({...u,nombreVisible:u.apodo_publico?.trim()||u.nombre?.trim()||'Usuario'}))]);
   });
  return()=>{activo=false;};
 },[mensajes,perfil.id,usuarios]);
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
 const crearGrupo=async e=>{e.preventDefault();if(!nombreGrupo.trim()||!invitados.length)return;const {data,error:er}=await supabase.from('ath_chats').insert({tipo:'grupo',nombre:nombreGrupo.trim().slice(0,80),creador_id:perfil.id}).select('id').single();if(er){setError(er.message);return;}const {error:ep}=await supabase.from('ath_chat_participantes').insert([{chat_id:data.id,usuario_id:perfil.id},...invitados.map(id=>({chat_id:data.id,usuario_id:id}))]);if(ep){setError(ep.message);return;}setCrear(false);setNombreGrupo('');setInvitados([]);setBusquedaGrupo('');await cargarConversaciones();setChat(data.id);setTipo('grupo');};
 const mostrar=c=>c.tipo==='privado'?(usuarios.find(u=>u.id===c.nombre?.split(':').find(x=>x!==perfil.id))?.nombreVisible||'Chat privado'):c.nombre;
 const visibles=conversaciones.filter(c=>c.tipo===tipo);
 return <section className="ath-chat"><nav className="ath-chat-tabs" aria-label="Tipos de chat">{[['general','Chat general'],['privado','Chat privado'],['grupo','Chats grupales']].map(([k,v])=><button key={k} className={tipo===k?'active':''} onClick={()=>{setTipo(k);setChat(k==='general'?GLOBAL:null);setCrear(false);}}>{v}</button>)}</nav>
 {tipo==='privado'&&<div className="ath-chat-contacts"><div className="ath-chat-section-heading"><h3>Mensajes privados</h3><span>Conversaciones y contactos</span></div><div className="ath-chat-presence"><div className="ath-chat-presence-title"><span className="ath-chat-dot"/> Personas conectadas <span className="ath-chat-presence-count">{onlineUsers.length+(selfOnline?1:0)}</span></div>{miPresencia}{onlineUsers.length?<div className="ath-chat-online-list">{onlineUsers.map(u=><button type="button" key={u.id} onClick={()=>{setUsuarios(old=>old.some(x=>x.id===u.id)?old:[...old,u]);iniciarPrivado(u.id);}}><span className="ath-chat-person-avatar">{u.nombreVisible.charAt(0).toUpperCase()}</span><span>{u.nombreVisible}</span>{estadoContacto(u.id)}</button>)}</div>:<p className="ath-chat-presence-empty">{presenceReady?'No hay otras personas conectadas en Athletix.':'Conectando con el estado en línea…'}</p>}</div><label className="ath-chat-search-label" htmlFor="ath-chat-search">Buscar persona</label><input id="ath-chat-search" className="ath-chat-search" type="search" placeholder="Nombre o apodo (mín. 2 letras)" value={busqueda} onChange={e=>setBusqueda(e.target.value)}/>{busqueda.trim().length>=2&&<div className="ath-chat-results" aria-live="polite">{buscando?<p>Buscando…</p>:contactos.length?contactos.map(u=><button type="button" key={u.id} onClick={()=>{setUsuarios(old=>old.some(x=>x.id===u.id)?old:[...old,u]);setBusqueda('');setContactos([]);iniciarPrivado(u.id);}}><span className="ath-chat-person-avatar">{u.nombreVisible.charAt(0).toUpperCase()}</span><span>{u.nombreVisible}</span>{estadoContacto(u.id)}</button>):<p>No se encontraron personas.</p>}</div>}</div>}
 {tipo==='grupo'&&<><button type="button" className="ath-chat-new" onClick={()=>{setCrear(!crear);setBusquedaGrupo('');setContactos([]);}}>{crear?'Cancelar':'＋ Nuevo grupo'}</button>{crear&&<form className="ath-chat-create" onSubmit={crearGrupo}><h3>Crear grupo</h3><label>Nombre del grupo<input value={nombreGrupo} maxLength={80} onChange={e=>setNombreGrupo(e.target.value)} placeholder="Ej. Entrenamiento del sábado" required/></label><div className="ath-chat-presence"><div className="ath-chat-presence-title"><span className="ath-chat-dot"/> Personas conectadas <span className="ath-chat-presence-count">{onlineUsers.length+(selfOnline?1:0)}</span></div>{miPresencia}{onlineUsers.filter(u=>!invitados.includes(u.id)).length?<div className="ath-chat-online-list">{onlineUsers.filter(u=>!invitados.includes(u.id)).map(u=><button type="button" key={u.id} onClick={()=>{setUsuarios(old=>old.some(x=>x.id===u.id)?old:[...old,u]);setInvitados(old=>[...old,u.id]);}}><span className="ath-chat-person-avatar">{u.nombreVisible.charAt(0).toUpperCase()}</span><span>{u.nombreVisible}</span><span className="ath-chat-start">Añadir +</span></button>)}</div>:<p className="ath-chat-presence-empty">{presenceReady?'No hay otras personas conectadas disponibles.':'Conectando…'}</p>}</div><label>Buscar participantes<input type="search" value={busquedaGrupo} onChange={e=>setBusquedaGrupo(e.target.value)} placeholder="Escribe un nombre o apodo"/></label>{invitados.length>0&&<div className="ath-chat-selected">{invitados.map(id=><button key={id} type="button" onClick={()=>setInvitados(old=>old.filter(x=>x!==id))}>{usuarios.find(u=>u.id===id)?.nombreVisible||'Participante'} <span aria-hidden="true">×</span></button>)}</div>}{busquedaGrupo.trim().length>=2&&<div className="ath-chat-results">{buscando?<p>Buscando…</p>:contactos.filter(u=>!invitados.includes(u.id)).length?contactos.filter(u=>!invitados.includes(u.id)).map(u=><button key={u.id} type="button" onClick={()=>{setUsuarios(old=>old.some(x=>x.id===u.id)?old:[...old,u]);setInvitados(old=>[...old,u.id]);setBusquedaGrupo('');setContactos([]);}}><span className="ath-chat-person-avatar">{u.nombreVisible.charAt(0).toUpperCase()}</span><span>{u.nombreVisible}</span><span className="ath-chat-group-result-end">{estadoContacto(u.id)}<span className="ath-chat-add-label">Añadir +</span></span></button>):<p>Sin resultados.</p>}</div>}<p className="ath-chat-hint">{invitados.length} participante(s) seleccionado(s)</p><button type="submit" disabled={!nombreGrupo.trim()||!invitados.length}>Crear grupo</button></form>}</>}
 {tipo!=='general'&&<div className="ath-chat-list">{visibles.map(c=><button className={chat===c.id?'active':''} key={c.id} onClick={()=>setChat(c.id)}>{mostrar(c)}</button>)}{!visibles.length&&<p>No tienes conversaciones de este tipo todavía.</p>}</div>}
 {error&&<p className="ath-chat-error" role="alert">{error}</p>}
 {chat&&<div className="ath-chat-window"><div className="ath-chat-window-head"><span className="ath-chat-avatar">{chat===GLOBAL?"#":"✦"}</span><div><h3>{chat===GLOBAL?'Chat general':mostrar(conversaciones.find(c=>c.id===chat)||{tipo,nombre:'Conversación'})}</h3><small>{chat===GLOBAL?'Espacio de la comunidad':'Conversación de Athletix'}</small></div></div><div className="ath-chat-messages" aria-live="polite">{mensajes.map(m=><article key={m.id} className={m.usuario_id===perfil.id?'mine':''}><small>{m.usuario_id===perfil.id?'Tú':usuarios.find(u=>u.id===m.usuario_id)?.nombreVisible||(m.usuario_id===perfil.id?(usuarios.find(u=>u.id===perfil.id)?.nombreVisible||perfil.apodo_publico||perfil.nombre||'Tú'):'Usuario')} · {new Date(m.creado_en).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</small><p>{m.contenido}</p>{esAdmin&&chat===GLOBAL&&<button type="button" className="ath-chat-moderate" disabled={moderando!==null} onClick={()=>retirarGeneral(m)}>{moderando===m.id?'Retirando…':'Retirar mensaje'}</button>}</article>)}<div ref={final}/></div><form className="ath-chat-compose" onSubmit={enviar}><input aria-label="Escribir mensaje" placeholder="Escribe un mensaje…" value={texto} maxLength={2000} onChange={e=>setTexto(e.target.value)}/><button disabled={enviando||!texto.trim()}>Enviar</button></form></div>}</section>;
}
