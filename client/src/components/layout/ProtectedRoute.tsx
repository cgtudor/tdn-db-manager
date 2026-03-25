import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { PageLoading } from '../shared/Loading';

export function ProtectedRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <PageLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return <Outlet />;
}

export function AdminRoute() {
  const { isAdmin, isLoading, isAuthenticated } = useAuth();

  if (isLoading) return <PageLoading />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return <Outlet />;
}
