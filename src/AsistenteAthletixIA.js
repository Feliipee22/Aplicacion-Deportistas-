import React, { useState } from 'react';
import { supabase } from './supabase';
import './AsistenteAthletixIA.css';

const OPCIONES = {
  entrenamiento: ['Mejorar condición física', 'Ganar fuerza', 'Ganar masa muscular', 'Mejorar rendimiento deportivo', 'Mantenerme activo'],
  alimentacion: ['Bajar de peso gradualmente', 'Subir de peso', 'Mantener peso', 'Ganar masa muscular', 'Mejorar rendimiento deportivo'],
};

export default function AsistenteAthletixIA({ tipo = 'entrenamiento' }) {
  const [objetivo, setObjetivo] = useState(OPCIONES[tipo][0]);
  const [edadGrupo, setEdadGrupo] = useState('adulto');
  const [nivel, setNivel] = useState('Principiante');
  const [deporte, setDeporte] = useState('');
  const [frecuencia, setFrecuencia] = useState('3');
  const [preferencias, setPreferencias] = useState('');
  const [pregunta, setPregunta] = useState('');
  const [respuesta, setRespuesta] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const alimentacion = tipo === 'alimentacion';

  async function consultar(e) {
    e.preventDefault();
    if (cargando) return;
    setCargando(true); setError(''); setRespuesta('');
    try {
      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      if (errorSesion || !sesion?.session) throw new Error('Inicia sesión para utilizar el asistente.');
      const { data, error: errorFuncion } = await supabase.functions.invoke('asistente-athletix', {
        body: { tipo, objetivo, edadGrupo, nivel, deporte: deporte.trim().slice(0, 80), frecuencia, preferencias: preferencias.trim().slice(0, 400), pregunta: pregunta.trim().slice(0, 500) },
      });
      if (errorFuncion) {
        let detalle = '';
        try { const json = await errorFuncion.context?.json(); detalle = json?.error || ''; } catch (_) { /* respuesta no JSON */ }
        throw new Error(detalle || 'No se pudo contactar al asistente. Comprueba que la función esté desplegada.');
      }
      if (!data?.respuesta) throw new Error(data?.error || 'La IA no entregó una respuesta.');
      setRespuesta(data.respuesta);
    } catch (err) { setError(err.message || 'No se pudo generar la recomendación.'); }
    finally { setCargando(false); }
  }

  return <section className="ath-ai" aria-label={alimentacion ? 'Asistente de alimentación' : 'Entrenador virtual'}>
    <div className="ath-ai-heading"><span className="ath-ai-spark">✦</span><div><h3>{alimentacion ? 'Tu asistente de alimentación' : 'Tu entrenador virtual'}</h3><p>Recomendaciones personalizadas con inteligencia artificial</p></div></div>
    <form onSubmit={consultar} className="ath-ai-form">
      <label>¿Cuál es tu objetivo?<select value={objetivo} onChange={e => setObjetivo(e.target.value)}>{OPCIONES[tipo].map(x => <option key={x}>{x}</option>)}</select></label>
      <div className="ath-ai-grid"><label>Etapa de vida<select value={edadGrupo} onChange={e => setEdadGrupo(e.target.value)}><option value="adulto">18 años o más</option><option value="menor">Menor de 18 años</option></select></label><label>Nivel de actividad<select value={nivel} onChange={e => setNivel(e.target.value)}><option>Principiante</option><option>Intermedio</option><option>Avanzado</option></select></label></div>
      <div className="ath-ai-grid"><label>Deporte (opcional)<input value={deporte} maxLength={80} onChange={e => setDeporte(e.target.value)} placeholder="Ej. fútbol, gimnasio" /></label><label>Entrenamientos por semana<select value={frecuencia} onChange={e => setFrecuencia(e.target.value)}>{['0','1','2','3','4','5','6','7'].map(n => <option key={n} value={n}>{n}</option>)}</select></label></div>
      <label>{alimentacion ? 'Preferencias, alergias, presupuesto y alimentos disponibles (opcional)' : 'Equipamiento, tiempo disponible y limitaciones (opcional)'}<textarea value={preferencias} maxLength={400} rows={3} onChange={e => setPreferencias(e.target.value)} placeholder={alimentacion ? 'Ej. sin lácteos, presupuesto semanal $30.000, comidas chilenas' : 'Ej. entreno en casa, 30 minutos, sin equipamiento'} /></label>
      <label>¿Qué quieres preguntarle? (opcional)<textarea value={pregunta} maxLength={500} rows={2} onChange={e => setPregunta(e.target.value)} placeholder={alimentacion ? 'Ej. ¿Qué puedo almorzar antes de entrenar?' : 'Ej. Hazme una rutina de 3 días para principiantes'} /></label>
      <button className="ath-ai-submit" type="submit" disabled={cargando}>{cargando ? 'Preparando recomendación…' : alimentacion ? 'Recomendar comidas' : 'Crear recomendación de entrenamiento'}</button>
    </form>
    {error && <p className="ath-ai-error" role="alert">{error}</p>}
    {respuesta && <div className="ath-ai-result" aria-live="polite"><div className="ath-ai-result-head"><strong>Tu recomendación</strong><button type="button" onClick={() => navigator.clipboard?.writeText(respuesta)}>Copiar</button></div><div className="ath-ai-response">{respuesta}</div></div>}
    <p className="ath-ai-disclaimer">Orientación general, no sustituye a un profesional de salud, nutrición o entrenamiento. No compartas datos médicos sensibles. Las recomendaciones no modifican las rutinas asignadas ni tu historial.</p>
  </section>;
}
