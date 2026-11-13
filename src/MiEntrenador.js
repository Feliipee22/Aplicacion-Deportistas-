import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import './MiEntrenador.css';

export default function MiEntrenador({ perfil }) {
  const esEntrenador = perfil?.rol_id === 2;
  const [codigo, setCodigo] = useState('');
  const [ingresado, setIngresado] = useState('');
  const [vinculos, setVinculos] = useState([]);
  const [resumen, setResumen] = useState({});
  const [detalle, setDetalle] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true); setError('');
    try {
      const { data, error: fallo } = await supabase.rpc('ath_mis_vinculos');
      if (fallo) throw fallo;
      setVinculos(data || []);
      if (esEntrenador) {
        const { data: estadisticas, error: falloResumen } = await supabase.rpc('ath_resumen_mis_deportistas');
        if (falloResumen) throw falloResumen;
        setResumen(Object.fromEntries((estadisticas || []).map(item => [item.deportista_id, item])));
        const { data: clave, error: falloCodigo } = await supabase.rpc('ath_codigo_entrenador');
        if (falloCodigo) throw falloCodigo;
        setCodigo(clave || '');
      }
    } catch (e) { setError(e.message || 'No fue posible cargar las vinculaciones.'); }
    finally { setCargando(false); }
  }, [esEntrenador]);
  useEffect(() => { cargar(); }, [cargar]);

  async function ejecutar(nombre, parametros, confirmar) {
    if (confirmar && !window.confirm(confirmar)) return;
    setOcupado(true); setError(''); setMensaje('');
    try {
      const { data, error: fallo } = await supabase.rpc(nombre, parametros);
      if (fallo) throw fallo;
      setMensaje(data || 'Cambios guardados');
      setIngresado('');
      await cargar();
    } catch (e) { setError(e.message || 'No se pudo completar la acción.'); }
    finally { setOcupado(false); }
  }

  const activos = vinculos.filter(v => v.estado === 'activo');
  const pendientes = vinculos.filter(v => v.estado === 'pendiente');
  const totalRutinas = activos.reduce((total, v) => total + Number(resumen[v.deportista_id]?.rutinas_asignadas || 0), 0);
  return <section className="ath-vinculos">
    <header className="ath-vinculos-head">
      <p>{esEntrenador ? 'Comparte tu código y acepta solicitudes antes de asignar rutinas.' : 'Puedes entrenar con IA sin entrenador. Si quieres uno, solicita vincularte con su código.'}</p>
    </header>
    {esEntrenador && <div className="ath-v27-metricas" aria-label="Resumen de mis deportistas">
      <div><strong>{activos.length}</strong><span>Deportistas vinculados</span></div>
      <div><strong>{totalRutinas}</strong><span>Rutinas asignadas</span></div>
      <div><strong>{pendientes.length}</strong><span>Solicitudes pendientes</span></div>
    </div>}
    {error && <div className="ath-vinculos-error" role="alert">{error}</div>}
    {mensaje && <div className="ath-vinculos-ok" role="status">{mensaje}</div>}
    {esEntrenador ? <div className="ath-vinculos-panel">
      <span className="ath-vinculos-label">Tu código de entrenador</span>
      <div className="ath-vinculos-code">{codigo || (cargando ? 'Cargando…' : 'No disponible')}</div>
      <button type="button" className="ath-vinculos-secondary" disabled={!codigo} onClick={() => navigator.clipboard?.writeText(codigo).then(() => setMensaje('Código copiado')).catch(() => setError('Selecciona y copia el código manualmente.'))}>Copiar código</button>
      <p>El deportista debe ingresar este código en su cuenta. Tú decides si aceptas la solicitud.</p>
    </div> : <div className="ath-vinculos-panel">
      <label htmlFor="ath-codigo-vinculo">Código de tu entrenador</label>
      <input id="ath-codigo-vinculo" value={ingresado} maxLength={24} placeholder="ATH-XXXXXXXX" autoCapitalize="characters" onChange={e => setIngresado(e.target.value.toUpperCase())} disabled={ocupado || activos.length > 0 || pendientes.length > 0} />
      <button type="button" className="ath-vinculos-primary" disabled={ocupado || !ingresado.trim() || activos.length > 0 || pendientes.length > 0} onClick={() => ejecutar('ath_solicitar_entrenador', {p_codigo: ingresado})}>Enviar solicitud</button>
    </div>}
    <div className="ath-vinculos-panel">
      <div className="ath-vinculos-title"><h3>{esEntrenador ? 'Solicitudes pendientes' : 'Solicitud pendiente'}</h3><button type="button" className="ath-vinculos-link" onClick={cargar} disabled={cargando || ocupado}>Actualizar</button></div>
      {cargando ? <p>Cargando…</p> : pendientes.length === 0 ? <p>No hay solicitudes pendientes.</p> : pendientes.map(v => <div className="ath-vinculos-persona" key={v.id}><div><strong>{v.nombre_otro}</strong><small>Esperando respuesta</small></div>{esEntrenador && <div className="ath-vinculos-actions"><button type="button" disabled={ocupado} className="ath-vinculos-primary" onClick={() => ejecutar('ath_responder_solicitud',{p_id:v.id,p_aceptar:true})}>Aceptar</button><button type="button" disabled={ocupado} className="ath-vinculos-secondary" onClick={() => ejecutar('ath_responder_solicitud',{p_id:v.id,p_aceptar:false})}>Rechazar</button></div>}</div>)}
    </div>
    <div className="ath-vinculos-panel">
      <h3>{esEntrenador ? 'Deportistas vinculados' : 'Entrenador vinculado'}</h3>
      {cargando ? <p>Cargando…</p> : activos.length === 0 ? <p>{esEntrenador ? 'Aún no tienes deportistas vinculados.' : 'Todavía no tienes entrenador. Puedes seguir utilizando tus planes IA.'}</p> : activos.map(v => <div className="ath-v27-deportista" key={v.id}>
        <div className="ath-v27-persona">
          <div className="ath-v27-avatar" aria-hidden="true">{(v.nombre_otro || 'D').trim().charAt(0).toUpperCase()}</div>
          <div className="ath-v27-persona-info"><strong>{v.nombre_otro}</strong><small>Vinculación activa{esEntrenador ? ` · ${Number(resumen[v.deportista_id]?.rutinas_asignadas || 0)} rutina(s) asignada(s)` : ''}</small></div>
        </div>
        {esEntrenador && <button type="button" className="ath-vinculos-secondary ath-v27-detail-btn" aria-expanded={detalle === v.id} onClick={() => setDetalle(actual => actual === v.id ? null : v.id)}>{detalle === v.id ? 'Ocultar detalles' : 'Ver detalles'}</button>}
        {esEntrenador && detalle === v.id && <div className="ath-v27-detalle">
          <p>Este deportista está vinculado contigo. Para asignarle una rutina, entra en <strong>Mis rutinas</strong>, abre una rutina y selecciona <strong>Asignar deportista</strong>.</p>
          <p>Rutinas individuales asignadas: <strong>{Number(resumen[v.deportista_id]?.rutinas_asignadas || 0)}</strong></p>
          <p className="ath-v27-nota">El seguimiento de ejercicios y asistencia se incorporará después de definir permisos específicos. No se muestran datos privados sin autorización.</p>
        </div>}
        <button type="button" className="ath-vinculos-danger ath-v27-desvincular" disabled={ocupado} onClick={() => ejecutar('ath_desvincular_entrenador',{p_id:v.id},'¿Quieres finalizar esta vinculación? Las rutinas ya asignadas no se borrarán.')}>Desvincular</button>
      </div>)}
    </div>
  </section>;
}
