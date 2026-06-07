import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function AuthGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
