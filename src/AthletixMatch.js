import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { divIcon } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from './supabase';
import './AthletixMatch.css';

// Athletix Match no está limitado a una ciudad: cada zona se consulta por separado.
// Santiago tiene un pequeño catálogo inicial para no mostrar un mapa vacío.
const CIUDADES = [
  { id: 'arica', nombre: 'Arica', latitud: -18.4783, longitud: -70.3126 },
  { id: 'iquique', nombre: 'Iquique', latitud: -20.2141, longitud: -70.1520 },
  { id: 'antofagasta', nombre: 'Antofagasta', latitud: -23.6509, longitud: -70.3975 },
  { id: 'calama', nombre: 'Calama', latitud: -22.4624, longitud: -68.9272 },
  { id: 'copiapo', nombre: 'Copiapó', latitud: -27.3668, longitud: -70.3322 },
  { id: 'la-serena', nombre: 'La Serena', latitud: -29.9027, longitud: -71.2519 },
  { id: 'coquimbo', nombre: 'Coquimbo', latitud: -29.9533, longitud: -71.3436 },
  { id: 'valparaiso', nombre: 'Valparaíso', latitud: -33.0472, longitud: -71.6127 },
  { id: 'vina-del-mar', nombre: 'Viña del Mar', latitud: -33.0245, longitud: -71.5518 },
  { id: 'santiago', nombre: 'Santiago', latitud: -33.4489, longitud: -70.6693 },
  { id: 'rancagua', nombre: 'Rancagua', latitud: -34.1708, longitud: -70.7444 },
  { id: 'talca', nombre: 'Talca', latitud: -35.4264, longitud: -71.6554 },
  { id: 'chillan', nombre: 'Chillán', latitud: -36.6066, longitud: -72.1034 },
  { id: 'concepcion', nombre: 'Concepción', latitud: -36.8270, longitud: -73.0498 },
  { id: 'tome', nombre: 'Tomé', latitud: -36.6176, longitud: -72.9565 },
  { id: 'los-angeles', nombre: 'Los Ángeles', latitud: -37.4697, longitud: -72.3537 },
  { id: 'temuco', nombre: 'Temuco', latitud: -38.7359, longitud: -72.5904 },
  { id: 'valdivia', nombre: 'Valdivia', latitud: -39.8142, longitud: -73.2459 },
  { id: 'osorno', nombre: 'Osorno', latitud: -40.5740, longitud: -73.1335 },
  { id: 'puerto-montt', nombre: 'Puerto Montt', latitud: -41.4693, longitud: -72.9424 },
  { id: 'castro', nombre: 'Castro', latitud: -42.4801, longitud: -73.7624 },
  { id: 'coyhaique', nombre: 'Coyhaique', latitud: -45.5712, longitud: -72.0683 },
  { id: 'punta-arenas', nombre: 'Punta Arenas', latitud: -53.1638, longitud: -70.9171 },
].map((c) => ({ ...c, radioKm: c.id === 'santiago' ? 16 : 10, zoom: 12 }));
const ZONA_INICIAL = CIUDADES.find((c) => c.id === 'santiago');
const OVERPASS_SERVERS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
];
const CACHE_MS = 4 * 60 * 60 * 1000;
const LIMIT_MOSTRAR = 240;

function distanciaKm(lat1, lon1, lat2, lon2) {
  const a = (lat1 - lat2) * Math.PI / 180;
  const b = (lon1 - lon2) * Math.PI / 180;
  const r1 = lat1 * Math.PI / 180;
  const r2 = lat2 * Math.PI / 180;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(
    Math.sin(a / 2) ** 2 + Math.cos(r1) * Math.cos(r2) * Math.sin(b / 2) ** 2,
  )));
}

function crearConsultaOSM(zona) {
  const lat = Number(zona.latitud);
  const lon = Number(zona.longitud);
  const radio = Number(zona.radioKm) || 10;
  const dLat = radio / 111.2;
  const dLon = radio / (111.2 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon]
    .map((n) => n.toFixed(5)).join(',');
  return `[out:json][timeout:18];(
    nwr["leisure"~"^(pitch|sports_centre|stadium|track|fitness_station)$"]["name"](${bbox});
    nwr["leisure"="park"]["name"](${bbox});
  );out center 800;`;
}

// Selección inicial de espacios REALES de Santiago, con identificadores y
// coordenadas de OpenStreetMap contrastados con fuentes cartográficas.
// Así el mapa no depende de que un servicio externo responda al instante.
// La existencia del recinto no implica acceso público ni disponibilidad.
const LUGARES_VERIFICADOS = [
  { osm_id: 'way/118792722', nombre: 'Skatepark Parque de los Reyes', direccion: 'Parque de los Reyes, Santiago', latitud: -33.42869, longitud: -70.66892, disciplinas: ['Skate'], descripcion: 'Espacio para practicar skate en el Parque de los Reyes.' },
  { osm_id: 'way/1314762861', nombre: 'Skatepark Parque O’Higgins', direccion: 'Parque O’Higgins, Santiago', latitud: -33.46362, longitud: -70.65739, disciplinas: ['Skate'], descripcion: 'Skatepark ubicado en el Parque O’Higgins.' },
  { osm_id: 'way/573341284', nombre: 'Cancha Jaime Eyzaguirre', direccion: 'Ñuñoa, Santiago', latitud: -33.46950, longitud: -70.57973, disciplinas: ['Fútbol'], descripcion: 'Cancha de fútbol en Ñuñoa. Confirma las condiciones de acceso.' },
  { osm_id: 'way/111876383', nombre: 'Cancha Calasanz', direccion: 'Ñuñoa, Santiago', latitud: -33.44990, longitud: -70.58411, disciplinas: ['Fútbol'], descripcion: 'Cancha de fútbol. El acceso podría estar restringido.' },
  { osm_id: 'way/1198186314', nombre: 'Cancha de fútbol 1', direccion: 'Sector Estadio Nacional, Ñuñoa', latitud: -33.46979, longitud: -70.61009, disciplinas: ['Fútbol'], descripcion: 'Cancha de fútbol en Ñuñoa. Consulta disponibilidad y acceso.' },
  { osm_id: 'way/1198186312', nombre: 'Cancha de fútbol 3', direccion: 'Sector Estadio Nacional, Ñuñoa', latitud: -33.46985, longitud: -70.61113, disciplinas: ['Fútbol'], descripcion: 'Cancha de fútbol en Ñuñoa. Consulta disponibilidad y acceso.' },
  { osm_id: 'way/1557954963', nombre: 'Cancha de básquetbol 1 · Combarbalá', direccion: 'Parque Combarbalá, San Ramón', latitud: -33.53037, longitud: -70.63050, disciplinas: ['Básquetbol'], descripcion: 'Cancha de básquetbol en el sector de Parque Combarbalá.' },
  { osm_id: 'way/1557954497', nombre: 'Cancha de básquetbol 2 · Combarbalá', direccion: 'Sector Combarbalá, San Ramón', latitud: -33.52985, longitud: -70.62489, disciplinas: ['Básquetbol'], descripcion: 'Cancha de básquetbol en San Ramón.' },
  { osm_id: 'way/618963880', nombre: 'Cancha de Fútbol 4 Álamos', direccion: 'Maipú, Santiago', latitud: -33.51782, longitud: -70.75078, disciplinas: ['Fútbol'], descripcion: 'Cancha de fútbol en Maipú. Consulta disponibilidad y acceso.' },
  { osm_id: 'way/291865079', nombre: 'Cancha de Fútbol Clara Estrella', direccion: 'Lo Espejo, Santiago', latitud: -33.51862, longitud: -70.67715, disciplinas: ['Fútbol'], descripcion: 'Cancha de fútbol en Lo Espejo.' },
  { osm_id: 'way/1311315529', nombre: 'Cancha 4 · Tenis', direccion: 'Ñuñoa, Santiago', latitud: -33.46227, longitud: -70.61335, disciplinas: ['Tenis'], descripcion: 'Cancha de tenis en Ñuñoa. Confirma las condiciones de acceso.' },
  { osm_id: 'way/22371383', nombre: 'Parque Araucano', direccion: 'Las Condes, Santiago', latitud: -33.40291, longitud: -70.57489, disciplinas: ['Running', 'Caminata'], descripcion: 'Parque urbano con espacios para caminar y correr.' },
  { osm_id: 'way/14817188', nombre: 'Parque O’Higgins', direccion: 'Santiago Centro', latitud: -33.46428, longitud: -70.66030, disciplinas: ['Running', 'Caminata'], descripcion: 'Parque urbano con espacios para actividades al aire libre.' },
  { osm_id: 'way/93992786', nombre: 'Parque Bicentenario', direccion: 'Vitacura, Santiago', latitud: -33.40063, longitud: -70.60137, disciplinas: ['Running', 'Caminata'], descripcion: 'Parque urbano para pasear y realizar actividades al aire libre.' },
  { osm_id: 'way/220750456', nombre: 'Parque Intercomunal Padre Hurtado', direccion: 'La Reina, Santiago', latitud: -33.43179, longitud: -70.54531, disciplinas: ['Running', 'Caminata'], descripcion: 'Parque intercomunal con espacios para actividades recreativas.' },
  { osm_id: 'way/23394922', nombre: 'Parque Quinta Normal', direccion: 'Matucana, Santiago', latitud: -33.44131, longitud: -70.68385, disciplinas: ['Caminata'], descripcion: 'Parque urbano para pasear y realizar actividades recreativas.' },
].map((l) => ({ ...l, id: l.osm_id, fuente: 'catalogo', tipo: 'deporte' }));

