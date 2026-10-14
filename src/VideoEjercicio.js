import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';

export const VIDEO_BUCKET = 'videos-ejercicios';
export const VIDEO_PREFIX = 'storage:';

function youtubeId(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host === 'youtu.be' || host === 'www.youtu.be') return u.pathname.split('/')[1];
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(host)) {
      if (u.pathname === '/watch') return u.searchParams.get('v');
      if (u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2];
    }
  } catch (_) { /* Enlace inválido */ }
  return null;
}

export default function VideoEjercicio({ valor }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let activo = true;
    setUrl(''); setError('');
    if (!valor) return () => { activo = false; };
    if (!valor.startsWith(VIDEO_PREFIX)) {
      if (/^https:\/\//i.test(valor)) setUrl(valor);
      else setError('El enlace del video no es válido.');
      return () => { activo = false; };
    }
    const ruta = valor.slice(VIDEO_PREFIX.length);
    supabase.storage.from(VIDEO_BUCKET).createSignedUrl(ruta, 3600)
      .then(({ data, error: fallo }) => {
        if (!activo) return;
        if (fallo || !data?.signedUrl) setError('No se pudo cargar el video.');
        else setUrl(data.signedUrl);
      });
    return () => { activo = false; };
  }, [valor]);
  if (!valor) return null;
  if (error) return <p className="ath-video-error">{error}</p>;
  if (!url) return <p>Cargando video...</p>;
  const id = youtubeId(url);
  if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return <div className="ath-video-frame"><iframe title="Video demostrativo" src={`https://www.youtube-nocookie.com/embed/${id}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>;
  }
  if (valor.startsWith(VIDEO_PREFIX) || /\.(mp4|webm|ogg)(\?|$)/i.test(url)) {
    return <video className="ath-video-player" src={url} controls preload="metadata" playsInline />;
  }
  return <a className="ath-exlib-video" href={url} target="_blank" rel="noopener noreferrer">Ver video demostrativo ↗</a>;
}
