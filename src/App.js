import React, { useState } from 'react';
import Login from './Login';
import GestionDeportistas from './GestionDeportistas';
import ControlAsistencia from './ControlAsistencia';

function App() {
  const [pantalla, setPantalla] = useState('asistencia');

  return (
    <div>
      <nav style={{
        display: 'flex',
        gap: '12px',
        padding: '20px',
        borderBottom: '1px solid #ddd'
      }}>
        <button onClick={() => setPantalla('login')}>
          Inicio de sesión
        </button>

        <button onClick={() => setPantalla('deportistas')}>
          Gestión de Deportistas
        </button>

        <button onClick={() => setPantalla('asistencia')}>
          Control de Asistencia
        </button>
      </nav>

      {pantalla === 'login' && <Login />}

      {pantalla === 'deportistas' && <GestionDeportistas />}

      {pantalla === 'asistencia' && <ControlAsistencia />}
    </div>
  );
}

export default App;