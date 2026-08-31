import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/common/ProtectedRoute';
import { DashboardHome } from './pages/DashboardHome';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { ProfilePage } from './pages/ProfilePage';
import { ServicesPage } from './pages/services/ServicesPage';
import { AdminServicesPage } from './pages/admin/AdminServicesPage';
import { NewOrderPage } from './pages/orders/NewOrderPage';
import { OrderListPage } from './pages/orders/OrderListPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { DepositPage } from './pages/wallet/DepositPage';
import { WalletLedgerPage } from './pages/wallet/WalletLedgerPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AdminSettingsPage } from './pages/admin/AdminSettingsPage';
import { ApiDocsPage } from './pages/api/ApiDocsPage';
import { SupportTicketsPage } from './pages/support/SupportTicketsPage';
import { AdminTicketsPage } from './pages/admin/AdminTicketsPage';
import { RefillPage } from './pages/orders/RefillPage';
import { ChildPanelPage } from './pages/childpanel/ChildPanelPage';
import { AffiliatesPage } from './pages/affiliates/AffiliatesPage';
import { ServiceUpdatesPage } from './pages/services/ServiceUpdatesPage';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <CurrencyProvider>
        <BrowserRouter>
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
                path="refill"
                element={
                  <ProtectedRoute>
                    <RefillPage />
                  </ProtectedRoute>
                }
              />
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
      </BrowserRouter>
      </CurrencyProvider>
    </AuthProvider>
  );
};

export default App;
