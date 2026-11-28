import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from './supabase';
import './ReportesAdmin.css';
import AthletixSoporte from './AthletixSoporte';
import AthletixHistorial from './AthletixHistorial';

const fmt = n => Number(n || 0).toLocaleString('es-CL');
const fecha = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const inicioDefecto = () => { const d=new Date(); d.setMonth(d.getMonth()-5,1); return fecha(d); };
const fechaHoy = () => fecha(new Date());
const ESTADOS=['PRESENTE','AUSENTE','JUSTIFICADO'];
function Indicador({titulo,valor,detalle}){return <article className="ath-report-kpi"><span>{titulo}</span><strong>{valor}</strong>{detalle&&<small>{detalle}</small>}</article>}
function Estadisticas({perfil}){
 const [inicio,setInicio]=useState(inicioDefecto);
 const [fin,setFin]=useState(fechaHoy);
 const [cargando,setCargando]=useState(true);
 const [error,setError]=useState('');
 const [datos,setDatos]=useState(null);
 const cargar=useCallback(async()=>{
  if(Number(perfil?.rol_id)!==1)return;
  setCargando(true);setError('');setDatos(null);
  try{
   if(!inicio||!fin||inicio>fin)throw new Error('Selecciona un rango de fechas válido.');
   const {data,error:fallo}=await supabase.rpc('ath_admin_reporte_global',{p_desde:inicio,p_hasta:fin});
   if(fallo)throw fallo;
   if(!data)throw new Error('El servidor no devolvió estadísticas.');
   setDatos(data);

  }catch(e){setError(e?.message||'No se pudieron consultar los reportes.');}
  finally{setCargando(false);}
 },[perfil?.rol_id,inicio,fin]);
 useEffect(()=>{cargar()},[cargar]);
 const resumen=useMemo(()=>{
  if(!datos)return null;
  const estados=Object.fromEntries(ESTADOS.map(e=>[e,Number(datos.estados?.[e]||0)]));
  const total=Number(datos.total_asistencias||0);
  return {deportistas:Number(datos.deportistas||0),entrenadores:Number(datos.entrenadores||0),rutinas:Number(datos.rutinas||0),estados,total,porcentaje:total?Math.round(estados.PRESENTE/total*1000)/10:null,meses:Object.entries(datos.meses||{}).sort(([a],[b])=>a.localeCompare(b))};
 },[datos]);
 if(Number(perfil?.rol_id)!==1)return <p>No tienes acceso a esta sección.</p>;
 return <section className="ath-report" aria-label="Reportes de Athletix">

  <div className="ath-report-filters"><label>Desde<input type="date" value={inicio} max={fin} onChange={e=>setInicio(e.target.value)}/></label><label>Hasta<input type="date" value={fin} min={inicio} onChange={e=>setFin(e.target.value)}/></label><small>Las fechas filtran la asistencia. Usuarios y rutinas muestran su estado actual.</small></div>
  {cargando&&<p className="ath-report-message" role="status">Cargando reportes…</p>}
  {error&&<p className="ath-report-error" role="alert">No se pudieron cargar las estadísticas. Cambia el rango o vuelve a ingresar.</p>}
  {resumen&&<>
   <div className="ath-report-kpis"><Indicador titulo="Deportistas activos" valor={fmt(resumen.deportistas)}/><Indicador titulo="Entrenadores activos" valor={fmt(resumen.entrenadores)}/><Indicador titulo="Rutinas activas" valor={fmt(resumen.rutinas)}/><Indicador titulo="Asistencias registradas" valor={fmt(resumen.total)} detalle="Período seleccionado"/></div>
   <div className="ath-report-panels"><article className="ath-report-panel"><h3>Asistencias por mes</h3><p>Registros individuales del período.</p>{resumen.meses.length===0?<p>Sin registros visibles en este período.</p>:<div className="ath-report-bars">{resumen.meses.map(([mes,cantidad])=><div className="ath-report-bar-row" key={mes}><span>{new Date(mes+"-01T12:00:00").toLocaleDateString("es-CL",{month:"short",year:"numeric"})}</span><div className="ath-report-bar-track" role="img" aria-label={`${cantidad} asistencias en ${mes}`}><div style={{width:`${cantidad/Math.max(1,...resumen.meses.map(x=>x[1]))*100}%`}}/></div><strong>{fmt(cantidad)}</strong></div>)}</div>}</article>
   <article className="ath-report-panel"><h3>Asistencia individual</h3><p>Porcentaje de presentes entre los registros visibles.</p><div className="ath-report-attendance"><div className="ath-ring" style={{background:`conic-gradient(#176b60 ${resumen.porcentaje||0}%, #e8edf0 0)`}}><strong>{resumen.porcentaje===null?'Sin datos':`${resumen.porcentaje.toLocaleString('es-CL')} %`}</strong></div><span>{fmt(resumen.total)} {resumen.total===1?'registro clasificado':'registros clasificados'}</span></div><div className="ath-report-attendance-list">{ESTADOS.map(estado=><div key={estado}><span>{estado==='PRESENTE'?'Presentes':estado==='AUSENTE'?'Ausentes':'Justificados'}</span><strong>{fmt(resumen.estados[estado])}</strong></div>)}</div><small>Un registro por deportista, entrenador y fecha. Los días sin registro no se consideran ausencias.</small></article></div>
  </>}
 </section>
}
const tipos={mensaje:'Mensaje',publicacion:'Publicación',comentario:'Comentario',encuentro:'Encuentro',baja:'Eliminación de cuenta'};
const medidas={advertida:'Advertencia enviada',revisada:'Revisada sin retirar',desestimada:'Desestimada',retirada:'Contenido retirado',gestionada:'Solicitud gestionada'};
function fechaHora(v){return v?new Date(v).toLocaleString('es-CL'):'No registrada';}
function Moderacion({bajas,onCounts}){
 const [pendientes,P]=useState(true),[tipo,T]=useState(''),[pagina,G]=useState(0),[items,I]=useState([]),[cargando,C]=useState(true),[error,E]=useState(''),[revision,R]=useState(0),[seleccion,S]=useState(null),[medida,M]=useState(''),[nota,N]=useState(''),[busy,B]=useState(false);
 useEffect(()=>{let vigente=true;C(true);E('');I([]);(async()=>{try{const {data,error}=await supabase.rpc('ath_admin_listar_denuncias',{p_bajas:bajas,p_pendientes:pendientes,p_tipo:tipo,p_offset:pagina*20});if(error)throw error;if(vigente){I(data.items||[]);onCounts({denuncias:data.pendientes,solicitudes:data.solicitudes});}}catch{if(vigente)E('No pudimos cargar los registros.');}finally{if(vigente)C(false);}})();return()=>{vigente=false;};},[bajas,pendientes,tipo,pagina,revision,onCounts]);
 async function resolver(){if(busy||!medida||nota.trim().length<3)return;if(medida==='retirada'&&!window.confirm('¿Retirar el contenido? Esta acción puede eliminar respuestas asociadas.'))return;B(true);E('');try{const {error}=await supabase.rpc('ath_admin_resolver_denuncia',{p_id:seleccion.id,p_medida:medida,p_nota:nota.trim()});if(error)throw error;S(null);G(0);R(x=>x+1);}catch{E('No se pudo guardar la resolución. Es posible que el contenido ya no esté disponible.');}finally{B(false);}}
 return <section className="ath-report"><div className="ath-mod-filters"><select aria-label="Estado" value={pendientes?'pendiente':'historial'} onChange={e=>{P(e.target.value==='pendiente');G(0);S(null);}}><option value="pendiente">Pendientes</option><option value="historial">Historial</option></select>{!bajas&&<select aria-label="Tipo" value={tipo} onChange={e=>{T(e.target.value);G(0);S(null);}}><option value="">Todos los tipos</option>{Object.entries(tipos).filter(([k])=>k!=='baja').map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>}</div>
 {error&&<p role="alert" className="ath-report-error">{error} <button onClick={()=>R(x=>x+1)}>Reintentar</button></p>}{cargando&&<p role="status">Cargando…</p>}{!cargando&&!error&&!items.length&&<div className="ath-report-panel"><div className="ath-mod-empty"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 4h16l2 10v6H2v-6L4 4Z M2 14h6l2 3h4l2-3h6"/></svg><strong>No hay {bajas?'solicitudes':'denuncias'} {pendientes?'pendientes':'resueltas'}</strong><small>{pendientes?(bajas?'Las solicitudes de eliminación de cuentas aparecerán aquí.':'Las nuevas denuncias aparecerán aquí.'):'Las resoluciones guardadas aparecerán aquí.'}</small></div></div>}
 {items.slice(0,20).map(x=><article className="ath-report-panel ath-mod-item" key={x.id}><div className="ath-mod-head"><strong>{tipos[x.tipo]||'Denuncia'}</strong><span className={'ath-mod-status '+(x.estado==='pendiente'?'pending':'')}>{x.estado==='pendiente'?'Pendiente':medidas[x.medida]||'Revisada'}</span></div><small>{fechaHora(x.creado_en)}</small><dl><dt>{bajas?'Solicitante':'Denunciado por'}</dt><dd>{x.denunciante||'Usuario no disponible'}</dd>{!bajas&&<><dt>Autor denunciado</dt><dd>{x.denunciado||'Usuario no disponible'}</dd></>}</dl><div className="ath-mod-evidence"><small>Motivo</small><p>{x.motivo}</p>{!bajas&&<><small>Contenido denunciado</small><p>{x.evidencia||'No disponible'}</p></>}</div>{x.estado==='pendiente'?<button className="ath-mod-primary" onClick={()=>{S(x);M('');N('');E('');}}>{bajas?'Gestionar solicitud':'Resolver denuncia'}</button>:<div className="ath-mod-history"><small>Resolución: {fechaHora(x.resuelto_en)} · {x.responsable||'No registrado'}</small><p>{x.nota_resolucion||'Sin nota de resolución'}</p></div>}</article>)}
 {(pagina>0||items.length>20)&&<div className="ath-mod-filters"><button disabled={!pagina||cargando} onClick={()=>G(x=>x-1)}>Anterior</button><span>Página {pagina+1}</span><button disabled={items.length<=20||cargando} onClick={()=>G(x=>x+1)}>Siguiente</button></div>}
 {seleccion&&<div className="ath-mod-overlay" role="dialog" aria-modal="true" aria-label="Resolver solicitud"><div className="ath-report-panel ath-mod-dialog"><h3>{bajas?'Gestionar solicitud':'Resolver denuncia'}</h3>{bajas&&<p>Gestionar no elimina la cuenta. Verifica la solicitud y realiza la eliminación desde Usuarios si corresponde.</p>}<fieldset className="ath-mod-options"><legend>Medida administrativa</legend>{[['desestimada','Desestimar denuncia'],...(bajas?[['gestionada','Registrar gestión realizada']]:[['revisada','Marcar como revisada'],...(seleccion.puede_advertir?[['advertida','Advertir al usuario']]:[]),...(seleccion.puede_retirar?[['retirada','Retirar contenido']]:[])])].map(([valor,texto])=><label key={valor}><input type="radio" name="ath-medida" value={valor} checked={medida===valor} onChange={()=>M(valor)} disabled={busy}/><span>{bajas&&valor==='desestimada'?'Desestimar solicitud':texto}</span></label>)}</fieldset><label>Motivo de resolución<textarea placeholder="Escribe el motivo de la decisión…" value={nota} maxLength={1000} onChange={e=>N(e.target.value)} disabled={busy}/></label>{error&&<p role="alert">{error}</p>}<div className="ath-mod-filters"><button className="ath-mod-cancel" disabled={busy} onClick={()=>S(null)}>Cancelar</button><button className="ath-mod-primary" disabled={busy||!medida||nota.trim().length<3} onClick={resolver}>{busy?'Guardando…':'Guardar resolución'}</button></div></div></div>}
 </section>;
}
export default function ReportesAdmin({perfil}){
 const [tab,T]=useState('stats'),[counts,C]=useState({});
 const raiz=useRef(null);
 function cambiarTab(k){if(k===tab)return;T(k);window.scrollTo({top:0,left:0,behavior:'auto'});let el=raiz.current?.parentElement;while(el){if(el.scrollTop>0)el.scrollTop=0;el=el.parentElement;}}
 useEffect(()=>{let vivo=true;if(Number(perfil?.rol_id)===1)supabase.rpc('ath_admin_listar_denuncias',{p_bajas:false,p_pendientes:true,p_tipo:'',p_offset:0}).then(({data,error})=>{if(vivo&&!error&&data)C({denuncias:data.pendientes,solicitudes:data.solicitudes});});return()=>{vivo=false;};},[perfil?.rol_id]);
 if(Number(perfil?.rol_id)!==1)return null;
 return <div className="ath-report ath-report-root" ref={raiz}><nav className="ath-mod-tabs" aria-label="Secciones de reportes">{[['stats','Estadísticas'],['denuncias','Denuncias'],['solicitudes','Solicitudes'],['soporte','Soporte'],['historial','Historial']].map(([k,v])=><button key={k} aria-pressed={tab===k} onClick={()=>cambiarTab(k)}>{v}{counts[k]>0&&<span>{counts[k]}</span>}</button>)}</nav>{tab==='stats'?<Estadisticas perfil={perfil}/>:tab==='historial'?<AthletixHistorial/>:tab==='soporte'?<AthletixSoporte admin/>:<Moderacion key={tab} bajas={tab==='solicitudes'} onCounts={C}/>}</div>;
}
