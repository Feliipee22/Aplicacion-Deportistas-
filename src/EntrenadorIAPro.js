import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import './EntrenadorIAPro.css';
import SeguimientoIA from './SeguimientoIA';
import VideoSugerido from './VideoSugerido';
import EntrenamientoGuiado from './EntrenamientoGuiado';

const OBJETIVOS = ['Mejorar condición física','Ganar fuerza','Ganar masa muscular','Mejorar resistencia','Mejorar velocidad y agilidad','Mejorar rendimiento deportivo','Movilidad y flexibilidad','Reducir grasa corporal (adultos)','Volver gradualmente a la actividad'];
const INICIAL = { edad:'', objetivo:'Mejorar condición física', deporte:'', nivel:'Principiante', experiencia:'', frecuencia:'3', minutos:'45', lugar:'Casa', equipo:'Sin equipamiento', dias:'Lunes, miércoles y viernes', actividadActual:'', otrasSesiones:'', preferencias:'', limitaciones:'', supervisado:false };
const text = (v) => String(v ?? '');
const valido = (plan) => plan && typeof plan.titulo === 'string' && Array.isArray(plan.sesiones) && plan.sesiones.length > 0 && plan.sesiones.every(s => Array.isArray(s.ejercicios));
const normalizar = (p) => ({...p, sesiones:(p.sesiones || []).map((s,i) => ({...s, dia:s.dia || `Sesión ${i+1}`, ejercicios:(s.ejercicios || []).map(e=>({...e}))}))});

function Input({campo,label,placeholder='',type='text',valor,cambio}) {return <label className="aip-field"><span>{label}</span><input type={type} value={valor} placeholder={placeholder} onChange={e=>cambio(campo,e.target.value)}/></label>;}
function Select({campo,label,opciones,valor,cambio}) {return <label className="aip-field"><span>{label}</span><select value={valor} onChange={e=>cambio(campo,e.target.value)}>{opciones.map(o=><option key={o}>{o}</option>)}</select></label>;}

