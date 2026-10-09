import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import './CalendarioDeportivo.css';

const TIPOS = ['ENTRENAMIENTO', 'PARTIDO', 'COMPETENCIA', 'REUNION', 'OTRO'];
const ETIQUETAS_TIPO = {
  ENTRENAMIENTO: 'Entrenamiento', PARTIDO: 'Partido',
  COMPETENCIA: 'Competencia', REUNION: 'Reunión', OTRO: 'Otra actividad',
};
const ETIQUETAS_ESTADO = {
  PROGRAMADA: 'Programada', MODIFICADA: 'Modificada', CANCELADA: 'Cancelada',
};
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES = Array.from({ length: 12 }, (_, mes) =>
  new Intl.DateTimeFormat('es-CL', { month: 'long' }).format(new Date(2026, mes, 1))
);
const ANIOS = Array.from({ length: 101 }, (_, indice) => 2000 + indice);
const FORMULARIO_VACIO = {
  titulo: '', tipo: 'ENTRENAMIENTO', equipoId: '',
  inicio: '', fin: '', lugar: '', descripcion: '',
};

function fechaClave(fecha) {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function fechaDesdeClave(clave) {
  const [anio, mes, dia] = clave.split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

function diasDelMes(anio, mes) {
  return new Date(anio, mes + 1, 0).getDate();
}

// Mantiene un día válido cuando se cambia de mes o año (por ejemplo, 31 de enero a febrero).
function actualizarParteFecha(clave, parte, valor) {
  const original = fechaDesdeClave(clave);
  const anio = parte === 'anio' ? Number(valor) : original.getFullYear();
  const mes = parte === 'mes' ? Number(valor) : original.getMonth();
  const dia = parte === 'dia' ? Number(valor) : original.getDate();
  return fechaClave(new Date(anio, mes, Math.min(dia, diasDelMes(anio, mes))));
}

function inicioSemana(fecha) {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  copia.setDate(copia.getDate() - ((copia.getDay() + 6) % 7));
  return copia;
}

function sumarDias(fecha, cantidad) {
  const copia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  copia.setDate(copia.getDate() + cantidad);
  return copia;
}

function fechasVisibles(referencia, vista) {
  if (vista === 'semana') {
    const lunes = inicioSemana(referencia);
    return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
  }
  const primero = new Date(referencia.getFullYear(), referencia.getMonth(), 1);
  const lunes = inicioSemana(primero);
  return Array.from({ length: 42 }, (_, i) => sumarDias(lunes, i));
}

function formatoMes(fecha) {
  const nombreMes = MESES[fecha.getMonth()];
  return `${nombreMes.charAt(0).toUpperCase()}${nombreMes.slice(1)} ${fecha.getFullYear()}`;
}

function formatoFecha(fecha) {
  return new Intl.DateTimeFormat('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }).format(fecha);
}

function formatoHora(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso));
}

function formatoFechaCorta(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('es-CL', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(iso));
}

function aLocalInput(iso) {
  if (!iso) return '';
  const fecha = new Date(iso);
  const hh = String(fecha.getHours()).padStart(2, '0');
  const mm = String(fecha.getMinutes()).padStart(2, '0');
  return `${fechaClave(fecha)}T${hh}:${mm}`;
}

function nuevoHorario(clave) {
  return {
    inicio: `${clave}T18:00`,
    fin: `${clave}T19:00`,
  };
}

// Selector propio de Athletix: evita el calendario nativo del navegador.
function mostrarFechaHora(valor) {
  if (!valor || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) {
    return { fecha: 'Selecciona una fecha', hora: '--:--' };
  }
  const fecha = fechaDesdeClave(valor.slice(0, 10));
  const texto = new Intl.DateTimeFormat('es-CL', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  }).format(fecha);
  return { fecha: texto.charAt(0).toUpperCase() + texto.slice(1), hora: valor.slice(11, 16) };
}

