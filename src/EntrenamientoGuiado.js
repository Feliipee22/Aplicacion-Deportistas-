import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';
import VideoSugerido from './VideoSugerido';
import './EntrenamientoGuiado.css';

const initial = () => ({ index: 0, seriesDone: 0, completed: [], phase: 'ready', elapsed: 0, runningSince: null, restUntil: null, restRemaining: 0, finished: false });
const clock = seconds => { const s = Math.max(0, Math.floor(seconds || 0)); return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':'); };
const count = value => { const n = parseInt(String(value ?? '').replace(/[^0-9]/g, ''), 10); return Number.isFinite(n) && n > 0 ? Math.min(n, 30) : 1; };
const restSeconds = value => { const n = Number(value); return Number.isFinite(n) && n > 0 ? Math.min(900, Math.floor(n)) : 60; };
const elapsedNow = (s, now) => Math.max(0, (s.elapsed || 0) + (s.runningSince ? (now - s.runningSince) / 1000 : 0));

export default function EntrenamientoGuiado({ planId, sesionIndex, sesion, programacionId = null, onBack, onRegister }) {
  const exercises = useMemo(() => Array.isArray(sesion?.ejercicios) ? sesion.ejercicios : [], [sesion]);
  const [key, setKey] = useState(null);
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(Date.now());
  const [loaded, setLoaded] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setKey(data?.user?.id ? `athletix:guided:v3:${data.user.id}:${planId}:${sesionIndex}:${programacionId || "libre"}` : null);
    }).catch(() => { if (alive) setKey(null); });
    return () => { alive = false; };
  }, [planId, sesionIndex, programacionId]);

  useEffect(() => {
    if (!key) return;
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { /* no stored state */ }
    const next = saved && typeof saved === 'object' && !Array.isArray(saved) && !saved.finished ? { ...initial(), ...saved } : initial();
    next.index = Math.max(0, Math.min(exercises.length - 1, Number(next.index) || 0));
    next.seriesDone = Math.max(0, Number(next.seriesDone) || 0);
    next.completed = Array.isArray(next.completed) ? next.completed.filter(i => Number.isInteger(i) && i >= 0 && i < exercises.length) : [];
    if (next.phase === 'rest' && next.restUntil && next.restUntil <= Date.now()) { next.phase = 'exercise'; next.restUntil = null; }
    setState(next);
    setLoaded(true);
  }, [key, exercises.length]);

  useEffect(() => {
    if (!key || !loaded) return;
    try { localStorage.setItem(key, JSON.stringify(state)); } catch (_) { /* browser storage blocked */ }
  }, [key, loaded, state]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id); }, []);
  useEffect(() => { setShowVideo(false); }, [state.index]);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (state.phase !== 'rest' || !state.restUntil || state.restUntil > now) return;
    setState(s => s.phase === 'rest' && s.restUntil && s.restUntil <= Date.now() ? { ...s, phase: 'exercise', restUntil: null, restRemaining: 0 } : s);
  }, [now, state.phase, state.restUntil]);

  const exercise = exercises[state.index];
  const totalSeries = exercises.reduce((sum, e) => sum + count(e.series), 0);
  const doneSeries = exercises.reduce((sum, e, i) => sum + (state.completed.includes(i) ? count(e.series) : i === state.index ? Math.min(state.seriesDone, count(e.series)) : 0), 0);
  const progress = totalSeries ? Math.min(100, Math.round(doneSeries / totalSeries * 100)) : 0;
  const seconds = elapsedNow(state, now);
  const restLeft = state.phase === 'rest' ? (state.restUntil ? Math.max(0, Math.ceil((state.restUntil - now) / 1000)) : state.restRemaining || 0) : 0;
  const isRunning = Boolean(state.runningSince);
  const freeze = s => ({ ...s, elapsed: elapsedNow(s, Date.now()), runningSince: null });
  const pause = () => setState(s => ({ ...freeze(s), restRemaining: s.phase === 'rest' && s.restUntil ? Math.max(0, Math.ceil((s.restUntil - Date.now()) / 1000)) : s.restRemaining, restUntil: null }));
  const resume = () => setState(s => ({ ...s, runningSince: Date.now(), phase: s.phase === 'ready' ? 'exercise' : s.phase, restUntil: s.phase === 'rest' && s.restRemaining ? Date.now() + s.restRemaining * 1000 : s.restUntil }));
  const nextExercise = s => {
    const completed = [...new Set([...s.completed, s.index])];
    if (s.index >= exercises.length - 1) return { ...freeze(s), completed, seriesDone: 0, phase: 'summary', finished: true, restUntil: null, restRemaining: 0 };
    return { ...s, completed, index: s.index + 1, seriesDone: 0, phase: 'exercise', restUntil: null, restRemaining: 0 };
  };
  const markSeries = () => {
    if (!isRunning) return;
    setState(s => {
      if (s.phase !== 'exercise') return s;
      const nextDone = s.seriesDone + 1;
      if (nextDone >= count(exercises[s.index]?.series)) return nextExercise(s);
      const duration = restSeconds(exercises[s.index]?.descanso_segundos);
      return { ...s, seriesDone: nextDone, phase: 'rest', restUntil: Date.now() + duration * 1000, restRemaining: duration };
    });
  };
  const skipRest = () => setState(s => ({ ...s, phase: 'exercise', restUntil: null, restRemaining: 0 }));
  const finishEarly = () => { setState(s => ({ ...freeze(s), phase: 'summary', finished: true, restUntil: null, restRemaining: 0 })); setConfirmFinish(false); };
  const goBack = () => { if (isRunning) pause(); onBack(); };
  const reset = () => { setState(initial()); setConfirmReset(false); setShowVideo(false); };
  const register = () => { if (isRunning) pause(); onRegister(Math.max(1, Math.round(seconds))); };

  if (!key || !loaded) return <section className="eg-wrap"><p>Preparando tu entrenamiento…</p><button onClick={onBack}>Volver</button></section>;
  if (!exercises.length) return <section className="eg-wrap"><p>Esta sesión todavía no tiene ejercicios.</p><button onClick={onBack}>Volver al plan</button></section>;
  return createPortal(<section className={`eg-wrap eg-stepper eg-immersive ${state.phase === 'rest' ? 'eg-is-rest' : ''} ${state.finished ? 'eg-is-finished' : ''}`}>
    <header className="eg-top"><button className="eg-back" onClick={goBack}>← Salir</button><strong>Entrenamiento guiado</strong><span>{state.finished ? 'Finalizado' : `${state.index + 1}/${exercises.length}`}</span></header>
    <div className="eg-progress"><div className="eg-progress-label"><strong>{state.finished ? 'Sesión finalizada' : `Ejercicio ${state.index + 1} de ${exercises.length}`}</strong><span>{progress}% completado</span></div><div className="eg-track"><span style={{ width: `${progress}%` }}/></div></div>
    {state.finished ? <div className="eg-summary"><div className="eg-summary-icon">✓</div><h2>¡Entrenamiento terminado!</h2><p>Tiempo de entrenamiento</p><strong className="eg-summary-time">{clock(seconds)}</strong><p>{state.completed.length} de {exercises.length} ejercicios completados · {doneSeries} de {totalSeries} series</p><button onClick={register}>Continuar al registro</button><p className="eg-small">Para guardar esta sesión en tu historial, completa el registro en la siguiente pantalla.</p><button className="eg-outline" onClick={goBack}>Volver al plan</button></div> : <>
      <div className="eg-session-head"><span>{sesion?.titulo || sesion?.dia || 'Mi entrenamiento'}</span><strong>{clock(seconds)}</strong></div>
      {state.phase === 'ready' ? <div className="eg-start"><h2>¿Lista para comenzar?</h2><p>Te acompañaremos serie por serie. Podrás consultar la técnica, descansar y continuar a tu ritmo.</p><button onClick={resume}>▶ Comenzar entrenamiento</button></div> : null}
      <article className="eg-current">
        <span className="eg-kicker">{state.phase === 'rest' ? 'DESCANSO ENTRE SERIES' : 'EJERCICIO ACTUAL'}</span>
        <h2>{exercise?.nombre || 'Ejercicio'}</h2>
        <div className="eg-series"><strong>Serie {Math.min(state.seriesDone + 1, count(exercise?.series))} de {count(exercise?.series)}</strong><span>{exercise?.repeticiones ? String(exercise.repeticiones) : 'Sigue las indicaciones de tu plan'}</span></div>
        {exercise?.indicaciones && <p className="eg-instructions">{exercise.indicaciones}</p>}
        <details className="eg-video-details"><summary>Ver demostración en video</summary><div className="eg-video-player"><VideoSugerido nombre={exercise?.nombre}/></div></details>
      </article>
      {state.phase === 'rest' ? <div className="eg-rest-screen" role="status"><span>Tu descanso</span><strong>{clock(restLeft)}</strong><p>Después continuarás con la serie {state.seriesDone + 1}.</p><button onClick={skipRest}>Omitir descanso</button></div> : <div className="eg-primary-action"><button disabled={!isRunning || state.phase === 'ready'} onClick={markSeries}>✓ Terminé esta serie</button><p>Confirma cada serie cuando realmente la hayas realizado.</p></div>}
      <div className="eg-controls"><button className="eg-outline" onClick={isRunning ? pause : resume}>{isRunning ? '⏸ Pausar entrenamiento' : '▶ Continuar entrenamiento'}</button><button className="eg-text-button" onClick={() => setConfirmFinish(true)}>Terminar antes</button></div>
    </>}
    <div className="eg-bottom-actions"><button className="eg-text-button" onClick={() => setConfirmReset(true)}>Reiniciar sesión</button></div>
    {confirmReset && <div className="eg-modal-backdrop" role="presentation"><div className="eg-modal" role="dialog" aria-modal="true" aria-labelledby="eg-reset-title"><h3 id="eg-reset-title">¿Reiniciar entrenamiento?</h3><p>Se perderá el progreso de esta sesión.</p><div><button className="eg-outline" onClick={() => setConfirmReset(false)}>Cancelar</button><button onClick={reset}>Sí, reiniciar</button></div></div></div>}
    {confirmFinish && <div className="eg-modal-backdrop" role="presentation"><div className="eg-modal" role="dialog" aria-modal="true" aria-labelledby="eg-finish-title"><h3 id="eg-finish-title">¿Terminar antes?</h3><p>Podrás registrar el tiempo y las series que alcanzaste a completar.</p><div><button className="eg-outline" onClick={() => setConfirmFinish(false)}>Seguir entrenando</button><button onClick={finishEarly}>Terminar</button></div></div></div>}
    <p className="eg-small">El progreso se conserva en este dispositivo, incluso si recargas la página.</p>
  </section>, document.body);
}
