import React, {useState, useRef} from 'react';
import {supabase} from './supabase';
import './ConsultaAthletixIA.css';
const sugerencias={entrenamiento:['¿Cómo caliento antes de entrenar?','¿Cómo adapto un ejercicio sin equipamiento?','¿Cómo organizo mi recuperación?'],alimentacion:['¿Qué puedo comer antes de entrenar?','¿Cómo me hidrato durante el ejercicio?','¿Qué opciones de comida puedo preparar después de entrenar?']};
export default function ConsultaAthletixIA({tipo='entrenamiento',perfil={}}){
 const [abierto,setAbierto]=useState(false),[pregunta,setPregunta]=useState(''),[historial,setHistorial]=useState([]),[ocupado,setOcupado]=useState(false),[error,setError]=useState(''),[usarContexto,setUsarContexto]=useState(false);
 const bloqueo=useRef(false);
 async function enviar(e){e.preventDefault();const q=pregunta.trim();if(!q||bloqueo.current)return;bloqueo.current=true;setOcupado(true);setError('');
 try{const {data:{user},error:auth}=await supabase.auth.getUser();if(auth||!user)throw new Error('Inicia sesión nuevamente.');
 const contexto=[];
 if(usarContexto&&tipo==='entrenamiento'){
 const {data:a,error:ae}=await supabase.from('rutina_usuario').select('rutina_id').eq('usuario_id',user.id).eq('activo',true).limit(10);
 if(ae)throw new Error('No se pudo consultar tu rutina. Puedes desactivar el contexto e intentar nuevamente.');
 const ids=[...new Set((a||[]).map(x=>x.rutina_id).filter(x=>x!=null))];
 if(ids.length){const {data:r,error:re}=await supabase.from('rutinas').select('nombre,descripcion').in('id',ids).eq('estado','ACTIVA');if(re)throw new Error('No se pudo consultar tu rutina.');contexto.push('Rutinas asignadas: '+(r||[]).map(x=>x.nombre+': '+(x.descripcion||'')).join('; '));}
 const {data:p,error:pe}=await supabase.from('entrenamientos_programados').select('fecha_programada,hora_programada,estado').eq('usuario_id',user.id).eq('estado','PENDIENTE').gte('fecha_programada',new Date().toLocaleDateString('sv-SE')).order('fecha_programada').limit(5);if(!pe&&p?.length)contexto.push('Próximas sesiones: '+p.map(x=>x.fecha_programada+' '+(x.hora_programada||'')).join(', '));
 }
 const edad=Number(perfil.edad);const adulto=edad>=18;
 const anterior=historial.slice(-1).map(x=>'Consulta anterior: '+x.q+'; respuesta anterior: '+x.r.slice(0,180)).join('');
 const preferencias=[anterior, ...contexto].filter(Boolean).join('\n').slice(0,400);
 const {data,error:err}=await supabase.functions.invoke('asistente-athletix',{body:{tipo,objetivo:perfil.objetivo||'Mejorar rendimiento deportivo',edadGrupo:adulto?'adulto':'menor',nivel:perfil.nivel||'Principiante',deporte:String(perfil.deporte||'').slice(0,80),frecuencia:String(perfil.frecuencia||perfil.sesiones||'3'),preferencias,pregunta:q.slice(0,500)}});
 if(err){let detalle='';try{detalle=(await err.context?.json())?.error||'';}catch(_){}throw new Error(detalle||'No se pudo obtener una respuesta.');}if(typeof data?.respuesta!=='string'||!data.respuesta.trim())throw new Error('El asistente no devolvió una respuesta de texto.');setHistorial(h=>[...h,{q,r:data.respuesta}].slice(-8));setPregunta('');
 }catch(e){setError(e.message||'No se pudo consultar.');}finally{bloqueo.current=false;setOcupado(false);}}
 return <section className="consulta-ath" aria-label="Consulta rápida con IA"><button type="button" className="consulta-ath-toggle" aria-expanded={abierto} onClick={()=>setAbierto(v=>!v)}><span>✦ Pregúntale a Athletix IA</span><span>{abierto?'−':'+'}</span></button>{abierto&&<div className="consulta-ath-body"><p>Resuelve dudas sin crear un plan nuevo. Las respuestas son orientativas.</p>{!historial.length&&<div className="consulta-ath-chips">{sugerencias[tipo].map(s=><button type="button" key={s} onClick={()=>setPregunta(s)}>{s}</button>)}</div>}<div aria-live="polite" className="consulta-ath-chat">{historial.map((m,i)=><div key={i}><p className="consulta-ath-user">{m.q}</p><p className="consulta-ath-answer">{m.r}</p></div>)}</div><form onSubmit={enviar}><textarea aria-label="Tu pregunta" placeholder="Escribe tu pregunta…" maxLength={500} rows={2} value={pregunta} onChange={e=>setPregunta(e.target.value)} disabled={ocupado}/>{tipo==='entrenamiento'&&<label className="consulta-ath-check"><input type="checkbox" checked={usarContexto} onChange={e=>setUsarContexto(e.target.checked)} disabled={ocupado}/> Incluir mis rutinas y próximas sesiones en la consulta</label>}<button type="submit" disabled={ocupado||!pregunta.trim()}>{ocupado?'Consultando…':'Enviar pregunta'}</button></form>{error&&<p role="alert">{error}</p>}<button type="button" className="consulta-ath-clear" disabled={ocupado} onClick={()=>{setHistorial([]);setError('');setPregunta('');}}>Limpiar conversación</button><small>No compartas datos médicos sensibles. Se envía la pregunta y, si lo autorizas, el contexto indicado al proveedor de IA. No modifica tus planes.</small></div>}</section>;
}
