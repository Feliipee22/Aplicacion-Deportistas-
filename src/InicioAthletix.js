import React, {useEffect,useState} from 'react';
import {supabase} from './supabase';
import './InicioAthletix.css';
const localDate = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
export default function InicioAthletix({perfil,onNavegar}) {
 const [datos,setDatos]=useState({cargando:true,sesiones:0,minutos:0,comidas:0,asistencias:0,proxima:null,reciente:null,error:''});
 useEffect(()=>{let activo=true;async function cargar(){
  const ahora=new Date(),inicio=new Date(ahora);inicio.setDate(ahora.getDate()-((ahora.getDay()+6)%7));inicio.setHours(0,0,0,0);
  const inicioSemana=localDate(inicio),hoy=localDate(ahora);
  const consultas=await Promise.allSettled([
   supabase.from('sesiones_entrenamiento_ia').select('fecha,duracion_minutos').eq('usuario_id',perfil.id).gte('fecha',inicioSemana).order('fecha',{ascending:false}).limit(100),
   supabase.from('alimentacion_registros').select('id').eq('usuario_id',perfil.id).eq('fecha',hoy),
   supabase.from('asistencias').select('estado_asistencia,fecha_registro').eq('deportista_id',perfil.id).eq('estado_asistencia','PRESENTE').gte('fecha_registro',inicio.toISOString()).limit(100),
   supabase.from('actividades').select('titulo,fecha_hora').gte('fecha_hora',ahora.toISOString()).order('fecha_hora',{ascending:true}).limit(1)
  ]);
  const extraer=i=>consultas[i].status==='fulfilled'&&!consultas[i].value.error?consultas[i].value.data||[]:null;
  const ses=extraer(0),com=extraer(1),asi=extraer(2),act=extraer(3);
  if(activo)setDatos({cargando:false,sesiones:ses?.length??null,minutos:ses?ses.reduce((a,s)=>a+(s.duracion_minutos||0),0):null,comidas:com?.length??null,asistencias:asi?.length??null,proxima:act?.[0]||null,reciente:ses?.[0]||null,error:!ses&&!com&&!asi?'No se pudieron cargar las estadísticas.':''});
 }cargar();return()=>{activo=false;};},[perfil.id]);
 const nombre=perfil.nombre?.trim().split(/\s+/)[0]||'deportista';
 const metricas=perfil.rol_id===3?[
  ['Sesiones esta semana',datos.sesiones,'rutinas'],['Minutos entrenados',datos.minutos,'rutinas'],['Asistencias esta semana',datos.asistencias,'asistencia'],['Comidas de hoy',datos.comidas,'alimentacion']
 ]:perfil.rol_id===2?[
  ['Sesiones personales',datos.sesiones,'rutinas'],['Minutos entrenados',datos.minutos,'rutinas'],['Comidas de hoy',datos.comidas,'alimentacion']
 ]:[];
 return <section className="ath-home"><div className="ath-home-welcome"><span>{perfil.rol_id===1?'ADMINISTRACIÓN ATHLETIX':'RESUMEN DE ACTIVIDAD'}</span><h2>¡Hola, {nombre}!</h2><p>{new Date().toLocaleDateString('es-CL',{weekday:'long',day:'numeric',month:'long'})} · {perfil.rol_id===1?'Panel de control de la plataforma':'Tu espacio deportivo en Athletix'}</p></div>
 {perfil.rol_id===1?<>
 <div className="ath-admin-hero"><div><span className="ath-admin-eyebrow">CENTRO DE CONTROL</span><h3>Tu plataforma, en un solo lugar.</h3><p>Gestiona la comunidad, revisa los reportes y mantén Athletix al día.</p></div><button type="button" onClick={()=>onNavegar('reportes')}>Explorar reportes <span aria-hidden="true">→</span></button></div>
 <div className="ath-admin-section-title"><h3>Accesos rápidos</h3><p>Selecciona una sección para comenzar.</p></div>
 <div className="ath-admin-links">
  <button type="button" onClick={()=>onNavegar('usuarios')}><span className="ath-admin-link-icon" aria-hidden="true">♙</span><span><strong>Usuarios</strong><small>Consultar y gestionar cuentas</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
  <button type="button" onClick={()=>onNavegar('reportes')}><span className="ath-admin-link-icon" aria-hidden="true">▥</span><span><strong>Reportes</strong><small>Indicadores de la plataforma</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
  <button type="button" onClick={()=>onNavegar('avisos')}><span className="ath-admin-link-icon" aria-hidden="true">✉</span><span><strong>Avisos</strong><small>Comunicados y convocatorias</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
  <button type="button" onClick={()=>onNavegar('mapa')}><span className="ath-admin-link-icon" aria-hidden="true">⌖</span><span><strong>Athletix Match</strong><small>Encuentros y moderación del muro público</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
  <button type="button" onClick={()=>onNavegar('comunidad')}><span className="ath-admin-link-icon" aria-hidden="true">☰</span><span><strong>Comunidad</strong><small>Chat general y moderación pública</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
  <button type="button" onClick={()=>onNavegar('ejercicios')}><span className="ath-admin-link-icon" aria-hidden="true">▷</span><span><strong>Gestión de videos</strong><small>Revisar videos de ejercicios</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
  <button type="button" onClick={()=>onNavegar('actividades')}><span className="ath-admin-link-icon" aria-hidden="true">▦</span><span><strong>Calendario</strong><small>Consultar actividades deportivas</small></span><span className="ath-admin-chevron" aria-hidden="true">→</span></button>
 </div>

 </>:<>
 <div className="ath-home-panel"><span>PRÓXIMA ACTIVIDAD</span><h3>{datos.cargando?'Consultando calendario…':datos.proxima?.titulo||'Sin actividades próximas registradas'}</h3><p>{datos.proxima?.fecha_hora?new Date(datos.proxima.fecha_hora).toLocaleString('es-CL',{dateStyle:'medium',timeStyle:'short'}):'Revisa tu calendario para organizar la semana.'}</p><button onClick={()=>onNavegar('actividades')}>Abrir calendario</button></div>
 <h3>Tu semana en números</h3><div className="ath-home-stats">{metricas.map(([label,value,dest])=><button key={label} onClick={()=>onNavegar(dest)}><strong>{datos.cargando?'…':value??'—'}</strong><span>{label}</span></button>)}</div>
 <div className="ath-home-activity"><h3>Actividad reciente</h3>{datos.reciente?<p>Última sesión registrada: {new Date(`${datos.reciente.fecha}T12:00:00`).toLocaleDateString('es-CL')} · {datos.reciente.duracion_minutos??'Sin duración'} min</p>:<p>{datos.cargando?'Cargando actividad…':'Aún no hay entrenamientos personales registrados esta semana.'}</p>}</div></>}
 {datos.error&&<p role="status">{datos.error}</p>}{perfil.rol_id!==1&&<small>Los datos de actividad se actualizan según la información disponible en tu cuenta.</small>}</section>;
}
