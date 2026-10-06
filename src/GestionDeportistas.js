import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';

export default function GestionDeportistas() {
  const [deportistas, setDeportistas] = useState([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nombre, setNombre] = useState('');
  const [rut, setRut] = useState('');
  const [correo, setCorreo] = useState('');

  useEffect(() => {
    obtenerDeportistas();
  }, []);

  const obtenerDeportistas = async () => {
    const { data, error } = await supabase.from('usuarios').select('*'); 
    if (error) {
      console.error("Error al obtener los datos:", error);
    } else {
      setDeportistas(data);
    }
  };

  const agregarDeportista = async (e) => {
    e.preventDefault();
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: correo,
      password: rut, 
    });

    if (authError) {
      alert('Error al crear credencial: ' + authError.message);
      return;
    }

    const { error: dbError } = await supabase
      .from('usuarios')
      .insert([{ id: authData.user.id, nombre: nombre, rut: rut, correo: correo, rol_id: 3 }]);

    if (dbError) {
      alert('Error al guardar el perfil: ' + dbError.message);
    } else {
      alert('¡Deportista agregado exitosamente!');
      setNombre('');
      setRut('');
      setCorreo('');
      setMostrarForm(false);
      obtenerDeportistas(); 
    }
  };

  const eliminarDeportista = async (id) => {
    const confirmar = window.confirm("¿Seguro que deseas eliminar a este deportista del equipo?");
    if (confirmar) {
      const { error } = await supabase.from('usuarios').delete().eq('id', id);
      if (error) {
        alert("Error al eliminar: " + error.message);
      } else {
        alert("Deportista eliminado correctamente.");
        obtenerDeportistas(); // Recarga la tabla para que desaparezca visualmente
      }
    }
  };

  return (
    <div style={{ padding: '50px', fontFamily: 'sans-serif' }}>
      <h2>Gestión de Deportistas</h2>
      <button 
        onClick={() => setMostrarForm(!mostrarForm)}
        style={{ padding: '10px 15px', marginBottom: '20px', cursor: 'pointer', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px' }}>
        {mostrarForm ? 'Cancelar' : '+ Agregar Nuevo Deportista'}
      </button>

      {mostrarForm && (
        <form onSubmit={agregarDeportista} style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ddd', borderRadius: '5px', backgroundColor: '#f9f9f9' }}>
          <input type="text" placeholder="Nombre completo" value={nombre} onChange={(e) => setNombre(e.target.value)} required style={{ marginRight: '10px', padding: '8px', width: '200px' }} />
          <input type="text" placeholder="RUT (ej. 12345678-9)" value={rut} onChange={(e) => setRut(e.target.value)} required style={{ marginRight: '10px', padding: '8px', width: '150px' }} />
          <input type="email" placeholder="Correo electrónico" value={correo} onChange={(e) => setCorreo(e.target.value)} required style={{ marginRight: '10px', padding: '8px', width: '200px' }} />
          <button type="submit" style={{ padding: '9px 15px', backgroundColor: '#008CBA', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>Guardar Deportista</button>
        </form>
      )}
      
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ backgroundColor: '#f2f2f2' }}>
            <th style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>Nombre</th>
            <th style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>RUT</th>
            <th style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {deportistas.map((deportista) => (
            <tr key={deportista.id}>
              <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>{deportista.nombre}</td>
              <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>{deportista.rut}</td>
              <td style={{ padding: '12px', borderBottom: '1px solid #ddd' }}>
                <button 
                  onClick={() => eliminarDeportista(deportista.id)}
                  style={{ padding: '5px 10px', backgroundColor: '#f44336', color: 'white', border: 'none', borderRadius: '3px', cursor: 'pointer' }}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}