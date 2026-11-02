import { Component, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './providers';
import { Layout } from '../components/Layout';
import { LoadingSkeleton, EmptyState } from '../components/ui';
import { Login } from '../pages/Login';
import { Dashboard } from '../pages/Dashboard';
import { Products, ProductEditor } from '../pages/Products';
import { Orders, OrderDetails } from '../pages/Orders';
import { Users } from '../pages/Users';
import { Settings } from '../pages/Settings';
export function ProtectedRoute({ admin = false }: { admin?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="error-state">
        <h1>Something interrupted this page.</h1>
        <p>Your saved work is still safe. Reload to continue.</p>
        <button className="button primary" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingSkeleton />;
  return user ? <Navigate to="/dashboard" replace /> : <Login />;
}
export function App() {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="products" element={<Products />} />
            <Route path="orders" element={<Orders />} />
            <Route path="orders/:id" element={<OrderDetails />} />
            <Route path="settings" element={<Settings />} />
            <Route element={<ProtectedRoute admin />}>
              <Route path="products/new" element={<ProductEditor />} />
              <Route path="products/:id/edit" element={<ProductEditor />} />
              <Route path="analytics" element={<Dashboard analytics />} />
              <Route path="users" element={<Users />} />
            </Route>
            <Route
              path="*"
              element={
                <EmptyState
                  title="Page not found"
                  description="Choose a page from the navigation to continue."
                />
              }
            />
          </Route>
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
