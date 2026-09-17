import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { TenantProvider } from './context/TenantContext';
import { TenantSimulationBanner } from './components/common/TenantSimulationBanner';
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { DashboardHome } from './pages/DashboardHome';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { WhatsAppChannelPopup } from './components/common/WhatsAppChannelPopup';

// Lazy loaded customer routes
const ProfilePage = lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const ServicesPage = lazy(() => import('./pages/services/ServicesPage').then(m => ({ default: m.ServicesPage })));
const ServiceUpdatesPage = lazy(() => import('./pages/services/ServiceUpdatesPage').then(m => ({ default: m.ServiceUpdatesPage })));
const ApiDocsPage = lazy(() => import('./pages/api/ApiDocsPage').then(m => ({ default: m.ApiDocsPage })));
const NewOrderPage = lazy(() => import('./pages/orders/NewOrderPage').then(m => ({ default: m.NewOrderPage })));
const WhatsAppOrderPage = lazy(() => import('./pages/orders/WhatsAppOrderPage').then(m => ({ default: m.WhatsAppOrderPage })));
const OrderListPage = lazy(() => import('./pages/orders/OrderListPage').then(m => ({ default: m.OrderListPage })));
const DepositPage = lazy(() => import('./pages/wallet/DepositPage').then(m => ({ default: m.DepositPage })));
const WalletLedgerPage = lazy(() => import('./pages/wallet/WalletLedgerPage').then(m => ({ default: m.WalletLedgerPage })));
const SupportTicketsPage = lazy(() => import('./pages/support/SupportTicketsPage').then(m => ({ default: m.SupportTicketsPage })));
const ChildPanelPage = lazy(() => import('./pages/childpanel/ChildPanelPage').then(m => ({ default: m.ChildPanelPage })));
const AffiliatesPage = lazy(() => import('./pages/affiliates/AffiliatesPage').then(m => ({ default: m.AffiliatesPage })));

// Lazy loaded administrative routes
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage').then(m => ({ default: m.AdminOrdersPage })));
const AdminTicketsPage = lazy(() => import('./pages/admin/AdminTicketsPage').then(m => ({ default: m.AdminTicketsPage })));
const AdminServicesPage = lazy(() => import('./pages/admin/AdminServicesPage').then(m => ({ default: m.AdminServicesPage })));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })));

const RouteLoadingFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center">
    <div className="w-8 h-8 rounded-full border-2 border-brand-500/20 border-t-brand-500 animate-spin" />
  </div>
);

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <TenantProvider>
          <BrowserRouter>
            <TenantSimulationBanner />
            <WhatsAppChannelPopup />
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Main App Routes wrapped in MainLayout */}
            <Route path="/" element={<MainLayout />}>
              <Route index element={<DashboardHome />} />

              {/* Public Services Catalog */}
              <Route path="services" element={<ServicesPage />} />
              <Route path="updates" element={<ServiceUpdatesPage />} />

              {/* Reseller API Docs */}
              <Route path="api-docs" element={<ApiDocsPage />} />

              {/* Authenticated Customer Routes */}
              <Route
                path="profile"
                element={
                  <ProtectedRoute>
                    <ProfilePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="orders"
                element={
                  <ProtectedRoute>
                    <OrderListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="orders/new"
                element={
                  <ProtectedRoute>
                    <NewOrderPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="orders/whatsapp"
                element={
                  <ProtectedRoute>
                    <WhatsAppOrderPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="whatsapp"
                element={<Navigate to="/orders/whatsapp" replace />}
              />
              <Route path="refill" element={<Navigate to="/orders" replace />} />
              <Route
                path="child-panel"
                element={
                  <ProtectedRoute>
                    <ChildPanelPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="referrals"
                element={
                  <ProtectedRoute>
                    <AffiliatesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="deposit"
                element={
                  <ProtectedRoute>
                    <DepositPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="wallet/deposit"
                element={
                  <ProtectedRoute>
                    <DepositPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="wallet/ledger"
                element={
                  <ProtectedRoute>
                    <WalletLedgerPage />
                  </ProtectedRoute>
                }
              />
            <Route
              path="support"
              element={
                <ProtectedRoute>
                  <SupportTicketsPage />
                </ProtectedRoute>
              }
            />

            {/* Protected Admin Routes */}
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/orders"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <AdminOrdersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/tickets"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <AdminTicketsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/services"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <AdminServicesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <AdminUsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin/settings"
              element={
                <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
                  <AdminSettingsPage />
                </ProtectedRoute>
              }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
      </BrowserRouter>
        </TenantProvider>
      </CurrencyProvider>
    </AuthProvider>
  );
};

export default App;