function SelectorFechaHora({ valor, onChange, onCerrar, titulo }) {
  const fechaSeleccionada = valor?.slice(0, 10) || fechaClave(new Date());
  const [hora = '18', minuto = '00'] = (valor?.slice(11, 16) || '18:00').split(':');
  const [mesVisible, setMesVisible] = useState(() => {
    const fecha = fechaDesdeClave(fechaSeleccionada);
    return new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  });
  const [saltoAbierto, setSaltoAbierto] = useState(false);
  const [fechaSalto, setFechaSalto] = useState(fechaSeleccionada);
  const inicioCuadricula = inicioSemana(mesVisible);
  const diasMes = Array.from({ length: 42 }, (_, i) => sumarDias(inicioCuadricula, i));
  const partesSalto = fechaDesdeClave(fechaSalto);
  const hoy = fechaClave(new Date());

  const actualizar = (fecha, nuevaHora = hora, nuevoMinuto = minuto) => {
    onChange(`${fecha}T${nuevaHora}:${nuevoMinuto}`);
  };
  const cambiarMes = (cantidad) => {
    setMesVisible((anterior) => new Date(anterior.getFullYear(), anterior.getMonth() + cantidad, 1));
  };
  const seleccionarDia = (dia) => {
    actualizar(fechaClave(dia));
    if (dia.getMonth() !== mesVisible.getMonth() || dia.getFullYear() !== mesVisible.getFullYear()) {
      setMesVisible(new Date(dia.getFullYear(), dia.getMonth(), 1));
    }
  };
  const elegirHoy = () => {
    const fecha = new Date();
    actualizar(fechaClave(fecha));
    setMesVisible(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    setSaltoAbierto(false);
  };
  const mostrarFechaBuscada = () => {
    const fecha = fechaDesdeClave(fechaSalto);
    actualizar(fechaSalto);
    setMesVisible(new Date(fecha.getFullYear(), fecha.getMonth(), 1));
    setSaltoAbierto(false);
  };

  return (
    <div className="ath-cal-date-picker" role="group" aria-label={titulo}>
      <div className="ath-cal-date-picker-header">
        <div>
          <span className="ath-cal-date-picker-eyebrow">SELECCIONAR FECHA Y HORA</span>
          <strong>{titulo}</strong>
        </div>
        <div className="ath-cal-date-picker-nav">
          <button type="button" aria-label="Mes anterior" onClick={() => cambiarMes(-1)}>‹</button>
          <span className="ath-cal-date-picker-period" aria-live="polite">{formatoMes(mesVisible)}</span>
          <button type="button" aria-label="Mes siguiente" onClick={() => cambiarMes(1)}>›</button>
          <button type="button" className="ath-cal-date-picker-today" onClick={elegirHoy} title="Elegir la fecha de hoy">Ir a hoy</button>
          <button
            type="button"
            className={`ath-cal-date-picker-jump-toggle${saltoAbierto ? ' active' : ''}`}
            aria-expanded={saltoAbierto}
            onClick={() => {
              setFechaSalto(fechaSeleccionada);
              setSaltoAbierto((abierto) => !abierto);
            }}
          >
            Ir a fecha
          </button>
        </div>
      </div>
      {saltoAbierto && (
        <div className="ath-cal-date-picker-jump" role="group" aria-label="Buscar fecha de la actividad">
          <span className="ath-cal-date-picker-jump-title">Buscar una fecha</span>
          <label>Día
            <select value={partesSalto.getDate()} onChange={(evento) => setFechaSalto((clave) => actualizarParteFecha(clave, 'dia', evento.target.value))}>
              {Array.from({ length: diasDelMes(partesSalto.getFullYear(), partesSalto.getMonth()) }, (_, i) => i + 1).map((dia) => <option key={dia} value={dia}>{dia}</option>)}
            </select>
          </label>
          <label>Mes
            <select value={partesSalto.getMonth()} onChange={(evento) => setFechaSalto((clave) => actualizarParteFecha(clave, 'mes', evento.target.value))}>
              {MESES.map((nombre, mes) => <option key={mes} value={mes}>{nombre.charAt(0).toUpperCase() + nombre.slice(1)}</option>)}
            </select>
          </label>
          <label>Año
            <select value={partesSalto.getFullYear()} onChange={(evento) => setFechaSalto((clave) => actualizarParteFecha(clave, 'anio', evento.target.value))}>
              {ANIOS.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
            </select>
          </label>
          <button type="button" className="ath-cal-date-picker-jump-go" onClick={mostrarFechaBuscada}>Mostrar fecha</button>
          <button type="button" className="ath-cal-date-picker-jump-cancel" onClick={() => setSaltoAbierto(false)}>Cerrar</button>
        </div>
      )}
      <div className="ath-cal-date-picker-weekdays">
        {DIAS.map((dia) => <span key={dia}>{dia}</span>)}
      </div>
      <div className="ath-cal-date-picker-days">
        {diasMes.map((dia) => {
          const clave = fechaClave(dia);
          const fuera = dia.getMonth() !== mesVisible.getMonth();
          return (
            <button
              type="button"
              key={clave}
              className={`${fuera ? 'outside ' : ''}${clave === fechaSeleccionada ? 'selected ' : ''}${clave === hoy ? 'today' : ''}`}
              aria-label={formatoFecha(dia)}
              aria-pressed={clave === fechaSeleccionada}
              onClick={() => seleccionarDia(dia)}
            >{dia.getDate()}</button>
          );
        })}
      </div>
      <div className="ath-cal-date-picker-bottom">
        <div className="ath-cal-date-picker-time">
          <span className="ath-cal-date-picker-time-label">Hora</span>
          <label>
            <span className="ath-cal-visually-hidden">Hora (00 a 23)</span>
            <select aria-label="Hora" value={hora} onChange={(evento) => actualizar(fechaSeleccionada, evento.target.value, minuto)}>
              {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </label>
          <span className="ath-cal-date-picker-colon">:</span>
          <label>
            <span className="ath-cal-visually-hidden">Minutos (00 a 59)</span>
            <select aria-label="Minutos" value={minuto} onChange={(evento) => actualizar(fechaSeleccionada, hora, evento.target.value)}>
              {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
        </div>
        <div className="ath-cal-date-picker-actions">
          <button type="button" className="ath-cal-date-picker-done" onClick={onCerrar}>Listo</button>
        </div>
      </div>
    </div>
  );
}

function mensajeError(error, contexto) {
  if (error?.code === '42501') {
    return 'Tu cuenta no tiene permiso para realizar esta acción. Revisa las políticas de actividades en Supabase.';
  }
  if (error?.code === '23503') return 'El equipo o usuario relacionado ya no está disponible.';
  if (error?.code === '23514') return 'La actividad contiene un tipo o estado no permitido.';
  return `${contexto}: ${error?.message || 'Ocurrió un error inesperado.'}`;
}

export default function CalendarioDeportivo({ perfil }) {
  const rolId = Number(perfil.rol_id);
  const administrador = rolId === 1;
  const entrenador = rolId === 2;
  const puedeGestionar = administrador || entrenador;
  const [vista, setVista] = useState('mes');
  const [referencia, setReferencia] = useState(() => new Date());
  const [diaElegido, setDiaElegido] = useState(() => fechaClave(new Date()));
  const [saltoAbierto, setSaltoAbierto] = useState(false);
  const [fechaSalto, setFechaSalto] = useState(() => fechaClave(new Date()));
  const [actividades, setActividades] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [revision, setRevision] = useState(0);
  const [filtroEquipo, setFiltroEquipo] = useState('TODOS');
  const [filtroTipo, setFiltroTipo] = useState('TODOS');
  const [actividadElegidaId, setActividadElegidaId] = useState(null);
  const [formularioVisible, setFormularioVisible] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState(FORMULARIO_VACIO);
  const [selectorFechaAbierto, setSelectorFechaAbierto] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmandoCancelacion, setConfirmandoCancelacion] = useState(null);
  const [cancelando, setCancelando] = useState(false);
  const solicitudActual = useRef(0);

  const dias = useMemo(() => fechasVisibles(referencia, vista), [referencia, vista]);
  const primerDia = fechaClave(dias[0]);
  const ultimoDia = fechaClave(dias[dias.length - 1]);

  const cargarDatos = useCallback(async () => {
    const solicitud = ++solicitudActual.current;
    setCargando(true);
    setErrorCarga('');
    try {
      if (!perfil.id) throw new Error('No se pudo identificar la sesión actual.');
      let ids = [];
      if (!administrador) {
        const { data: membresias, error } = await supabase
          .from('usuario_equipo')
          .select('equipo_id')
          .eq('usuario_id', perfil.id)
          .eq('funcion_en_equipo', entrenador ? 'ENTRENADOR' : 'DEPORTISTA')
          .eq('activo', true);
        if (error) throw error;
        ids = [...new Set((membresias || []).map((item) => item.equipo_id))];
      }

      const inicio = fechaDesdeClave(primerDia);
      const fin = sumarDias(fechaDesdeClave(ultimoDia), 1);
      const consultaEquipos = administrador
        ? supabase.from('equipos').select('id, nombre, estado').order('nombre')
        : ids.length
          ? supabase.from('equipos').select('id, nombre, estado').in('id', ids).order('nombre')
          : Promise.resolve({ data: [], error: null });
      const [respuestaEquipos, respuestaActividades] = await Promise.all([
        consultaEquipos,
        supabase.from('actividades')
          .select('id, titulo, tipo, fecha_hora, fecha_fin, lugar, descripcion, estado, equipo_id, creado_por')
          .gte('fecha_hora', inicio.toISOString())
          .lt('fecha_hora', fin.toISOString())
          .order('fecha_hora', { ascending: true }),
      ]);
      if (respuestaEquipos.error) throw respuestaEquipos.error;
      if (respuestaActividades.error) throw respuestaActividades.error;
      const visibles = administrador
        ? (respuestaActividades.data || [])
        : (respuestaActividades.data || []).filter(
            (item) => item.equipo_id == null || ids.includes(item.equipo_id)
          );
      if (solicitud !== solicitudActual.current) return;
      setEquipos(respuestaEquipos.data || []);
      setActividades(visibles);
      setActividadElegidaId((anterior) =>
        visibles.some((item) => item.id === anterior) ? anterior : null
      );
    } catch (error) {
      if (solicitud === solicitudActual.current) {
        setErrorCarga(mensajeError(error, 'No se pudo cargar el calendario'));
      }
    } finally {
      if (solicitud === solicitudActual.current) setCargando(false);
    }
  }, [perfil.id, administrador, entrenador, primerDia, ultimoDia]);

  useEffect(() => {
    cargarDatos();
    return () => { solicitudActual.current += 1; };
  }, [cargarDatos, revision]);

  const equiposActivos = equipos.filter((item) => item.estado === true);
  const nombreEquipo = (id) => id == null
    ? 'Actividad general'
    : equipos.find((item) => item.id === id)?.nombre || 'Equipo no disponible';
  const equipoEstaActivo = (id) => id == null || equipos.some(
    (item) => item.id === id && item.estado === true
  );
  const puedeEditarActividad = (item) => {
    if (!item || !puedeGestionar) return false;
    if (administrador) return true;
    return item.equipo_id != null && equipos.some(
      (equipo) => equipo.id === item.equipo_id && equipo.estado === true
    );
  };

  const filtradas = actividades.filter((item) =>
    (filtroEquipo === 'TODOS' ||
      (filtroEquipo === 'GENERAL' ? item.equipo_id == null : String(item.equipo_id) === filtroEquipo)) &&
    (filtroTipo === 'TODOS' || item.tipo === filtroTipo)
  );
  const porDia = new Map();
  filtradas.forEach((item) => {
    const clave = fechaClave(new Date(item.fecha_hora));
    if (!porDia.has(clave)) porDia.set(clave, []);
    porDia.get(clave).push(item);
  });
  const delDia = porDia.get(diaElegido) || [];
  const actividadElegida = delDia.find((item) => item.id === actividadElegidaId) || null;
  const cantidadProgramadas = filtradas.filter((item) => item.estado !== 'CANCELADA').length;
  const cantidadCanceladas = filtradas.length - cantidadProgramadas;
  const fechaHoy = fechaClave(new Date());
  const partesSalto = fechaDesdeClave(fechaSalto);

  // Todas las formas de navegar usan el mismo destino para actualizar calendario y agenda.
  const irAFecha = (fecha) => {
    setReferencia(fecha);
    setDiaElegido(fechaClave(fecha));
    setActividadElegidaId(null);
    setSaltoAbierto(false);
    setMensaje('');
  };

  const cambiarPeriodo = (direccion) => {
    const nueva = new Date(referencia);
    if (vista === 'semana') nueva.setDate(nueva.getDate() + direccion * 7);
    else nueva.setMonth(nueva.getMonth() + direccion, 1);
    irAFecha(nueva);
  };

  const irHoy = () => irAFecha(new Date());

  const elegirDia = (clave) => {
    setDiaElegido(clave);
    setActividadElegidaId(null);
    const fecha = fechaDesdeClave(clave);
    if (vista === 'mes' && fecha.getMonth() !== referencia.getMonth()) {
      setReferencia(fecha);
    }
  };

  const comenzarCreacion = () => {
    if (!puedeGestionar || guardando) return;
    if (equiposActivos.length === 0 && !administrador) {
      setErrorAccion('No tienes equipos activos asignados. Solicita al administrador que revise tus equipos.');
      return;
    }
    setEditandoId(null);
    setSelectorFechaAbierto(null);
    setFormulario({ ...FORMULARIO_VACIO, ...nuevoHorario(diaElegido) });
    setErrorAccion('');
    setMensaje('');
    setFormularioVisible(true);
  };

  const comenzarEdicion = (item) => {
    if (!puedeEditarActividad(item) || guardando) return;
    setEditandoId(item.id);
    setSelectorFechaAbierto(null);
    setFormulario({
      titulo: item.titulo || '',
      tipo: item.tipo || 'ENTRENAMIENTO',
      equipoId: item.equipo_id == null ? 'GENERAL' : String(item.equipo_id),
      inicio: aLocalInput(item.fecha_hora),
      fin: aLocalInput(item.fecha_fin),
      lugar: item.lugar || '',
      descripcion: item.descripcion || '',
    });
    setErrorAccion('');
    setMensaje('');
    setFormularioVisible(true);
  };

  const guardarActividad = async (evento) => {
    evento.preventDefault();
    if (!puedeGestionar || guardando) return;
    setErrorAccion('');
    const titulo = formulario.titulo.trim();
    const lugar = formulario.lugar.trim();
    const descripcion = formulario.descripcion.trim();
    const inicio = new Date(formulario.inicio);
    const fin = new Date(formulario.fin);
    const equipoId = formulario.equipoId === 'GENERAL' ? null : Number(formulario.equipoId);

    if (titulo.length < 3 || titulo.length > 100) {
      setErrorAccion('El título debe tener entre 3 y 100 caracteres.'); return;
    }
    if (!TIPOS.includes(formulario.tipo)) {
      setErrorAccion('Selecciona un tipo de actividad válido.'); return;
    }
    if (!formulario.equipoId || (equipoId == null && !administrador)) {
      setErrorAccion('Selecciona un equipo. Solo el administrador puede crear actividades generales.'); return;
    }
    if (equipoId != null && !equiposActivos.some((item) => item.id === equipoId)) {
      setErrorAccion('Selecciona un equipo activo al que tengas acceso.'); return;
    }
    if (!formulario.inicio || !formulario.fin || Number.isNaN(+inicio) || Number.isNaN(+fin) || fin <= inicio) {
      setErrorAccion('Indica un inicio y término válidos. El término debe ser posterior al inicio.'); return;
    }
    if (lugar.length > 150 || descripcion.length > 1000) {
      setErrorAccion('El lugar admite hasta 150 caracteres y la descripción hasta 1000.'); return;
    }

    setGuardando(true);
    try {
      const datos = {
        titulo, tipo: formulario.tipo, equipo_id: equipoId,
        fecha_hora: inicio.toISOString(), fecha_fin: fin.toISOString(),
        lugar: lugar || null, descripcion: descripcion || null,
        estado: editandoId == null ? 'PROGRAMADA' : 'MODIFICADA',
      };
      let respuesta;
      if (editandoId == null) {
        respuesta = await supabase.from('actividades')
          .insert({ ...datos, creado_por: perfil.id }).select('id').single();
      } else {
        respuesta = await supabase.from('actividades')
          .update(datos).eq('id', editandoId).select('id').single();
      }
      if (respuesta.error) throw respuesta.error;
      setFormularioVisible(false);
      setSelectorFechaAbierto(null);
      setMensaje(editandoId == null ? 'Actividad creada correctamente.' : 'Actividad actualizada correctamente.');
      setDiaElegido(fechaClave(inicio));
      setReferencia(inicio);
      setActividadElegidaId(respuesta.data?.id ?? null);
      setRevision((valor) => valor + 1);
    } catch (error) {
      setErrorAccion(mensajeError(error, 'No se pudo guardar la actividad'));
    } finally {
      setGuardando(false);
    }
  };

  const cancelarActividad = async () => {
    const item = confirmandoCancelacion;
    if (!item || !puedeEditarActividad(item) || cancelando) return;
    setCancelando(true);
    setErrorAccion('');
    try {
      const { data, error } = await supabase.from('actividades')
        .update({ estado: 'CANCELADA' }).eq('id', item.id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('No se pudo confirmar la actualización.');
      setConfirmandoCancelacion(null);
      setMensaje('Actividad cancelada. Se conserva en el calendario como registro.');
      setRevision((valor) => valor + 1);
    } catch (error) {
      setErrorAccion(mensajeError(error, 'No se pudo cancelar la actividad'));
    } finally {
      setCancelando(false);
    }
  };

  const periodoTitulo = vista === 'mes'
    ? formatoMes(referencia)
    : `${formatoFechaCorta(dias[0])} — ${formatoFechaCorta(dias[6])}`;

  return (
    <section className="ath-cal">
      <div className="ath-cal-intro">
        <div>
          <span className="ath-cal-eyebrow">{administrador ? 'ESPACIO DEL ADMINISTRADOR' : entrenador ? 'ESPACIO DEL ENTRENADOR' : 'ESPACIO DEL DEPORTISTA'}</span>
          <h2>Calendario deportivo</h2>
          <p>{administrador
            ? 'Organiza las actividades generales y de los equipos del club.'
            : entrenador
              ? 'Programa entrenamientos y actividades para tus equipos asignados.'
              : 'Consulta los entrenamientos, partidos y actividades de tus equipos.'}</p>
        </div>
        <div className="ath-cal-top-actions">
          <button type="button" className="ath-cal-ghost" onClick={() => setRevision((valor) => valor + 1)} disabled={cargando || guardando}>Actualizar</button>
          {puedeGestionar && <button type="button" className="ath-cal-primary" onClick={comenzarCreacion} disabled={cargando || guardando}>+ Nueva actividad</button>}
        </div>
      </div>

      {errorCarga && <div className="ath-cal-error" role="alert">{errorCarga}</div>}
      {mensaje && <div className="ath-cal-success" role="status">{mensaje}</div>}
      {errorAccion && !formularioVisible && !confirmandoCancelacion && <div className="ath-cal-error" role="alert">{errorAccion}</div>}

      <div className="ath-cal-stats">
        <div><span>Actividades del período</span><strong>{filtradas.length}</strong></div>
        <div><span>Programadas o modificadas</span><strong>{cantidadProgramadas}</strong></div>
        <div><span>Canceladas</span><strong>{cantidadCanceladas}</strong></div>
      </div>

      <div className="ath-cal-toolbar">
        <div className="ath-cal-period">
          <button type="button" aria-label="Período anterior" title="Período anterior" onClick={() => cambiarPeriodo(-1)}>‹</button>
          <h3 className={`ath-cal-period-title${vista === 'semana' ? ' is-week' : ''}`}>
            {periodoTitulo}
          </h3>
          <button type="button" aria-label="Período siguiente" title="Período siguiente" onClick={() => cambiarPeriodo(1)}>›</button>
          <button type="button" className="ath-cal-today" onClick={irHoy} title="Volver a la fecha actual">Ir a hoy</button>
          <button
            type="button"
            className={`ath-cal-jump-toggle${saltoAbierto ? ' active' : ''}`}
            aria-expanded={saltoAbierto}
            onClick={() => {
              setFechaSalto(diaElegido);
              setSaltoAbierto((abierto) => !abierto);
            }}
          >
            Ir a fecha
          </button>
        </div>
        <div className="ath-cal-filters">
          <label>
            <span>Equipo</span>
            <select value={filtroEquipo} onChange={(evento) => setFiltroEquipo(evento.target.value)}>
              <option value="TODOS">Todos</option>
              <option value="GENERAL">Actividades generales</option>
              {equipos.map((equipo) => <option key={equipo.id} value={String(equipo.id)}>{equipo.nombre}{equipo.estado ? '' : ' (inactivo)'}</option>)}
            </select>
          </label>
          <label>
            <span>Tipo</span>
            <select value={filtroTipo} onChange={(evento) => setFiltroTipo(evento.target.value)}>
              <option value="TODOS">Todos</option>
              {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{ETIQUETAS_TIPO[tipo]}</option>)}
            </select>
          </label>
          <div className="ath-cal-view" role="group" aria-label="Vista del calendario">
            <button type="button" className={vista === 'mes' ? 'active' : ''} aria-pressed={vista === 'mes'} onClick={() => setVista('mes')}>Mes</button>
            <button type="button" className={vista === 'semana' ? 'active' : ''} aria-pressed={vista === 'semana'} onClick={() => setVista('semana')}>Semana</button>
          </div>
        </div>
      </div>

      {saltoAbierto && (
        <form className="ath-cal-jump-panel" onSubmit={(evento) => {
          evento.preventDefault();
          irAFecha(fechaDesdeClave(fechaSalto));
        }}>
          <div className="ath-cal-jump-intro">
            <strong>Buscar una fecha</strong>
            <span>Elige día, mes y año para ir directamente.</span>
          </div>
          <label>Día
            <select value={partesSalto.getDate()} onChange={(evento) => setFechaSalto((clave) => actualizarParteFecha(clave, 'dia', evento.target.value))}>
              {Array.from({ length: diasDelMes(partesSalto.getFullYear(), partesSalto.getMonth()) }, (_, i) => i + 1).map((dia) => <option key={dia} value={dia}>{dia}</option>)}
            </select>
          </label>
          <label>Mes
            <select value={partesSalto.getMonth()} onChange={(evento) => setFechaSalto((clave) => actualizarParteFecha(clave, 'mes', evento.target.value))}>
              {MESES.map((nombre, mes) => <option key={mes} value={mes}>{nombre.charAt(0).toUpperCase() + nombre.slice(1)}</option>)}
            </select>
          </label>
          <label>Año
            <select value={partesSalto.getFullYear()} onChange={(evento) => setFechaSalto((clave) => actualizarParteFecha(clave, 'anio', evento.target.value))}>
              {ANIOS.map((anio) => <option key={anio} value={anio}>{anio}</option>)}
            </select>
          </label>
          <button type="submit" className="ath-cal-jump-go">Mostrar fecha</button>
          <button type="button" className="ath-cal-jump-cancel" onClick={() => setSaltoAbierto(false)}>Cerrar</button>
        </form>
      )}

      <div className="ath-cal-layout">
        <div className="ath-cal-calendar">
          <div className="ath-cal-weekdays">{DIAS.map((dia) => <span key={dia}>{dia}</span>)}</div>
          <div className={`ath-cal-grid ${vista === 'semana' ? 'week' : ''}`}>
            {dias.map((dia) => {
              const clave = fechaClave(dia);
              const eventos = porDia.get(clave) || [];
              const fuera = vista === 'mes' && dia.getMonth() !== referencia.getMonth();
              return (
                <button type="button" key={clave}
                  className={`ath-cal-day${fuera ? ' outside' : ''}${clave === diaElegido ? ' chosen' : ''}${clave === fechaHoy ? ' today' : ''}`}
                  onClick={() => elegirDia(clave)} aria-pressed={clave === diaElegido}
                  aria-label={`${formatoFecha(dia)}. ${eventos.length} actividades.`}>
                  <span className="ath-cal-day-number">{dia.getDate()}</span>
                  <span className="ath-cal-day-events">
                    {eventos.slice(0, vista === 'semana' ? 4 : 2).map((item) => (
                      <span key={item.id} className={`ath-cal-chip tipo-${item.tipo.toLowerCase()}${item.estado === 'CANCELADA' ? ' cancelled' : ''}`}>
                        <span className="ath-cal-chip-time">{formatoHora(item.fecha_hora)}</span> {item.titulo}
                      </span>
                    ))}
                    {eventos.length > (vista === 'semana' ? 4 : 2) && (
                      <span className="ath-cal-more">+{eventos.length - (vista === 'semana' ? 4 : 2)} más</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {cargando && <div className="ath-cal-loading" role="status">Cargando actividades...</div>}
        </div>

        <aside className="ath-cal-agenda">
          <div className="ath-cal-agenda-heading">
            <span>AGENDA DEL DÍA</span>
            <h3>{formatoFecha(fechaDesdeClave(diaElegido))}</h3>
            <p>{delDia.length === 1 ? '1 actividad' : `${delDia.length} actividades`}</p>
          </div>
          {delDia.length === 0 ? (
            <div className="ath-cal-empty">
              <div className="ath-cal-empty-icon" aria-hidden="true">◎</div>
              <strong>Sin actividades</strong>
              <p>No hay eventos para esta fecha con los filtros seleccionados.</p>
              {puedeGestionar && <button type="button" onClick={comenzarCreacion}>Programar actividad</button>}
            </div>
          ) : (
            <div className="ath-cal-agenda-list">
              {delDia.map((item) => (
                <button type="button" key={item.id}
                  className={`ath-cal-agenda-item${actividadElegidaId === item.id ? ' active' : ''}`}
                  onClick={() => setActividadElegidaId((actual) => actual === item.id ? null : item.id)}
                  aria-expanded={actividadElegidaId === item.id}>
                  <span className={`ath-cal-agenda-stripe tipo-${item.tipo.toLowerCase()}`} />
                  <span className="ath-cal-agenda-item-text">
                    <strong>{item.titulo}</strong>
                    <small>{formatoHora(item.fecha_hora)}{item.fecha_fin ? ` – ${formatoHora(item.fecha_fin)}` : ''}</small>
                    <small>{nombreEquipo(item.equipo_id)}</small>
                  </span>
                  <span className={`ath-cal-mini-status ${item.estado === 'CANCELADA' ? 'cancelled' : ''}`}>
                    {item.estado === 'CANCELADA' ? 'Cancelada' : '›'}
                  </span>
                </button>
              ))}
            </div>
          )}
          {actividadElegida && (
            <div className="ath-cal-detail">
              <div className="ath-cal-detail-top">
                <span className={`ath-cal-type tipo-${actividadElegida.tipo.toLowerCase()}`}>{ETIQUETAS_TIPO[actividadElegida.tipo] || actividadElegida.tipo}</span>
                <span className={`ath-cal-status ${actividadElegida.estado === 'CANCELADA' ? 'cancelled' : ''}`}>{ETIQUETAS_ESTADO[actividadElegida.estado] || actividadElegida.estado}</span>
              </div>
              <h4>{actividadElegida.titulo}</h4>
              <dl>
                <div><dt>Equipo</dt><dd>{nombreEquipo(actividadElegida.equipo_id)}</dd></div>
                <div><dt>Inicio</dt><dd>{formatoFechaCorta(actividadElegida.fecha_hora)} · {formatoHora(actividadElegida.fecha_hora)}</dd></div>
                {actividadElegida.fecha_fin && <div><dt>Término</dt><dd>{formatoFechaCorta(actividadElegida.fecha_fin)} · {formatoHora(actividadElegida.fecha_fin)}</dd></div>}
                {actividadElegida.lugar && <div><dt>Lugar</dt><dd>{actividadElegida.lugar}</dd></div>}
              </dl>
              {actividadElegida.descripcion && <p className="ath-cal-description">{actividadElegida.descripcion}</p>}
              {!equipoEstaActivo(actividadElegida.equipo_id) && <p className="ath-cal-warning">Este equipo está inactivo. Su actividad se conserva como historial.</p>}
              {puedeEditarActividad(actividadElegida) && (
                <div className="ath-cal-detail-actions">
                  <button type="button" className="ath-cal-ghost" onClick={() => comenzarEdicion(actividadElegida)}>
                    {actividadElegida.estado === 'CANCELADA' ? 'Reprogramar' : 'Editar'}
                  </button>
                  {actividadElegida.estado !== 'CANCELADA' && (
                    <button type="button" className="ath-cal-danger" onClick={() => { setErrorAccion(''); setConfirmandoCancelacion(actividadElegida); }}>Cancelar actividad</button>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {formularioVisible && (
        <div className="ath-cal-overlay" onMouseDown={(evento) => { if (evento.target === evento.currentTarget && !guardando) setFormularioVisible(false); }}>
          <div className="ath-cal-modal" role="dialog" aria-modal="true" aria-labelledby="ath-cal-form-title">
            <div className="ath-cal-modal-head">
              <div><span className="ath-cal-eyebrow">CALENDARIO DEPORTIVO</span><h3 id="ath-cal-form-title">{editandoId == null ? 'Nueva actividad' : 'Editar actividad'}</h3></div>
              <button type="button" className="ath-cal-close" aria-label="Cerrar formulario" disabled={guardando} onClick={() => setFormularioVisible(false)}>×</button>
            </div>
            <form onSubmit={guardarActividad}>
              <div className="ath-cal-form-grid">
                <label className="ath-cal-span-2">Título *
                  <input required maxLength={100} value={formulario.titulo} placeholder="Ej. Entrenamiento de resistencia" onChange={(evento) => setFormulario((actual) => ({ ...actual, titulo: evento.target.value }))} />
                </label>
                <label>Tipo de actividad *
                  <select value={formulario.tipo} onChange={(evento) => setFormulario((actual) => ({ ...actual, tipo: evento.target.value }))}>
                    {TIPOS.map((tipo) => <option key={tipo} value={tipo}>{ETIQUETAS_TIPO[tipo]}</option>)}
                  </select>
                </label>
                <label>Dirigida a *
                  <select required value={formulario.equipoId} onChange={(evento) => setFormulario((actual) => ({ ...actual, equipoId: evento.target.value }))}>
                    <option value="">Selecciona un destino</option>
                    {administrador && <option value="GENERAL">Todo el club (general)</option>}
                    {equiposActivos.map((equipo) => <option key={equipo.id} value={String(equipo.id)}>{equipo.nombre}</option>)}
                  </select>
                </label>
                <div className="ath-cal-datetime-field">
                  <span id="ath-cal-label-inicio">Fecha y hora de inicio *</span>
                  <button
                    type="button"
                    className={`ath-cal-datetime-trigger${selectorFechaAbierto === 'inicio' ? ' active' : ''}`}
                    aria-labelledby="ath-cal-label-inicio"
                    aria-expanded={selectorFechaAbierto === 'inicio'}
                    disabled={guardando}
                    onClick={() => setSelectorFechaAbierto((actual) => actual === 'inicio' ? null : 'inicio')}
                  >
                    <span className="ath-cal-datetime-date">{mostrarFechaHora(formulario.inicio).fecha}</span>
                    <strong>{mostrarFechaHora(formulario.inicio).hora}</strong>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>
                  </button>
                </div>
                <div className="ath-cal-datetime-field">
                  <span id="ath-cal-label-fin">Fecha y hora de término *</span>
                  <button
                    type="button"
                    className={`ath-cal-datetime-trigger${selectorFechaAbierto === 'fin' ? ' active' : ''}`}
                    aria-labelledby="ath-cal-label-fin"
                    aria-expanded={selectorFechaAbierto === 'fin'}
                    disabled={guardando}
                    onClick={() => setSelectorFechaAbierto((actual) => actual === 'fin' ? null : 'fin')}
                  >
                    <span className="ath-cal-datetime-date">{mostrarFechaHora(formulario.fin).fecha}</span>
                    <strong>{mostrarFechaHora(formulario.fin).hora}</strong>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>
                  </button>
                </div>
                {selectorFechaAbierto && (
                  <div className="ath-cal-span-2 ath-cal-picker-wrapper">
                    <SelectorFechaHora
                      key={selectorFechaAbierto}
                      titulo={selectorFechaAbierto === 'inicio' ? 'Inicio de la actividad' : 'Término de la actividad'}
                      valor={formulario[selectorFechaAbierto]}
                      onChange={(valor) => setFormulario((actual) => ({ ...actual, [selectorFechaAbierto]: valor }))}
                      onCerrar={() => setSelectorFechaAbierto(null)}
                    />
                  </div>
                )}
                <label className="ath-cal-span-2">Lugar
                  <input maxLength={150} value={formulario.lugar} placeholder="Ej. Gimnasio principal" onChange={(evento) => setFormulario((actual) => ({ ...actual, lugar: evento.target.value }))} />
                </label>
                <label className="ath-cal-span-2">Descripción
                  <textarea rows={3} maxLength={1000} value={formulario.descripcion} placeholder="Información para los participantes..." onChange={(evento) => setFormulario((actual) => ({ ...actual, descripcion: evento.target.value }))} />
                </label>
              </div>
              {editandoId != null && <p className="ath-cal-hint">Al guardar, la actividad quedará marcada como «Modificada». Si estaba cancelada, volverá a estar disponible.</p>}
              {errorAccion && <div className="ath-cal-error" role="alert">{errorAccion}</div>}
              <div className="ath-cal-modal-actions">
                <button type="button" className="ath-cal-ghost" disabled={guardando} onClick={() => setFormularioVisible(false)}>Cerrar</button>
                <button type="submit" className="ath-cal-primary" disabled={guardando}>{guardando ? 'Guardando...' : editandoId == null ? 'Crear actividad' : 'Guardar cambios'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmandoCancelacion && (
        <div className="ath-cal-overlay">
          <div className="ath-cal-modal ath-cal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="ath-cal-confirm-title" aria-describedby="ath-cal-confirm-text">
            <span className="ath-cal-confirm-symbol" aria-hidden="true">!</span>
            <h3 id="ath-cal-confirm-title">¿Cancelar esta actividad?</h3>
            <p id="ath-cal-confirm-text"><strong>{confirmandoCancelacion.titulo}</strong> quedará marcada como cancelada. Los deportistas podrán ver el cambio y el registro no se eliminará.</p>
            {errorAccion && <div className="ath-cal-error" role="alert">{errorAccion}</div>}
            <div className="ath-cal-modal-actions">
              <button type="button" className="ath-cal-ghost" disabled={cancelando} onClick={() => { setConfirmandoCancelacion(null); setErrorAccion(''); }}>Volver</button>
              <button type="button" className="ath-cal-danger ath-cal-danger-filled" disabled={cancelando} onClick={cancelarActividad}>{cancelando ? 'Cancelando...' : 'Sí, cancelar actividad'}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
