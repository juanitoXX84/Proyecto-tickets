import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { MainLayout } from './components/layout/MainLayout.jsx';
import { Home } from './pages/Home.jsx';
import { NotFound } from './pages/NotFound.jsx';
import { EventDetail } from './pages/EventDetail.jsx';
import { Login } from './pages/Login.jsx';
import { Register } from './pages/Register.jsx';
import { AuthCallback } from './pages/AuthCallback.jsx';
import { CompleteProfile } from './pages/CompleteProfile.jsx';
import { OrganizerDashboard } from './pages/OrganizerDashboard.jsx';
import { OrganizerEventFormPage } from './pages/OrganizerEventFormPage.jsx';
import { CheckoutPlaceholder } from './pages/CheckoutPlaceholder.jsx';
import { CheckoutReturn } from './pages/CheckoutReturn.jsx';
import { MyPurchases } from './pages/MyPurchases.jsx';
import { Profile } from './pages/Profile.jsx';
import { PrivacyPage } from './pages/PrivacyPage.jsx';
import { TermsPage } from './pages/TermsPage.jsx';
import { AdminLayout } from './components/admin/AdminLayout.jsx';
import { AdminUsersPage } from './pages/admin/AdminUsersPage.jsx';
import { AdminEventsPage } from './pages/admin/AdminEventsPage.jsx';
import { AdminEventPreviewPage } from './pages/admin/AdminEventPreviewPage.jsx';
import { AdminPaymentsPage } from './pages/admin/AdminPaymentsPage.jsx';
import { AdminFinancePage } from './pages/admin/AdminFinancePage.jsx';
import { AdminResenasPage } from './pages/admin/AdminResenasPage.jsx';
import { TicketView } from './pages/TicketView.jsx';

function RequireAdmin() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (!user || user.rol !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RequireOrganizer() {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="py-24 text-center text-slate-400">Cargando…</div>;
  }
  if (!user || user.rol !== 'organizador') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RequireNotAdmin() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (user?.rol === 'admin') {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

function RequireProfileComplete() {
  const { user, needsProfile, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-500">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }
  if (user && needsProfile) {
    return <Navigate to="/oauth/acceso" replace />;
  }
  return <Outlet />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/oauth/acceso" element={<CompleteProfile />} />
      <Route path="/completar-perfil" element={<CompleteProfile />} />

      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/admin/usuarios" replace />} />
          <Route path="/admin/usuarios" element={<AdminUsersPage />} />
          <Route path="/admin/eventos" element={<AdminEventsPage />} />
          <Route path="/admin/eventos/:id/vista-previa" element={<AdminEventPreviewPage />} />
          <Route path="/admin/pagos" element={<AdminPaymentsPage />} />
          <Route path="/admin/finanzas" element={<AdminFinancePage />} />
          <Route path="/admin/resenas" element={<AdminResenasPage />} />
        </Route>
      </Route>

      <Route element={<MainLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/terminos" element={<TermsPage />} />
        <Route path="/privacidad" element={<PrivacyPage />} />

        {/* Ficha pública: mismo mapa interactivo con o sin sesión (no esperar /me ni perfil completo). */}
        <Route path="/eventos/:id" element={<EventDetail />} />
        {/* Vista al escanear el QR del correo (URL publicada en el código). */}
        <Route path="/boleto/:codigo" element={<TicketView />} />

        <Route element={<RequireProfileComplete />}>
          <Route path="/" element={<Home />} />
          <Route path="/checkout" element={<CheckoutPlaceholder />} />
          <Route path="/checkout/retorno" element={<CheckoutReturn />} />
          <Route element={<RequireNotAdmin />}>
            <Route path="/mis-compras" element={<MyPurchases />} />
            <Route path="/perfil" element={<Profile />} />
          </Route>

          <Route path="organizador" element={<RequireOrganizer />}>
            <Route index element={<OrganizerDashboard />} />
            <Route path="eventos/nuevo" element={<OrganizerEventFormPage />} />
            <Route path="eventos/:id/editar" element={<OrganizerEventFormPage />} />
          </Route>
        </Route>
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
