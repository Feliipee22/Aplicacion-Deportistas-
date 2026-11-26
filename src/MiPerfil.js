import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';
import './MiPerfil.css';

export default function MiPerfil({ perfil, onPerfilActualizado, onCerrarSesion }) {
  const [deportivo, setDeportivo] = useState({deporte:'',nivel:'Principiante',objetivo:'Mejorar condición física',frecuencia:3,preferencias:'',usar_ia:false});
  const [cargaDeportiva, setCargaDeportiva] = useState(true);
  useEffect(() => { let activo=true; if (perfil.rol_id !== 3) return; setCargaDeportiva(true); supabase.from('ath_perfil_deportivo').select('*').eq('usuario_id',perfil.id).maybeSingle().then(({data,error})=>{if(!activo)return; if(error){setError('No pudimos cargar tu perfil deportivo.');return;} if(data)setDeportivo(data); setCargaDeportiva(false);}); return ()=>{activo=false;}; },[perfil.id,perfil.rol_id]);
  const campo = (k,v) => setDeportivo(d=>({...d,[k]:v}));
  const [privacidad,setPrivacidad]=useState({notificaciones:true,mostrar_conexion:true});
  const [privacidadLista,setPrivacidadLista]=useState(false);
  useEffect(()=>{let activo=true;setPrivacidadLista(false);supabase.from('ath_preferencias_privacidad').select('notificaciones,mostrar_conexion').eq('usuario_id',perfil.id).maybeSingle().then(({data,error})=>{if(!activo)return;if(error){setError('No pudimos cargar tus preferencias.');return;}setPrivacidad(data||{notificaciones:true,mostrar_conexion:true});setPrivacidadLista(true);});return()=>{activo=false;};},[perfil.id]);
  const [vista, setVista] = useState('resumen');
  const [nombre, setNombre] = useState(perfil.nombre || '');
  const [telefono, setTelefono] = useState(perfil.telefono || '');
  const [correo, setCorreo] = useState(perfil.correo || '');
  const [nuevoCorreo, setNuevoCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [ocupado, setOcupado] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  useEffect(() => { setNombre(perfil.nombre || ''); setTelefono(perfil.telefono || ''); setCorreo(perfil.correo || ''); }, [perfil]);
  useEffect(() => {
    let vivo = true;
    supabase.auth.getUser().then(({ data }) => { if (vivo && data?.user?.email) setCorreo(data.user.email); });
    return () => { vivo = false; };
  }, []);
  const ejecutar = async (accion, fn) => {
    setOcupado(accion); setError(''); setMensaje('');
    try { await fn(); } catch (e) { setError(e.message || 'No pudimos guardar los cambios. Inténtalo nuevamente.'); }
    finally { setOcupado(''); }
  };
  const guardarDatos = e => { e.preventDefault(); ejecutar('datos', async () => {
    const limpio = nombre.trim().replace(/\s+/g, ' ');
    const tel = telefono.trim();
    if (limpio.length < 2 || limpio.length > 120) throw new Error('Ingresa un nombre de 2 a 120 caracteres.');
    if (tel && !/^\+?[0-9\s()-]{7,20}$/.test(tel)) throw new Error('Ingresa un teléfono válido o déjalo vacío.');
    const { data, error: err } = await supabase.from('usuarios').update({ nombre: limpio, telefono: tel || null }).eq('id', perfil.id).select('nombre,telefono').single();
    if (err) throw new Error('No se pudieron guardar tus datos. Inténtalo nuevamente.');
    onPerfilActualizado?.(data);
    setMensaje('Tu información se actualizó correctamente.'); setVista('resumen');
  }); };
  const guardarDeportivo = e => { e.preventDefault(); ejecutar('deportivo', async()=>{ const {error:err}=await supabase.from('ath_perfil_deportivo').upsert({...deportivo,usuario_id:perfil.id}); if(err)throw new Error('No pudimos guardar tu perfil deportivo.'); setMensaje('Perfil deportivo guardado.');setVista('resumen'); }); };
  const cambiarCorreo = e => { e.preventDefault(); ejecutar('correo', async () => {
    const email = nuevoCorreo.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Ingresa un correo válido.');
    if (email === correo.toLowerCase()) throw new Error('Ese ya es tu correo actual.');
    const { error: err } = await supabase.auth.updateUser({ email });
    if (err) throw new Error('No pudimos solicitar el cambio de correo. Inténtalo nuevamente.');
    setNuevoCorreo(''); setMensaje('Te enviamos las instrucciones para confirmar tu nuevo correo. Revisa tu bandeja de entrada.'); setVista('resumen');
  }); };
  const cambiarClave = e => { e.preventDefault(); ejecutar('clave', async () => {
    if (clave.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
    if (clave !== confirmacion) throw new Error('Las contraseñas no coinciden.');
    const { error: err } = await supabase.auth.updateUser({ password: clave });
    if (err) throw new Error('No pudimos cambiar tu contraseña. Inténtalo nuevamente.');
    setClave(''); setConfirmacion(''); setMensaje('Tu contraseña se cambió correctamente.'); setVista('resumen');
  }); };
  const rol = perfil.rol_id === 1 ? 'Administrador' : perfil.rol_id === 2 ? 'Entrenador' : 'Deportista';
  const opciones = [
    ...(perfil.rol_id === 3 ? [['deportivo','Perfil deportivo','Deporte, objetivos y preferencias','◎']] : []),
    ['datos','Información personal','Nombre y teléfono','◉'],
    ['correo','Correo electrónico',correo || 'Administrar correo','✉'],
    ['clave','Contraseña y seguridad','Actualiza tu contraseña','◇'],
    ['privacidad','Privacidad y notificaciones','Controla tu conexión y alertas','◇']
  ];
  return <div className="ath-perfil">
    <div className="ath-perfil-hero"><div className="ath-perfil-avatar">{(perfil.nombre || '?').trim().charAt(0).toUpperCase()}</div><div><h2>{perfil.nombre}</h2><p>{rol} · Cuenta Athletix</p></div></div>
    {mensaje && <div className="ath-perfil-ok" role="status">{mensaje}</div>}
    {error && <div className="ath-perfil-error" role="alert">{error}</div>}
    {vista !== 'resumen' && <button type="button" className="ath-perfil-volver" onClick={()=>{setVista('resumen');setError('');}}>← Volver a mi cuenta</button>}
    {vista === 'resumen' && <>
      <div className="ath-perfil-section-title"><h3>Mi cuenta</h3><p>Gestiona tu información y seguridad.</p></div>
      <div className="ath-perfil-menu">{opciones.map(([id,titulo,sub,icono])=><button type="button" className="ath-perfil-menu-item" key={id} onClick={()=>{setVista(id);setError('');setMensaje('');}}><span className="ath-perfil-menu-icon" aria-hidden="true">{icono}</span><span className="ath-perfil-menu-text"><strong>{titulo}</strong><small>{sub}</small></span><span className="ath-perfil-chevron" aria-hidden="true">›</span></button>)}</div>

      <button type="button" className="ath-perfil-logout" onClick={()=>setConfirmarSalida(true)}>↪ Cerrar sesión</button>
    </>}
    {vista === 'deportivo' && <form className="ath-perfil-card" onSubmit={guardarDeportivo}><h3>Perfil deportivo</h3><label>Deporte principal<input maxLength={80} value={deportivo.deporte} onChange={e=>campo('deporte',e.target.value)} placeholder="Ej. fútbol, gimnasio"/></label><label>Experiencia<select value={deportivo.nivel} onChange={e=>campo('nivel',e.target.value)}>{['Principiante','Intermedio','Avanzado'].map(x=><option key={x}>{x}</option>)}</select></label><label>Objetivo<select value={deportivo.objetivo} onChange={e=>campo('objetivo',e.target.value)}>{['Mejorar condición física','Ganar fuerza','Ganar masa muscular','Mejorar rendimiento deportivo','Mantenerme activo'].map(x=><option key={x}>{x}</option>)}</select></label><label>Días de entrenamiento por semana<select value={deportivo.frecuencia} onChange={e=>campo('frecuencia',Number(e.target.value))}>{Array.from({length:8},(_,i)=><option key={i}>{i}</option>)}</select></label><label>Equipamiento, disponibilidad y preferencias<textarea maxLength={400} rows={3} value={deportivo.preferencias} onChange={e=>campo('preferencias',e.target.value)} placeholder="Ej. mancuernas, 30 minutos por la tarde"/></label><label className="ath-perfil-check"><input type="checkbox" checked={deportivo.usar_ia} onChange={e=>campo('usar_ia',e.target.checked)}/> Usar mi perfil para personalizar el asistente de entrenamiento</label><button disabled={!!ocupado || cargaDeportiva} type="submit">{ocupado==='deportivo'?'Guardando…':'Guardar perfil'}</button></form>}
    {vista === 'privacidad' && <form className="ath-perfil-card" onSubmit={e=>{e.preventDefault();ejecutar('privacidad',async()=>{const {error:err}=await supabase.from('ath_preferencias_privacidad').upsert({...privacidad,usuario_id:perfil.id});if(err)throw new Error('No pudimos guardar tus preferencias.');setMensaje('Preferencias guardadas.');setVista('resumen');});}}><h3>Privacidad y notificaciones</h3><label className="ath-perfil-check"><input type="checkbox" checked={privacidad.notificaciones} onChange={e=>setPrivacidad(p=>({...p,notificaciones:e.target.checked}))}/> Recibir nuevas notificaciones</label><p>Incluye alertas dentro de la aplicación y nuevos envíos al teléfono.</p><label className="ath-perfil-check"><input type="checkbox" checked={privacidad.mostrar_conexion} onChange={e=>setPrivacidad(p=>({...p,mostrar_conexion:e.target.checked}))}/> Mostrar mi estado de conexión</label><button type="submit" disabled={!privacidadLista||!!ocupado}>Guardar preferencias</button></form>}
    {vista === 'datos' && <form onSubmit={guardarDatos} className="ath-perfil-card"><h3>Información personal</h3><p>Actualiza los datos que aparecen en tu perfil.</p><label>Nombre y apellido<input value={nombre} maxLength={120} onChange={e=>setNombre(e.target.value)} required /></label><label>Teléfono (opcional)<input type="tel" autoComplete="tel" value={telefono} onChange={e=>setTelefono(e.target.value)} placeholder="+56 9 1234 5678" /></label><button disabled={!!ocupado} type="submit">{ocupado === 'datos' ? 'Guardando…' : 'Guardar cambios'}</button></form>}
    {vista === 'correo' && <form onSubmit={cambiarCorreo} className="ath-perfil-card"><h3>Cambiar correo electrónico</h3><p>Para proteger tu cuenta, es posible que debas confirmar el nuevo correo.</p><label>Correo actual<input value={correo} readOnly type="email" /></label><label>Nuevo correo<input type="email" autoComplete="email" value={nuevoCorreo} onChange={e=>setNuevoCorreo(e.target.value)} placeholder="nombre@correo.cl" required /></label><button disabled={!!ocupado} type="submit">{ocupado === 'correo' ? 'Enviando…' : 'Continuar'}</button></form>}
    {vista === 'clave' && <form onSubmit={cambiarClave} className="ath-perfil-card"><h3>Cambiar contraseña</h3><p>Usa una contraseña nueva de al menos 8 caracteres.</p><label>Nueva contraseña<input type="password" autoComplete="new-password" minLength={8} value={clave} onChange={e=>setClave(e.target.value)} required /></label><label>Confirmar contraseña<input type="password" autoComplete="new-password" minLength={8} value={confirmacion} onChange={e=>setConfirmacion(e.target.value)} required /></label><button disabled={!!ocupado} type="submit">{ocupado === 'clave' ? 'Actualizando…' : 'Guardar contraseña'}</button></form>}
    {confirmarSalida && <div className="ath-perfil-modal-backdrop" role="presentation" onClick={()=>setConfirmarSalida(false)}><div className="ath-perfil-modal" role="dialog" aria-modal="true" aria-label="Confirmar cierre de sesión" onClick={e=>e.stopPropagation()}><h3>¿Cerrar sesión?</h3><p>Podrás volver a ingresar con tu correo y contraseña.</p><button type="button" className="ath-perfil-danger" onClick={onCerrarSesion}>Sí, cerrar sesión</button><button type="button" className="ath-perfil-secondary" onClick={()=>setConfirmarSalida(false)}>Cancelar</button></div></div>}
  </div>;
}
