import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { isConfigured } from './lib/supabase.js';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { FarmProvider } from './context/FarmContext.jsx';
import { UIProvider } from './context/UIContext.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';
import Auth from './pages/Auth.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Reports from './pages/Reports.jsx';
import SetupNeeded from './pages/SetupNeeded.jsx';
import Settings from './pages/Settings.jsx';
import Transactions from './pages/Transactions.jsx';

function Gate() {
  const { session, loading, recovery } = useAuth();
  if (loading) return <PageLoader />;
  if (!session || recovery) return <Auth />;
  return (
    <FarmProvider key={session.user.id}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </FarmProvider>
  );
}

export default function App() {
  if (!isConfigured) return <SetupNeeded />;
  return (
    <AuthProvider>
      <UIProvider>
        <Gate />
      </UIProvider>
    </AuthProvider>
  );
}
