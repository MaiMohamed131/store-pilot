import { useState } from 'react';
import { NavLink, Outlet, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ChartNoAxesCombined,
  Users,
  Settings,
  LogOut,
  RotateCcw,
  PanelLeftClose,
  Menu,
  ArrowUpRight,
  ChevronDown,
  Command,
  Store,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth, useShop } from '../app/providers';
import { api, errorMessage } from '../lib/api';
const links = [
  { to: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { to: '/products', label: 'Products', icon: Package },
  { to: '/orders', label: 'Orders', icon: ShoppingBag },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/users', label: 'Team members', icon: Users },
];
export function AppSidebar({
  open,
  close,
  collapsed,
  toggle,
}: {
  open: boolean;
  close: () => void;
  collapsed: boolean;
  toggle: () => void;
}) {
  const { user, signOut } = useAuth();
  const { data: shop } = useShop();
  return (
    <>
      <button
        className={`sidebar-backdrop ${open ? 'visible' : ''}`}
        onClick={close}
        aria-label="Close navigation"
      />
      <aside className={`sidebar ${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}>
        <Link to="/dashboard" className="brand">
          <span className="brand-icon">
            <Command size={23} />
          </span>
          <span>
            StorePilot<span className="brand-dot">.</span>
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="store-icon">
            <Store size={19} />
          </span>
          <div>
            <strong>{shop?.name ?? 'Your store'}</strong>
            <small>Retail workspace</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {links
            .filter((l) => user?.role === 'ADMIN' || !['/users', '/analytics'].includes(l.to))
            .map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                title={l.label}
                onClick={close}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <l.icon size={19} />
                <span>{l.label}</span>
                {l.to === '/dashboard' && <span className="nav-dot" />}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <div className="online-dot" />
            All systems operational
            <ArrowUpRight size={14} />
          </div>
          <NavLink to="/settings" onClick={close}>
            <Settings size={19} />
            <span>Settings</span>
          </NavLink>
          <button onClick={toggle} className="collapse-control">
            <PanelLeftClose size={18} />
            <span>{collapsed ? 'Expand navigation' : 'Collapse navigation'}</span>
          </button>
          <div className="sidebar-user">
            <span className="avatar">
              {user?.name
                .split(' ')
                .map((s) => s[0])
                .slice(0, 2)
                .join('')}
            </span>
            <div>
              <strong>{user?.name}</strong>
              <small>{user?.role === 'ADMIN' ? 'Administrator' : 'Staff member'}</small>
            </div>
            {user?.isDemo && (
              <button
                title="Reset demo"
                aria-label="Reset demo"
                onClick={() => {
                  if (window.confirm('Reset your demo? Your temporary changes will be cleared.'))
                    void api
                      .post('/demo/reset')
                      .then(() => window.location.assign('/dashboard'))
                      .catch((e) => toast.error(errorMessage(e)));
                }}
              >
                <RotateCcw size={17} />
              </button>
            )}
            {!user?.isDemo && (
              <button
                title="Sign out"
                aria-label="Sign out"
                onClick={() => void signOut().catch((e) => toast.error(errorMessage(e)))}
              >
                <LogOut size={17} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
export function AppHeader({ open }: { open: () => void }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const name = pathname.split('/')[1];
  return (
    <header className="app-header">
      <div className="header-left">
        <button className="icon-button mobile-menu" onClick={open} aria-label="Open navigation">
          <Menu size={22} />
        </button>
        <span className="header-workspace">Workspace</span>
        <span className="breadcrumb-slash">/</span>
        <strong>
          {name === 'dashboard' ? 'Overview' : name.charAt(0).toUpperCase() + name.slice(1)}
        </strong>
      </div>
      <div className="header-right">
        <span className="live-pill">
          <i />
          {user?.isDemo ? 'Your private demo' : 'Live workspace'}
        </span>
        <span className="header-divider" />
        <Link
          to="/settings"
          className="avatar header-avatar"
          aria-label={`Profile for ${user?.name}`}
        >
          {user?.name
            .split(' ')
            .map((s) => s[0])
            .slice(0, 2)
            .join('')}
        </Link>
      </div>
    </header>
  );
}
export function Layout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={collapsed ? 'app sidebar-small' : 'app'}>
      <AppSidebar
        open={open}
        close={() => setOpen(false)}
        collapsed={collapsed}
        toggle={() => setCollapsed(!collapsed)}
      />
      <div className="main-shell">
        <AppHeader open={() => setOpen(true)} />
        <main>
          <Outlet />
        </main>
        <footer>
          © {new Date().getFullYear()} StorePilot<span>Made for your everyday business.</span>
        </footer>
      </div>
    </div>
  );
}
