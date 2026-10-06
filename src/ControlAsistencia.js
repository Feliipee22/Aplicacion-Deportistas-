import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function ControlAsistencia() {
  const [deportistas, setDeportistas] = useState([]);

  useEffect(() => {
    obtenerDeportistas();
  }, []);

  const obtenerDeportistas = async () => {
    // Traemos solo a los usuarios que tengan el rol_id 3 (Deportistas)
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('rol_id', 3); 
    
    if (error) {
      console.error("Error al obtener los datos:", error);
    } else {
      setDeportistas(data);
    }
  };

  const guardarAsistencia = () => {
    // Más adelante conectaremos esto con la tabla 'asistencias'
    alert("¡Asistencia registrada exitosamente!");
  };

  return (
    <div style={{ padding: '50px', fontFamily: 'sans-serif' }}>
      <h2>Control de Asistencia</h2>
      <p style={{ marginBottom: '20px' }}>Marca a los deportistas que asistieron al entrenamiento de hoy:</p>
      
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginBottom: '20px' }}>
        <thead>
          <tr style={{ backgroundColor: '#f2f2f2' }}>
            <th style={{ padding: '12px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>Asistencia</th>
            <th style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>Nombre</th>
            <th style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>RUT</th>
          </tr>
        </thead>
        <tbody>
          {deportistas.map((deportista) => (
            <tr key={deportista.id}>
              <td style={{ padding: '12px', borderBottom: '1px solid #ddd', textAlign: 'center' }}>
                <input type="checkbox" style={{ transform: 'scale(1.5)', cursor: 'pointer' }} />
              </td>
              <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>{deportista.nombre}</td>
              <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>{deportista.rut}</td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <button 
        onClick={guardarAsistencia}
        style={{ padding: '10px 20px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontSize: '16px' }}>
        Guardar Asistencia
      </button>
    </div>
  );
}