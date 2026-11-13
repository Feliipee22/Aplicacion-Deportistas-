import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

const Context = createContext({ onlineIds: [], connected: false, estados: {}, estadoDe: () => 'desconectado' });
const CHANNEL = 'athletix-app-presence-v2';
const GRACIA_SEGUNDO_PLANO_MS = 5 * 60 * 1000;
const LIMITE_AUSENTE_MS = 30 * 60 * 1000;

function calcularEstado(registro, ahora) {
  if (!registro?.ultima_actividad) return 'desconectado';
  const transcurrido = ahora - new Date(registro.ultima_actividad).getTime();
  if (!Number.isFinite(transcurrido) || transcurrido < 0 || transcurrido > LIMITE_AUSENTE_MS) return 'desconectado';
  if (transcurrido <= GRACIA_SEGUNDO_PLANO_MS) return 'en-linea';
  return 'ausente';
}

export function AthletixPresenceProvider({ perfil, children }) {
  const [registros, setRegistros] = useState({});
  const [connected, setConnected] = useState(false);
  const [ahora, setAhora] = useState(Date.now());
  const id = perfil?.id ? String(perfil.id) : null;

  useEffect(() => {
    if (!id) { setRegistros({}); setConnected(false); return undefined; }
    let activo = true;
    let marcando = false;
    const canal = supabase.channel(CHANNEL, { config: { presence: { key: id } } });
    const actualizar = async () => {
      const { data, error } = await supabase.from('ath_usuarios_presencia')
        .select('usuario_id, ultima_actividad, en_primer_plano')
        .gte('ultima_actividad', new Date(Date.now() - LIMITE_AUSENTE_MS).toISOString())
        .limit(1000);
      if (!activo || error) return;
      setRegistros(Object.fromEntries((data || []).map(fila => [String(fila.usuario_id), fila])));
      setAhora(Date.now());
    };
    const marcar = async (primerPlano) => {
      if (!activo || marcando) return;
      marcando = true;
      try {
        const { error } = await supabase.rpc('ath_marcar_presencia', { p_primer_plano: primerPlano });
        if (!error && activo) {
          // La RPC confirmó el heartbeat: reflejarlo inmediatamente en el estado propio.
          // No depender de que la lectura general o el canal Realtime respondan a tiempo.
          setRegistros(prev => ({...prev, [id]: {usuario_id:id, ultima_actividad:new Date().toISOString(), en_primer_plano:primerPlano}}));
          setAhora(Date.now());
          await actualizar();
        }
      } finally { marcando = false; }
    };
    const alCambiarVisibilidad = () => { void marcar(document.visibilityState === 'visible'); };
    const alVolver = () => { void marcar(true); };
    canal.on('presence', { event: 'sync' }, () => { void actualizar(); })
      .on('presence', { event: 'join' }, () => { void actualizar(); })
      .on('presence', { event: 'leave' }, () => { void actualizar(); })
      .subscribe(async estado => {
        if (!activo) return;
        if (estado === 'SUBSCRIBED') {
          setConnected(true);
          await canal.track({ activo: true });
          void marcar(document.visibilityState === 'visible');
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(estado)) {
          setConnected(false);
        }
      });
    void marcar(document.visibilityState === 'visible');
    const intervalo = window.setInterval(() => {
      setAhora(Date.now());
      void actualizar();
      if (document.visibilityState === 'visible') void marcar(true);
    }, 60000);
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    window.addEventListener('focus', alVolver);
    return () => {
      activo = false;
      window.clearInterval(intervalo);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
      window.removeEventListener('focus', alVolver);
      supabase.removeChannel(canal);
    };
  }, [id]);

  const estados = useMemo(() => Object.fromEntries(
    Object.entries(registros).map(([usuario, registro]) => [usuario, calcularEstado(registro, ahora)])
  ), [registros, ahora]);
  const onlineIds = useMemo(() => Object.keys(estados).filter(usuario => estados[usuario] === 'en-linea'), [estados]);
  const estadoDe = (usuario) => estados[String(usuario)] || 'desconectado';
  const value = useMemo(() => ({ onlineIds, connected, estados, estadoDe }), [onlineIds, connected, estados]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAthletixPresence() { return useContext(Context); }