const iconoMarcador = divIcon({
  className: 'match-marker-wrapper',
  html: '<span class="match-marker-dot" aria-hidden="true"></span>',
  iconSize: [36, 42], iconAnchor: [18, 38], popupAnchor: [0, -32],
});

const ETIQUETAS_DEPORTE = {
  soccer: 'Fútbol', football: 'Fútbol', basketball: 'Básquetbol',
  tennis: 'Tenis', volleyball: 'Vóleibol', beachvolleyball: 'Vóleibol',
  futsal: 'Futsal', handball: 'Balonmano', rugby: 'Rugby',
  athletics: 'Atletismo', running: 'Running', swimming: 'Natación',
  skateboard: 'Skate', skating: 'Patinaje', cycling: 'Ciclismo',
  baseball: 'Béisbol', table_tennis: 'Tenis de mesa',
  multi: 'Multideporte', multi_sport: 'Multideporte',
  fitness: 'Entrenamiento', gymnastics: 'Gimnasia',
};

function deportesDesdeEtiquetas(tags) {
  const lista = String(tags.sport || '').split(/[;,]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const traducidos = [...new Set(lista.map((s) => ETIQUETAS_DEPORTE[s] || s.replace(/_/g, ' ')))];
  if (traducidos.length) return traducidos;
  if (tags.leisure === 'park') return ['Running', 'Caminata'];
  if (tags.leisure === 'track') return ['Atletismo'];
  if (tags.leisure === 'fitness_station') return ['Entrenamiento'];
  return ['Multideporte'];
}

function transformarLugar(elemento) {
  const tags = elemento.tags || {};
  const latitud = Number(elemento.lat ?? elemento.center?.lat);
  const longitud = Number(elemento.lon ?? elemento.center?.lon);
  if (!tags.name || !Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
  const direccion = [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ');
  return {
    id: `${elemento.type}/${elemento.id}`,
    osm_id: `${elemento.type}/${elemento.id}`,
    nombre: tags.name,
    direccion: direccion || tags['addr:full'] || tags['addr:city'] || 'Dirección no informada',
    latitud, longitud,
    disciplinas: deportesDesdeEtiquetas(tags),
    descripcion: tags.description || (tags.leisure === 'park'
      ? 'Parque con espacios para actividades al aire libre.'
      : 'Instalación deportiva. Consulta sus condiciones de acceso.'),
    tipo: tags.leisure || 'deporte',
    fuente: 'osm',
  };
}

function transformarGuardado(lugar) {
  return {
    ...lugar,
    id_db: lugar.id,
    id: lugar.osm_id || `guardado/${lugar.id}`,
    osm_id: lugar.osm_id || null,
    disciplinas: Array.isArray(lugar.disciplinas) ? lugar.disciplinas : [],
    fuente: 'guardado',
  };
}

function leerCache(zona) {
  try {
    const clave = `athletix_match_osm_${zona.latitud.toFixed(3)}_${zona.longitud.toFixed(3)}_${zona.radioKm}`;
    const cache = JSON.parse(window.sessionStorage.getItem(clave) || 'null');
    if (cache && Date.now() - cache.fecha < CACHE_MS && Array.isArray(cache.lugares)) {
      return cache.lugares;
    }
  } catch (_) { /* El almacenamiento local es opcional. */ }
  return null;
}

async function consultarLugaresOSM(zona, forzarActualizacion = false) {
  const cache = forzarActualizacion ? null : leerCache(zona);
  if (cache) return cache;
  const consulta = crearConsultaOSM(zona);
  let ultimoError;
  for (const servidor of OVERPASS_SERVERS) {
    const controlador = new AbortController();
    const timeout = setTimeout(() => controlador.abort(), 21000);
    try {
      const respuesta = await fetch(`${servidor}?data=${encodeURIComponent(consulta)}`, {
        signal: controlador.signal,
        headers: { Accept: 'application/json' },
      });
      if (!respuesta.ok) throw new Error(`Servicio de lugares: ${respuesta.status}`);
      const json = await respuesta.json();
      if (!Array.isArray(json.elements)) throw new Error('Respuesta cartográfica inválida');
      const lugares = json.elements.map(transformarLugar).filter(Boolean);
      const clave = `athletix_match_osm_${zona.latitud.toFixed(3)}_${zona.longitud.toFixed(3)}_${zona.radioKm}`;
      try { window.sessionStorage.setItem(clave, JSON.stringify({ fecha: Date.now(), lugares })); }
      catch (_) { /* La caché es opcional. */ }
      return lugares;
    } catch (error) {
      ultimoError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw ultimoError || new Error('No se pudieron cargar lugares');
}

function Icono({ tipo, size = 19 }) {
  const caminos = {
    mapa: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/></>,
    ubicacion: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    personas: <><path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    mas: <path d="M12 5v14M5 12h14"/>,
    ruta: <path d="m3 11 19-9-9 19-2-8-8-2Z"/>,
    calendario: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></>,
    buscar: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
    recargar: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.5-3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">{caminos[tipo] || caminos.mapa}</svg>;
}

function CentrarMapa({ lugar, zona }) {
  const mapa = useMap();
  useEffect(() => {
    mapa.flyTo([Number(zona.latitud), Number(zona.longitud)], zona.zoom || 12, { duration: 0.6 });
  }, [mapa, zona.latitud, zona.longitud, zona.zoom]);
  const latitud = lugar?.latitud;
  const longitud = lugar?.longitud;
  useEffect(() => {
    if (latitud != null && longitud != null) {
      mapa.flyTo([Number(latitud), Number(longitud)], 15, { duration: 0.6 });
    }
  }, [mapa, latitud, longitud]);
  return null;
}

function formatearFecha(fecha) {
  const valor = new Date(fecha);
  return Number.isNaN(valor.getTime()) ? 'Fecha no disponible'
    : new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(valor);
}
function normalizar(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function mensajeError(error) {
  console.error('Athletix Match:', error);
  if (error?.code === '42883' || /function.*does not exist/i.test(error?.message || '')) {
    return 'Las convocatorias todavía no están habilitadas. Falta configurar el servicio de partidos.';
  }
  if (error?.code === '42501') return 'No tienes permiso para realizar esta acción.';
  return 'No se pudo completar la acción. Revisa tu conexión e inténtalo nuevamente.';
}

export default function AthletixMatch({ perfil, partidoDestacadoId = null }) {
  const [pestana, setPestana] = useState('mapa');
  useEffect(() => { if (partidoDestacadoId != null) setPestana('partidos'); }, [partidoDestacadoId]);
  const [zona, setZona] = useState(ZONA_INICIAL);
  const [ciudadElegida, setCiudadElegida] = useState('santiago');
  const [ciudadLibre, setCiudadLibre] = useState('');
  const [buscandoCiudad, setBuscandoCiudad] = useState(false);
  const [errorCiudad, setErrorCiudad] = useState('');
  const [lugaresOSM, setLugaresOSM] = useState([]);
  const [lugaresGuardados, setLugaresGuardados] = useState([]);
  const [partidos, setPartidos] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [cargandoMapa, setCargandoMapa] = useState(false);
  const [cargandoPartidos, setCargandoPartidos] = useState(true);
  const [errorMapa, setErrorMapa] = useState('');
  const [partidosHabilitados, setPartidosHabilitados] = useState(false);
  const [aviso, setAviso] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [cancelacionPendiente, setCancelacionPendiente] = useState(null);
  const [recargaMapa, setRecargaMapa] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [deporteFiltro, setDeporteFiltro] = useState('Todos');
  const [lugarId, setLugarId] = useState(null);
  const [detalleTab, setDetalleTab] = useState('informacion');
  const [formularioAbierto, setFormularioAbierto] = useState(false);
  const [formError, setFormError] = useState('');
  const [nuevoPartido, setNuevoPartido] = useState({ deporte: '', fecha: '', capacidad: '10' });

  const cargarPartidos = useCallback(async () => {
    setCargandoPartidos(true);
    const [rLugares, rPartidos, rInscritos] = await Promise.all([
      supabase.from('lugares_deportivos').select('*'),
      supabase.from('partidos_activos').select('*').order('fecha_hora', { ascending: true }),
      supabase.from('participantes_partido').select('partido_id').eq('usuario_id', perfil.id),
    ]);
    if (rLugares.error || rPartidos.error || rInscritos.error) {
      console.error('Athletix Match: error al cargar datos', { lugares: rLugares.error, partidos: rPartidos.error, inscripciones: rInscritos.error });
      setAviso('No se pudieron cargar los encuentros. Pulsa Actualizar partidos o revisa la consola.');
      setPartidosHabilitados(false);
    } else {
      setPartidosHabilitados(true);
      setLugaresGuardados((rLugares.data || []).map(transformarGuardado));
      setPartidos(rPartidos.data || []);
      setInscripciones((rInscritos.data || []).map((i) => i.partido_id));
    }
    setCargandoPartidos(false);
  }, [perfil.id]);

  useEffect(() => { cargarPartidos(); }, [cargarPartidos]);
  useEffect(() => {
    // Santiago tiene ubicaciones iniciales. Otras zonas se consultan al elegirlas.
    if (zona.id === 'santiago' && recargaMapa === 0) return undefined;
    let activo = true;
    setCargandoMapa(true);
    setErrorMapa('');
    consultarLugaresOSM(zona, recargaMapa > 0).then((lugares) => {
      if (activo) setLugaresOSM(lugares);
    }).catch((error) => {
      console.error('No se pudieron consultar lugares deportivos:', error);
      if (activo) setErrorMapa('No pudimos cargar más lugares en esta zona. Intenta actualizar o busca otra ciudad.');
    }).finally(() => { if (activo) setCargandoMapa(false); });
    return () => { activo = false; };
  }, [zona, recargaMapa]);

  const cambiarZona = (nuevaZona, idCiudad = '') => {
    setZona(nuevaZona);
    setCiudadElegida(idCiudad);
    setBusqueda('');
    setDeporteFiltro('Todos');
    setLugarId(null);
    setDetalleTab('informacion');
    setLugaresOSM([]);
    setErrorMapa('');
    setErrorCiudad('');
    setFormularioAbierto(false);
    setPestana('mapa');
  };

  const seleccionarCiudad = (evento) => {
    const id = evento.target.value;
    if (!id) { setCiudadElegida(''); return; }
    const ciudad = CIUDADES.find((c) => c.id === id);
    if (ciudad) { setCiudadLibre(''); cambiarZona(ciudad, id); }
  };

  const buscarOtraCiudad = async (evento) => {
    evento.preventDefault();
    const nombre = ciudadLibre.trim();
    if (nombre.length < 2) {
      setErrorCiudad('Escribe el nombre de una ciudad o comuna de Chile.');
      return;
    }
    setBuscandoCiudad(true);
    setErrorCiudad('');
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&addressdetails=1&limit=3&q=${encodeURIComponent(`${nombre}, Chile`)}`;
      const respuesta = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!respuesta.ok) throw new Error('Búsqueda de ciudades no disponible');
      const datos = await respuesta.json();
      const resultado = datos.find((r) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon)));
      if (!resultado) {
        setErrorCiudad('No encontramos esa ciudad o comuna. Prueba con otro nombre.');
        return;
      }
      cambiarZona({
        id: `busqueda-${resultado.place_id}`,
        nombre: nombre,
        latitud: Number(resultado.lat),
        longitud: Number(resultado.lon),
        radioKm: 10,
        zoom: 12,
      });
    } catch (error) {
      console.error('Error al buscar ciudad:', error);
      setErrorCiudad('No pudimos buscar esa ciudad. Puedes elegir una de la lista.');
    } finally {
      setBuscandoCiudad(false);
    }
  };

  const lugares = useMemo(() => {
    const dentroDeZona = (l) => Number.isFinite(Number(l.latitud)) && Number.isFinite(Number(l.longitud)) &&
      distanciaKm(Number(l.latitud), Number(l.longitud), zona.latitud, zona.longitud) <= zona.radioKm * 1.55;
    const iniciales = zona.id === 'santiago' ? LUGARES_VERIFICADOS : [];
    const mapa = new Map(iniciales.map((l) => [l.id, l]));
    lugaresGuardados.filter(dentroDeZona).forEach((l) => {
      const anterior = mapa.get(l.id);
      mapa.set(l.id, { ...anterior, ...l, descripcion: l.descripcion || anterior?.descripcion });
    });
    lugaresOSM.filter(dentroDeZona).forEach((l) => {
      const anterior = mapa.get(l.id);
      mapa.set(l.id, {
        ...anterior, ...l,
        descripcion: anterior?.descripcion || l.descripcion,
        id_db: anterior?.id_db,
      });
    });
    return [...mapa.values()].sort((a, b) =>
      distanciaKm(a.latitud, a.longitud, zona.latitud, zona.longitud) -
      distanciaKm(b.latitud, b.longitud, zona.latitud, zona.longitud));
  }, [lugaresGuardados, lugaresOSM, zona]);

  const disciplinas = useMemo(() => {
    const conjunto = new Set();
    lugares.forEach((l) => (l.disciplinas || []).forEach((d) => conjunto.add(d)));
    return ['Todos', ...[...conjunto].sort((a, b) => a.localeCompare(b, 'es'))];
  }, [lugares]);

  const lugaresFiltrados = useMemo(() => lugares.filter((l) => {
    return normalizar(`${l.nombre} ${l.direccion}`).includes(normalizar(busqueda)) &&
      (deporteFiltro === 'Todos' || (l.disciplinas || []).includes(deporteFiltro));
  }), [lugares, busqueda, deporteFiltro]);

  const visibles = lugaresFiltrados.slice(0, LIMIT_MOSTRAR);
  const seleccionado = lugaresFiltrados.find((l) => l.id === lugarId) || null;
  // id_db conserva la clave numérica original para relacionar partidos con lugares.
  const partidosDelLugar = partidos.filter((p) => {
    if (!seleccionado || new Date(p.fecha_hora).getTime() <= Date.now()) return false;
    const guardado = lugaresGuardados.find((l) => l.id_db === p.lugar_id);
    return guardado?.id === seleccionado.id;
  });

  const partidosDisponibles = partidos.filter((p) => new Date(p.fecha_hora).getTime() > Date.now() && lugaresGuardados.some((l) => l.id_db === p.lugar_id && distanciaKm(Number(l.latitud), Number(l.longitud), zona.latitud, zona.longitud) <= zona.radioKm * 1.55));
  const misOrganizados = partidos.filter((p) => p.organizador_id === perfil.id && new Date(p.fecha_hora).getTime() > Date.now());
  const misInscritos = partidos.filter((p) => p.organizador_id !== perfil.id && inscripciones.includes(p.id) && new Date(p.fecha_hora).getTime() > Date.now());

  // Feed comunitario independiente del recinto seleccionado.
  const [publicaciones, setPublicaciones] = useState([]);
  const [autoresMuro, setAutoresMuro] = useState({});
  const [apodo, setApodo] = useState('');
  const [editandoApodo, setEditandoApodo] = useState(false);
  const [guardandoApodo, setGuardandoApodo] = useState(false);
  const [mensajeApodo, setMensajeApodo] = useState('');
  const guardarApodo = async (e) => {
    e.preventDefault();
    const valor = apodo.trim();
    if (valor && !/^[\p{L}\p{N}_.-]{3,24}$/u.test(valor)) {
      setMensajeApodo('Usa entre 3 y 24 caracteres: letras, números, _, punto o guion.');
      return;
    }
    setGuardandoApodo(true);
    setMensajeApodo('');
    const { error } = await supabase.rpc('comunidad_guardar_apodo', { nuevo_apodo: valor || null });
    setGuardandoApodo(false);
    if (error) {
      setMensajeApodo(error.message?.includes('duplicate key') ? 'Ese apodo ya está ocupado.' : `No se pudo guardar: ${error.message}`);
      return;
    }
    setEditandoApodo(false);
    setMensajeApodo('Apodo actualizado.');
    await Promise.all([cargarMuro(), cargarComentarios()]);
  };
  const [lugarPublicacion, setLugarPublicacion] = useState('');
  const [mostrarPublicacion, setMostrarPublicacion] = useState(false);
  const [mostrarUbicacionPublicacion, setMostrarUbicacionPublicacion] = useState(true);
  const [cargandoMuro, setCargandoMuro] = useState(false);
  const [enviandoMuro, setEnviandoMuro] = useState(false);
  const [errorMuro, setErrorMuro] = useState('');
  const [mensajeNuevo, setMensajeNuevo] = useState('');
  const [ciudadComunidad, setCiudadComunidad] = useState('');
  const [ciudadPublicacion, setCiudadPublicacion] = useState('');
  const [busquedaRecinto, setBusquedaRecinto] = useState('');
  const [busquedaRecintoPublicacion, setBusquedaRecintoPublicacion] = useState('');
  const [ubicacionElegida, setUbicacionElegida] = useState(null);
  const [ciudadElegidaPublicacion, setCiudadElegidaPublicacion] = useState(null);
  const [sugerenciasLugar, setSugerenciasLugar] = useState([]);
  const [sugerenciasCiudad, setSugerenciasCiudad] = useState([]);
  const [buscandoLugar, setBuscandoLugar] = useState(false);
  const [buscandoCiudadPublicacion, setBuscandoCiudadPublicacion] = useState(false);
  const [errorUbicacion, setErrorUbicacion] = useState('');
  const [comentarios, setComentarios] = useState([]);
  const [hiloAbierto, setHiloAbierto] = useState(null);
  const [respuestaA, setRespuestaA] = useState(null);
  const [textoComentario, setTextoComentario] = useState('');
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [errorComentarios, setErrorComentarios] = useState('');
  const [accionMuro, setAccionMuro] = useState(null);
  const [procesandoMuro, setProcesandoMuro] = useState(false);
  const [errorGestion, setErrorGestion] = useState('');
  const [editarMuro, setEditarMuro] = useState(null);
  const [textoEdicion, setTextoEdicion] = useState('');
  const esAdministradorMuro = Number(perfil.rol_id) === 1 || String(perfil.rol || '').toLowerCase() === 'administrador';
  const puedeGestionar = (autorId) => autorId === perfil.id || esAdministradorMuro;
  const puedeEditar = (autorId) => autorId === perfil.id;

  const guardarEdicionMuro = async () => {
    if (!editarMuro || procesandoMuro) return;
    const mensaje = textoEdicion.trim();
    if (!mensaje || mensaje.length > 500) { setErrorGestion('El texto debe tener entre 1 y 500 caracteres.'); return; }
    setProcesandoMuro(true); setErrorGestion('');
    const tabla = editarMuro.tipo === 'publicacion' ? 'muro_comunidad' : 'muro_comentarios';
    const { error } = await supabase.from(tabla).update({ mensaje }).eq('id', editarMuro.id).eq('usuario_id', perfil.id);
    setProcesandoMuro(false);
    if (error) { setErrorGestion('No se pudo editar. Comprueba los permisos de Supabase.'); return; }
    setEditarMuro(null); setTextoEdicion('');
    if (editarMuro.tipo === 'publicacion') await cargarMuro(); else await cargarComentarios();
  };
  const confirmarEliminacionMuro = async () => {
    if (!accionMuro || procesandoMuro) return;
    setProcesandoMuro(true); setErrorGestion('');
    const tabla = accionMuro.tipo === 'publicacion' ? 'muro_comunidad' : 'muro_comentarios';
    const { error } = esAdministradorMuro
      ? await supabase.rpc('ath_admin_moderar_contenido', { p_tipo: accionMuro.tipo, p_id: String(accionMuro.id) })
      : await supabase.from(tabla).delete().eq('id', accionMuro.id).eq('usuario_id', perfil.id);
    setProcesandoMuro(false);
    if (error) { setErrorGestion('No se pudo eliminar: ' + error.message); return; }
    setAccionMuro(null); setEditarMuro(null);
    await Promise.all([cargarMuro(), cargarComentarios()]);
  };


  const cargarMuro = useCallback(async () => {
    setCargandoMuro(true);
    setErrorMuro('');
    const { data, error } = await supabase.from('muro_comunidad')
      .select('id, lugar_id, usuario_id, mensaje, creado_en, ciudad, lugar_nombre, lugar_latitud, lugar_longitud, lugar_osm_id')
      .order('creado_en', { ascending: false }).limit(150);
    if (error) {
      console.error('Athletix Match comunidad:', error);
      setErrorMuro('No se pudieron cargar las publicaciones. Revisa los permisos de Supabase.');
    } else {
      setPublicaciones(data || []);
      const ids = [...new Set((data || []).map(m => m.usuario_id).filter(Boolean))];
      if (ids.length) {
        const { data: usuariosMuro, error: errorAutores } = await supabase.from('perfiles_publicos')
          .select('id, nombre, rol_id, apodo_publico').in('id', ids);
        if (errorAutores) {
          console.warn('Athletix Match: perfiles de autores no disponibles', errorAutores);
          setAutoresMuro({});
        } else {
          const idsRoles = [...new Set((usuariosMuro || []).map(u => u.rol_id).filter(id => id != null))];
          let nombresRoles = {};
          if (idsRoles.length) {
            const { data: rolesMuro, error: errorRoles } = await supabase.from('roles')
              .select('id, nombre').in('id', idsRoles);
            if (!errorRoles) nombresRoles = Object.fromEntries((rolesMuro || []).map(r => [r.id, r.nombre]));
          }
          setAutoresMuro(Object.fromEntries((usuariosMuro || []).map(u => [u.id, {
            nombre: u.apodo_publico || u.nombre,
            rol: nombresRoles[u.rol_id] || ({ 1: 'Administrador', 2: 'Entrenador', 3: 'Deportista' }[u.rol_id] || 'Miembro'),
          }])));
        }
      } else setAutoresMuro({});
    }
    setCargandoMuro(false);
  }, []);

  const cargarComentarios = useCallback(async () => {
    const { data, error } = await supabase.from('muro_comentarios')
      .select('id, publicacion_id, usuario_id, respuesta_a, mensaje, creado_en')
      .order('creado_en', { ascending: true }).limit(1000);
    if (error) {
      console.error('Comentarios:', error);
      setErrorComentarios('No se pudieron cargar los comentarios. Comprueba que instalaste el SQL de la v9.');
      return;
    }
    setErrorComentarios('');
    setComentarios(data || []);
    const ids = [...new Set((data || []).map(c => c.usuario_id).filter(Boolean))];
    if (ids.length) {
      const { data: users } = await supabase.from('perfiles_publicos').select('id, nombre, rol_id, apodo_publico').in('id', ids);
      if (users) setAutoresMuro(prev => ({ ...prev, ...Object.fromEntries(users.map(u => [u.id, {
        nombre: u.apodo_publico || u.nombre, rol: ({ 1: 'Administrador', 2: 'Entrenador', 3: 'Deportista' })[u.rol_id] || 'Miembro',
      }])) }));
    }
  }, []);

  const enviarComentario = async (e, publicacionId) => {
    e.preventDefault();
    const contenido = textoComentario.trim();
    if (!contenido || enviandoComentario || contenido.length > 500) return;
    setEnviandoComentario(true);
    const { error } = await supabase.from('muro_comentarios').insert({
      publicacion_id: publicacionId, usuario_id: perfil.id, respuesta_a: respuestaA, mensaje: contenido,
    });
    setEnviandoComentario(false);
    if (error) { setErrorComentarios('No se pudo enviar el comentario.'); return; }
    setTextoComentario(''); setRespuestaA(null);
    await cargarComentarios();
  };


  useEffect(() => { if (pestana === 'comunidad') { cargarMuro(); cargarComentarios(); } }, [pestana, cargarMuro, cargarComentarios]);

  const lugaresComunidad = lugaresGuardados.filter(l => l.id_db != null);
  const nombresLugares = new Map(lugaresGuardados.map(l => [String(l.id_db), l.nombre]));
  const recintosBuscados = lugaresComunidad.filter(l => normalizar(`${l.nombre} ${l.direccion || ''}`).includes(normalizar(busquedaRecintoPublicacion))).slice(0, 35);
  // Búsqueda real en OpenStreetMap (Nominatim). Una solicitud por campo y pausa >= 1 s.
  // No se admite texto libre como ubicación válida: hay que seleccionar un resultado.
  useEffect(() => {
    const texto = ciudadPublicacion.trim();
    if (ciudadElegidaPublicacion || texto.length < 3) { setSugerenciasCiudad([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscandoCiudadPublicacion(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&addressdetails=1&limit=5&featuretype=settlement&q=${encodeURIComponent(texto)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Servicio no disponible');
        setSugerenciasCiudad(await res.json()); setErrorUbicacion('');
      } catch (err) { if (err.name !== 'AbortError') setErrorUbicacion('No se pudo consultar las comunas. Intenta de nuevo.'); }
      finally { if (!controller.signal.aborted) setBuscandoCiudadPublicacion(false); }
    }, 1250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [ciudadPublicacion, ciudadElegidaPublicacion]);

  useEffect(() => {
    const texto = busquedaRecintoPublicacion.trim();
    if (ubicacionElegida || texto.length < 3) { setSugerenciasLugar([]); return; }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBuscandoLugar(true);
      try {
        const q = ciudadElegidaPublicacion ? `${texto}, ${ciudadPublicacion}, Chile` : `${texto}, Chile`;
        const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=cl&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Servicio no disponible');
        const data = await res.json();
        setSugerenciasLugar(data.filter(p => p.lat && p.lon)); setErrorUbicacion('');
      } catch (err) { if (err.name !== 'AbortError') setErrorUbicacion('No se pudo buscar recintos. Intenta nuevamente.'); }
      finally { if (!controller.signal.aborted) setBuscandoLugar(false); }
    }, 1250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [busquedaRecintoPublicacion, ubicacionElegida, ciudadPublicacion, ciudadElegidaPublicacion]);

  const publicacionesVisibles = publicaciones.filter(m => {
    const lugar = m.lugar_id == null ? null : lugaresGuardados.find(l => String(l.id_db) === String(m.lugar_id));
    const ciudadDelMensaje = m.ciudad || lugar?.direccion || '';
    return (!ciudadComunidad.trim() || normalizar(ciudadDelMensaje).includes(normalizar(ciudadComunidad))) &&
      (!busquedaRecinto.trim() || normalizar(`${lugar?.nombre || ''} ${lugar?.direccion || ''} ${m.lugar_nombre || ''}`).includes(normalizar(busquedaRecinto)));
  });

  const publicarMensaje = async (evento) => {
    evento.preventDefault();
    const contenido = mensajeNuevo.trim();
    if (!contenido || enviandoMuro) return;
    if (!ciudadElegidaPublicacion) { setErrorMuro('Selecciona una comuna real de las sugerencias.'); return; }
    if (busquedaRecintoPublicacion.trim() && !ubicacionElegida) { setErrorMuro('Selecciona un recinto de las sugerencias o borra la búsqueda para publicar sin recinto.'); return; }
    if (contenido.length > 500) { setErrorMuro('Máximo 500 caracteres.'); return; }
    setEnviandoMuro(true);
    setErrorMuro('');
    const { error } = await supabase.from('muro_comunidad').insert({
      lugar_id: null, ciudad: ciudadPublicacion.trim(), usuario_id: perfil.id, mensaje: contenido,
      lugar_nombre: ubicacionElegida?.display_name || null, lugar_latitud: ubicacionElegida ? Number(ubicacionElegida.lat) : null,
      lugar_longitud: ubicacionElegida ? Number(ubicacionElegida.lon) : null, lugar_osm_id: ubicacionElegida ? `${ubicacionElegida.osm_type}:${ubicacionElegida.osm_id}` : null,
    });
    setEnviandoMuro(false);
    if (error) {
      console.error('Athletix Match publicar comunidad:', error);
      setErrorMuro('No se pudo publicar. Comprueba los permisos del muro.');
      return;
    }
    setMensajeNuevo(''); setLugarPublicacion(''); setBusquedaRecinto(''); setBusquedaRecintoPublicacion(''); setUbicacionElegida(null);
    setMostrarPublicacion(false);
    await cargarMuro();
  };

  const verLugarDesdeMuro = (id) => {
    const lugar = lugaresGuardados.find(l => String(l.id_db) === String(id));
    if (!lugar) return;
    setBusqueda('');
    setDeporteFiltro('Todos');
    setLugarId(lugar.id);
    setDetalleTab('informacion');
    setPestana('mapa');
  };

  const abrirFormulario = () => {
    if (!seleccionado || !partidosHabilitados) return;
    if (!seleccionado.osm_id) {
      setAviso('Este lugar aún no tiene una referencia cartográfica para organizar encuentros.');
      return;
    }
    setFormError('');
    setNuevoPartido({ deporte: seleccionado.disciplinas?.[0] || 'Multideporte', fecha: '', capacidad: '10' });
    setFormularioAbierto(true);
  };

  const crearPartido = async (evento) => {
    evento.preventDefault();
    if (!seleccionado || guardando) return;
    const fecha = new Date(nuevoPartido.fecha);
    const capacidad = Number(nuevoPartido.capacidad);
    if (Number.isNaN(fecha.getTime()) || fecha.getTime() < Date.now() + 30 * 60000) {
      setFormError('Elige una fecha y hora con al menos 30 minutos de anticipación.'); return;
    }
    if (!Number.isInteger(capacidad) || capacidad < 2 || capacidad > 30) {
      setFormError('Elige una capacidad entre 2 y 30 personas.'); return;
    }
    setGuardando(true); setFormError('');
    const { error } = await supabase.rpc('match_crear_partido', {
      p_osm_id: seleccionado.osm_id,
      p_nombre: seleccionado.nombre,
      p_direccion: seleccionado.direccion,
      p_latitud: Number(seleccionado.latitud),
      p_longitud: Number(seleccionado.longitud),
      p_disciplinas: seleccionado.disciplinas,
      p_deporte: nuevoPartido.deporte,
      p_fecha_hora: fecha.toISOString(),
      p_capacidad: capacidad,
    });
    setGuardando(false);
    if (error) { setFormError(mensajeError(error)); return; }
    setFormularioAbierto(false);
    setAviso('Tu convocatoria se publicó correctamente.');
    setPestana('mis');
    await cargarPartidos();
  };

  const ejecutarAccion = async (funcion, id, exito) => {
    if (guardando) return;
    setGuardando(true); setAviso('');
    const { error } = await supabase.rpc(funcion, { p_partido_id: id });
    setGuardando(false);
    if (error) { setAviso(mensajeError(error)); return; }
    setCancelacionPendiente(null);
    setAviso(exito);
    await cargarPartidos();
  };

  const renderEventos = (lista, mostrarLugar = false) => {
    if (cargandoPartidos) return <div className="match-empty"><strong>Cargando encuentros...</strong></div>;
    if (!partidosHabilitados) return <p className="match-error" role="alert">No se pudieron cargar los encuentros. Revisa la conexión y vuelve a actualizar.</p>;
    if (!lista.length) return <div className="match-empty match-empty-compact"><strong>No hay encuentros disponibles</strong><p>Selecciona un lugar en el mapa y crea una convocatoria, o prueba otra ciudad.</p></div>;
    return <div className="match-events">{lista.map((p) => {
              const inscrito = inscripciones.includes(p.id);
              const propio = p.organizador_id === perfil.id;
              const puedeCancelar = propio || esAdministradorMuro;
              const ocupados = Number(p.jugadores_actuales) || 0;
              const capacidad = Number(p.capacidad_maxima) || 0;
              return <article className={`match-event ${String(p.id) === String(partidoDestacadoId) ? 'match-event-destacado' : ''}`} key={p.id}>
                <div className="match-event-main"><div className="match-event-title"><strong>{p.deporte}</strong><span className="match-event-status">{propio ? 'Organizas' : inscrito ? 'Inscrito' : ocupados >= capacidad ? 'Completo' : 'Disponible'}</span></div>{mostrarLugar && <span><Icono tipo="ubicacion" size={15}/>{lugaresGuardados.find((l) => l.id_db === p.lugar_id)?.nombre || "Recinto deportivo"}</span>}
                  <span><Icono tipo="calendario" size={15}/>{formatearFecha(p.fecha_hora)}</span>
                  <span><Icono tipo="personas" size={15}/>{ocupados}/{capacidad} participantes · {Math.max(0, capacidad - ocupados)} cupos disponibles</span>
                </div>
                <div className="match-event-actions">
                  {puedeCancelar ? (
                    <button type="button" className="match-btn match-btn-secondary" disabled={guardando}
                      onClick={() => setCancelacionPendiente(p.id)}>{propio ? 'Cancelar mi encuentro' : 'Retirar encuentro'}</button>
                  ) : (
                    <button type="button" className="match-btn match-btn-primary" disabled={guardando || (!inscrito && ocupados >= capacidad)}
                      onClick={() => ejecutarAccion(inscrito ? 'match_salir_partido' : 'match_unirse_partido', p.id,
                        inscrito ? 'Saliste del encuentro.' : 'Te inscribiste correctamente.')}>{inscrito ? 'Salir' : ocupados >= capacidad ? 'Completo' : 'Unirme'}</button>
                  )}
                </div>
              </article>;
            })}</div>;
  };

  return (
    <section className="match-module">
      <div className="match-hero">
        <div><span className="match-overline">ATHLETIX MATCH</span>
          <h2>Encuentra dónde jugar.</h2>
          <p>Encuentra espacios deportivos en Chile, organiza encuentros y completa equipos.</p>
        </div>
        <div className="match-hero-icon"><Icono tipo="mapa" size={38}/></div>
      </div>

      <nav className="match-tabs" aria-label="Secciones de Athletix Match">
        <button type="button" className={pestana === 'mapa' ? 'is-active' : ''} aria-current={pestana === 'mapa' ? 'page' : undefined} onClick={() => setPestana('mapa')}>Mapa</button>
        <button type="button" className={pestana === 'partidos' ? 'is-active' : ''} aria-current={pestana === 'partidos' ? 'page' : undefined} onClick={() => setPestana('partidos')}>Partidos <span>{partidosDisponibles.length}</span></button>
        <button type="button" className={pestana === 'mis' ? 'is-active' : ''} aria-current={pestana === 'mis' ? 'page' : undefined} onClick={() => setPestana('mis')}>Mis encuentros</button>
        <button type="button" className={pestana === 'comunidad' ? 'is-active' : ''} aria-current={pestana === 'comunidad' ? 'page' : undefined} onClick={() => setPestana('comunidad')}>Comunidad</button>
      </nav>
      {pestana === 'mapa' && <div className="match-map-content">
      <div className="match-location-panel">
        <div className="match-location-intro"><strong>¿Dónde quieres jugar?</strong>
          <span>Elige una ciudad o busca una comuna de Chile.</span></div>
        <div className="match-location-controls">
          <label className="match-location-city"><span>Ciudad</span>
            <select value={ciudadElegida} onChange={seleccionarCiudad} aria-label="Elegir ciudad">
              <option value="">Otra ciudad o comuna</option>
              {CIUDADES.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
          <form className="match-location-search" onSubmit={buscarOtraCiudad}>
            <label htmlFor="match-otra-ciudad">¿No está en la lista?</label>
            <div><input id="match-otra-ciudad" value={ciudadLibre} onChange={(e) => setCiudadLibre(e.target.value)}
              placeholder="Escribe tu ciudad o comuna" />
              <button type="submit" className="match-btn match-btn-primary" disabled={buscandoCiudadPublicacion}>
                {buscandoCiudadPublicacion ? 'Buscando...' : 'Buscar'}
              </button>
            </div>
          </form>
        </div>
        {errorCiudad && <p className="match-error" role="alert">{errorCiudad}</p>}
      </div>

      <div className="match-toolbar match-toolbar-clean">
        <span className="match-source-caption">Explora lugares deportivos</span>
        <div className="match-toolbar-actions">
          <button type="button" className="match-btn match-btn-secondary" onClick={() => setRecargaMapa((v) => v + 1)} disabled={cargandoMapa}>
            <Icono tipo="recargar" size={16}/> {cargandoMapa ? 'Actualizando...' : 'Actualizar'}
          </button>
          {partidosHabilitados && (
            <button type="button" className="match-btn match-btn-secondary" onClick={cargarPartidos} disabled={cargandoPartidos}>
              <Icono tipo="recargar" size={16}/> Actualizar partidos
            </button>
          )}
        </div>
      </div>
      {aviso && <p className="match-feedback" role="status">{aviso}</p>}
      {errorMapa && <p className="match-error" role="alert">{errorMapa}</p>}

      <div className="match-filters">
        <label className="match-search"><Icono tipo="buscar" size={18}/>
          <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cancha, parque o sector" aria-label="Buscar cancha, parque o sector"/>
        </label>
        <label className="match-filter-select"><span>Deporte</span>
          <select value={deporteFiltro} onChange={(e) => setDeporteFiltro(e.target.value)}>
            {disciplinas.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </div>

      <div className="match-layout">
        <div className="match-map-panel">
          <div className="match-map-heading"><span><Icono tipo="ubicacion" size={16}/> {zona.nombre}, Chile</span>
            <strong>{`${lugaresFiltrados.length} lugares`}</strong>
          </div>
          <MapContainer center={[zona.latitud, zona.longitud]} zoom={zona.zoom || 12} scrollWheelZoom={false} className="match-map" zoomControl>
            <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}/>
            <CentrarMapa lugar={seleccionado} zona={zona}/>
            {visibles.map((l) => (
              <Marker key={l.id} icon={iconoMarcador} position={[Number(l.latitud), Number(l.longitud)]}
                eventHandlers={{ click: () => setLugarId(l.id) }}>
                <Popup><strong>{l.nombre}</strong><div>{l.direccion}</div></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <div className="match-side-panel">
          <div className="match-side-title"><h3>Explorar lugares</h3><span>{lugaresFiltrados.length} resultados</span></div>
          {cargandoMapa && !lugares.length ? (
            <div className="match-empty"><strong>Buscando espacios deportivos...</strong><p>Estamos buscando lugares deportivos en esta zona.</p></div>
          ) : visibles.length === 0 ? (
            <div className="match-empty"><Icono tipo="ubicacion" size={30}/><strong>No encontramos lugares</strong>
              <p>Prueba con otro deporte, actualiza el mapa o elige otra ciudad.</p></div>
          ) : (
            <div className="match-places">
              {visibles.map((l) => (
                <button type="button" key={l.id} className={`match-place ${seleccionado?.id === l.id ? 'is-selected' : ''}`}
                  onClick={() => setLugarId(l.id)}>
                  <span className="match-place-icon"><Icono tipo="ubicacion" size={19}/></span>
                  <span className="match-place-text"><strong>{l.nombre}</strong><small>{l.direccion}</small>
                    <span className="match-tags">{(l.disciplinas || []).slice(0, 3).map((d) => <em key={d}>{d}</em>)}</span>
                  </span>
                </button>
              ))}
              {lugaresFiltrados.length > LIMIT_MOSTRAR && (
                <p className="match-list-note">Mostrando {LIMIT_MOSTRAR} lugares. Usa la búsqueda para encontrar otros.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {!seleccionado && lugaresFiltrados.length > 0 && (
        <div className="match-details match-select-hint">
          <Icono tipo="ubicacion" size={23}/>
          <div><strong>Selecciona un lugar</strong><p>Haz clic en un marcador o en la lista para consultar información y organizar un encuentro.</p></div>
        </div>
      )}
      {seleccionado && (
        <div className="match-details">
          <div className="match-details-heading">
            <div><span className="match-overline match-overline-dark">LUGAR SELECCIONADO</span>
              <h3>{seleccionado.nombre}</h3><p className="match-details-address">{seleccionado.direccion}</p>
            </div>
            <a className="match-btn match-btn-secondary" target="_blank" rel="noopener noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${seleccionado.latitud},${seleccionado.longitud}`)}`}>
              <Icono tipo="ruta" size={17}/> Cómo llegar
            </a>
          </div>
          <div className="match-detail-tabs" role="tablist" aria-label="Información del recinto">
            <button type="button" role="tab" aria-selected={detalleTab === 'informacion'} className={detalleTab === 'informacion' ? 'is-active' : ''} onClick={() => setDetalleTab('informacion')}>Información</button>
            <button type="button" role="tab" aria-selected={detalleTab === 'partidos'} className={detalleTab === 'partidos' ? 'is-active' : ''} onClick={() => setDetalleTab('partidos')}>Partidos ({partidosDelLugar.length})</button>
          </div>
          {detalleTab === 'informacion' && <div className="match-detail-body">
            <p>{seleccionado.descripcion || 'Consulta la información del recinto antes de asistir.'}</p>
            <div className="match-tags">{(seleccionado.disciplinas || []).map((d) => <em key={d}>{d}</em>)}</div>
          </div>}
          {detalleTab === 'partidos' && <div className="match-detail-body">
            <div className="match-match-header"><div><h3>Próximos encuentros</h3>
              <p>{partidosDelLugar.length} convocatorias en este lugar</p></div>
              <button type="button" className="match-btn match-btn-primary" onClick={abrirFormulario}
                disabled={!partidosHabilitados} title={!partidosHabilitados ? 'Próximamente' : 'Crear convocatoria'}>
                <Icono tipo="mas" size={17}/> Crear convocatoria
              </button>
            </div>
            {renderEventos(partidosDelLugar)}
          </div>}

        </div>
      )}

      </div>}
      {pestana === 'comunidad' && <section className="match-tab-panel match-feed">
        <div className="match-tab-heading"><div><h3>Comunidad Athletix</h3><p>Conecta con deportistas y entrenadores de todo Chile.</p></div>
          <button type="button" className="match-btn match-btn-secondary" onClick={() => { cargarMuro(); cargarComentarios(); }} disabled={cargandoMuro}>Actualizar</button></div>
        <div className="match-feed-filters">
          <label>Ciudad o comuna (opcional)<input value={ciudadComunidad} onChange={e => setCiudadComunidad(e.target.value)} placeholder="Todo Chile · Busca tu comuna" /></label>
          <label>Filtrar por recinto (opcional)
            <input list="match-recintos-filtro" value={busquedaRecinto} onChange={e => setBusquedaRecinto(e.target.value)} placeholder="Todos los recintos · Escribe para filtrar" />
            <datalist id="match-recintos-filtro">{lugaresComunidad.map(l => <option key={l.id_db} value={l.nombre} />)}</datalist>
          </label>
        </div>
        <button type="button" className="match-btn match-btn-primary match-feed-create" onClick={() => { setMostrarPublicacion(true); setErrorMuro(''); }} disabled={mostrarPublicacion}>+ Crear publicación</button>
        {mostrarPublicacion && <form className="match-community-form match-feed-compose" onSubmit={publicarMensaje}>
          <div className="match-compose-heading"><strong>Nueva publicación</strong><button type="button" className="match-compose-close" onClick={() => setMostrarPublicacion(false)}>Cerrar</button></div>
          <div className="match-compose-profile">
            <span className="match-compose-avatar" aria-hidden="true">{(autoresMuro[perfil.id]?.nombre || perfil.nombre || 'A').trim().charAt(0).toUpperCase()}</span>
            <div className="match-compose-profile-info"><strong>{autoresMuro[perfil.id]?.nombre || perfil.nombre || 'Miembro'}</strong><small>Publicando en Comunidad Athletix</small></div>
            <button type="button" className="match-compose-edit-name" aria-label="Cambiar apodo público" title="Cambiar apodo público" onClick={async () => {
              if (!editandoApodo) {
                const { data } = await supabase.from('perfiles_publicos').select('apodo_publico').eq('id', perfil.id).maybeSingle();
                setApodo(data?.apodo_publico || '');
              }
              setEditandoApodo(!editandoApodo); setMensajeApodo('');
            }}>{editandoApodo ? 'Cancelar' : '✎ Editar'}</button>
          </div>
          {editandoApodo && <div className="match-compose-nickname">
            <label htmlFor="match-apodo">Apodo público (opcional)</label>
            <input id="match-apodo" value={apodo} onChange={e => setApodo(e.target.value)} maxLength={24} placeholder="Ej. Catta22" />
            <small>Si lo dejas vacío, se mostrará tu nombre registrado.</small>
            <button type="button" className="match-btn match-btn-secondary" onClick={guardarApodo} disabled={guardandoApodo}>{guardandoApodo ? 'Guardando...' : 'Guardar apodo'}</button>
          </div>}
          {mensajeApodo && <p className="match-compose-feedback" role="status">{mensajeApodo}</p>}
          <label className="match-compose-message-label" htmlFor="match-mensaje">¿Qué quieres compartir?</label>
          <textarea id="match-mensaje" value={mensajeNuevo} maxLength={500} rows={4} onChange={e => setMensajeNuevo(e.target.value)} placeholder="¿Quién se anima a entrenar o jugar este fin de semana?" required />
          <div className="match-compose-tools">
            <button type="button" className="match-compose-location-toggle" aria-expanded={mostrarUbicacionPublicacion} onClick={() => setMostrarUbicacionPublicacion(!mostrarUbicacionPublicacion)}>{mostrarUbicacionPublicacion ? '⌖ Ocultar ubicación' : '⌖ Agregar ubicación'} <span>{mostrarUbicacionPublicacion ? '−' : '+'}</span></button>
            <span className="match-compose-count">{mensajeNuevo.length}/500</span>
          </div>
          {mostrarUbicacionPublicacion && <div className="match-compose-location-fields">
          <label htmlFor="match-ciudad-publicacion">Ciudad o comuna de la publicación</label>
          <input id="match-ciudad-publicacion" autoComplete="off" value={ciudadPublicacion}
            onChange={e => { setCiudadPublicacion(e.target.value); setCiudadElegidaPublicacion(null); setUbicacionElegida(null); setBusquedaRecintoPublicacion(''); }}
            placeholder="Busca una comuna de Chile" maxLength={120} required />
          {buscandoCiudadPublicacion && <small className="match-location-note">Buscando comunas...</small>}
          {!ciudadElegidaPublicacion && sugerenciasCiudad.length > 0 && <div className="match-location-results" role="listbox" aria-label="Comunas encontradas">
            {sugerenciasCiudad.map(c => <button type="button" key={`${c.osm_type}-${c.osm_id}`} onClick={() => { setCiudadPublicacion(c.name || c.display_name.split(',')[0]); setCiudadElegidaPublicacion(c); setSugerenciasCiudad([]); }}>
              <strong>{c.name || c.display_name.split(',')[0]}</strong><small>{c.display_name}</small>
            </button>)}
          </div>}
          {ciudadElegidaPublicacion && <small className="match-location-valid">✓ Comuna seleccionada: {ciudadElegidaPublicacion.display_name}</small>}
          <label htmlFor="match-buscar-recinto">Lugar o recinto (opcional)</label>
          <input id="match-buscar-recinto" autoComplete="off" value={busquedaRecintoPublicacion}
            onChange={e => { setBusquedaRecintoPublicacion(e.target.value); setUbicacionElegida(null); }}
            placeholder="Busca y selecciona un lugar real" disabled={!ciudadElegidaPublicacion} />
          {buscandoLugar && <small className="match-location-note">Buscando lugares...</small>}
          {!ubicacionElegida && sugerenciasLugar.length > 0 && <div className="match-location-results" role="listbox" aria-label="Lugares encontrados">
            {sugerenciasLugar.map(l => <button type="button" key={`${l.osm_type}-${l.osm_id}`} onClick={() => { setUbicacionElegida(l); setBusquedaRecintoPublicacion(l.display_name); setSugerenciasLugar([]); }}>
              <strong>{l.name || l.display_name.split(',')[0]}</strong><small>{l.display_name}</small>
            </button>)}
          </div>}
          {ubicacionElegida && <div className="match-location-picked"><span>✓ {ubicacionElegida.display_name}</span><button type="button" onClick={() => { setUbicacionElegida(null); setBusquedaRecintoPublicacion(''); }}>Quitar</button></div>}
          {!busquedaRecintoPublicacion && <small className="match-location-note">Puedes publicar sin seleccionar un recinto.</small>}
          {errorUbicacion && <p className="match-error" role="alert">{errorUbicacion}</p>}
          </div>}
          <div className="match-community-actions match-compose-submit"><small>{!ciudadElegidaPublicacion ? 'Selecciona una comuna para publicar' : `Publicación en ${ciudadPublicacion}`}</small><button type="submit" className="match-btn match-btn-primary" disabled={enviandoMuro || !mensajeNuevo.trim() || !ciudadElegidaPublicacion || (Boolean(busquedaRecintoPublicacion.trim()) && !ubicacionElegida)}>{enviandoMuro ? 'Publicando...' : 'Publicar ahora'}</button></div>
        </form>}
        {errorMuro && <p className="match-error" role="alert">{errorMuro}</p>}
        {cargandoMuro ? <p className="match-my-empty">Cargando publicaciones...</p> : publicacionesVisibles.length === 0 ? <p className="match-my-empty">No hay publicaciones con estos filtros. ¡Inicia una conversación!</p> :
          <div className="match-feed-list">{publicacionesVisibles.map(m => <article className="match-feed-card" key={m.id}>
            <div className="match-feed-meta"><div className="match-feed-author"><strong>{(autoresMuro[m.usuario_id]?.nombre || (m.usuario_id === perfil.id ? 'Tú' : 'Miembro de Athletix'))}</strong>
              <span className="match-feed-role">{autoresMuro[m.usuario_id]?.rol || 'Miembro'}</span></div><time dateTime={m.creado_en}>{formatearFecha(m.creado_en)}</time></div>
            <span className="match-feed-place match-feed-city">⌖ {m.ciudad || 'Chile'}</span>
            {m.lugar_nombre && m.lugar_latitud != null && m.lugar_longitud != null && <a className="match-feed-place" href={`https://www.openstreetmap.org/?mlat=${encodeURIComponent(m.lugar_latitud)}&mlon=${encodeURIComponent(m.lugar_longitud)}#map=16/${encodeURIComponent(m.lugar_latitud)}/${encodeURIComponent(m.lugar_longitud)}`} target="_blank" rel="noopener noreferrer">⌖ {m.lugar_nombre} · Ver mapa</a>}
            {m.lugar_id != null && <button type="button" className="match-feed-place" onClick={() => verLugarDesdeMuro(m.lugar_id)}>{nombresLugares.get(String(m.lugar_id)) || 'Recinto deportivo'} · Ver mapa</button>}
            {editarMuro?.tipo === 'publicacion' && editarMuro.id === m.id ? <div className="match-inline-editor"><textarea value={textoEdicion} maxLength={500} onChange={e => setTextoEdicion(e.target.value)} aria-label="Editar publicación"/><div className="match-manage-actions"><button type="button" onClick={guardarEdicionMuro} disabled={procesandoMuro || !textoEdicion.trim()}>Guardar</button><button type="button" onClick={() => setEditarMuro(null)}>Cancelar</button></div></div> : <p>{m.mensaje}</p>}
            {puedeGestionar(m.usuario_id) && <div className="match-manage-actions">{puedeEditar(m.usuario_id) && <button type="button" onClick={() => { setEditarMuro({ tipo: 'publicacion', id: m.id }); setTextoEdicion(m.mensaje); setErrorGestion(''); }}>Editar</button>}<button type="button" className="match-delete-action" onClick={() => { setAccionMuro({ tipo: 'publicacion', id: m.id }); setErrorGestion(''); }}>Eliminar</button></div>}
            <button type="button" className="match-btn match-btn-secondary match-comment-toggle" onClick={() => { setHiloAbierto(hiloAbierto === m.id ? null : m.id); setRespuestaA(null); setTextoComentario(''); }}>
              Comentarios ({comentarios.filter(c => c.publicacion_id === m.id).length})
            </button>
            {hiloAbierto === m.id && <div className="match-comments">
              {comentarios.filter(c => c.publicacion_id === m.id).map(c => <div className="match-comment" key={c.id} style={{ marginLeft: c.respuesta_a ? 14 : 0 }}>
                <strong>{(autoresMuro[c.usuario_id]?.nombre || (c.usuario_id === perfil.id ? 'Tú' : 'Miembro'))}</strong>
                {c.respuesta_a && <small> · Respuesta</small>}
                {editarMuro?.tipo === 'comentario' && editarMuro.id === c.id ? <div className="match-inline-editor"><textarea value={textoEdicion} maxLength={500} onChange={e => setTextoEdicion(e.target.value)} aria-label="Editar comentario"/><div className="match-manage-actions"><button type="button" onClick={guardarEdicionMuro} disabled={procesandoMuro || !textoEdicion.trim()}>Guardar</button><button type="button" onClick={() => setEditarMuro(null)}>Cancelar</button></div></div> : <p>{c.mensaje}</p>}
                {puedeGestionar(c.usuario_id) && <div className="match-manage-actions">{puedeEditar(c.usuario_id) && <button type="button" onClick={() => { setEditarMuro({ tipo: 'comentario', id: c.id }); setTextoEdicion(c.mensaje); setErrorGestion(''); }}>Editar</button>}<button type="button" className="match-delete-action" onClick={() => { setAccionMuro({ tipo: 'comentario', id: c.id }); setErrorGestion(''); }}>Eliminar</button></div>}
                <button type="button" className="match-comment-reply" onClick={() => { setRespuestaA(c.id); setTextoComentario(''); }}>Responder</button>
              </div>)}
              {errorComentarios && <p className="match-error" role="alert">{errorComentarios}</p>}
              <form onSubmit={e => enviarComentario(e, m.id)} className="match-comment-form">
                {respuestaA && <div className="match-reply-indicator">Respondiendo a un comentario <button type="button" onClick={() => setRespuestaA(null)}>Cancelar</button></div>}
                <textarea value={textoComentario} onChange={e => setTextoComentario(e.target.value)} maxLength={500} rows={2} placeholder="Escribe un comentario..." required />
                <button type="submit" className="match-btn match-btn-primary" disabled={enviandoComentario || !textoComentario.trim()}>{enviandoComentario ? 'Enviando...' : 'Comentar'}</button>
              </form>
            </div>}
          </article>)}</div>}
      </section>}
      {pestana === 'partidos' && <section className="match-tab-panel">
        <div className="match-tab-heading"><div><h3>Próximos encuentros</h3><p>Convocatorias disponibles en {zona.nombre}.</p></div><button type="button" className="match-btn match-btn-secondary" disabled={cargandoPartidos} onClick={cargarPartidos}>Actualizar</button></div>
        {partidoDestacadoId != null && partidos.some(p => String(p.id) === String(partidoDestacadoId)) && (
          <div className="match-linked-event"><strong>Partido seleccionado desde Avisos</strong>{renderEventos(partidos.filter(p => String(p.id) === String(partidoDestacadoId)), true)}</div>
        )}
        {renderEventos(partidosDisponibles.filter(p => String(p.id) !== String(partidoDestacadoId)), true)}
        <p className="match-help">¿Quieres organizar uno? Ve a Mapa, selecciona un recinto y toca «Crear convocatoria».</p>
      </section>}
      {pestana === 'mis' && <section className="match-tab-panel">
        <div className="match-tab-heading"><div><h3>Mis encuentros</h3><p>Convocatorias que organizaste o a las que te inscribiste.</p></div><button type="button" className="match-btn match-btn-secondary" disabled={cargandoPartidos} onClick={cargarPartidos}>Actualizar</button></div>
        <div className="match-my-group"><h4>Organizados por mí <span>{misOrganizados.length}</span></h4>{misOrganizados.length ? renderEventos(misOrganizados, true) : <p className="match-my-empty">Todavía no organizas encuentros.</p>}</div>
        <div className="match-my-group"><h4>Mis inscripciones <span>{misInscritos.length}</span></h4>{misInscritos.length ? renderEventos(misInscritos, true) : <p className="match-my-empty">Todavía no te has inscrito en otros encuentros.</p>}</div>
      </section>}
      {errorGestion && <p className="match-error" role="alert">{errorGestion}</p>}
      {accionMuro && <div className="match-modal-backdrop" role="presentation"><div className="match-modal match-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="match-delete-content-title"><h3 id="match-delete-content-title">¿Eliminar {accionMuro.tipo === 'publicacion' ? 'publicación' : 'comentario'}?</h3><p>Esta acción no se puede deshacer.{accionMuro.tipo === 'publicacion' ? ' También se eliminarán sus comentarios.' : ' También se eliminarán sus respuestas.'}</p><div className="match-confirm-actions"><button type="button" className="match-btn match-btn-secondary" onClick={() => setAccionMuro(null)} disabled={procesandoMuro}>Volver</button><button type="button" className="match-btn match-btn-primary" onClick={confirmarEliminacionMuro} disabled={procesandoMuro}>{procesandoMuro ? 'Eliminando...' : 'Eliminar'}</button></div>{errorGestion && <p className="match-error" role="alert">{errorGestion}</p>}</div></div>}
      {cancelacionPendiente !== null && (
        <div className="match-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !guardando) setCancelacionPendiente(null); }}>
          <div className="match-modal match-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="match-cancel-title" aria-describedby="match-cancel-description">
            <h3 id="match-cancel-title">¿Cancelar convocatoria?</h3>
            <p id="match-cancel-description">Se retirará el encuentro y sus inscripciones. Esta acción no se puede deshacer y, si eres administrador, quedará registrada.</p>
            <div className="match-confirm-actions">
              <button type="button" className="match-btn match-btn-secondary" disabled={guardando} onClick={() => setCancelacionPendiente(null)}>Volver</button>
              <button type="button" className="match-btn match-btn-danger" disabled={guardando} onClick={() => ejecutarAccion(esAdministradorMuro ? 'ath_admin_cancelar_partido' : 'match_cancelar_partido', cancelacionPendiente, 'Convocatoria cancelada.')}>{guardando ? 'Cancelando...' : 'Sí, cancelar'}</button>
            </div>
          </div>
        </div>
      )}
      {formularioAbierto && seleccionado && (
        <div className="match-modal-backdrop" role="presentation" onMouseDown={(e) => {
          if (e.target === e.currentTarget && !guardando) setFormularioAbierto(false);
        }}>
          <div className="match-modal" role="dialog" aria-modal="true" aria-labelledby="match-form-title">
            <div className="match-modal-header"><div><span className="match-overline match-overline-dark">NUEVA CONVOCATORIA</span>
              <h3 id="match-form-title">Organizar encuentro</h3></div>
              <button type="button" className="match-close" aria-label="Cerrar" disabled={guardando}
                onClick={() => setFormularioAbierto(false)}>×</button>
            </div>
            <p className="match-modal-location">Lugar: <strong>{seleccionado.nombre}</strong></p>
            <form onSubmit={crearPartido} className="match-form">
              <label>Deporte o actividad
                <select required value={nuevoPartido.deporte} onChange={(e) => setNuevoPartido((p) => ({ ...p, deporte: e.target.value }))}>
                  {(seleccionado.disciplinas || ['Multideporte']).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </label>
              <label>Fecha y hora
                <input type="datetime-local" required value={nuevoPartido.fecha}
                  onChange={(e) => setNuevoPartido((p) => ({ ...p, fecha: e.target.value }))}/>
              </label>
              <label>Cupos totales (incluyéndote)
                <input type="number" min="2" max="30" required value={nuevoPartido.capacidad}
                  onChange={(e) => setNuevoPartido((p) => ({ ...p, capacidad: e.target.value }))}/>
              </label>
              {formError && <p className="match-error" role="alert">{formError}</p>}
              <p className="match-form-note">Athletix organiza participantes; no reserva automáticamente la instalación. Confirma su disponibilidad antes de publicar.</p>
              <button type="submit" className="match-btn match-btn-primary match-submit" disabled={guardando}>
                {guardando ? 'Publicando...' : 'Publicar convocatoria'}
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
