import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Outlet } from 'react-router-dom';
import {
  LayoutDashboard, FlaskConical, Search, BookOpen, FileText,
  Settings, ChevronLeft, ChevronRight, Menu, ShieldAlert,
  LogOut, Zap, Shield
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useRBAC } from '@/lib/useRBAC';
import { cn } from '@/lib/utils';
import TenantSwitcher from '@/components/layout/TenantSwitcher';
import SyncStatusBanner from '@/components/shared/SyncStatusBanner';

const ROLE_LABELS = {
  app_super_admin: 'App Super Admin',
  site_admin: 'Site Admin',
  site_user: 'Site User',
  site_security: 'Site Security',
};

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const {
    hazmatRole,
    isAppSuperAdmin,
    isSiteAdmin,
    isSiteUser,
    canReviewFastTrack,
    canViewSecureConfig,
  } = useRBAC();

  const handleLogout = () => base44.auth.logout();

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/', show: true },
    { icon: FlaskConical, label: 'HazMat Register', path: '/register', show: true },
    { icon: Search, label: 'Search', path: '/search', show: true },
    { icon: BookOpen, label: 'Glossary', path: '/glossary', show: true },
    { icon: FileText, label: 'Documents', path: '/documents', show: true },
    { icon: Zap, label: 'Fast Track', path: '/fast-track', show: true },
    { icon: Zap, label: 'FT Review', path: '/fast-track-review', show: canReviewFastTrack },
    { icon: ShieldAlert, label: 'Admin', path: '/admin', show: isSiteAdmin },
    { icon: Settings, label: 'Support', path: '/support', show: true },
  ];

  const NavLink = ({ item }) => {
    if (!item.show) return null;
    const active = location.pathname === item.path ||
      (item.path !== '/' && location.pathname.startsWith(item.path));
    return (
      <Link
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group',
          active
            ? 'bg-sidebar-primary text-sidebar-primary-foreground'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <item.icon size={20} className="shrink-0" />
        {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
      </Link>
    );
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-5 border-b border-sidebar-border">
        <img src="https://media.base44.com/images/public/69c686a2a3716dae20083c36/dbe8ba221_R2K.png" alt="R2K" className="w-10 h-10 object-contain shrink-0" />
        {!collapsed && (
          <div>
            <h1 className="text-sm font-bold font-space-grotesk tracking-wide" style={{ color: '#145370' }}>HazMat R2K</h1>
            <p className="text-xs text-sidebar-foreground/50">Safety Register</p>
          </div>
        )}
      </div>

      <div className="px-3 pb-2">
        <TenantSwitcher collapsed={collapsed} />
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {navItems.map(item => <NavLink key={item.path} item={item} />)}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        {!collapsed && user && (
          <div className="mb-2 px-3 py-2 rounded-lg bg-sidebar-accent">
            <p className="text-xs font-medium text-sidebar-foreground truncate">{user.full_name || user.email}</p>
            <p className="text-xs text-sidebar-foreground/50">{ROLE_LABELS[hazmatRole] || hazmatRole}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-all"
        >
          <LogOut size={16} />
          {!collapsed && <span className="text-sm">Logout</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300 relative',
        collapsed ? 'w-16' : 'w-60'
      )}>
        <SidebarContent />
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center shadow-sm hover:bg-secondary transition-colors z-10"
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-sidebar flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile Header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-card border-b border-border">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-lg hover:bg-secondary">
            <Menu size={20} />
          </button>
          <div className="flex items-center gap-2">
            <img src="https://media.base44.com/images/public/69c686a2a3716dae20083c36/dbe8ba221_R2K.png" alt="R2K" className="w-6 h-6 object-contain" />
            <span className="font-bold text-sm font-space-grotesk" style={{ color: '#145370' }}>HazMat R2K</span>
          </div>
        </header>

        <SyncStatusBanner />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}