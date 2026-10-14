import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabase';
import './MiAlimentacion.css';

const crearId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const nuevoAlimento = () => ({ id: crearId(), nombre: '', gramos: '100', proteinas: '0', carbohidratos: '0', grasas: '0' });
const numero = (valor) => Math.max(0, Number(valor) || 0);
const mostrar = (valor) => Number(valor || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 });
const fechaLocal = (fecha = new Date()) => {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const tiposComida = ['Desayuno', 'Almuerzo', 'Once', 'Cena', 'Colación', 'Otra'];

const calcular = (lista) => {
  const total = lista.reduce((acc, a) => {
    const factor = numero(a.gramos) / 100;
    acc.proteinas += numero(a.proteinas) * factor;
    acc.carbohidratos += numero(a.carbohidratos) * factor;
    acc.grasas += numero(a.grasas) * factor;
    return acc;
  }, { proteinas: 0, carbohidratos: 0, grasas: 0 });
  return { ...total, calorias: total.proteinas * 4 + total.carbohidratos * 4 + total.grasas * 9 };
};

// Gemini entrega nutrientes por porción; el formulario los muestra por cada 100 g.
const convertirAlimento = (dato) => {
  const gramos = numero(dato.cantidad_g);
  if (!gramos || !String(dato.nombre || '').trim()) return null;
  const factor = 100 / gramos;
  return {
    id: crearId(),
    nombre: String(dato.nombre).slice(0, 100),
    gramos: String(Math.round(gramos)),
    proteinas: String(Math.round(numero(dato.proteinas_g) * factor * 10) / 10),
    carbohidratos: String(Math.round(numero(dato.carbohidratos_g) * factor * 10) / 10),
    grasas: String(Math.round(numero(dato.grasas_g) * factor * 10) / 10),
  };
};

const leerBase64 = (archivo) => new Promise((resolve, reject) => {
  const lector = new FileReader();
  lector.onload = () => {
    const base64 = String(lector.result || '').split(',')[1];
    base64 ? resolve(base64) : reject(new Error('No se pudo leer la imagen.'));
  };
  lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
  lector.readAsDataURL(archivo);
});

const mensajeError = (error) => {
  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return 'Todavía no está creada la tabla de alimentación. Ejecuta el SQL incluido en el ZIP.';
  }
  return error?.message || 'Ocurrió un error al consultar Supabase.';
};

