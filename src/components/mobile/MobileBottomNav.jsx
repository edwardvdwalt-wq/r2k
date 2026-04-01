import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, FlaskConical, Search, FileText, AlertTriangle, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * MobileBottomNav - Fixed bottom navigation for mobile
 * Shows 5-6 primary actions as icons + labels
 * Emergency always visible for safety-critical app
 */
const navItems = [
  { icon: Home, label: 'Home', path: '/' },
  { icon: FlaskConical, label: 'Register', path: '/register' },
  { icon: Search, label: 'Search', path: '/search' },
  { icon: AlertTriangle, label: 'Emergency', path: '/emergency' },
  { icon: FileText, label: 'Documents', path: '/documents' },
  { icon: Menu, label: 'More', path: '/admin' },
];

export default function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-40">
      <div className="flex items-stretch">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || 
                          (item.path !== '/' && location.pathname.startsWith(item.path));
          const isEmergency = item.path === '/emergency';
          
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-1",
                "text-xs font-medium transition-colors",
                isEmergency && "hover:bg-red-50",
                isActive && isEmergency
                  ? "text-red-600 bg-red-50"
                  : isActive
                  ? "text-primary bg-primary/5"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={20} className={isEmergency && isActive ? "text-red-600" : ""} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}