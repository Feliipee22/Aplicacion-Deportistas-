import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import './MiAsistencia.css';
const etiquetaEstado={PRESENTE:'Presente',AUSENTE:'Ausente',JUSTIFICADO:'Justificado'};
export default function MiAsistencia({usuarioId}){
 const [datos,setDatos]=useState([]),[error,setError]=useState(''),[cargando,setCargando]=useState(true);
 async function cargar(){setCargando(true);setError('');const {data,error:e}=await supabase.from('ath_asistencia_individual').select('id,fecha,estado,observacion').eq('deportista_id',usuarioId).order('fecha',{ascending:false}).limit(200);if(e)setError('No se pudieron cargar tus asistencias.');else setDatos(data||[]);setCargando(false);}
 useEffect(()=>{if(usuarioId)cargar();},[usuarioId]); // eslint-disable-line react-hooks/exhaustive-deps
 const presentes=datos.filter(r=>r.estado==='PRESENTE').length;
 const ausentes=datos.filter(r=>r.estado==='AUSENTE').length;
 const justificados=datos.filter(r=>r.estado==='JUSTIFICADO').length;
 return <section className="ath-attendance"><div className="ath-attendance-intro"><div><p className="ath-attendance-eyebrow">Registro de entrenamientos</p><p>Revisa las asistencias registradas por tu entrenador.</p></div><button type="button" onClick={cargar} disabled={cargando}>↻ Actualizar</button></div>
 {error&&<p role="alert" className="ath-attendance-error">{error}</p>}
 {cargando?<div className="ath-attendance-empty">Cargando tus registros…</div>:datos.length===0?<div className="ath-attendance-empty"><span aria-hidden="true">▦</span><h3>Aún no hay asistencias</h3><p>Cuando tu entrenador registre una sesión, podrás verla aquí con su fecha y estado.</p></div>:<><div className="ath-attendance-stats"><div><strong>{presentes}</strong><span>Presentes</span></div><div><strong>{ausentes}</strong><span>Ausencias</span></div><div><strong>{justificados}</strong><span>Justificadas</span></div></div><h3 className="ath-attendance-title">Historial</h3><div className="ath-attendance-history">{datos.map(r=><article key={r.id}><div><strong>{new Date(r.fecha+'T12:00:00').toLocaleDateString('es-CL',{day:'numeric',month:'long',year:'numeric'})}</strong>{r.observacion&&<p>{r.observacion}</p>}</div><span className={'ath-attendance-status '+(r.estado||'').toLowerCase()}>{etiquetaEstado[r.estado]||r.estado||'Sin estado'}</span></article>)}</div></>}
 </section>;
}
