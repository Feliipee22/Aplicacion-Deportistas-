
import React, { useEffect, useState } from 'react';
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [actualizacion, setActualizacion] = useState(0);

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

  const usuariosFiltrados = usuarios.filter((usuario) => {
    const texto = busqueda.toLowerCase().trim();

    return (
      usuario.nombre?.toLowerCase().includes(texto) ||
      usuario.correo?.toLowerCase().includes(texto) ||
      nombresRoles[usuario.rol_id]
        ?.toLowerCase()
        .includes(texto)
    );
  });

  const totalActivos = usuarios.filter(
    (usuario) => usuario.estado === true
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
        <h2>Gestión de usuarios</h2>
        <p>
          Administra las cuentas registradas en tu organización.
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
              Información obtenida directamente de Supabase.
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

        {cargando ? (
          <p className="ath-users-message">
            Cargando usuarios...
          </p>
        ) : error ? (
          <p className="ath-routine-error" role="alert">
            {error}
          </p>
        ) : (
          <div className="ath-users-table-wrap">
            <table className="ath-users-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                </tr>
              </thead>

              <tbody>
                {usuariosFiltrados.map((usuario) => (
                  <tr key={usuario.id}>
                    <td>
                      <div className="ath-user-identity">
                        <span className="ath-user-avatar">
                          {usuario.nombre
                            ?.charAt(0)
                            .toUpperCase() || '?'}
                        </span>
                        <strong>{usuario.nombre}</strong>
                      </div>
                    </td>

                    <td>{usuario.correo}</td>

                    <td>
                      {nombresRoles[usuario.rol_id] ||
                        'Sin rol válido'}
                    </td>

                    <td>
                      <span
                        className={
                          usuario.estado
                            ? 'ath-user-status active'
                            : 'ath-user-status inactive'
                        }
                      >
                        {usuario.estado
                          ? 'Activo'
                          : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {usuariosFiltrados.length === 0 && (
              <p className="ath-users-message">
                No se encontraron usuarios.
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
