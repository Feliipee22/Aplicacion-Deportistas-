
import React, { useEffect, useState } from 'react';
import { supabase } from './supabase';

export default function MisRutinas({ usuarioId }) {
  const [rutinas, setRutinas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [rutinaAbierta, setRutinaAbierta] = useState(null);
  const [ejercicios, setEjercicios] = useState([]);
  const [cargandoEjercicios, setCargandoEjercicios] = useState(false);
  const [errorEjercicios, setErrorEjercicios] = useState('');

  useEffect(() => {
    let activo = true;

    const cargarRutinas = async () => {
      setCargando(true);
      setError('');

      try {
        // 1. Consultar asignaciones individuales y equipos.
        const [directas, membresias] = await Promise.all([
          supabase
            .from('rutina_usuario')
            .select('rutina_id')
            .eq('usuario_id', usuarioId)
            .eq('activo', true),

          supabase
            .from('usuario_equipo')
            .select('equipo_id')
            .eq('usuario_id', usuarioId)
            .eq('funcion_en_equipo', 'DEPORTISTA')
            .eq('activo', true),
        ]);

        if (directas.error) throw directas.error;
        if (membresias.error) throw membresias.error;

        // 2. Consultar rutinas asignadas a sus equipos.
        const equiposIds = (membresias.data || []).map(
          (item) => item.equipo_id
        );

        let asignacionesEquipo = [];

        if (equiposIds.length > 0) {
          const resultado = await supabase
            .from('rutina_equipo')
            .select('rutina_id')
            .in('equipo_id', equiposIds)
            .eq('activo', true);

          if (resultado.error) throw resultado.error;

          asignacionesEquipo = resultado.data || [];
        }

        // 3. Unificar las asignaciones sin duplicar rutinas.
        const rutinasIds = [
          ...new Set([
            ...(directas.data || []).map(
              (item) => item.rutina_id
            ),
            ...asignacionesEquipo.map(
              (item) => item.rutina_id
            ),
          ]),
        ];

        if (rutinasIds.length === 0) {
          if (activo) setRutinas([]);
          return;
        }

        // 4. Consultar solamente rutinas activas.
        const { data, error: errorRutinas } = await supabase
          .from('rutinas')
          .select('id, nombre, descripcion, estado, fecha_creacion')
          .in('id', rutinasIds)
          .eq('estado', 'ACTIVA')
          .order('fecha_creacion', { ascending: false });

        if (errorRutinas) throw errorRutinas;

        if (activo) setRutinas(data || []);
      } catch (err) {
        console.error('Error al cargar rutinas:', err);

        if (activo) {
          setError('No se pudieron cargar tus rutinas.');
        }
      } finally {
        if (activo) setCargando(false);
      }
    };

    if (usuarioId) {
      cargarRutinas();
    } else {
      setError('No se pudo identificar al usuario.');
      setCargando(false);
    }

    return () => {
      activo = false;
    };
  }, [usuarioId]);

  const abrirRutina = async (rutina) => {
    if (cargandoEjercicios) return;

    if (rutinaAbierta?.id === rutina.id) {
      setRutinaAbierta(null);
      setEjercicios([]);
      return;
    }

    setRutinaAbierta(rutina);
    setEjercicios([]);
    setErrorEjercicios('');
    setCargandoEjercicios(true);

    const { data, error: errorDetalle } = await supabase
      .from('detalle_rutina')
      .select(`
        id,
        orden,
        series,
        repeticiones,
        duracion_segundos,
        descanso_segundos,
        indicaciones_adicionales,
        ejercicio:ejercicios (
          nombre,
          descripcion,
          indicaciones,
          video_url
        )
      `)
      .eq('rutina_id', rutina.id)
      .order('orden', { ascending: true });

    if (errorDetalle) {
      console.error('Error al cargar ejercicios:', errorDetalle);
      setErrorEjercicios('No se pudieron cargar los ejercicios.');
    } else {
      setEjercicios(data || []);
    }

    setCargandoEjercicios(false);
  };

  return (
    <section className="ath-routines">
      <div className="ath-section-heading">
        <h2>Mis rutinas asignadas</h2>
        <p>
          Consulta tus entrenamientos, ejercicios e indicaciones.
        </p>
      </div>

      {cargando && (
        <p className="ath-routine-message">
          Cargando tus rutinas...
        </p>
      )}

      {!cargando && error && (
        <p className="ath-routine-error" role="alert">
          {error}
        </p>
      )}

      {!cargando && !error && rutinas.length === 0 && (
        <div className="ath-routine-empty">
          <div className="ath-routine-empty-icon">◎</div>
          <h3>Aún no tienes rutinas asignadas</h3>
          <p>
            Cuando tu entrenador te asigne una rutina,
            aparecerá aquí automáticamente.
          </p>
        </div>
      )}

      {!cargando && !error && (
        <div className="ath-routine-list">
          {rutinas.map((rutina) => (
            <article className="ath-routine-card" key={rutina.id}>
              <div className="ath-routine-header">
                <div>
                  <span className="ath-routine-tag">
                    RUTINA ACTIVA
                  </span>

                  <h3>{rutina.nombre}</h3>

                  <p>
                    {rutina.descripcion ||
                      'Sin descripción disponible.'}
                  </p>
                </div>

                <button
                  className="ath-routine-button"
                  onClick={() => abrirRutina(rutina)}
                  disabled={cargandoEjercicios}
                >
                  {rutinaAbierta?.id === rutina.id
                    ? 'Ocultar ejercicios'
                    : 'Ver ejercicios'}
                </button>
              </div>

              {rutinaAbierta?.id === rutina.id && (
                <div className="ath-routine-details">
                  {cargandoEjercicios && (
                    <p>Cargando ejercicios...</p>
                  )}

                  {errorEjercicios && (
                    <p className="ath-routine-error" role="alert">
                      {errorEjercicios}
                    </p>
                  )}

                  {!cargandoEjercicios &&
                    !errorEjercicios &&
                    ejercicios.length === 0 && (
                      <p>
                        Esta rutina todavía no tiene ejercicios
                        registrados.
                      </p>
                    )}

                  {!cargandoEjercicios &&
                    !errorEjercicios &&
                    ejercicios.map((detalle) => {
                      const ejercicio = detalle.ejercicio;

                      const videoValido =
                        typeof ejercicio?.video_url === 'string' &&
                        /^https?:\/\//i.test(ejercicio.video_url);

                      return (
                        <div
                          className="ath-exercise"
                          key={detalle.id}
                        >
                          <h4>
                            {detalle.orden}.{' '}
                            {ejercicio?.nombre ||
                              'Ejercicio sin nombre'}
                          </h4>

                          {ejercicio?.descripcion && (
                            <p>{ejercicio.descripcion}</p>
                          )}

                          <div className="ath-exercise-meta">
                            {detalle.series != null && (
                              <span>
                                Series: {detalle.series}
                              </span>
                            )}

                            {detalle.repeticiones != null && (
                              <span>
                                Repeticiones: {detalle.repeticiones}
                              </span>
                            )}

                            {detalle.duracion_segundos != null && (
                              <span>
                                Duración: {detalle.duracion_segundos} s
                              </span>
                            )}

                            {detalle.descanso_segundos != null && (
                              <span>
                                Descanso: {detalle.descanso_segundos} s
                              </span>
                            )}
                          </div>

                          {ejercicio?.indicaciones && (
                            <p>
                              <strong>Indicaciones:</strong>{' '}
                              {ejercicio.indicaciones}
                            </p>
                          )}

                          {detalle.indicaciones_adicionales && (
                            <p>
                              <strong>Nota del entrenador:</strong>{' '}
                              {detalle.indicaciones_adicionales}
                            </p>
                          )}

                          {videoValido && (
                            <a
                              href={ejercicio.video_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ath-video-link"
                            >
                              Ver video demostrativo ↗
                            </a>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
