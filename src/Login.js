import React, { useState } from 'react';
import { supabase } from './supabase';

export default function Login() {
  const [rut, setRut] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();

    // 1. Buscar el correo asociado al RUT en la tabla 'usuarios'
    const { data: usuario, error: errorRut } = await supabase
      .from('usuarios')
      .select('correo')
      .eq('rut', rut)
      .single();

    if (errorRut || !usuario) {
      alert('RUT no encontrado en la base de datos.');
      return;
    }

    // 2. Iniciar sesión usando el correo encontrado y la contraseña
    const { data, error } = await supabase.auth.signInWithPassword({
      email: usuario.correo,
      password: password,
    });

    if (error) {
      alert('Error al iniciar sesión: Verifica tu contraseña.');
    } else {
      alert('¡Sesión iniciada con éxito en APP clubes!');
      console.log('Datos del usuario:', data.user);
    }
  };

  return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>Iniciar Sesión - APP clubes</h2>
      <form onSubmit={handleLogin}>
        <div style={{ marginBottom: '15px' }}>
          <label>RUT:</label><br />
          <input 
            type="text" 
            value={rut}
            onChange={(e) => setRut(e.target.value)}
            placeholder="12345678-9" 
            required 
            style={{ padding: '8px', width: '200px' }}
          />
        </div>
        <div style={{ marginBottom: '15px' }}>
          <label>Contraseña:</label><br />
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tu contraseña" 
            required 
            style={{ padding: '8px', width: '200px' }}
          />
        </div>
        <button type="submit" style={{ padding: '10px 20px', cursor: 'pointer' }}>
          Entrar
        </button>
      </form>
    </div>
  );
}