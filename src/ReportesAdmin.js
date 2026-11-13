import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './ReportesAdmin.css';

const fmt = n => Number(n || 0).toLocaleString('es-CL');
const fecha = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const inicioDefecto = () => { const d=new Date(); d.setMonth(d.getMonth()-5,1); return fecha(d); };
const fechaHoy = () => fecha(new Date());
const ESTADOS=['PRESENTE','AUSENTE','JUSTIFICADO'];
async function consultarTodo(crear, limite=10000) {
 const filas=[]; const tam=500;
 for(let desde=0;desde<limite;desde+=tam){
  const {data,error}=await crear().range(desde,desde+tam-1);
  if(error)throw error;
  filas.push(...(data||[]));
  if((data||[]).length<tam)return {filas,incompleto:false};
 }
 return {filas,incompleto:true};
}
function Indicador({titulo,valor,detalle}){return <article className="ath-report-kpi"><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>}
export default function ReportesAdmin({perfil}){
 const [inicio,setInicio]=useState(inicioDefecto);
 const [fin,setFin]=useState(fechaHoy);
 const [revision,setRevision]=useState(0);
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
 useEffect(()=>{cargar()},[cargar,revision]);
 const resumen=useMemo(()=>{
  if(!datos)return null;
  const estados=Object.fromEntries(ESTADOS.map(e=>[e,Number(datos.estados?.[e]||0)]));
  const total=Number(datos.total_asistencias||0);
  return {deportistas:Number(datos.deportistas||0),entrenadores:Number(datos.entrenadores||0),rutinas:Number(datos.rutinas||0),estados,total,porcentaje:total?Math.round(estados.PRESENTE/total*1000)/10:null,meses:Object.entries(datos.meses||{}).sort(([a],[b])=>a.localeCompare(b))};
 },[datos]);
 if(Number(perfil?.rol_id)!==1)return <p>No tienes acceso a esta sección.</p>;
 return <section className="ath-report" aria-label="Reportes de Athletix">
  <div className="ath-report-intro"><div><p>Resumen de deportistas, entrenadores, rutinas y asistencias individuales.</p><small>Indicadores generales de Athletix. Actualiza para consultar los últimos datos.</small></div><button type="button" onClick={()=>setRevision(n=>n+1)} disabled={cargando}>Actualizar datos</button></div>
  <div className="ath-report-filters"><label>Desde<input type="date" value={inicio} max={fin} onChange={e=>setInicio(e.target.value)}/></label><label>Hasta<input type="date" value={fin} min={inicio} onChange={e=>setFin(e.target.value)}/></label><small>Las fechas filtran la asistencia. Usuarios y rutinas muestran su estado actual.</small></div>
  {cargando&&<p className="ath-report-message" role="status">Cargando reportes…</p>}
  {error&&<p className="ath-report-error" role="alert">No se pudo cargar el reporte: {error}</p>}
  {resumen&&<>
   <div className="ath-report-kpis"><Indicador titulo="Deportistas activos" valor={fmt(resumen.deportistas)} detalle="Estado actual"/><Indicador titulo="Entrenadores activos" valor={fmt(resumen.entrenadores)} detalle="Estado actual"/><Indicador titulo="Rutinas activas" valor={fmt(resumen.rutinas)} detalle="Estado actual"/><Indicador titulo="Asistencias registradas" valor={fmt(resumen.total)} detalle="Período seleccionado"/></div>
   <div className="ath-report-panels"><article className="ath-report-panel"><h3>Asistencias por mes</h3><p>Registros individuales del período.</p>{resumen.meses.length===0?<p>Sin registros visibles en este período.</p>:<div className="ath-report-bars">{resumen.meses.map(([mes,cantidad])=><div className="ath-report-bar-row" key={mes}><span>{mes}</span><div className="ath-report-bar-track" role="img" aria-label={`${cantidad} asistencias en ${mes}`}><div style={{width:`${cantidad/Math.max(1,...resumen.meses.map(x=>x[1]))*100}%`}}/></div><strong>{fmt(cantidad)}</strong></div>)}</div>}</article>
   <article className="ath-report-panel"><h3>Asistencia individual</h3><p>Porcentaje de presentes entre los registros visibles.</p><div className="ath-report-attendance"><strong>{resumen.porcentaje===null?'Sin datos':`${resumen.porcentaje.toLocaleString('es-CL')} %`}</strong><span>{fmt(resumen.total)} registros clasificados</span></div><div className="ath-report-attendance-list">{ESTADOS.map(estado=><div key={estado}><span>{estado==='PRESENTE'?'Presentes':estado==='AUSENTE'?'Ausentes':'Justificados'}</span><strong>{fmt(resumen.estados[estado])}</strong></div>)}</div><small>Un registro por deportista, entrenador y fecha. Los días sin registro no se consideran ausencias.</small></article></div>
  </>}
 </section>
}
