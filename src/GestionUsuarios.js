
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabase';

const nombresRoles = {
  1: 'Administrador',
  2: 'Entrenador',
  3: 'Deportista',
};

const formularioInicial = {
  nombre: '',
  rut: '',
  correo: '',
  rol_id: '2',
  password: '',
};

export default function GestionUsuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [filtroRol, setFiltroRol] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const estaActivo = (valor) => valor === true || String(valor).toLowerCase() === 'true' || String(valor).toLowerCase() === 'activo';
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [actualizacion, setActualizacion] = useState(0);
  const [procesandoId, setProcesandoId] = useState(null);
  const [usuarioConfirmacion, setUsuarioConfirmacion] = useState(null);
  const [usuarioEliminar, setUsuarioEliminar] = useState(null);

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [formulario, setFormulario] = useState(formularioInicial);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [errorCreacion, setErrorCreacion] = useState('');

  useEffect(() => {
    let activo = true;

    const cargarUsuarios = async () => {
      setCargando(true);
      setError('');

      const { data, error: errorConsulta } = await supabase
        .from('usuarios')
        .select('id, nombre, correo, rol_id, estado')
        .order('nombre', { ascending: true });

      if (!activo) return;

      if (errorConsulta) {
        console.error('Error al cargar usuarios:', errorConsulta);
        setError('No se pudieron cargar los usuarios.');
        setUsuarios([]);
      } else {
        setUsuarios(data || []);
      }

      setCargando(false);
    };

    cargarUsuarios();

    return () => {
      activo = false;
    };
  }, [actualizacion]);

  const actualizarCampo = (campo, valor) => {
    setFormulario((anterior) => ({
      ...anterior,
      [campo]: valor,
    }));
  };

  const crearUsuario = async (e) => {
    e.preventDefault();

    if (guardando) return;

    setGuardando(true);
    setErrorCreacion('');
    setMensaje('');

    try {
      const {
        data: { session },
        error: errorSesion,
      } = await supabase.auth.getSession();

      if (errorSesion || !session?.access_token) {
        setErrorCreacion(
          'Tu sesión no está disponible. Inicia sesión nuevamente.'
        );
        return;
      }

      const { data, error: errorFuncion } =
        await supabase.functions.invoke('crear-usuario', {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          body: {
            nombre: formulario.nombre.trim(),
            rut: formulario.rut.trim(),
            correo: formulario.correo.trim().toLowerCase(),
            rol_id: Number(formulario.rol_id),
            password: formulario.password,
          },
        });

      if (errorFuncion) {
        let detalle = 'No se pudo crear el usuario.';

        try {
          const respuesta = await errorFuncion.context?.json();
          detalle = respuesta?.error || detalle;
        } catch {
          // Mantener el mensaje general si no hay respuesta JSON.
        }

        setErrorCreacion(detalle);
        return;
      }

      if (!data?.usuario?.id) {
        setErrorCreacion(
          'No se recibió una confirmación válida del registro.'
        );
        return;
      }

      setMensaje(
        `Se creó correctamente la cuenta de ${data.usuario.nombre}.`
      );

      setFormulario(formularioInicial);
      setMostrarFormulario(false);
      setActualizacion((n) => n + 1);
    } catch (err) {
      console.error('Error al registrar usuario:', err);
      setErrorCreacion(
        'No fue posible conectar con el servicio de registro.'
      );
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (usuario) => {
    setUsuarioConfirmacion(null);
    setProcesandoId(usuario.id);
    setMensaje(''); setError('');
    try {
      const { data, error: fallo } = await supabase.rpc('ath_admin_cambiar_estado_usuario', {
        p_usuario_id: usuario.id,
        p_estado: !estaActivo(usuario.estado),
      });
      if (fallo) throw fallo;
      if (data !== true) throw new Error('No se confirmó la actualización.');
      setMensaje(`Cuenta de ${usuario.nombre} ${estaActivo(usuario.estado) ? 'desactivada' : 'reactivada'}.`);
      setActualizacion(n => n + 1);
    } catch (e) {
      setError(e?.message || 'No se pudo actualizar el estado.');
    } finally { setProcesandoId(null); }
  };

  const solicitarEliminacion = async (usuario) => {
    setProcesandoId(usuario.id);
    setError(''); setMensaje('');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.access_token) throw new Error('Inicia sesión nuevamente.');
      const { data, error: invokeError } = await supabase.functions.invoke('eliminar-usuario', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { usuario_id: usuario.id },
      });
      if (invokeError) {
        let detalle = 'No se pudo registrar la solicitud.';
        try { const respuesta = await invokeError.context?.json(); detalle = respuesta?.error || detalle; } catch (_) {}
        throw new Error(detalle);
      }
      if (!data?.ok) throw new Error(data?.error || 'No se confirmó la solicitud.');
      setUsuarioEliminar(null);
      setMensaje(`Se desactivó la cuenta de ${usuario.nombre} y se registró su solicitud de eliminación. La purga aún no está habilitada.`);
      setActualizacion(n => n + 1);
    } catch (e) { setError(e?.message || 'Error al solicitar eliminación.'); }
    finally { setProcesandoId(null); }
  };

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const texto = busqueda.toLowerCase().trim();

    return (filtroRol === 'todos' || String(usuario.rol_id) === filtroRol) &&
      (filtroEstado === 'todos' || String(estaActivo(usuario.estado)) === filtroEstado) && (
      usuario.nombre?.toLowerCase().includes(texto) ||
      usuario.correo?.toLowerCase().includes(texto) ||
      nombresRoles[usuario.rol_id]
        ?.toLowerCase()
        .includes(texto)
    );
  });

  const totalActivos = usuarios.filter(
    (usuario) => estaActivo(usuario.estado)
  ).length;

  const totalDeportistas = usuarios.filter(
    (usuario) => usuario.rol_id === 3
  ).length;

  const totalEntrenadores = usuarios.filter(
    (usuario) => usuario.rol_id === 2
  ).length;

  return (
    <section className="ath-users">
      <div className="ath-section-heading">
        
        <p>
          Administra las cuentas de Athletix. Solo los administradores autorizados pueden gestionar su estado.
        </p>
      </div>

      <div className="ath-user-stats">
        <div className="ath-user-stat">
          <span>Total de usuarios</span>
          <strong>{usuarios.length}</strong>
        </div>

        <div className="ath-user-stat">
          <span>Usuarios activos</span>
          <strong>{totalActivos}</strong>
        </div>

        <div className="ath-user-stat">
          <span>Entrenadores</span>
          <strong>{totalEntrenadores}</strong>
        </div>

        <div className="ath-user-stat">
          <span>Deportistas</span>
          <strong>{totalDeportistas}</strong>
        </div>
      </div>

      <div className="ath-users-panel">
        <div className="ath-users-toolbar">
          <div>
            <h3>Usuarios registrados</h3>
            <p>
              Consulta las cuentas y administra su acceso.
            </p>
          </div>

          <div className="ath-users-actions">
            <button
              type="button"
              className="ath-users-refresh"
              onClick={() => setActualizacion((n) => n + 1)}
              disabled={cargando}
            >
              Actualizar
            </button>

            <button
              type="button"
              className="ath-users-add"
              onClick={() => {
                setMostrarFormulario((actual) => !actual);
                setErrorCreacion('');
                setMensaje('');
              }}
              disabled={guardando}
            >
              {mostrarFormulario
                ? 'Cancelar'
                : '+ Agregar usuario'}
            </button>
          </div>
        </div>

        {mensaje && (
          <div className="ath-users-success" role="status">
            {mensaje}
          </div>
        )}

        {errorCreacion && (
          <div className="ath-users-form-error" role="alert">
            {errorCreacion}
          </div>
        )}

        {mostrarFormulario && (
          <form
            className="ath-users-form"
            onSubmit={crearUsuario}
          >
            <div className="ath-users-form-heading">
              <h3>Registrar nuevo usuario</h3>
              <p>
                Completa los datos del entrenador o deportista.
              </p>
            </div>

            <div className="ath-users-form-grid">
              <label className="ath-users-field">
                Nombre completo
                <input
                  type="text"
                  value={formulario.nombre}
                  onChange={(e) =>
                    actualizarCampo('nombre', e.target.value)
                  }
                  placeholder="Nombre y apellido"
                  minLength={2}
                  maxLength={100}
                  required
                  disabled={guardando}
                />
              </label>

              <label className="ath-users-field">
                RUT
                <input
                  type="text"
                  value={formulario.rut}
                  onChange={(e) =>
                    actualizarCampo('rut', e.target.value)
                  }
                  placeholder="12345678-9"
                  required
                  disabled={guardando}
                />
              </label>

              <label className="ath-users-field">
                Correo electrónico
                <input
                  type="email"
                  value={formulario.correo}
                  onChange={(e) =>
                    actualizarCampo('correo', e.target.value)
                  }
                  placeholder="correo@ejemplo.com"
                  maxLength={254}
                  required
                  disabled={guardando}
                />
              </label>

              <label className="ath-users-field">
                Rol
                <select
                  value={formulario.rol_id}
                  onChange={(e) =>
                    actualizarCampo('rol_id', e.target.value)
                  }
                  required
                  disabled={guardando}
                >
                  <option value="2">Entrenador</option>
                  <option value="3">Deportista</option>
                </select>
              </label>

              <label className="ath-users-field ath-users-field-full">
                Contraseña temporal
                <input
                  type="password"
                  value={formulario.password}
                  onChange={(e) =>
                    actualizarCampo('password', e.target.value)
                  }
                  placeholder="Mínimo 6 caracteres"
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                  required
                  disabled={guardando}
                />
                <small>
                  No utilices el RUT como contraseña.
                  Este registro es para pruebas del Capstone.
                </small>
              </label>
            </div>

            <div className="ath-users-form-footer">
              <button
                type="submit"
                className="ath-users-add"
                disabled={guardando}
              >
                {guardando
                  ? 'Creando usuario...'
                  : 'Crear usuario'}
              </button>
            </div>
          </form>
        )}

        <input
          className="ath-users-search"
          type="search"
          placeholder="Buscar por nombre, correo o rol..."
          aria-label="Buscar usuarios"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />

        <div className="ath-admin-filters">
          <label>Rol<select value={filtroRol} onChange={e=>setFiltroRol(e.target.value)}><option value="todos">Todos</option><option value="1">Administradores</option><option value="2">Entrenadores</option><option value="3">Deportistas</option></select></label>
          <label>Estado<select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)}><option value="todos">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></label>
        </div>
        <p className="ath-admin-result-count">{usuariosFiltrados.length} cuentas encontradas</p>
        {cargando ? (
          <p className="ath-users-message">
            Cargando usuarios...
          </p>
        ) : error ? (
          <p className="ath-routine-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="ath-admin-user-list">
            {usuariosFiltrados.map(usuario => (
              <article className="ath-admin-user-card" key={usuario.id}>
                <div className="ath-admin-user-card-head">
                  <span className="ath-user-avatar" aria-hidden="true">{usuario.nombre?.charAt(0).toUpperCase() || '?'}</span>
                  <div className="ath-admin-user-main">
                    <strong>{usuario.nombre || 'Sin nombre'}</strong>
                    <span className="ath-admin-user-email">{usuario.correo || 'Sin correo'}</span>
                  </div>
                </div>
                <div className="ath-admin-user-meta">
                  <span className="ath-admin-user-role">{nombresRoles[usuario.rol_id] || 'Sin rol válido'}</span>
                  <span className={estaActivo(usuario.estado) ? 'ath-user-status active' : 'ath-user-status inactive'}>
                    {estaActivo(usuario.estado) ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                {Number(usuario.rol_id) === 1 ? (
                  <div className="ath-admin-protected">Cuenta administrativa protegida</div>
                ) : (
                  <button type="button" className="ath-admin-user-action"
                    disabled={procesandoId === usuario.id}
                    onClick={() => setUsuarioConfirmacion(usuario)}>
                    {procesandoId === usuario.id ? 'Guardando…' : estaActivo(usuario.estado) ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                  </button>
                )}
                {Number(usuario.rol_id) !== 1 && (
                  <button type="button" className="ath-admin-delete-action"
                    disabled={procesandoId === usuario.id}
                    onClick={() => setUsuarioEliminar(usuario)}>
                    Solicitar eliminación
                  </button>
                )}
              </article>
            ))}
            {usuariosFiltrados.length === 0 && (
              <p className="ath-users-message">No se encontraron usuarios con estos filtros.</p>
            )}
          </div>
        )}
      </div>
      {usuarioEliminar && createPortal(
        <div className="ath-confirm-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !procesandoId) setUsuarioEliminar(null); }}>
          <div className="ath-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="ath-delete-title" aria-describedby="ath-delete-description">
            <div className="ath-confirm-symbol" aria-hidden="true">!</div>
            <h3 id="ath-delete-title">¿Solicitar eliminación de cuenta?</h3>
            <p id="ath-delete-description">Se desactivará inmediatamente la cuenta de <strong>{usuarioEliminar.nombre}</strong> y se registrará una solicitud de eliminación. <strong>La purga y anonimización todavía no están activadas.</strong></p>
            <div className="ath-confirm-actions">
              <button type="button" className="ath-confirm-cancel" disabled={Boolean(procesandoId)} onClick={() => setUsuarioEliminar(null)}>Cancelar</button>
              <button type="button" className="ath-confirm-accept" disabled={Boolean(procesandoId)} onClick={() => solicitarEliminacion(usuarioEliminar)}>{procesandoId ? 'Procesando…' : 'Sí, solicitar'}</button>
            </div>
          </div>
        </div>, document.body
      )}
      {usuarioConfirmacion && createPortal(
        <div className="ath-confirm-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !procesandoId) setUsuarioConfirmacion(null); }}>
          <div className="ath-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="ath-confirm-title" aria-describedby="ath-confirm-description">
            <div className="ath-confirm-symbol" aria-hidden="true">{estaActivo(usuarioConfirmacion.estado) ? '!' : '✓'}</div>
            <h3 id="ath-confirm-title">{estaActivo(usuarioConfirmacion.estado) ? '¿Desactivar esta cuenta?' : '¿Reactivar esta cuenta?'}</h3>
            <p id="ath-confirm-description">
              {estaActivo(usuarioConfirmacion.estado)
                ? <>La cuenta de <strong>{usuarioConfirmacion.nombre}</strong> perderá acceso a Athletix. Sus datos no se eliminarán.</>
                : <>La cuenta de <strong>{usuarioConfirmacion.nombre}</strong> podrá volver a acceder a Athletix.</>}
            </p>
            <div className="ath-confirm-actions">
              <button type="button" className="ath-confirm-cancel" disabled={Boolean(procesandoId)} onClick={() => setUsuarioConfirmacion(null)}>Cancelar</button>
              <button type="button" className="ath-confirm-accept" disabled={Boolean(procesandoId)} onClick={() => cambiarEstado(usuarioConfirmacion)}>
                {procesandoId ? 'Guardando…' : estaActivo(usuarioConfirmacion.estado) ? 'Sí, desactivar' : 'Sí, reactivar'}
              </button>
            </div>
          </div>
        </div>, document.body
      )}
    </section>
  );
}
