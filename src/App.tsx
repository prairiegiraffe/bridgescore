import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { OrgProvider } from './contexts/OrgContext';
import TopNav from './components/TopNav';
import AuthGate from './components/AuthGate';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import CallDetail from './pages/CallDetail';
import Demo from './pages/Demo';
import Assistants from './pages/admin/Assistants';

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
                path="/admin/assistants"
                element={
                  <AuthGate>
                    <Assistants />
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
