import { render, screen } from '@testing-library/react';
import Login from './Login';
jest.mock('./supabase', () => ({ supabase: {} }));
test('muestra el acceso de Athletix', () => {
  render(<Login />);
  expect(screen.getByText('¡Qué bueno verte!')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('12345678-9')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Ingresa tu contraseña')).toBeInTheDocument();
});