export default function MiAlimentacion() {
  const [foto, setFoto] = useState(null);
  const [fotoUrl, setFotoUrl] = useState('');
  const [alimentos, setAlimentos] = useState([nuevoAlimento()]);
  const [aviso, setAviso] = useState('');
  const [analizando, setAnalizando] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const [fecha, setFecha] = useState(fechaLocal());
  const [tipoComida, setTipoComida] = useState('Almuerzo');
  const [nota, setNota] = useState('');
  const [registros, setRegistros] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [mensajeHistorial, setMensajeHistorial] = useState('');
  const camaraRef = useRef(null);
  const galeriaRef = useRef(null);
  const editorRef = useRef(null);

  useEffect(() => {
    if (!foto) { setFotoUrl(''); return undefined; }
    const url = URL.createObjectURL(foto);
    setFotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [foto]);

  const cargarHistorial = async () => {
    setCargando(true);
    try {
      const { data: { user }, error: errorUsuario } = await supabase.auth.getUser();
      if (errorUsuario || !user) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      const { data, error } = await supabase.from('alimentacion_registros')
        .select('id, fecha, tipo_comida, nota, alimentos, observaciones, calorias, proteinas_g, carbohidratos_g, grasas_g, created_at')
        .eq('usuario_id', user.id)
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      setRegistros(data || []);
      setMensajeHistorial('');
    } catch (error) {
      setMensajeHistorial(mensajeError(error));
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => { cargarHistorial(); }, []);

  const totales = useMemo(() => calcular(alimentos), [alimentos]);
  const registrosFecha = useMemo(() => registros.filter((r) => r.fecha === fecha), [registros, fecha]);
  const totalDia = useMemo(() => registrosFecha.reduce((acc, r) => {
    acc.calorias += numero(r.calorias);
    acc.proteinas += numero(r.proteinas_g);
    acc.carbohidratos += numero(r.carbohidratos_g);
    acc.grasas += numero(r.grasas_g);
    return acc;
  }, { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 }), [registrosFecha]);

  const actualizar = (id, campo, valor) => {
    setAlimentos((actuales) => actuales.map((a) => a.id === id ? { ...a, [campo]: valor } : a));
  };

  const elegirFoto = (evento) => {
    const archivo = evento.target.files?.[0];
    evento.target.value = ''; // Permite seleccionar nuevamente la misma foto.
    if (!archivo) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
      setAviso('Selecciona una fotografía JPG, PNG o WebP.'); return;
    }
    if (archivo.size > 8 * 1024 * 1024) {
      setAviso('La fotografía debe pesar como máximo 8 MB.'); return;
    }
    setFoto(archivo);
    setObservaciones('');
    setAviso('Fotografía lista. Pulsa «Analizar con IA» para reconocer los alimentos.');
  };

  const analizarConIA = async () => {
    if (!foto || analizando) return;
    setAnalizando(true);
    setAviso('Analizando fotografía...');
    setObservaciones('');
    try {
      const { data: sesion, error: errorSesion } = await supabase.auth.getSession();
      if (errorSesion || !sesion?.session?.access_token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      const imageBase64 = await leerBase64(foto);
      const { data, error } = await supabase.functions.invoke('analizar-alimento', {
        body: { imageBase64, mimeType: foto.type },
      });
      if (error) {
        let mensaje = 'No se pudo analizar la fotografía.';
        if (typeof error.context?.json === 'function') {
          try { mensaje = (await error.context.json())?.error || mensaje; } catch (_) { /* respuesta no JSON */ }
        }
        throw new Error(mensaje);
      }
      if (data?.error) throw new Error(data.error);
      if (!Array.isArray(data?.alimentos)) throw new Error('La IA devolvió un resultado inesperado.');
      const identificados = data.alimentos.map(convertirAlimento).filter(Boolean);
      if (!identificados.length) {
        setAviso('No se identificaron alimentos. Puedes ingresarlos manualmente.'); return;
      }
      setAlimentos(identificados);
      setObservaciones(String(data.observaciones || '').slice(0, 600));
      setAviso(`Se identificaron ${identificados.length} alimentos. Revisa las porciones antes de guardar.`);
    } catch (error) {
      setAviso(error?.message || 'No se pudo analizar la fotografía. Puedes registrar los alimentos manualmente.');
    } finally {
      setAnalizando(false);
    }
  };

  const nuevoRegistro = () => {
    setEditandoId(null);
    setAlimentos([nuevoAlimento()]);
    setTipoComida('Almuerzo');
    setNota('');
    setFoto(null);
    setObservaciones('');
    setAviso('Nuevo registro listo.');
  };

  const guardar = async () => {
    if (guardando || analizando) return;
    const validos = alimentos.filter((a) => String(a.nombre).trim() !== '');
    if (!validos.length) { setAviso('Ingresa al menos un alimento con nombre.'); return; }
    if (validos.some((a) => !Number.isFinite(Number(a.gramos)) || numero(a.gramos) <= 0 ||
      ['proteinas', 'carbohidratos', 'grasas'].some((campo) => a[campo] === '' || !Number.isFinite(Number(a[campo])) || Number(a[campo]) < 0))) {
      setAviso('Revisa las porciones y los macronutrientes: deben ser números válidos y no negativos.'); return;
    }
    if (!fecha) { setAviso('Selecciona una fecha.'); return; }
    const limpios = validos.map((a) => ({
      nombre: a.nombre.trim().slice(0, 100),
      gramos: numero(a.gramos),
      proteinas: numero(a.proteinas),
      carbohidratos: numero(a.carbohidratos),
      grasas: numero(a.grasas),
    }));
    const valores = calcular(limpios);
    setGuardando(true);
    setAviso('Guardando tu comida...');
    try {
      const { data: { user }, error: errorUsuario } = await supabase.auth.getUser();
      if (errorUsuario || !user) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
      const registro = {
        usuario_id: user.id,
        fecha,
        tipo_comida: tipoComida,
        nota: nota.trim().slice(0, 250),
        alimentos: limpios,
        observaciones: observaciones.slice(0, 600),
        calorias: Math.round(valores.calorias * 10) / 10,
        proteinas_g: Math.round(valores.proteinas * 10) / 10,
        carbohidratos_g: Math.round(valores.carbohidratos * 10) / 10,
        grasas_g: Math.round(valores.grasas * 10) / 10,
      };
      let resultado;
      if (editandoId) {
        resultado = await supabase.from('alimentacion_registros').update(registro)
          .eq('id', editandoId).eq('usuario_id', user.id).select('id').single();
      } else {
        resultado = await supabase.from('alimentacion_registros').insert(registro).select('id').single();
      }
      if (resultado.error) throw resultado.error;
      const eraEdicion = Boolean(editandoId);
      nuevoRegistro();
      setAviso(eraEdicion ? 'Registro actualizado correctamente.' : 'Comida guardada correctamente en tu historial privado.');
      await cargarHistorial();
    } catch (error) {
      setAviso(`No se pudo guardar: ${mensajeError(error)}`);
    } finally {
      setGuardando(false);
    }
  };

  const editar = (r) => {
    setEditandoId(r.id);
    setFecha(r.fecha);
    setTipoComida(r.tipo_comida);
    setNota(r.nota || '');
    setAlimentos(Array.isArray(r.alimentos) && r.alimentos.length
      ? r.alimentos.map((a) => ({ ...a, id: crearId(), gramos: String(a.gramos), proteinas: String(a.proteinas), carbohidratos: String(a.carbohidratos), grasas: String(a.grasas) }))
      : [nuevoAlimento()]);
    setFoto(null);
    setObservaciones(r.observaciones || '');
    setAviso('Editando una comida guardada. Realiza los cambios y pulsa «Actualizar comida».');
    editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const eliminar = async (r) => {
    if (eliminando || !window.confirm('¿Eliminar esta comida de tu historial?')) return;
    setEliminando(r.id);
    try {
      const { data: { user }, error: errorUsuario } = await supabase.auth.getUser();
      if (errorUsuario || !user) throw new Error('Sesión no válida.');
      const { error } = await supabase.from('alimentacion_registros').delete()
        .eq('id', r.id).eq('usuario_id', user.id);
      if (error) throw error;
      if (editandoId === r.id) nuevoRegistro();
      await cargarHistorial();
    } catch (error) {
      setMensajeHistorial(`No se pudo eliminar: ${mensajeError(error)}`);
    } finally {
      setEliminando(null);
    }
  };

  return (
    <section className="ath-food" aria-label="Mi alimentación">
      <header className="ath-food-hero">
        <span className="ath-food-kicker">NUTRICIÓN PERSONAL</span>
        
        <p>Fotografía tu comida, estima sus nutrientes con IA y lleva un historial privado.</p>
      </header>
      <div className="ath-food-info"><strong>Estimaciones orientativas.</strong> La IA no puede medir exactamente las porciones ni los ingredientes ocultos. Corrige los valores antes de guardarlos. Las fotografías no se almacenan en el historial.</div>
      <div className="ath-food-grid">
        <div className="ath-food-panel">
          <h3>1. Fotografía de tu comida</h3>
          <p>Toma una foto con tu móvil o selecciona una imagen JPG, PNG o WebP (máximo 8 MB).</p>
          <div className="ath-food-actions">
            <button type="button" className="ath-food-upload" onClick={() => camaraRef.current?.click()}>Tomar fotografía</button>
            <button type="button" className="ath-food-upload ath-food-upload--secondary" onClick={() => galeriaRef.current?.click()}>Elegir de galería</button>
            <input ref={camaraRef} className="ath-food-file-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={elegirFoto} aria-label="Tomar fotografía con la cámara" />
            <input ref={galeriaRef} className="ath-food-file-hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={elegirFoto} aria-label="Elegir fotografía de la galería" />
          </div>
          {fotoUrl ? <img className="ath-food-preview" src={fotoUrl} alt="Vista previa de la comida seleccionada" /> : <div className="ath-food-placeholder">Aquí aparecerá tu fotografía</div>}
          {foto && <div className="ath-food-actions ath-food-photo-actions">
            <button type="button" className="ath-food-add" onClick={analizarConIA} disabled={analizando}>{analizando ? 'Analizando...' : 'Analizar con IA'}</button>
            <button type="button" className="ath-food-link" onClick={() => { setFoto(null); setAviso(''); }} disabled={analizando}>Quitar fotografía</button>
          </div>}
          {aviso && <p className="ath-food-notice" role="status">{aviso}</p>}
          {observaciones && <p className="ath-food-footnote"><strong>Observaciones de la IA:</strong> {observaciones}</p>}
        </div>
        <div className="ath-food-panel">
          <h3>2. Estimación nutricional</h3>
          <p>Se actualiza al corregir las porciones y los valores por 100 g.</p>
          <div className="ath-food-metrics">
            <div><span>Calorías</span><strong>{mostrar(totales.calorias)} <small>kcal</small></strong></div>
            <div><span>Proteínas</span><strong>{mostrar(totales.proteinas)} <small>g</small></strong></div>
            <div><span>Carbohidratos</span><strong>{mostrar(totales.carbohidratos)} <small>g</small></strong></div>
            <div><span>Grasas</span><strong>{mostrar(totales.grasas)} <small>g</small></strong></div>
          </div>
          <p className="ath-food-footnote">Calorías aproximadas: proteínas × 4 + carbohidratos × 4 + grasas × 9.</p>
        </div>
      </div>
      <div ref={editorRef} className="ath-food-panel ath-food-editor">
        <div className="ath-food-editor-heading"><div><h3>3. Alimentos y porciones</h3><p>Revisa los alimentos detectados o ingrésalos manualmente.</p></div></div>
        {alimentos.map((a, i) => <div className="ath-food-item" key={a.id}>
          <div className="ath-food-item-title"><strong>Alimento {i + 1}</strong>{alimentos.length > 1 && <button type="button" className="ath-food-link" onClick={() => setAlimentos(lista => lista.filter(x => x.id !== a.id))}>Quitar</button>}</div>
          <div className="ath-food-fields">
            <label>Nombre<input type="text" maxLength={100} placeholder="Ej.: arroz cocido" value={a.nombre} onChange={e => actualizar(a.id, 'nombre', e.target.value)} /></label>
            <label>Porción (g)<input type="number" min="0" step="1" value={a.gramos} onChange={e => actualizar(a.id, 'gramos', e.target.value)} /></label>
            <label>Proteínas / 100 g<input type="number" min="0" step="0.1" value={a.proteinas} onChange={e => actualizar(a.id, 'proteinas', e.target.value)} /></label>
            <label>Carbohidratos / 100 g<input type="number" min="0" step="0.1" value={a.carbohidratos} onChange={e => actualizar(a.id, 'carbohidratos', e.target.value)} /></label>
            <label>Grasas / 100 g<input type="number" min="0" step="0.1" value={a.grasas} onChange={e => actualizar(a.id, 'grasas', e.target.value)} /></label>
          </div>
        </div>)}
        <button type="button" className="ath-food-add" onClick={() => setAlimentos(lista => [...lista, nuevoAlimento()])}>+ Agregar alimento</button>
        <div className="ath-food-savebar">
          <label>Fecha<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label>
          <label>Tipo de comida<select value={tipoComida} onChange={e => setTipoComida(e.target.value)}>{tiposComida.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          <label className="ath-food-note">Nota (opcional)<input type="text" maxLength={250} value={nota} placeholder="Ej.: Después de entrenar" onChange={e => setNota(e.target.value)} /></label>
        </div>
        <div className="ath-food-actions ath-food-bottom-actions">
          <button type="button" className="ath-food-save" disabled={guardando || analizando} onClick={guardar}>{guardando ? 'Guardando...' : editandoId ? 'Actualizar comida' : 'Guardar comida'}</button>
          <button type="button" className="ath-food-add" onClick={nuevoRegistro}>Nuevo registro</button>
        </div>
      </div>
      <div className="ath-food-panel ath-food-history">
        <div className="ath-food-history-heading"><div><h3>4. Mi historial</h3><p>Solo tú puedes consultar tus comidas guardadas.</p></div><button type="button" className="ath-food-link" onClick={cargarHistorial} disabled={cargando}>Actualizar</button></div>
        <div className="ath-food-history-filter"><label>Consultar fecha<input type="date" value={fecha} onChange={e => setFecha(e.target.value)} /></label><span>{registrosFecha.length} comida(s) guardada(s)</span></div>
        <div className="ath-food-day-summary">
          <strong>Resumen del {fecha.split('-').reverse().join('/')}</strong>
          <div className="ath-food-day-values"><span>{mostrar(totalDia.calorias)} kcal</span><span>{mostrar(totalDia.proteinas)} g proteínas</span><span>{mostrar(totalDia.carbohidratos)} g carbohidratos</span><span>{mostrar(totalDia.grasas)} g grasas</span></div>
        </div>
        {mensajeHistorial && <p className="ath-food-notice" role="alert">{mensajeHistorial}</p>}
        {cargando ? <p className="ath-food-empty">Cargando historial...</p> : registrosFecha.length === 0 ? <p className="ath-food-empty">Todavía no hay comidas guardadas para esta fecha.</p> : <div className="ath-food-history-list">
          {registrosFecha.map(r => <article className="ath-food-history-item" key={r.id}>
            <div><strong>{r.tipo_comida}</strong>{r.nota && <p>{r.nota}</p>}<p>{Array.isArray(r.alimentos) ? r.alimentos.map(a => a.nombre).join(', ') : ''}</p></div>
            <div className="ath-food-history-meta"><strong>{mostrar(r.calorias)} kcal</strong><small>P {mostrar(r.proteinas_g)} g · C {mostrar(r.carbohidratos_g)} g · G {mostrar(r.grasas_g)} g</small></div>
            <div className="ath-food-history-controls"><button type="button" className="ath-food-link" onClick={() => editar(r)}>Editar</button><button type="button" className="ath-food-link ath-food-danger" disabled={eliminando === r.id} onClick={() => eliminar(r)}>{eliminando === r.id ? 'Eliminando...' : 'Eliminar'}</button></div>
          </article>)}
        </div>}
        {registros.length >= 300 && <p className="ath-food-footnote">Se muestran los 300 registros más recientes. Los anteriores permanecen guardados.</p>}
      </div>
    </section>
  );
}
