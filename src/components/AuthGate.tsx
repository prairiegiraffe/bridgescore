import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface AuthGateProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export default function AuthGate({ children, fallback }: AuthGateProps) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      fallback || (
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )
    );
  }

  if (!user) {
    // Redirect to login with the current path as returnTo parameter
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}