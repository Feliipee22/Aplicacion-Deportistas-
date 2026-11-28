// Evita solapar sondeos y suspende el sondeo cuando la página está oculta.
export function actualizacionVisible(tarea, intervalo) {
  let activo = true, ocupado = false;
  const ejecutar = async () => {
    if (!activo || ocupado || document.hidden) return;
    ocupado = true;
    try { await tarea(); } catch (error) { console.warn('No se pudo actualizar.'); }
    finally { ocupado = false; }
  };
  const timer = setInterval(ejecutar, intervalo);
  document.addEventListener('visibilitychange', ejecutar);
  void ejecutar();
  return () => { activo = false; clearInterval(timer); document.removeEventListener('visibilitychange', ejecutar); };
}
