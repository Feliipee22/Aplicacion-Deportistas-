import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import './RutinasEntrenador.css';

const formularioInicial = { nombre: '', descripcion: '' };

function numeroOpcional(valor, nombreCampo, minimo) {
  if (valor === '') return null;
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) {
    throw new Error(`${nombreCampo} debe ser un número entero de al menos ${minimo}.`);
  }
  return numero;
}

export default function RutinasEntrenador({ usuarioId }) {
  const [rutinas, setRutinas] = useState([]);
  const [ejercicios, setEjercicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [ejercicioSeleccionado, setEjercicioSeleccionado] = useState('');
  const [detalles, setDetalles] = useState([]);
  const siguienteClave = useRef(0);
  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [errorAccion, setErrorAccion] = useState('');

  // Edición: utiliza el mismo formulario que la creación.
  const [editandoId, setEditandoId] = useState(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const formularioRef = useRef(null);

  // Confirmación integrada: nunca borra asignaciones de forma accidental.
  const [rutinaPorEliminar, setRutinaPorEliminar] = useState(null);
  const [resumenEliminacion, setResumenEliminacion] = useState(null);
  const [consultandoEliminacion, setConsultandoEliminacion] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminacion, setErrorEliminacion] = useState('');
  const [cambiandoEstadoId, setCambiandoEstadoId] = useState(null);

  const [rutinaAbierta, setRutinaAbierta] = useState(null);
  const [detallesAbiertos, setDetallesAbiertos] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');


  // Asignaciones individuales: solo deportistas visibles para el entrenador.
  const [rutinaParaAsignar, setRutinaParaAsignar] = useState(null);
  const [deportistasDisponibles, setDeportistasDisponibles] = useState([]);
  const [asignacionesRutina, setAsignacionesRutina] = useState([]);
  const [deportistaElegido, setDeportistaElegido] = useState('');
  const [cargandoAsignaciones, setCargandoAsignaciones] = useState(false);
  const [guardandoAsignacion, setGuardandoAsignacion] = useState(false);
  const [errorAsignacion, setErrorAsignacion] = useState('');
  const [mensajeAsignacion, setMensajeAsignacion] = useState('');

  // Asignaciones por equipo: un registro en rutina_equipo cubre a sus deportistas activos.
  const [rutinaParaAsignarEquipo, setRutinaParaAsignarEquipo] = useState(null);
  const [equiposDisponibles, setEquiposDisponibles] = useState([]);
  const [asignacionesEquipo, setAsignacionesEquipo] = useState([]);
  const [equipoElegido, setEquipoElegido] = useState('');
  const [cargandoEquipos, setCargandoEquipos] = useState(false);
  const [guardandoAsignacionEquipo, setGuardandoAsignacionEquipo] = useState(false);
  const [errorAsignacionEquipo, setErrorAsignacionEquipo] = useState('');
  const [mensajeAsignacionEquipo, setMensajeAsignacionEquipo] = useState('');

  const cargarDatos = useCallback(async () => {
    if (!usuarioId) {
      setErrorCarga('No se pudo identificar al entrenador.');
      setCargando(false);
      return;
    }

    setCargando(true);
    setErrorCarga('');

    try {
      const [respuestaEjercicios, respuestaRutinas] = await Promise.all([
        supabase
          .from('ejercicios')
          .select('id, nombre, categoria')
          .order('nombre', { ascending: true }),
        supabase
          .from('rutinas')
          .select('id, nombre, descripcion, estado, fecha_creacion')
          .eq('entrenador_id', usuarioId)
          .order('fecha_creacion', { ascending: false }),
      ]);

      if (respuestaEjercicios.error) throw respuestaEjercicios.error;
      if (respuestaRutinas.error) throw respuestaRutinas.error;

      setEjercicios(respuestaEjercicios.data || []);
      setRutinas(respuestaRutinas.data || []);
    } catch (error) {
      console.error('Error al cargar rutinas y ejercicios:', error);
      setErrorCarga('No se pudieron cargar las rutinas o la biblioteca de ejercicios.');
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  useEffect(() => {
    if (mostrarFormulario && editandoId !== null) {
      formularioRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [mostrarFormulario, editandoId]);

  useEffect(() => {
    if (!rutinaPorEliminar || eliminando || cambiandoEstadoId !== null) return undefined;
    const alPresionarTecla = (evento) => {
      if (evento.key === 'Escape') {
        setRutinaPorEliminar(null);
        setResumenEliminacion(null);
        setErrorEliminacion('');
      }
    };
    window.addEventListener('keydown', alPresionarTecla);
    return () => window.removeEventListener('keydown', alPresionarTecla);
  }, [rutinaPorEliminar, eliminando, cambiandoEstadoId]);

  const cerrarFormulario = () => {
    if (guardando) return;
    setMostrarFormulario(false);
    setFormulario(formularioInicial);
    setEjercicioSeleccionado('');
    setDetalles([]);
    setErrorFormulario('');
    setEditandoId(null);
  };

  const agregarEjercicio = () => {
    if (!ejercicioSeleccionado) return;
    siguienteClave.current += 1;

    setDetalles((actuales) => [
      ...actuales,
      {
        clave: siguienteClave.current,
        ejercicio_id: Number(ejercicioSeleccionado),
        series: '3',
        repeticiones: '12',
        duracion_segundos: '',
        descanso_segundos: '60',
        indicaciones_adicionales: '',
      },
    ]);
    setEjercicioSeleccionado('');
    setErrorFormulario('');
  };

  const cambiarDetalle = (clave, campo, valor) => {
    setDetalles((actuales) =>
      actuales.map((detalle) =>
        detalle.clave === clave ? { ...detalle, [campo]: valor } : detalle
      )
    );
  };


  const abrirEdicion = async (rutina) => {
    if (guardando || cargandoEdicion || eliminando || cambiandoEstadoId !== null) return;
    if (mostrarFormulario) {
      setErrorAccion('Cierra o guarda el formulario abierto antes de editar otra rutina.');
      return;
    }
    setCargandoEdicion(true);
    setErrorAccion('');
    setMensaje('');
    try {
      const { data, error } = await supabase
        .from('detalle_rutina')
        .select('id, ejercicio_id, orden, series, repeticiones, duracion_segundos, descanso_segundos, indicaciones_adicionales')
        .eq('rutina_id', rutina.id)
        .order('orden', { ascending: true });
      if (error) throw error;
      if (!data?.length) {
        setErrorAccion('Esta rutina no tiene ejercicios. Revisa su información antes de editarla.');
        return;
      }
      const valores = data.map((detalle) => {
        siguienteClave.current += 1;
        return {
          clave: siguienteClave.current,
          ejercicio_id: detalle.ejercicio_id,
          series: detalle.series == null ? '' : String(detalle.series),
          repeticiones: detalle.repeticiones == null ? '' : String(detalle.repeticiones),
          duracion_segundos: detalle.duracion_segundos == null ? '' : String(detalle.duracion_segundos),
          descanso_segundos: detalle.descanso_segundos == null ? '' : String(detalle.descanso_segundos),
          indicaciones_adicionales: detalle.indicaciones_adicionales || '',
        };
      });
      setFormulario({ nombre: rutina.nombre, descripcion: rutina.descripcion || '' });
      setDetalles(valores);
      setEjercicioSeleccionado('');
      setEditandoId(rutina.id);
      setErrorFormulario('');
      setMostrarFormulario(true);
    } catch (error) {
      console.error('Error al cargar rutina para edición:', error);
      setErrorAccion('No se pudieron cargar los ejercicios para editar la rutina.');
    } finally {
      setCargandoEdicion(false);
    }
  };

  const cerrarConfirmacionEliminacion = () => {
    if (eliminando || cambiandoEstadoId !== null) return;
    setRutinaPorEliminar(null);
    setResumenEliminacion(null);
    setErrorEliminacion('');
  };

  const abrirConfirmacionEliminacion = async (rutina) => {
    if (guardando || eliminando || consultandoEliminacion || cambiandoEstadoId !== null) return;
    if (mostrarFormulario) {
      setErrorAccion('Cierra el formulario antes de eliminar o archivar una rutina.');
      return;
    }
    setRutinaPorEliminar(rutina);
    setResumenEliminacion(null);
    setErrorEliminacion('');
    setErrorAccion('');
    setConsultandoEliminacion(true);
    try {
      const [personas, equipos] = await Promise.all([
        supabase.from('rutina_usuario').select('id', { count: 'exact', head: true }).eq('rutina_id', rutina.id),
        supabase.from('rutina_equipo').select('id', { count: 'exact', head: true }).eq('rutina_id', rutina.id),
      ]);
      if (personas.error) throw personas.error;
      if (equipos.error) throw equipos.error;
      setResumenEliminacion({ deportistas: personas.count ?? 0, equipos: equipos.count ?? 0 });
    } catch (error) {
      console.error('Error al revisar asignaciones antes de eliminar:', error);
      setErrorEliminacion('No se pudieron comprobar las asignaciones. Por seguridad, no se puede eliminar esta rutina.');
    } finally {
      setConsultandoEliminacion(false);
    }
  };

  const eliminarRutina = async () => {
    if (!rutinaPorEliminar || !resumenEliminacion || eliminando || cambiandoEstadoId !== null) return;
    if (resumenEliminacion.deportistas > 0 || resumenEliminacion.equipos > 0) return;
    setEliminando(true);
    setErrorEliminacion('');
    try {
      const { data: autenticacion, error: errorAutenticacion } = await supabase.auth.getUser();
      if (errorAutenticacion || autenticacion?.user?.id !== usuarioId) {
        throw new Error('No se pudo verificar la sesión del entrenador.');
      }
      // La función SQL vuelve a comprobar la propiedad y las asignaciones
      // dentro de una única transacción; nunca se fía solo de esta pantalla.
      const { error } = await supabase.rpc('eliminar_rutina_entrenador', {
        p_rutina_id: rutinaPorEliminar.id,
      });
      if (error) throw error;
      if (rutinaAbierta === rutinaPorEliminar.id) {
        setRutinaAbierta(null);
        setDetallesAbiertos([]);
      }
      setRutinaPorEliminar(null);
      setResumenEliminacion(null);
      setMensaje('La rutina se eliminó definitivamente.');
      await cargarDatos();
    } catch (error) {
      console.error('Error al eliminar rutina:', error);
      setErrorEliminacion(error.code === 'P0001'
        ? 'No se puede eliminar: la rutina tiene asignaciones o no tienes permiso. Puedes archivarla si está asignada.'
        : 'No se pudo eliminar la rutina. Revisa que hayas ejecutado el archivo SQL y consulta la consola.');
    } finally {
      setEliminando(false);
    }
  };

  const cambiarEstadoRutina = async (rutina, nuevoEstado) => {
    if (guardando || eliminando || cambiandoEstadoId !== null) return;
    setCambiandoEstadoId(rutina.id);
    setErrorEliminacion('');
    setErrorAccion('');
    try {
      const { data: autenticacion, error: errorAutenticacion } = await supabase.auth.getUser();
      if (errorAutenticacion || autenticacion?.user?.id !== usuarioId) {
        throw new Error('No se pudo verificar la sesión del entrenador.');
      }
      const { data, error } = await supabase.from('rutinas')
        .update({ estado: nuevoEstado, updated_at: new Date().toISOString() })
        .eq('id', rutina.id)
        .eq('entrenador_id', usuarioId)
        .select('id');
      if (error) throw error;
      if (data?.length !== 1) throw new Error('No se actualizó el estado de la rutina.');
      if (nuevoEstado === 'ARCHIVADA') {
        setRutinaPorEliminar(null);
        setResumenEliminacion(null);
        setMensaje('La rutina se archivó. Sus asignaciones se conservan, pero los deportistas ya no la verán en «Mis rutinas».');
      } else {
        setMensaje('La rutina se reactivó. Los deportistas con asignaciones activas volverán a verla.');
      }
      await cargarDatos();
    } catch (error) {
      console.error('Error al cambiar estado de rutina:', error);
      if (rutinaPorEliminar?.id === rutina.id) {
        setErrorEliminacion('No se pudo archivar la rutina. Revisa los permisos en Supabase.');
      } else {
        setErrorAccion('No se pudo reactivar la rutina. Revisa los permisos en Supabase.');
      }
    } finally {
      setCambiandoEstadoId(null);
    }
  };

  const guardarRutina = async (evento) => {
    evento.preventDefault();
    if (guardando) return;

    setErrorFormulario('');
    setMensaje('');

    if (!formulario.nombre.trim()) {
      setErrorFormulario('Escribe un nombre para la rutina.');
      return;
    }
    if (detalles.length === 0) {
      setErrorFormulario('Agrega al menos un ejercicio a la rutina.');
      return;
    }

    let registros;
    try {
      registros = detalles.map((detalle, indice) => {
        const series = numeroOpcional(detalle.series, 'Series', 1);
        const repeticiones = numeroOpcional(detalle.repeticiones, 'Repeticiones', 1);
        const duracion = numeroOpcional(detalle.duracion_segundos, 'Duración', 1);
        const descanso = numeroOpcional(detalle.descanso_segundos, 'Descanso', 0);

        if (repeticiones === null && duracion === null) {
          throw new Error(`El ejercicio ${indice + 1} necesita repeticiones o duración.`);
        }

        return {
          ejercicio_id: detalle.ejercicio_id,
          orden: indice + 1,
          series,
          repeticiones,
          duracion_segundos: duracion,
          descanso_segundos: descanso,
          indicaciones_adicionales: detalle.indicaciones_adicionales.trim() || null,
        };
      });
    } catch (error) {
      setErrorFormulario(error.message);
      return;
    }

    setGuardando(true);

    if (editandoId !== null) {
      try {
        const { data: autenticacion, error: errorAutenticacion } = await supabase.auth.getUser();
        if (errorAutenticacion || autenticacion?.user?.id !== usuarioId) {
          throw new Error('La sesión del entrenador no pudo verificarse.');
        }
        // La actualización de rutina y sus ejercicios es atómica en Supabase.
        const { error } = await supabase.rpc('actualizar_rutina_entrenador', {
          p_rutina_id: editandoId,
          p_nombre: formulario.nombre.trim(),
          p_descripcion: formulario.descripcion.trim() || null,
          p_detalles: registros,
        });
        if (error) throw error;
        if (rutinaAbierta === editandoId) {
          setRutinaAbierta(null);
          setDetallesAbiertos([]);
        }
        setMostrarFormulario(false);
        setEditandoId(null);
        setFormulario(formularioInicial);
        setEjercicioSeleccionado('');
        setDetalles([]);
        setMensaje('La rutina se actualizó correctamente. Los deportistas asignados verán los cambios al actualizar su sesión.');
        await cargarDatos();
      } catch (error) {
        console.error('Error al actualizar rutina:', error);
        setErrorFormulario('No se pudieron guardar los cambios. Comprueba que ejecutaste el archivo SQL y revisa la consola.');
      } finally {
        setGuardando(false);
      }
      return;
    }

    let rutinaCreadaId = null;

    try {
      const { data: autenticacion, error: errorAutenticacion } = await supabase.auth.getUser();
      if (errorAutenticacion || autenticacion?.user?.id !== usuarioId) {
        throw new Error('La sesión del entrenador no pudo verificarse.');
      }

      const fecha = new Date().toISOString();
      const { data: rutinaCreada, error: errorRutina } = await supabase
        .from('rutinas')
        .insert({
          nombre: formulario.nombre.trim(),
          descripcion: formulario.descripcion.trim() || null,
          entrenador_id: usuarioId,
          estado: 'ACTIVA',
          fecha_creacion: fecha,
          updated_at: fecha,
        })
        .select('id')
        .single();

      if (errorRutina) throw errorRutina;
      rutinaCreadaId = rutinaCreada.id;

      const { error: errorEjercicios } = await supabase
        .from('detalle_rutina')
        .insert(
          registros.map((detalle) => ({
            ...detalle,
            rutina_id: rutinaCreadaId,
            created_at: fecha,
          }))
        );

      if (errorEjercicios) throw errorEjercicios;

      cerrarFormulario();
      setMostrarFormulario(false);
      setFormulario(formularioInicial);
      setEjercicioSeleccionado('');
      setDetalles([]);
      setEditandoId(null);
      setMensaje('La rutina y sus ejercicios se guardaron correctamente.');
      await cargarDatos();
    } catch (error) {
      console.error('Error al guardar rutina:', error);

      if (rutinaCreadaId !== null) {
        // Si falla el detalle, intentamos retirar la rutina incompleta.
        const { data: rutinaEliminada, error: errorReversion } = await supabase
          .from('rutinas')
          .delete()
          .eq('id', rutinaCreadaId)
          .eq('entrenador_id', usuarioId)
          .select('id');

        const reversionConfirmada = !errorReversion && rutinaEliminada?.length === 1;
        setErrorFormulario(
          reversionConfirmada
            ? 'No se pudo guardar la rutina completa. Se revirtió la creación; puedes intentarlo otra vez.'
            : 'No se pudieron guardar los ejercicios y puede haber quedado una rutina incompleta. Revisa Supabase antes de reintentar.'
        );
      } else {
        setErrorFormulario('No se pudo crear la rutina. Revisa los permisos o inténtalo nuevamente.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const abrirRutina = async (rutinaId) => {
    if (cargandoDetalle) return;
    if (rutinaAbierta === rutinaId) {
      setRutinaAbierta(null);
      setDetallesAbiertos([]);
      setErrorDetalle('');
      return;
    }

    setRutinaAbierta(rutinaId);
    setDetallesAbiertos([]);
    setErrorDetalle('');
    setCargandoDetalle(true);

    const { data, error } = await supabase
      .from('detalle_rutina')
      .select(`
        id, orden, series, repeticiones, duracion_segundos,
        descanso_segundos, indicaciones_adicionales,
        ejercicio:ejercicios (nombre, categoria)
      `)
      .eq('rutina_id', rutinaId)
      .order('orden', { ascending: true });

    if (error) {
      console.error('Error al consultar detalle de rutina:', error);
      setErrorDetalle('No se pudieron consultar los ejercicios de esta rutina.');
    } else {
      setDetallesAbiertos(data || []);
    }
    setCargandoDetalle(false);
  };

  // La consulta de usuarios respeta las políticas RLS: el entrenador
  // solo verá deportistas a los que su cuenta tenga acceso.
  const abrirAsignaciones = async (rutina) => {
    if (cargandoAsignaciones || guardandoAsignacion || cargandoEquipos || guardandoAsignacionEquipo) return;

    if (rutinaParaAsignar === rutina.id) {
      setRutinaParaAsignar(null);
      setDeportistaElegido('');
      setErrorAsignacion('');
      setMensajeAsignacion('');
      return;
    }

    // Al abrir una asignación individual, ocultamos la de equipo.
    setRutinaParaAsignarEquipo(null);
    setEquipoElegido('');
    setErrorAsignacionEquipo('');
    setMensajeAsignacionEquipo('');
    setRutinaParaAsignar(rutina.id);
    setDeportistasDisponibles([]);
    setAsignacionesRutina([]);
    setDeportistaElegido('');
    setErrorAsignacion('');
    setMensajeAsignacion('');
    setCargandoAsignaciones(true);

    try {
      const [respuestaDeportistas, respuestaAsignaciones] = await Promise.all([
        supabase
          .from('usuarios')
          .select('id, nombre')
          .eq('rol_id', 3)
          .eq('estado', true)
          .order('nombre', { ascending: true }),
        supabase
          .from('rutina_usuario')
          .select('id, usuario_id, activo')
          .eq('rutina_id', rutina.id),
      ]);

      if (respuestaDeportistas.error) throw respuestaDeportistas.error;
      if (respuestaAsignaciones.error) throw respuestaAsignaciones.error;

      setDeportistasDisponibles(respuestaDeportistas.data || []);
      setAsignacionesRutina(respuestaAsignaciones.data || []);
    } catch (error) {
      console.error('Error al consultar deportistas y asignaciones:', error);
      setErrorAsignacion('No se pudieron consultar los deportistas o las asignaciones. Revisa los permisos en Supabase.');
    } finally {
      setCargandoAsignaciones(false);
    }
  };

  const asignarRutinaADeportista = async (evento) => {
    evento.preventDefault();
    if (guardandoAsignacion || cargandoAsignaciones || rutinaParaAsignar === null) return;

    setErrorAsignacion('');
    setMensajeAsignacion('');

    const rutina = rutinas.find((item) => item.id === rutinaParaAsignar);
    const deportista = deportistasDisponibles.find((item) => item.id === deportistaElegido);

    if (!rutina || rutina.estado !== 'ACTIVA') {
      setErrorAsignacion('Solo puedes asignar rutinas activas.');
      return;
    }
    if (!deportista) {
      setErrorAsignacion('Selecciona un deportista de la lista.');
      return;
    }

    const previa = asignacionesRutina.find((item) => item.usuario_id === deportista.id);
    if (previa?.activo) {
      setErrorAsignacion('Este deportista ya tiene asignada la rutina.');
      return;
    }

    setGuardandoAsignacion(true);
    try {
      const { data: autenticacion, error: errorAutenticacion } = await supabase.auth.getUser();
      if (errorAutenticacion || autenticacion?.user?.id !== usuarioId) {
        throw new Error('No se pudo verificar la sesión del entrenador.');
      }

      const datos = {
        asignado_por: usuarioId,
        fecha_asignacion: new Date().toISOString(),
        activo: true,
      };

      // Si se desactivó anteriormente, se reactiva el registro existente.
      const resultado = previa
        ? await supabase
            .from('rutina_usuario')
            .update(datos)
            .eq('id', previa.id)
            .eq('rutina_id', rutina.id)
            .select('id, usuario_id, activo')
            .single()
        : await supabase
            .from('rutina_usuario')
            .insert({ rutina_id: rutina.id, usuario_id: deportista.id, ...datos })
            .select('id, usuario_id, activo')
            .single();

      if (resultado.error) throw resultado.error;

      setAsignacionesRutina((actuales) => [
        ...actuales.filter((item) => item.usuario_id !== deportista.id),
        resultado.data,
      ]);
      setDeportistaElegido('');
      setMensajeAsignacion(`La rutina se asignó correctamente a ${deportista.nombre}.`);
    } catch (error) {
      console.error('Error al asignar rutina a deportista:', error);
      if (error.code === '42501') {
        setErrorAsignacion('Supabase rechazó la asignación por permisos (RLS). Revisa el error de la consola.');
      } else if (error.code === '23505') {
        setErrorAsignacion('Esta asignación ya existe. Cierra y vuelve a abrir la sección para actualizarla.');
      } else {
        setErrorAsignacion('No se pudo asignar la rutina. Revisa la consola para ver el error exacto.');
      }
    } finally {
      setGuardandoAsignacion(false);
    }
  };


  // Consultar exclusivamente equipos activos donde la sesión figura como entrenador.
  const abrirAsignacionesEquipo = async (rutina) => {
    if (cargandoEquipos || guardandoAsignacionEquipo || cargandoAsignaciones || guardandoAsignacion) return;

    if (rutinaParaAsignarEquipo === rutina.id) {
      setRutinaParaAsignarEquipo(null);
      setEquipoElegido('');
      setErrorAsignacionEquipo('');
      setMensajeAsignacionEquipo('');
      return;
    }

    // Un solo panel de asignación abierto a la vez.
    setRutinaParaAsignar(null);
    setDeportistaElegido('');
    setErrorAsignacion('');
    setMensajeAsignacion('');
    setRutinaParaAsignarEquipo(rutina.id);
    setEquiposDisponibles([]);
    setAsignacionesEquipo([]);
    setEquipoElegido('');
    setErrorAsignacionEquipo('');
    setMensajeAsignacionEquipo('');
    setCargandoEquipos(true);

    try {
      const { data: membresias, error: errorMembresias } = await supabase
        .from('usuario_equipo')
        .select('equipo_id')
        .eq('usuario_id', usuarioId)
        .eq('funcion_en_equipo', 'ENTRENADOR')
        .eq('activo', true);

      if (errorMembresias) throw errorMembresias;
      const equiposIds = [...new Set((membresias || []).map((item) => item.equipo_id))];

      if (equiposIds.length === 0) {
        setEquiposDisponibles([]);
        setAsignacionesEquipo([]);
        return;
      }

      const [respuestaEquipos, respuestaAsignaciones] = await Promise.all([
        supabase
          .from('equipos')
          .select('id, nombre')
          .in('id', equiposIds)
          .eq('estado', true)
          .order('nombre', { ascending: true }),
        supabase
          .from('rutina_equipo')
          .select('id, equipo_id, activo')
          .eq('rutina_id', rutina.id)
          .in('equipo_id', equiposIds),
      ]);

      if (respuestaEquipos.error) throw respuestaEquipos.error;
      if (respuestaAsignaciones.error) throw respuestaAsignaciones.error;

      setEquiposDisponibles(respuestaEquipos.data || []);
      setAsignacionesEquipo(respuestaAsignaciones.data || []);
    } catch (error) {
      console.error('Error al consultar equipos y asignaciones:', error);
      setErrorAsignacionEquipo('No se pudieron cargar los equipos. Revisa los permisos de Supabase.');
    } finally {
      setCargandoEquipos(false);
    }
  };

  const asignarRutinaAEquipo = async (evento) => {
    evento.preventDefault();
    if (guardandoAsignacionEquipo || cargandoEquipos || rutinaParaAsignarEquipo === null) return;

    setErrorAsignacionEquipo('');
    setMensajeAsignacionEquipo('');

    const rutina = rutinas.find((item) => item.id === rutinaParaAsignarEquipo);
    const equipo = equiposDisponibles.find((item) => item.id === Number(equipoElegido));

    if (!rutina || rutina.estado !== 'ACTIVA') {
      setErrorAsignacionEquipo('Solo puedes asignar rutinas activas.');
      return;
    }
    if (!equipo) {
      setErrorAsignacionEquipo('Selecciona un equipo de la lista.');
      return;
    }

    const previa = asignacionesEquipo.find((item) => item.equipo_id === equipo.id);
    if (previa?.activo) {
      setErrorAsignacionEquipo('Este equipo ya tiene asignada la rutina.');
      return;
    }

    setGuardandoAsignacionEquipo(true);
    try {
      const { data: autenticacion, error: errorAutenticacion } = await supabase.auth.getUser();
      if (errorAutenticacion || autenticacion?.user?.id !== usuarioId) {
        throw new Error('No se pudo verificar la sesión del entrenador.');
      }

      // Comprobación adicional en el cliente. La protección definitiva corresponde a RLS.
      const { data: membresia, error: errorMembresia } = await supabase
        .from('usuario_equipo')
        .select('id')
        .eq('usuario_id', usuarioId)
        .eq('equipo_id', equipo.id)
        .eq('funcion_en_equipo', 'ENTRENADOR')
        .eq('activo', true)
        .maybeSingle();
      if (errorMembresia) throw errorMembresia;
      if (!membresia) {
        setErrorAsignacionEquipo('Ya no tienes acceso como entrenador a ese equipo.');
        return;
      }

      const datos = {
        asignado_por: usuarioId,
        fecha_asignacion: new Date().toISOString(),
        activo: true,
      };

      // Reutilizar la asignación desactivada, si ya existía.
      const resultado = previa
        ? await supabase
            .from('rutina_equipo')
            .update(datos)
            .eq('id', previa.id)
            .eq('rutina_id', rutina.id)
            .eq('equipo_id', equipo.id)
            .select('id, equipo_id, activo')
            .single()
        : await supabase
            .from('rutina_equipo')
            .insert({ rutina_id: rutina.id, equipo_id: equipo.id, ...datos })
            .select('id, equipo_id, activo')
            .single();

      if (resultado.error) throw resultado.error;

      setAsignacionesEquipo((actuales) => [
        ...actuales.filter((item) => item.equipo_id !== equipo.id),
        resultado.data,
      ]);
      setEquipoElegido('');
      setMensajeAsignacionEquipo(`La rutina se asignó correctamente a ${equipo.nombre}.`);
    } catch (error) {
      console.error('Error al asignar rutina a equipo:', error);
      if (error.code === '42501') {
        setErrorAsignacionEquipo('Supabase rechazó la asignación por permisos (RLS). Revisa la consola.');
      } else if (error.code === '23505') {
        setErrorAsignacionEquipo('Esta asignación ya existe. Cierra y vuelve a abrir el panel para actualizar.');
      } else {
        setErrorAsignacionEquipo('No se pudo asignar la rutina al equipo. Revisa la consola para ver el error.');
      }
    } finally {
      setGuardandoAsignacionEquipo(false);
    }
  };

  const equiposAsignados = equiposDisponibles.filter((equipo) =>
    asignacionesEquipo.some((asignacion) =>
      asignacion.equipo_id === equipo.id && asignacion.activo
    )
  );
  const equiposPendientes = equiposDisponibles.filter((equipo) =>
    !asignacionesEquipo.some((asignacion) =>
      asignacion.equipo_id === equipo.id && asignacion.activo
    )
  );

  const deportistasAsignados = deportistasDisponibles.filter((deportista) =>
    asignacionesRutina.some((asignacion) =>
      asignacion.usuario_id === deportista.id && asignacion.activo
    )
  );
  const deportistasPendientes = deportistasDisponibles.filter((deportista) =>
    !asignacionesRutina.some((asignacion) =>
      asignacion.usuario_id === deportista.id && asignacion.activo
    )
  );

  return (
    <section className="ath-rt">
      <div className="ath-rt-heading">
        <div>
          <h2>Rutinas de entrenamiento</h2>
          <p>Combina ejercicios de la biblioteca para preparar entrenamientos.</p>
        </div>
        <button
          type="button"
          className="ath-rt-primary"
          disabled={guardando || cargandoEdicion || eliminando || cambiandoEstadoId !== null}
          onClick={() => {
            if (mostrarFormulario) {
              cerrarFormulario();
            } else {
              setEditandoId(null);
              setFormulario(formularioInicial);
              setDetalles([]);
              setMostrarFormulario(true);
              setMensaje('');
              setErrorAccion('');
              setErrorFormulario('');
            }
          }}
        >
          {mostrarFormulario ? (editandoId !== null ? 'Cancelar edición' : 'Cancelar') : '+ Nueva rutina'}
        </button>
      </div>

      <div className="ath-rt-stats">
        <div className="ath-rt-stat">
          <span>Mis rutinas</span>
          <strong>{rutinas.length}</strong>
        </div>
        <div className="ath-rt-stat">
          <span>Rutinas activas</span>
          <strong>{rutinas.filter((rutina) => rutina.estado === 'ACTIVA').length}</strong>
        </div>
        <div className="ath-rt-stat">
          <span>Ejercicios disponibles</span>
          <strong>{ejercicios.length}</strong>
        </div>
      </div>

      {mensaje && <div className="ath-rt-success" role="status">{mensaje}</div>}
      {errorAccion && <div className="ath-rt-error" role="alert">{errorAccion}</div>}

      {mostrarFormulario && (
        <form ref={formularioRef} className="ath-rt-panel" onSubmit={guardarRutina}>
          <h3>{editandoId !== null ? 'Editar rutina' : 'Crear rutina'}</h3>
          <p className="ath-rt-muted">
            {editandoId !== null
              ? 'Modifica los ejercicios y sus indicaciones. Los cambios se aplicarán a quienes ya tengan esta rutina asignada.'
              : 'Define el entrenamiento y agrega sus ejercicios en orden.'}
          </p>

          {errorFormulario && (
            <div className="ath-rt-error" role="alert">{errorFormulario}</div>
          )}

          <div className="ath-rt-form-grid">
            <label className="ath-rt-field">
              Nombre de la rutina
              <input
                type="text"
                required
                maxLength={120}
                placeholder="Ej.: Entrenamiento de piernas"
                value={formulario.nombre}
                disabled={guardando}
                onChange={(e) => setFormulario((actual) => ({ ...actual, nombre: e.target.value }))}
              />
            </label>
            <label className="ath-rt-field ath-rt-full">
              Descripción (opcional)
              <textarea
                rows={3}
                maxLength={1500}
                placeholder="Objetivo o recomendaciones generales de la rutina"
                value={formulario.descripcion}
                disabled={guardando}
                onChange={(e) => setFormulario((actual) => ({ ...actual, descripcion: e.target.value }))}
              />
            </label>
          </div>

          <div className="ath-rt-add">
            <div>
              <h4>Ejercicios de la rutina</h4>
              <p className="ath-rt-muted">Selecciona un ejercicio y presiona «Agregar».</p>
            </div>
            <div className="ath-rt-add-controls">
              <select
                aria-label="Seleccionar ejercicio"
                value={ejercicioSeleccionado}
                disabled={guardando || ejercicios.length === 0}
                onChange={(e) => setEjercicioSeleccionado(e.target.value)}
              >
                <option value="">Seleccionar ejercicio...</option>
                {ejercicios.map((ejercicio) => (
                  <option key={ejercicio.id} value={ejercicio.id}>
                    {ejercicio.nombre}{ejercicio.categoria ? ` · ${ejercicio.categoria}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="ath-rt-secondary"
                disabled={!ejercicioSeleccionado || guardando}
                onClick={agregarEjercicio}
              >
                + Agregar
              </button>
            </div>
          </div>

          {ejercicios.length === 0 && (
            <p className="ath-rt-muted">Primero registra un ejercicio en «Ejercicios».</p>
          )}

          {detalles.length === 0 ? (
            <div className="ath-rt-empty-small">Aún no agregas ejercicios a esta rutina.</div>
          ) : (
            <div className="ath-rt-exercise-list">
              {detalles.map((detalle, indice) => {
                const ejercicio = ejercicios.find((item) => item.id === detalle.ejercicio_id);
                return (
                  <div className="ath-rt-exercise" key={detalle.clave}>
                    <div className="ath-rt-exercise-heading">
                      <div>
                        <span className="ath-rt-order">{indice + 1}</span>
                        <strong>{ejercicio?.nombre || 'Ejercicio'}</strong>
                      </div>
                      <button
                        type="button"
                        className="ath-rt-remove"
                        disabled={guardando}
                        onClick={() => setDetalles((actuales) => actuales.filter((item) => item.clave !== detalle.clave))}
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="ath-rt-numbers">
                      {[
                        ['series', 'Series', 1],
                        ['repeticiones', 'Repeticiones', 1],
                        ['duracion_segundos', 'Duración (s)', 1],
                        ['descanso_segundos', 'Descanso (s)', 0],
                      ].map(([campo, etiqueta, minimo]) => (
                        <label className="ath-rt-field" key={campo}>
                          {etiqueta}
                          <input
                            type="number"
                            min={minimo}
                            step="1"
                            value={detalle[campo]}
                            disabled={guardando}
                            onChange={(e) => cambiarDetalle(detalle.clave, campo, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <label className="ath-rt-field">
                      Nota adicional (opcional)
                      <input
                        type="text"
                        maxLength={500}
                        placeholder="Ej.: Mantener la espalda recta"
                        value={detalle.indicaciones_adicionales}
                        disabled={guardando}
                        onChange={(e) => cambiarDetalle(detalle.clave, 'indicaciones_adicionales', e.target.value)}
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          )}

          <p className="ath-rt-hint">
            Puedes dejar vacía la duración si trabajas por repeticiones, o dejar vacías las repeticiones si trabajas por tiempo.
          </p>
          <div className="ath-rt-actions">
            <button type="button" className="ath-rt-light" disabled={guardando} onClick={cerrarFormulario}>
              Cancelar
            </button>
            <button type="submit" className="ath-rt-primary" disabled={guardando || detalles.length === 0}>
              {guardando ? 'Guardando...' : (editandoId !== null ? 'Guardar cambios' : 'Guardar rutina')}
            </button>
          </div>
        </form>
      )}

      <div className="ath-rt-panel">
        <div className="ath-rt-heading">
          <div>
            <h3>Rutinas creadas</h3>
            <p>Estas son las rutinas registradas por tu cuenta.</p>
          </div>
          <button type="button" className="ath-rt-secondary" disabled={cargando} onClick={cargarDatos}>
            Actualizar
          </button>
        </div>

        {cargando ? (
          <p className="ath-rt-muted">Cargando rutinas...</p>
        ) : errorCarga ? (
          <div className="ath-rt-error" role="alert">{errorCarga}</div>
        ) : rutinas.length === 0 ? (
          <div className="ath-rt-empty">
            <div className="ath-rt-empty-icon">◎</div>
            <h3>Todavía no tienes rutinas</h3>
            <p>Crea tu primera rutina con los ejercicios de la biblioteca.</p>
          </div>
        ) : (
          <div className="ath-rt-list">
            {rutinas.map((rutina) => (
              <article className="ath-rt-card" key={rutina.id}>
                <div className="ath-rt-card-header">
                  <div>
                    <span className="ath-rt-tag">{rutina.estado}</span>
                    <h4>{rutina.nombre}</h4>
                    <p>{rutina.descripcion || 'Sin descripción.'}</p>
                    <small>
                      Creada el {new Date(rutina.fecha_creacion).toLocaleDateString('es-CL')}
                    </small>
                  </div>
                  <div className="ath-rt-card-buttons">
                    <button
                      type="button"
                      className="ath-rt-secondary"
                      disabled={cargandoDetalle}
                      onClick={() => abrirRutina(rutina.id)}
                    >
                      {rutinaAbierta === rutina.id ? 'Ocultar ejercicios' : 'Ver ejercicios'}
                    </button>
                    
{rutina.estado === 'ACTIVA' && (
  <>
    <button
      type="button"
      className="ath-rt-primary"
      disabled={cargandoAsignaciones || guardandoAsignacion || cargandoEquipos || guardandoAsignacionEquipo}
      onClick={() => abrirAsignaciones(rutina)}
      aria-expanded={rutinaParaAsignar === rutina.id}
    >
      {rutinaParaAsignar === rutina.id ? 'Cerrar asignación' : 'Asignar deportista'}
    </button>

    <button
      type="button"
      className="ath-rt-secondary"
      disabled={cargandoEquipos || guardandoAsignacionEquipo || cargandoAsignaciones || guardandoAsignacion}
      onClick={() => abrirAsignacionesEquipo(rutina)}
      aria-expanded={rutinaParaAsignarEquipo === rutina.id}
    >
      {rutinaParaAsignarEquipo === rutina.id ? 'Cerrar equipos' : 'Asignar equipo'}
    </button>
  </>
)}

                    <button
                      type="button"
                      className="ath-rt-light"
                      disabled={guardando || mostrarFormulario || cargandoEdicion || eliminando || cambiandoEstadoId !== null}
                      onClick={() => abrirEdicion(rutina)}
                    >
                      {cargandoEdicion ? 'Cargando...' : 'Editar'}
                    </button>
                    {rutina.estado === 'ARCHIVADA' && (
                      <button
                        type="button"
                        className="ath-rt-primary"
                        disabled={guardando || eliminando || cambiandoEstadoId !== null}
                        onClick={() => cambiarEstadoRutina(rutina, 'ACTIVA')}
                      >
                        {cambiandoEstadoId === rutina.id ? 'Reactivando...' : 'Reactivar'}
                      </button>
                    )}
                    
{rutina.estado !== 'ARCHIVADA' && (
  <button
    type="button"
    className="ath-rt-danger"
    disabled={
      guardando ||
      mostrarFormulario ||
      eliminando ||
      consultandoEliminacion ||
      cambiandoEstadoId !== null
    }
    onClick={() => abrirConfirmacionEliminacion(rutina)}
  >
    Eliminar
  </button>
)}

                  </div>
                </div>
                {rutinaParaAsignar === rutina.id && (
                  <div className="ath-rt-assign">
                    <h5>Asignar rutina a un deportista</h5>
                    <p className="ath-rt-muted">
                      Elige un deportista al que tengas acceso. La rutina aparecerá en su sección «Mis rutinas».
                    </p>

                    {cargandoAsignaciones ? (
                      <p className="ath-rt-muted ath-rt-assign-loading">Cargando deportistas...</p>
                    ) : (
                      <>
                        {errorAsignacion && (
                          <div className="ath-rt-error" role="alert">{errorAsignacion}</div>
                        )}
                        {mensajeAsignacion && (
                          <div className="ath-rt-success" role="status">{mensajeAsignacion}</div>
                        )}

                        {!errorAsignacion && deportistasDisponibles.length === 0 ? (
                          <p className="ath-rt-assign-note">
                            No hay deportistas disponibles para tu cuenta. Comprueba que el administrador
                            haya asignado deportistas a uno de tus equipos.
                          </p>
                        ) : errorAsignacion && deportistasDisponibles.length === 0 ? null : (
                          <>
                            <form className="ath-rt-assign-form" onSubmit={asignarRutinaADeportista}>
                              <label className="ath-rt-field ath-rt-assign-field">
                                Deportista
                                <select
                                  value={deportistaElegido}
                                  onChange={(evento) => setDeportistaElegido(evento.target.value)}
                                  disabled={guardandoAsignacion || rutina.estado !== 'ACTIVA' || deportistasPendientes.length === 0}
                                >
                                  <option value="">Seleccionar deportista...</option>
                                  {deportistasPendientes.map((deportista) => (
                                    <option value={deportista.id} key={deportista.id}>
                                      {deportista.nombre}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="submit"
                                className="ath-rt-primary"
                                disabled={guardandoAsignacion || !deportistaElegido || rutina.estado !== 'ACTIVA'}
                              >
                                {guardandoAsignacion ? 'Asignando...' : 'Confirmar asignación'}
                              </button>
                            </form>
                            {rutina.estado !== 'ACTIVA' && (
                              <p className="ath-rt-assign-note">Esta rutina no está activa y no puede asignarse.</p>
                            )}
                            {deportistasPendientes.length === 0 && (
                              <p className="ath-rt-muted">Todos los deportistas disponibles ya tienen esta rutina.</p>
                            )}
                            <div className="ath-rt-assigned">
                              <h6>Deportistas asignados ({deportistasAsignados.length})</h6>
                              {deportistasAsignados.length === 0 ? (
                                <p className="ath-rt-muted">Todavía no hay asignaciones individuales para esta rutina.</p>
                              ) : (
                                <ul>
                                  {deportistasAsignados.map((deportista) => (
                                    <li key={deportista.id}>
                                      <span>{deportista.nombre}</span>
                                      <span className="ath-rt-assigned-status">Asignada</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
                {rutinaParaAsignarEquipo === rutina.id && (
                  <div className="ath-rt-assign ath-rt-assign-team">
                    <h5>Asignar rutina a un equipo</h5>
                    <p className="ath-rt-muted">
                      Todos los deportistas activos de este equipo podrán consultar la rutina en «Mis rutinas».
                    </p>

                    {cargandoEquipos ? (
                      <p className="ath-rt-muted ath-rt-assign-loading">Cargando equipos...</p>
                    ) : (
                      <>
                        {errorAsignacionEquipo && (
                          <div className="ath-rt-error" role="alert">{errorAsignacionEquipo}</div>
                        )}
                        {mensajeAsignacionEquipo && (
                          <div className="ath-rt-success" role="status">{mensajeAsignacionEquipo}</div>
                        )}

                        {equiposDisponibles.length === 0 && !errorAsignacionEquipo ? (
                          <p className="ath-rt-assign-note">
                            No tienes equipos activos asignados como entrenador. Pide al administrador
                            que te vincule a un equipo antes de asignar rutinas.
                          </p>
                        ) : equiposDisponibles.length > 0 ? (
                          <>
                            <form className="ath-rt-assign-form" onSubmit={asignarRutinaAEquipo}>
                              <label className="ath-rt-field ath-rt-assign-field">
                                Equipo
                                <select
                                  value={equipoElegido}
                                  onChange={(evento) => setEquipoElegido(evento.target.value)}
                                  disabled={guardandoAsignacionEquipo || rutina.estado !== 'ACTIVA' || equiposPendientes.length === 0}
                                >
                                  <option value="">Seleccionar equipo...</option>
                                  {equiposPendientes.map((equipo) => (
                                    <option value={equipo.id} key={equipo.id}>{equipo.nombre}</option>
                                  ))}
                                </select>
                              </label>
                              <button
                                type="submit"
                                className="ath-rt-primary"
                                disabled={guardandoAsignacionEquipo || !equipoElegido || rutina.estado !== 'ACTIVA'}
                              >
                                {guardandoAsignacionEquipo ? 'Asignando...' : 'Confirmar asignación'}
                              </button>
                            </form>
                            {rutina.estado !== 'ACTIVA' && (
                              <p className="ath-rt-assign-note">Esta rutina no está activa y no puede asignarse.</p>
                            )}
                            {equiposPendientes.length === 0 && (
                              <p className="ath-rt-muted ath-rt-team-all-assigned">
                                Todos tus equipos disponibles ya tienen esta rutina.
                              </p>
                            )}
                            <div className="ath-rt-assigned">
                              <h6>Equipos asignados ({equiposAsignados.length})</h6>
                              {equiposAsignados.length === 0 ? (
                                <p className="ath-rt-muted">Todavía no hay equipos asignados a esta rutina.</p>
                              ) : (
                                <ul>
                                  {equiposAsignados.map((equipo) => (
                                    <li key={equipo.id}>
                                      <span>{equipo.nombre}</span>
                                      <span className="ath-rt-assigned-status">Asignada</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
                {rutinaAbierta === rutina.id && (
                  <div className="ath-rt-details">
                    {cargandoDetalle ? (
                      <p>Cargando ejercicios...</p>
                    ) : errorDetalle ? (
                      <div className="ath-rt-error" role="alert">{errorDetalle}</div>
                    ) : detallesAbiertos.length === 0 ? (
                      <p>No hay ejercicios registrados en esta rutina.</p>
                    ) : (
                      detallesAbiertos.map((detalle) => (
                        <div className="ath-rt-detail" key={detalle.id}>
                          <strong>{detalle.orden}. {detalle.ejercicio?.nombre || 'Ejercicio'}</strong>
                          <div className="ath-rt-detail-tags">
                            {detalle.series != null && <span>{detalle.series} series</span>}
                            {detalle.repeticiones != null && <span>{detalle.repeticiones} repeticiones</span>}
                            {detalle.duracion_segundos != null && <span>{detalle.duracion_segundos} s de duración</span>}
                            {detalle.descanso_segundos != null && <span>{detalle.descanso_segundos} s de descanso</span>}
                          </div>
                          {detalle.indicaciones_adicionales && <p>{detalle.indicaciones_adicionales}</p>}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {rutinaPorEliminar && (
        <div className="ath-rt-modal-backdrop">
          <div
            className="ath-rt-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="ath-rt-modal-title"
            aria-describedby="ath-rt-modal-description"
          >
            <div className="ath-rt-modal-icon" aria-hidden="true">!</div>
            <h3 id="ath-rt-modal-title">¿Qué hacemos con esta rutina?</h3>
            <p id="ath-rt-modal-description">
              <strong>{rutinaPorEliminar.nombre}</strong>
            </p>

            {consultandoEliminacion ? (
              <p className="ath-rt-muted">Comprobando asignaciones...</p>
            ) : resumenEliminacion ? (
              <>
                <p className="ath-rt-modal-count">
                  Asignaciones registradas: <strong>{resumenEliminacion.deportistas}</strong> a deportistas y{' '}
                  <strong>{resumenEliminacion.equipos}</strong> a equipos.
                </p>
                {resumenEliminacion.deportistas + resumenEliminacion.equipos > 0 ? (
                  <p className="ath-rt-modal-warning">
                    Esta rutina ya está asignada. Para no borrar asignaciones ni información de entrenamiento,
                    puedes <strong>archivarla</strong>: dejará de aparecer a los deportistas, pero se conservará en tu lista.
                  </p>
                ) : (
                  <p className="ath-rt-modal-warning">
                    Esta rutina no tiene asignaciones. Si la eliminas, también se borrarán sus ejercicios
                    configurados. <strong>Esta acción no se puede deshacer.</strong>
                  </p>
                )}
              </>
            ) : null}

            {errorEliminacion && <div className="ath-rt-error" role="alert">{errorEliminacion}</div>}
            <div className="ath-rt-modal-actions">
              <button
                type="button"
                className="ath-rt-light"
                onClick={cerrarConfirmacionEliminacion}
                disabled={eliminando || cambiandoEstadoId !== null}
                autoFocus
              >
                Cancelar
              </button>
              {resumenEliminacion && (
                <>
                  {rutinaPorEliminar.estado !== 'ARCHIVADA' && (
                    <button
                      type="button"
                      className="ath-rt-secondary"
                      onClick={() => cambiarEstadoRutina(rutinaPorEliminar, 'ARCHIVADA')}
                      disabled={eliminando || cambiandoEstadoId !== null}
                    >
                      {cambiandoEstadoId !== null ? 'Archivando...' : 'Archivar rutina'}
                    </button>
                  )}
                  {resumenEliminacion.deportistas + resumenEliminacion.equipos === 0 && (
                    <button
                      type="button"
                      className="ath-rt-danger"
                      onClick={eliminarRutina}
                      disabled={eliminando || cambiandoEstadoId !== null}
                    >
                      {eliminando ? 'Eliminando...' : 'Eliminar definitivamente'}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