const formatoDuracion = valor => { const n = Math.max(0, Math.round(Number(valor)||0)); return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(v=>String(v).padStart(2,'0')).join(':'); };
export default function EntrenadorIAPro({ programacionInicial = null }) {
 const [segundosGuiados,setSegundosGuiados]=useState(null), [sesionCrono,setSesionCrono]=useState(0), [ultimoRegistro,setUltimoRegistro]=useState(null);
 const [perfil,setPerfil]=useState(INICIAL), [paso,setPaso]=useState(0), [plan,setPlan]=useState(null), [guardados,setGuardados]=useState([]), [cargando,setCargando]=useState(false), [guardando,setGuardando]=useState(false), [error,setError]=useState(''), [mensaje,setMensaje]=useState(''), [vista,setVista]=useState('guardados'), [seleccion,setSeleccion]=useState(0), [planGuardadoId,setPlanGuardadoId]=useState(null), [ejercicioAbierto,setEjercicioAbierto]=useState(null);
 const [programacionActiva,setProgramacionActiva]=useState(null);
 const [fechaProgramada,setFechaProgramada]=useState('');
 const [horaProgramada,setHoraProgramada]=useState('18:00');
 const [programando,setProgramando]=useState(false);
 const [programacionConfirmada,setProgramacionConfirmada]=useState(null);
 const panelRef=useRef(null);
 const menor = Number(perfil.edad)>0 && Number(perfil.edad)<18;
 const cambio=(k,v)=>setPerfil(prev=>({...prev,[k]:v}));
 const cargar=useCallback(async()=>{const {data,error:e}=await supabase.from('planes_entrenamiento_ia').select('id,titulo,objetivo,deporte,perfil,plan,estado,creado_en').order('creado_en',{ascending:false}).limit(40); if(e){setError('No se pudieron cargar los planes: '+e.message);return;}setGuardados(data||[]);},[]);
 useEffect(()=>{cargar();},[cargar]);
 useEffect(() => {
  if (!programacionInicial?.id) return;
  let vigente = true;
  async function abrirProgramacion() {
   setError('');
   const {data,error:e}=await supabase.from('entrenamientos_programados')
    .select('id,plan_id,sesion_indice,estado,planes_entrenamiento_ia(id,plan,perfil,estado)')
    .eq('id',programacionInicial.id).single();
   if (!vigente) return;
   if (e || !data || data.estado !== 'PENDIENTE' || !valido(data.planes_entrenamiento_ia?.plan)) {
    setError('No se pudo abrir esta sesión programada. Comprueba que siga pendiente.'); return;
   }
   const p=data.planes_entrenamiento_ia;
   if (p.estado !== 'ACTIVO' || !p.plan.sesiones[data.sesion_indice]) {
    setError('El plan está archivado o la sesión ya no está disponible.'); return;
   }
   setPlan(normalizar(p.plan));setPlanGuardadoId(data.plan_id);
   setPerfil({...INICIAL,...p.perfil});setSeleccion(data.sesion_indice);
   setProgramacionActiva(data.id);setVista('guiado');
  }
  abrirProgramacion();
  return () => { vigente=false; };
 }, [programacionInicial?.id]);
 const validarPaso=()=>{if(paso===0 && (!Number.isInteger(Number(perfil.edad)) || Number(perfil.edad)<6 || Number(perfil.edad)>100)){setError('Indica una edad válida entre 6 y 100 años.');return false;}if(paso===1 && (!perfil.deporte.trim() || Number(perfil.frecuencia)<1)){setError('Indica tu disciplina o actividad y los días disponibles.');return false;}setError('');return true;};
 async function generar(){if(!validarPaso())return;setCargando(true);setError('');setMensaje('');try{const {data,error:e}=await supabase.functions.invoke('asistente-athletix',{body:{tipo:'plan_entrenamiento',perfil:{...perfil,objetivo:menor && perfil.objetivo.includes('grasa')?'Mejorar condición física':perfil.objetivo}}});if(e){let detalle='';try{detalle=(await e.context?.json())?.error||'';}catch(_){}throw new Error(detalle||e.message||'No se pudo contactar a Gemini.');}if(!valido(data?.plan))throw new Error(data?.error||'La IA no devolvió un plan válido. Reintenta.');setPlan(normalizar(data.plan));setPlanGuardadoId(null);setSeleccion(0);setVista('resultado');}catch(e){setError(e.message||'Error al generar el plan.');}finally{setCargando(false);}}
 async function guardar(){
  if(!valido(plan)||guardando||planGuardadoId!==null)return;
  setGuardando(true);setError('');setMensaje('');
  try{
   const {data:{user},error:e}=await supabase.auth.getUser();
   if(e||!user)throw new Error('Debes iniciar sesión.');
   const {data:insertado,error:db}=await supabase.from('planes_entrenamiento_ia').insert({usuario_id:user.id,titulo:text(plan.titulo).slice(0,150),objetivo:perfil.objetivo,deporte:perfil.deporte,perfil,plan,estado:'ACTIVO'}).select('id').single();
   if(db)throw db;
   setPlanGuardadoId(insertado.id);
   setMensaje('¡Plan guardado! Ya puedes encontrarlo en tu biblioteca de planes.');
   setVista('guardados');
   await cargar();
  }catch(e){setError(e.message||'No se pudo guardar.');}
  finally{setGuardando(false);}
 }
 async function programarSesion(){
  if (!planGuardadoId || !plan?.sesiones?.[seleccion] || !fechaProgramada || programando) return;
  setProgramando(true);setError('');setMensaje('');
  try {
   const {data:{user},error:authError}=await supabase.auth.getUser();
   if(authError || !user) throw new Error('Inicia sesión para programar.');
   const {error:db}=await supabase.from('entrenamientos_programados').insert({
    usuario_id:user.id,plan_id:planGuardadoId,sesion_indice:seleccion,
    fecha_programada:fechaProgramada,hora_programada:horaProgramada || null,estado:'PENDIENTE'
   });
   if(db) throw new Error(db.code==='23505'?'Esta sesión ya está programada para esa fecha.':db.message);
   setProgramacionConfirmada({fecha:fechaProgramada,hora:horaProgramada,titulo:plan.sesiones[seleccion].titulo||'Entrenamiento',sesion:seleccion,planId:planGuardadoId});
   setMensaje('');
  }catch(ex){setError(ex.message||'No se pudo programar la sesión.');}
  finally{setProgramando(false);}
 }
 async function archivar(id,estado){if(!window.confirm(estado==='ACTIVO'?'¿Archivar este plan?':'¿Reactivar este plan?'))return;const {error:e}=await supabase.from('planes_entrenamiento_ia').update({estado:estado==='ACTIVO'?'ARCHIVADO':'ACTIVO'}).eq('id',id);if(e)setError(e.message);else cargar();}
 const actualizarEjercicio=(si,ei,k,v)=>{if(planGuardadoId!==null)return;setPlan(p=>({...p,sesiones:p.sesiones.map((s,i)=>i!==si?s:{...s,ejercicios:s.ejercicios.map((e,j)=>j!==ei?e:{...e,[k]:v})})}));};
 if (vista === 'guardado' && plan && planGuardadoId !== null) return <section className="aip aip-saved-confirmation" aria-live="polite"><div className="aip-saved-check" aria-hidden="true">✓</div><p className="aip-saved-kicker">REGISTRO COMPLETADO</p><h2>¡Entrenamiento guardado!</h2><p>Tu sesión ya está en el historial deportivo.</p><div className="aip-saved-details"><strong>{plan.sesiones[ultimoRegistro?.sesion ?? sesionCrono]?.titulo || plan.sesiones[ultimoRegistro?.sesion ?? sesionCrono]?.dia || 'Tu entrenamiento'}</strong>{ultimoRegistro?.segundos != null && <span>{formatoDuracion(ultimoRegistro.segundos)} registrados</span>}</div><button className="aip-confirm-primary" type="button" onClick={() => {setSegundosGuiados(null);setVista('historial');}}>Ver mi historial</button><button className="aip-confirm-secondary" type="button" onClick={() => {setSegundosGuiados(null);setVista('resultado');}}>Volver a mi plan</button></section>;
 if (vista === 'historial' && plan && planGuardadoId !== null) return <section className="aip aip-register-screen aip-history-screen"><div className="aip-register-top"><button type="button" onClick={() => setVista('resultado')} aria-label="Volver al plan">← Volver al plan</button></div><SeguimientoIA key={`historial-${planGuardadoId}`} planId={planGuardadoId} sesiones={plan.sesiones} estado={guardados.find(p=>p.id===planGuardadoId)?.estado||'ACTIVO'} soloHistorial onRegistrarManual={() => setVista('manual')} /></section>;
 if (vista === 'manual' && plan && planGuardadoId !== null) return <section className="aip aip-register-screen"><div className="aip-register-top"><button type="button" onClick={() => setVista('historial')}>← Mi actividad</button><strong>Registrar actividad</strong><span>Manual</span></div><SeguimientoIA key={`manual-${planGuardadoId}`} planId={planGuardadoId} sesiones={plan.sesiones} estado={guardados.find(p=>p.id===planGuardadoId)?.estado||'ACTIVO'} soloFormulario onGuardado={() => setVista('historial')} /></section>;
 if (vista === 'progreso' && plan && planGuardadoId !== null) return <section className="aip aip-register-screen"><div className="aip-register-top"><button type="button" onClick={() => setVista('resultado')} aria-label="Volver al plan">← Volver al plan</button><strong>Registrar entrenamiento</strong><span>Paso final</span></div><SeguimientoIA key={`${planGuardadoId}-${sesionCrono}-${programacionActiva || 'libre'}`} planId={planGuardadoId} segundosEntrenados={segundosGuiados} sesionEntrenada={sesionCrono} sesiones={plan.sesiones} estado={guardados.find(p=>p.id===planGuardadoId)?.estado||'ACTIVO'} modoRegistroGuiado={segundosGuiados !== null} programacionId={programacionActiva} onGuardado={() => {setUltimoRegistro({sesion:sesionCrono,segundos:segundosGuiados});setSegundosGuiados(null);setProgramacionActiva(null);setVista('guardado');}} /></section>;
 if (vista === 'guiado' && plan && planGuardadoId !== null && plan.sesiones[seleccion]) return <EntrenamientoGuiado key={`${planGuardadoId}-${seleccion}-${programacionActiva || "libre"}`} planId={planGuardadoId} programacionId={programacionActiva} sesionIndex={seleccion} sesion={plan.sesiones[seleccion]} onBack={() => {setProgramacionActiva(null);setVista('resultado');}} onRegister={(segundos) => {setUltimoRegistro(null);setSegundosGuiados(segundos);setSesionCrono(seleccion);setVista('progreso');}}/>;
 return <section className="aip">
  <header className="aip-head"><div className="aip-symbol">✦</div><div><h2>Mis planes de entrenamiento</h2><p>Elige un plan o crea uno nuevo.</p></div></header>
  <nav className="aip-tabs" style={{display:'flex',overflowX:'auto',gap:8,scrollbarWidth:'thin',paddingBottom:5}} aria-label="Secciones del entrenador IA"><button style={{flexShrink:0}} className={vista==='guardados'?'active':''} onClick={()=>{setVista('guardados');cargar();}}>Mis planes ({guardados.length})</button><button style={{flexShrink:0}} className={vista==='crear'?'active':''} onClick={()=>{setVista('crear');setError('');}}>+ Crear plan</button>{plan&&planGuardadoId===null&&<button style={{flexShrink:0}} className={vista==='resultado'?'active':''} onClick={()=>setVista('resultado')}>Plan generado</button>}</nav>
  {error&&<div className="aip-error" role="alert">{error}</div>}{mensaje&&<div className="aip-ok" role="status">{mensaje}</div>}
  {vista==='crear'&&<div className="aip-panel"><div className="aip-progress">Evaluación deportiva · Paso {paso+1} de 3<div className="aip-track"><span style={{width:`${(paso+1)*100/3}%`}}/></div></div>
   {paso===0&&<><h3>Tu perfil y objetivo</h3><p>Estos datos permiten adaptar la carga a tu etapa de desarrollo y experiencia.</p><Input campo="edad" valor={perfil.edad} cambio={cambio} label="Edad (años)" type="number" placeholder="Ej. 24"/><Select campo="objetivo" valor={perfil.objetivo} cambio={cambio} label="Objetivo principal" opciones={menor?OBJETIVOS.filter(o=>!o.includes('grasa')):OBJETIVOS}/><Select campo="nivel" valor={perfil.nivel} cambio={cambio} label="Experiencia deportiva" opciones={['Principiante','Intermedio','Avanzado','Competitivo']}/><Input campo="experiencia" valor={perfil.experiencia} cambio={cambio} label="¿Hace cuánto practicas?" placeholder="Ej. 8 meses, nunca, 4 años"/>{menor&&<div className="aip-note">Para menores: priorizamos técnica, disfrute y desarrollo físico adecuado. La planificación debe revisarse con un adulto y entrenador responsable.</div>}</>}
   {paso===1&&<><h3>Tu semana de entrenamiento</h3><Input campo="deporte" valor={perfil.deporte} cambio={cambio} label="Deporte o actividad principal" placeholder="Ej. patinaje, fútbol, gimnasio"/><Select campo="frecuencia" valor={perfil.frecuencia} cambio={cambio} label="Sesiones disponibles por semana" opciones={['1','2','3','4','5','6']}/><Select campo="minutos" valor={perfil.minutos} cambio={cambio} label="Duración aproximada por sesión" opciones={['20','30','45','60','75','90']}/><Input campo="dias" valor={perfil.dias} cambio={cambio} label="Días disponibles" placeholder="Ej. lunes, miércoles y viernes"/><Input campo="actividadActual" valor={perfil.actividadActual} cambio={cambio} label="Actividad física actual" placeholder="Ej. patino dos veces por semana"/><Input campo="otrasSesiones" valor={perfil.otrasSesiones} cambio={cambio} label="Otros entrenamientos o partidos" placeholder="Ej. fútbol los sábados"/></>}
   {paso===2&&<><h3>Equipamiento y preferencias</h3><Select campo="lugar" valor={perfil.lugar} cambio={cambio} label="Dónde entrenas" opciones={['Casa','Gimnasio','Club deportivo','Aire libre','Mixto']}/><Input campo="equipo" valor={perfil.equipo} cambio={cambio} label="Equipamiento disponible" placeholder="Ej. mancuernas, bandas, bicicleta"/><label className="aip-field"><span>Preferencias y ejercicios que te gustan</span><textarea value={perfil.preferencias} maxLength={400} onChange={e=>cambio('preferencias',e.target.value)} placeholder="Ej. prefiero sesiones variadas, disfruto patinar"/></label><label className="aip-field"><span>Molestias o limitaciones (opcional; evita diagnósticos detallados)</span><textarea value={perfil.limitaciones} maxLength={300} onChange={e=>cambio('limitaciones',e.target.value)} placeholder="Ej. prefiero evitar saltos"/></label><p className="aip-note">Si tienes dolor persistente, una lesión o una condición médica, solicita evaluación profesional antes de iniciar. La IA no determina si un ejercicio es seguro para tu caso.</p>{menor&&<label className="aip-check"><input type="checkbox" checked={perfil.supervisado} onChange={e=>cambio('supervisado',e.target.checked)}/> Un adulto responsable revisará el plan con el deportista.</label>}</>}
   <div className="aip-actions">{paso>0&&<button className="aip-secondary" onClick={()=>{setPaso(p=>p-1);setError('');}}>Anterior</button>}{paso<2?<button className="aip-primary" onClick={()=>{if(validarPaso())setPaso(p=>p+1);}}>Continuar</button>:<button className="aip-primary" disabled={cargando||(menor&&!perfil.supervisado)} onClick={generar}>{cargando?'Generando planificación…':'Generar plan deportivo'}</button>}</div>
  </div>}
  {vista==='resultado'&&plan&&<div className="aip-panel" ref={panelRef}><div className="aip-plan-head"><div><span className="aip-eyebrow">{planGuardadoId!==null?'Plan guardado · Solo lectura':'Plan propuesto por IA · Revisar antes de realizar'}</span><h3>{plan.titulo}</h3><p>{plan.descripcion||'Plan personalizado según tu evaluación.'}</p></div></div><div className="aip-stats"><span>{plan.sesiones.length} sesiones</span><span>{perfil.minutos} min aprox./sesión</span><span>{perfil.nivel}</span></div>{plan.advertencias&&<p className="aip-note">{Array.isArray(plan.advertencias)?plan.advertencias.join(' · '):plan.advertencias}</p>}
   <div className="aip-days" role="tablist" aria-label="Sesiones del plan">{plan.sesiones.map((s,i)=><button key={i} role="tab" aria-selected={seleccion===i} className={seleccion===i?'active':''} onClick={()=>{setSeleccion(i);setEjercicioAbierto(null);setProgramacionConfirmada(null);}}>{s.dia||`Sesión ${i+1}`}</button>)}</div>
   {plan.sesiones[seleccion]&&<div className="aip-session"><div className="aip-session-heading"><span className="aip-eyebrow">SESIÓN {seleccion+1} DE {plan.sesiones.length}</span><h4>{plan.sesiones[seleccion].titulo||'Sesión de entrenamiento'}</h4><p>{plan.sesiones[seleccion].objetivo||''}</p></div>
   {planGuardadoId!==null&&<section className="aip-schedule-card" aria-label="Programar entrenamiento">
    {programacionConfirmada&&programacionConfirmada.sesion===seleccion&&programacionConfirmada.planId===planGuardadoId ? <div className="aip-schedule-success" role="status">
      <div className="aip-schedule-success-icon" aria-hidden="true">✓</div>
      <div className="aip-schedule-success-copy"><span className="aip-schedule-kicker">AGENDADO CORRECTAMENTE</span><h3>¡Tu entrenamiento está programado!</h3><p>{programacionConfirmada.titulo}</p><strong>{programacionConfirmada.fecha.split('-').reverse().join('/')} · {programacionConfirmada.hora}</strong></div>
      <button type="button" className="aip-schedule-button" onClick={()=>window.dispatchEvent(new CustomEvent('athletix:navegar',{detail:{seccion:'actividades',fecha:programacionConfirmada.fecha}}))}>Ver en mi calendario <span aria-hidden="true">→</span></button>
      <button type="button" className="aip-schedule-link" onClick={()=>setProgramacionConfirmada(null)}>Programar otra fecha</button>
    </div> : <>
      <div className="aip-schedule-header"><span className="aip-schedule-symbol" aria-hidden="true">▦</span><div><h3>Agenda tu entrenamiento</h3><p>Elige el día y la hora para esta sesión.</p></div></div>
      <div className="aip-schedule-fields"><label htmlFor="aip-schedule-date">Fecha<input id="aip-schedule-date" type="date" value={fechaProgramada} min={new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10)} onChange={e=>setFechaProgramada(e.target.value)}/></label><label htmlFor="aip-schedule-time">Hora<input id="aip-schedule-time" type="time" value={horaProgramada} onChange={e=>setHoraProgramada(e.target.value)}/></label></div>
      <button type="button" className="aip-schedule-button" disabled={!fechaProgramada||programando} onClick={programarSesion}>{programando?'Guardando…':'Agregar a mi calendario'} <span aria-hidden="true">→</span></button>
    </>}
   </section>}
   {planGuardadoId!==null&&<div className="aip-guided-entry"><strong>¿Listo para entrenar?</strong><p>Sigue tus ejercicios, mira las demostraciones y registra tu progreso al terminar.</p><button type="button" className="aip-primary" onClick={()=>{setProgramacionActiva(null);setVista('guiado');}}>▶ Comenzar entrenamiento guiado</button></div>}
   <details className="aip-extra"><summary>Calentamiento · Ver indicaciones</summary><p>{plan.sesiones[seleccion].calentamiento||'Movilidad y activación gradual, 5–10 minutos.'}</p></details>
   <div className="aip-list-heading"><h4>Ejercicios</h4><span>{plan.sesiones[seleccion].ejercicios.length} en esta sesión</span></div>
   <div className="aip-exercise-list">{plan.sesiones[seleccion].ejercicios.map((e,i)=><article className={'aip-exercise-item '+(ejercicioAbierto===i?'open':'')} key={i}>
   <button type="button" className="aip-exercise-trigger" aria-expanded={ejercicioAbierto===i} onClick={()=>setEjercicioAbierto(ejercicioAbierto===i?null:i)}><span className="aip-exercise-number">{i+1}</span><span className="aip-exercise-summary"><strong>{text(e.nombre)||'Ejercicio'}</strong><small>{text(e.series)} series · {text(e.repeticiones)} rep./tiempo{e.descanso_segundos?` · ${e.descanso_segundos}s descanso`:''}</small></span><span className="aip-exercise-chevron" aria-hidden="true">{ejercicioAbierto===i?'−':'+'}</span></button>
   {ejercicioAbierto===i&&<div className="aip-exercise-detail">{planGuardadoId===null?<><label>Ejercicio<input aria-label="Nombre del ejercicio" value={text(e.nombre)} onChange={ev=>actualizarEjercicio(seleccion,i,'nombre',ev.target.value)}/></label><div className="aip-ex-grid">{[['series','Series'],['repeticiones','Repeticiones / tiempo'],['descanso_segundos','Descanso (s)']].map(([k,l])=><label key={k}>{l}<input aria-label={l} value={text(e[k])} onChange={ev=>actualizarEjercicio(seleccion,i,k,ev.target.value)}/></label>)}</div><label>Indicaciones<textarea aria-label="Indicaciones" value={text(e.indicaciones)} onChange={ev=>actualizarEjercicio(seleccion,i,'indicaciones',ev.target.value)}/></label></>:<div className="aip-read-detail"><strong>Cómo realizarlo</strong><p>{text(e.indicaciones)||'Consulta las indicaciones de tu entrenador.'}</p></div>}<VideoSugerido nombre={e.nombre}/></div>}</article>)}</div>
   <details className="aip-extra"><summary>Vuelta a la calma · Ver indicaciones</summary><p>{plan.sesiones[seleccion].vuelta_calma||'Bajar progresivamente la intensidad.'}</p></details></div>}
  {planGuardadoId!==null&&<div className="aip-actions"><button type="button" className="aip-secondary" onClick={()=>setVista('historial')}>Ver mi actividad</button></div>}
   <div className="aip-actions"><button className="aip-secondary" onClick={()=>setVista('crear')}>Ajustar evaluación</button>{planGuardadoId===null?<button className="aip-primary" onClick={guardar} disabled={guardando}>{guardando?'Guardando…':'Guardar en Mis planes con IA'}</button>:<button className="aip-primary" onClick={()=>{setPlanGuardadoId(null);setMensaje('Estás editando una copia. El plan original no cambiará.');}}>Crear copia editable</button>}</div><p className="aip-foot">Los planes IA son personales y no reemplazan ni modifican las rutinas oficiales de tu entrenador.</p></div>}
  {vista==='progreso'&&planGuardadoId!==null&&<div className="aip-panel"><button type="button" className="aip-secondary" onClick={()=>setVista('resultado')}>← Volver a ejercicios</button><h3>Mi progreso</h3><SeguimientoIA key={planGuardadoId} planId={planGuardadoId} segundosEntrenados={segundosGuiados} sesionEntrenada={sesionCrono} sesiones={plan.sesiones} estado={guardados.find(p=>p.id===planGuardadoId)?.estado||'ACTIVO'}/></div>}
  {vista==='guardados'&&<div className="aip-panel" ref={panelRef}><h3>Tus planes guardados</h3><p>Abre un plan para ver sus sesiones, ejercicios y videos. El seguimiento está en una pantalla aparte.</p>{!guardados.length?<p>Aún no tienes planes guardados. Crea uno desde «Crear plan».</p>:guardados.map(item=><article className="aip-saved" key={item.id}><div><strong>{item.titulo}</strong><small>{item.objetivo} · {new Date(item.creado_en).toLocaleDateString('es-CL')} · {item.estado}</small></div><div className="aip-actions"><button className="aip-secondary" onClick={()=>{setPlan(normalizar(item.plan));setPlanGuardadoId(item.id);setPerfil({...INICIAL,...item.perfil});setSeleccion(0);setVista('resultado');setMensaje('Estás viendo tu plan guardado.');}}>Abrir</button><button className="aip-secondary" onClick={()=>archivar(item.id,item.estado)}>{item.estado==='ACTIVO'?'Archivar':'Reactivar'}</button></div></article>)}</div>}
 </section>;
}
