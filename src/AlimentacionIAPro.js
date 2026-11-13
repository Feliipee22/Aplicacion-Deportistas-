import React, { useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import './AlimentacionIAPro.css';

const inicial = { peso: '', altura: '', edad: '', objetivo: 'Mejorar rendimiento deportivo', deporte: '', actividad: 'Moderada', sesiones: '3', duracion: '60', horario: '', comidas: '4', restricciones: '', alimentos: '', presupuesto: '', tiempoCocina: '30', contexto: '', supervisado: false };
const fecha = d => new Date(d).toLocaleDateString('es-CL');
const errorTexto = async err => {
  try { const r = await err?.context?.json(); if (r?.error) return r.error; } catch (_) { /* no JSON */ }
  return err?.message || 'No fue posible completar la solicitud.';
};
const numero = v => Number(v);
export default function AlimentacionIAPro() {
  const [perfil, setPerfil] = useState(inicial);
  const [paso, setPaso] = useState(0);
  const [vista, setVista] = useState('crear');
  const [plan, setPlan] = useState(null);
  const [guardados, setGuardados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [dia, setDia] = useState(0);
  const [idActual, setIdActual] = useState(null);
  const arriba = useRef(null);
  const cambiar = (k,v) => setPerfil(p => ({...p,[k]:v}));
  const subir = () => requestAnimationFrame(() => arriba.current?.scrollIntoView({behavior:'smooth',block:'start'}));
  const cargar = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const {data,error:err} = await supabase.from('planes_alimentacion_ia').select('id, titulo, objetivo, plan, created_at').eq('usuario_id',user.id).order('created_at',{ascending:false}).limit(40);
    if (err) { setError('No se pudo consultar los planes guardados: '+err.message); return; }
    setGuardados(data || []);
  };
  useEffect(() => { cargar(); }, []);
  const edad = numero(perfil.edad);
  const menor = edad >= 6 && edad < 18;
  const avanzar = () => {
    setError('');
    if (paso === 0 && (!Number.isInteger(edad) || edad < 6 || edad > 100)) return setError('Indica una edad válida entre 6 y 100 años.');
    if (paso === 0 && menor && !perfil.supervisado) return setError('Para menores, un adulto responsable debe revisar las recomendaciones.');
    if (paso === 1 && (!Number.isInteger(numero(perfil.sesiones)) || numero(perfil.sesiones)<0 || numero(perfil.sesiones)>14)) return setError('Revisa la cantidad de entrenamientos.');
    setPaso(x=>Math.min(2,x+1)); subir();
  };
  const generar = async () => {
    if ((perfil.peso && (Number(perfil.peso)<25 || Number(perfil.peso)>350)) || (perfil.altura && (Number(perfil.altura)<100 || Number(perfil.altura)>230))) {setError('Revisa el peso o altura ingresados.');return;} 
    if (cargando) return;
    setError(''); setMensaje(''); setCargando(true);
    try {
      const {data,error:err} = await supabase.functions.invoke('asistente-athletix',{body:{tipo:'plan_alimentacion',perfil:{...perfil, contexto: [perfil.contexto, edad>=18 && perfil.peso ? `Peso declarado: ${perfil.peso} kg` : '', edad>=18 && perfil.altura ? `Altura declarada: ${perfil.altura} cm` : ''].filter(Boolean).join('. ').slice(0,350), edad, sesiones:numero(perfil.sesiones),duracion:numero(perfil.duracion),comidas:numero(perfil.comidas),tiempoCocina:numero(perfil.tiempoCocina)}}});
      if (err) throw new Error(await errorTexto(err));
      if (data?.error) throw new Error(data.error);
      if (!data?.plan || !Array.isArray(data.plan.dias)) throw new Error('La IA no entregó un menú válido.');
      setPlan(data.plan); setIdActual(null); setDia(0); setVista('plan'); subir();
    } catch (e) { setError(e.message || 'No se pudo generar el menú.'); subir(); }
    finally { setCargando(false); }
  };
  const guardar = async () => {
    if (!plan || guardando || idActual) return;
    setGuardando(true); setError(''); setMensaje('');
    try {
      const {data:{user}} = await supabase.auth.getUser();
      if (!user) throw new Error('Inicia sesión para guardar tu plan.');
      const {data,error:err} = await supabase.from('planes_alimentacion_ia').insert({usuario_id:user.id,titulo:String(plan.titulo).slice(0,160),objetivo:perfil.objetivo,plan}).select('id').single();
      if (err) throw err;
      setIdActual(data.id); setMensaje('Plan guardado en Mis menús con IA.'); await cargar();
    } catch(e) { setError(e.message || 'No se pudo guardar el plan.'); }
    finally {setGuardando(false);}
  };
  const abrir = r => {setPlan(r.plan);setIdActual(r.id);setDia(0);setVista('plan');setMensaje('');setError('');subir();};
  const eliminar = async r => {
    if (!window.confirm('¿Eliminar este menú guardado?')) return;
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) return;
    const {error:err} = await supabase.from('planes_alimentacion_ia').delete().eq('id',r.id).eq('usuario_id',user.id);
    if (err) setError(err.message); else {if(idActual===r.id){setPlan(null);setIdActual(null);setVista('guardados');}await cargar();}
  };
  const campo = (etiqueta,key,props={}) => <label className="nut-field"><span>{etiqueta}</span><input value={perfil[key]} onChange={e=>cambiar(key,e.target.value)} {...props}/></label>;
  const opciones = (etiqueta,key,lista) => <label className="nut-field"><span>{etiqueta}</span><select value={perfil[key]} onChange={e=>cambiar(key,e.target.value)}>{lista.map(x=><option key={x} value={x}>{x}</option>)}</select></label>;
  return <section className="nut-pro" ref={arriba} aria-label="Planificador de alimentación Athletix">
    <div className="nut-hero"><span className="nut-icon">✦</span><div><span className="nut-kicker">ATHLETIX · NUTRICIÓN DEPORTIVA</span><h2>Alimentación inteligente</h2><p>Menús personalizados según tu objetivo, deporte, horarios y preferencias.</p></div></div>
    <div className="nut-tabs"><button className={vista==='crear'?'active':''} onClick={()=>{setVista('crear');subir();}}>Crear menú</button><button className={vista==='guardados'?'active':''} onClick={()=>{setVista('guardados');cargar();subir();}}>Mis menús ({guardados.length})</button>{plan&&<button className={vista==='plan'?'active':''} onClick={()=>{setVista('plan');subir();}}>Menú generado</button>}</div>
    {error&&<p className="nut-error" role="alert">{error}</p>}{mensaje&&<p className="nut-ok" role="status">{mensaje}</p>}
    {vista==='crear'&&<div className="nut-panel"><div className="nut-step">EVALUACIÓN NUTRICIONAL · PASO {paso+1} DE 3 <div className="nut-progress"><i style={{width:`${(paso+1)/3*100}%`}}/></div></div>
      {paso===0&&<><h3>Tu objetivo y etapa de vida</h3><p className="nut-hint">Usamos tu edad y objetivo para orientar las recomendaciones. El peso y la altura son opcionales para adultos. No se usarán para prescribir dietas restrictivas.</p><div className="nut-grid">{campo('Edad (años)','edad',{type:'number',min:6,max:100,placeholder:'Ej. 24',required:true})}{opciones('Objetivo principal','objetivo',menor?['Mejorar rendimiento deportivo','Mantener hábitos saludables','Apoyar recuperación deportiva']:['Mejorar rendimiento deportivo','Ganar masa muscular','Reducir grasa corporal gradualmente','Aumentar peso gradualmente','Mantener peso','Mejorar hábitos alimentarios'])}{!menor && edad>=18 && <><div className="nut-grid">{campo('Peso (kg, opcional)','peso',{type:'number',min:25,max:350,step:'0.1',placeholder:'Ej. 70'})}{campo('Altura (cm, opcional)','altura',{type:'number',min:100,max:230,step:'1',placeholder:'Ej. 170'})}</div></>}</div>{menor&&<label className="nut-check"><input type="checkbox" checked={perfil.supervisado} onChange={e=>cambiar('supervisado',e.target.checked)}/> Un adulto responsable revisará este menú orientativo.</label>}</>}
      {paso===1&&<><h3>Tu actividad deportiva</h3><div className="nut-grid">{campo('Deporte o actividad','deporte',{maxLength:80,placeholder:'Ej. fútbol, patinaje, gimnasio'})}{opciones('Actividad cotidiana','actividad',['Baja','Ligera','Moderada','Alta','Muy alta'])}{campo('Sesiones deportivas por semana','sesiones',{type:'number',min:0,max:14})}{campo('Minutos aproximados por sesión','duracion',{type:'number',min:0,max:240})}{campo('Horario habitual de entrenamiento','horario',{maxLength:100,placeholder:'Ej. lunes y miércoles 18:00'})}{opciones('Comidas al día','comidas',['3','4','5','6'])}</div></>}
      {paso===2&&<><h3>Tu alimentación y rutina diaria</h3><div className="nut-grid">{campo('Presupuesto aproximado','presupuesto',{maxLength:100,placeholder:'Ej. $40.000 CLP por semana'})}{opciones('Tiempo disponible para cocinar (min)','tiempoCocina',['10','20','30','45','60'])}</div><label className="nut-field"><span>Preferencias, alergias o alimentos que evitas</span><textarea maxLength={400} value={perfil.restricciones} onChange={e=>cambiar('restricciones',e.target.value)} placeholder="Ej. sin lactosa, vegetariano, alergia al maní"/></label><label className="nut-field"><span>Alimentos que tienes o sueles comprar</span><textarea maxLength={350} value={perfil.alimentos} onChange={e=>cambiar('alimentos',e.target.value)} placeholder="Ej. avena, huevos, arroz, legumbres, frutas"/></label><label className="nut-field"><span>Otros datos relevantes (opcional)</span><textarea maxLength={350} value={perfil.contexto} onChange={e=>cambiar('contexto',e.target.value)} placeholder="Ej. entreno temprano, no tengo cocina al almuerzo"/></label></>}
      <div className="nut-actions">{paso>0&&<button className="nut-secondary" onClick={()=>{setPaso(p=>p-1);setError('');subir();}}>Atrás</button>}{paso<2?<button className="nut-primary" onClick={avanzar}>Continuar</button>:<button className="nut-primary" disabled={cargando} onClick={generar}>{cargando?'Preparando menú…':'Generar menú personalizado'}</button>}</div>
    </div>}
    {vista==='guardados'&&<div className="nut-panel"><h3>Mis menús con IA</h3>{guardados.length===0?<p className="nut-hint">Todavía no tienes menús guardados.</p>:<div className="nut-saved">{guardados.map(r=><article key={r.id}><strong>{r.titulo}</strong><small>{r.objetivo} · {fecha(r.created_at)}</small><div className="nut-actions"><button className="nut-secondary" onClick={()=>abrir(r)}>Abrir menú</button><button className="nut-danger" onClick={()=>eliminar(r)}>Eliminar</button></div></article>)}</div>}</div>}
    {vista==='plan'&&plan&&<div className="nut-panel"><span className="nut-kicker">MENÚ PROPUESTO POR IA · REVISAR ANTES DE APLICAR</span><h3>{plan.titulo}</h3><p>{plan.resumen}</p><div className="nut-tags"><span>{plan.dias.length} días</span><span>{perfil.objetivo}</span></div>{Array.isArray(plan.recomendaciones)&&<div className="nut-note"><strong>Recomendaciones</strong><ul>{plan.recomendaciones.map((t,i)=><li key={i}>{t}</li>)}</ul></div>}<div className="nut-days" role="tablist" aria-label="Días del menú">{plan.dias.map((d,i)=><button key={i} role="tab" aria-selected={dia===i} className={dia===i?'active':''} onClick={()=>setDia(i)}>{d.dia||`Día ${i+1}`}</button>)}</div>{plan.dias[dia]&&<div className="nut-day"><h4>{plan.dias[dia].dia}</h4>{(plan.dias[dia].comidas||[]).map((c,i)=><article key={i} className="nut-meal"><span>{c.momento}</span><strong>{c.nombre}</strong><p>{c.descripcion}</p>{c.alternativa&&<small>Alternativa: {c.alternativa}</small>}</article>)}</div>}<div className="nut-actions"><button className="nut-secondary" onClick={()=>{setVista('crear');setPaso(0);subir();}}>Ajustar evaluación</button><button className="nut-primary" disabled={guardando||!!idActual} onClick={guardar}>{idActual?'Guardado en Mis menús':guardando?'Guardando…':'Guardar menú'}</button></div></div>}
    <p className="nut-disclaimer">Las recomendaciones son orientativas y no constituyen una dieta clínica. No se calculan calorías objetivo ni déficits automáticos. Si existen enfermedades, alergias graves, embarazo, trastornos alimentarios o necesidades especiales, consulta a un profesional. Los menús IA no modifican tus comidas registradas.</p>
  </section>;
}
