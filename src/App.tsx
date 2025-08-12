import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrgProvider } from './contexts/OrgContext';
import TopNav from './components/TopNav';
import AuthGate from './components/AuthGate';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CallDetail from './pages/CallDetail';
import Demo from './pages/Demo';
import ClientManagement from './pages/admin/ClientManagement';
import UserManagement from './pages/admin/UserManagement';
import Team from './pages/Team';
import Settings from './pages/Settings';

function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50">
            <TopNav />
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
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
                path="/admin/clients"
                element={
                  <AuthGate>
                    <ClientManagement />
                  </AuthGate>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <AuthGate>
                    <UserManagement />
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
                path="/settings"
                element={
                  <AuthGate>
                    <Settings />
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
        </BrowserRouter>
      </OrgProvider>
    </AuthProvider>
  );
}

export default App;
