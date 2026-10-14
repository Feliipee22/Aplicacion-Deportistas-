import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';
import './ReportesAdmin.css';

const ESTADOS_ASISTENCIA = ['PRESENTE', 'AUSENTE', 'JUSTIFICADO'];
const NOMBRES_MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const numero = (valor) => Number(valor || 0).toLocaleString('es-CL');

function fechaLocal(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
}
function mesInicioActual() {
  const hoy = new Date();
  return fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() - 5, 1));
}
function hoyLocal() { return fechaLocal(new Date()); }
function rangoUTC(inicio, fin) {
  // Incluye todo el último día según la zona horaria local del navegador.
  return {
    desde: new Date(`${inicio}T00:00:00`).toISOString(),
    hasta: new Date(new Date(`${fin}T00:00:00`).getTime() + 86400000).toISOString(),
  };
}
function mesClave(fecha) {
  const d = new Date(fecha);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function mesesEntre(inicio, fin) {
  const [a, m] = inicio.split('-').map(Number);
  const [b, n] = fin.split('-').map(Number);
  const resultado = [];
  for (let y = a, mes = m; y < b || (y === b && mes <= n); mes++) {
    if (mes === 13) { mes = 1; y++; }
    resultado.push(`${y}-${String(mes).padStart(2, '0')}`);
  }
  return resultado;
}

// Se paginan las consultas para evitar que el límite habitual de 1000 filas
// del API REST produzca gráficos parciales sin avisar.
async function consultarTodo(crearConsulta, maximo = 10000) {
  const filas = [];
  const pagina = 500;
  for (let inicio = 0; inicio < maximo; inicio += pagina) {
    const { data, error } = await crearConsulta().range(inicio, inicio + pagina - 1);
    if (error) throw error;
    const bloque = data || [];
    filas.push(...bloque);
    if (bloque.length < pagina) return { filas, incompleto: false };
  }
  return { filas, incompleto: true };
}

function Indicador({ titulo, valor, detalle }) {
  return <article className="ath-report-kpi"><span>{titulo}</span><strong>{valor}</strong><small>{detalle}</small></article>;
}

export default function ReportesAdmin({ perfil }) {
  const [inicio, setInicio] = useState(mesInicioActual);
  const [fin, setFin] = useState(hoyLocal);
  const [revision, setRevision] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [datos, setDatos] = useState(null);

  const cargar = useCallback(async () => {
    if (Number(perfil?.rol_id) !== 1) return;
    setCargando(true);
    setError('');
    setDatos(null);
    try {
      if (!inicio || !fin || inicio > fin) throw new Error('Selecciona un rango de fechas válido.');
      const { desde, hasta } = rangoUTC(inicio, fin);
      const [usuarios, equipos, rutinas, actividades] = await Promise.all([
        consultarTodo(() => supabase.from('usuarios').select('id, rol_id, estado').order('id')),
        consultarTodo(() => supabase.from('equipos').select('id, estado').order('id')),
        consultarTodo(() => supabase.from('rutinas').select('id, estado').order('id')),
        consultarTodo(() => supabase.from('actividades')
          .select('id, tipo, estado, fecha_hora, equipo_id')
          .gte('fecha_hora', desde).lt('fecha_hora', hasta).order('fecha_hora')),
      ]);
      const actividadesIds = actividades.filas.map(a => a.id);
      let asistencias = [];
      let asistenciasIncompletas = false;
      // Filtrar por IDs de las actividades del período. No se consulta el historial
      // de alimentación: es privado y no corresponde a reportes administrativos.
      for (let i = 0; i < actividadesIds.length; i += 100) {
        const ids = actividadesIds.slice(i, i + 100);
        const respuesta = await consultarTodo(() => supabase.from('asistencias')
          .select('actividad_id, estado_asistencia, deportista_id')
          .in('actividad_id', ids).order('actividad_id'));
        asistencias.push(...respuesta.filas);
        asistenciasIncompletas ||= respuesta.incompleto;
      }
      setDatos({ usuarios: usuarios.filas, equipos: equipos.filas, rutinas: rutinas.filas,
        actividades: actividades.filas, asistencias,
        incompleto: [usuarios, equipos, rutinas, actividades].some(x => x.incompleto) || asistenciasIncompletas });
    } catch (e) {
      setError(e?.message || 'No se pudieron consultar los reportes.');
    } finally {
      setCargando(false);
    }
  }, [perfil?.rol_id, inicio, fin]);

  useEffect(() => { cargar(); }, [cargar, revision]);

  const resumen = useMemo(() => {
    if (!datos) return null;
    const { usuarios, equipos, rutinas, actividades, asistencias } = datos;
    const estados = Object.fromEntries(ESTADOS_ASISTENCIA.map(x => [x, 0]));
    asistencias.forEach(x => { if (x.estado_asistencia in estados) estados[x.estado_asistencia]++; });
    const validos = Object.values(estados).reduce((a, b) => a + b, 0);
    const porcentaje = validos ? Math.round(estados.PRESENTE / validos * 1000) / 10 : null;
    const meses = mesesEntre(inicio.slice(0, 7), fin.slice(0, 7));
    const grafico = meses.map(mes => ({
      mes, actividades: actividades.filter(a => mesClave(a.fecha_hora) === mes).length,
      entrenamientos: actividades.filter(a => mesClave(a.fecha_hora) === mes && a.tipo === 'ENTRENAMIENTO').length,
    }));
    return {
      deportistas: usuarios.filter(x => x.rol_id === 3 && x.estado === true).length,
      entrenadores: usuarios.filter(x => x.rol_id === 2 && x.estado === true).length,
      equipos: equipos.filter(x => x.estado === true).length,
      rutinas: rutinas.filter(x => x.estado === true).length,
      actividades: actividades.length,
      proximas: actividades.filter(x => new Date(x.fecha_hora) > new Date() && x.estado !== 'CANCELADA').length,
      estados, validos, porcentaje, grafico,
    };
  }, [datos, inicio, fin]);

  if (Number(perfil?.rol_id) !== 1) return <p>No tienes acceso a esta sección.</p>;

  return <section className="ath-report" aria-label="Estadísticas deportivas">
    <div className="ath-report-intro">
      <div><p>Indicadores de usuarios, equipos, rutinas, actividades y asistencia registrados en Athletix.</p>
        <small>Los datos corresponden a los registros que tu cuenta tiene permiso para consultar en Supabase.</small></div>
      <button type="button" onClick={() => setRevision(n => n + 1)} disabled={cargando}>Actualizar datos</button>
    </div>
    <div className="ath-report-filters">
      <label>Desde<input type="date" value={inicio} max={fin} onChange={e => setInicio(e.target.value)} /></label>
      <label>Hasta<input type="date" value={fin} min={inicio} onChange={e => setFin(e.target.value)} /></label>
      <small>El período filtra actividades y asistencias. Los usuarios, equipos y rutinas muestran su estado actual.</small>
    </div>
    {cargando && <p className="ath-report-message" role="status">Cargando estadísticas reales de Supabase…</p>}
    {error && <p className="ath-report-error" role="alert">{error}</p>}
    {datos?.incompleto && <p className="ath-report-error">Hay más de 10.000 registros en alguna consulta. Los resultados podrían estar incompletos; se requiere un reporte paginado desde el servidor.</p>}
    {resumen && <>
      <div className="ath-report-kpis">
        <Indicador titulo="Deportistas activos" valor={numero(resumen.deportistas)} detalle="Estado actual" />
        <Indicador titulo="Entrenadores activos" valor={numero(resumen.entrenadores)} detalle="Estado actual" />
        <Indicador titulo="Equipos activos" valor={numero(resumen.equipos)} detalle="Estado actual" />
        <Indicador titulo="Rutinas activas" valor={numero(resumen.rutinas)} detalle="Estado actual" />
        <Indicador titulo="Actividades del período" valor={numero(resumen.actividades)} detalle="Incluye todos los estados" />
        <Indicador titulo="Actividades próximas" valor={numero(resumen.proximas)} detalle="Dentro del período seleccionado" />
      </div>
      <div className="ath-report-panels">
        <article className="ath-report-panel">
          <h3>Actividades por mes</h3>
          <p>Actividad deportiva registrada en el calendario.</p>
          {resumen.grafico.length > 24 ? <p>Selecciona un período de hasta 24 meses para visualizar el gráfico.</p> :
            <div className="ath-report-bars">
              {resumen.grafico.map(item => {
                const max = Math.max(1, ...resumen.grafico.map(x => x.actividades));
                const [a, b] = item.mes.split('-');
                return <div className="ath-report-bar-row" key={item.mes}>
                  <span>{NOMBRES_MESES[Number(b) - 1]} {a}</span>
                  <div className="ath-report-bar-track" role="img" aria-label={`${item.actividades} actividades en ${item.mes}`}>
                    <div style={{ width: `${item.actividades / max * 100}%` }} /></div>
                  <strong>{numero(item.actividades)}</strong>
                </div>;
              })}
            </div>}
        </article>
        <article className="ath-report-panel">
          <h3>Asistencia registrada</h3>
          <p>Porcentaje de presentes entre los registros con estado presente, ausente o justificado.</p>
          <div className="ath-report-attendance">
            <strong>{resumen.porcentaje === null ? 'Sin datos' : `${resumen.porcentaje.toLocaleString('es-CL')} %`}</strong>
            <span>{numero(resumen.validos)} registros clasificados</span>
          </div>
          <div className="ath-report-attendance-list">
            {ESTADOS_ASISTENCIA.map(estado => <div key={estado}>
              <span>{estado === 'PRESENTE' ? 'Presentes' : estado === 'AUSENTE' ? 'Ausentes' : 'Justificados'}</span>
              <strong>{numero(resumen.estados[estado])}</strong>
            </div>)}
          </div>
          <small>Las actividades sin asistencia registrada no se cuentan como ausencias. El indicador no mide asistencia de todos los convocados.</small>
        </article>
      </div>
    </>}
  </section>;
}
