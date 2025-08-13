import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { OrgProvider } from './contexts/OrgContext';
import { BrandingProvider } from './contexts/BrandingContext';
import Sidebar from './components/Sidebar';
import AuthGate from './components/AuthGate';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CallDetail from './pages/CallDetail';
import Demo from './pages/Demo';
import OrganizationManagement from './pages/admin/OrganizationManagement';
import Team from './pages/Team';
import Resources from './pages/Resources';

function AppContent() {
  const location = useLocation();
  const { user, loading } = useAuth();
  const isAuthPage = location.pathname === '/login';
  const isDemoPage = location.pathname.startsWith('/demo');
  // Only show sidebar if user is authenticated AND not on auth/demo pages
  const showSidebar = !isAuthPage && !isDemoPage && user && !loading;

  return (
    <div className="min-h-screen bg-gray-50">
      {showSidebar && <Sidebar />}
      <div className={showSidebar ? 'lg:ml-64' : ''}>
          <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/dashboard"
                element={
                  <AuthGate>
                    <Dashboard />
                  </AuthGate>
                }
              />
              <Route
                path="/calls/:id"
                element={
                  <AuthGate>
                    <CallDetail />
                  </AuthGate>
                }
              />
              <Route path="/demo/:shareId" element={<Demo />} />
              <Route
                path="/admin/organizations"
                element={
                  <AuthGate>
                    <OrganizationManagement />
                  </AuthGate>
                }
              />
              <Route
                path="/team"
                element={
                  <AuthGate>
                    <Team />
                  </AuthGate>
                }
              />
              <Route
                path="/resources"
                element={
                  <AuthGate>
                    <Resources />
                  </AuthGate>
                }
              />
              <Route
                path="/"
                element={
                  <AuthGate>
                    <Dashboard />
                  </AuthGate>
                }
              />
            </Routes>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <BrandingProvider>
          <BrowserRouter>
            <AppContent />
          </BrowserRouter>
        </BrandingProvider>
      </OrgProvider>
    </AuthProvider>
  );
}

export default App;
