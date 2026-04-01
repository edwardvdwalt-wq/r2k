import { useState, useEffect } from 'react';
import { useTenant } from '@/lib/TenantContext';
import { base44 } from '@/api/base44Client';
import { Building2, ChevronDown, MapPin } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function TenantSwitcher({ collapsed = false }) {
  const { tenant, allTenants, switchTenant, switchSite, activeSite, isSuperAdmin, tenantId } = useTenant();
  const [siteNames, setSiteNames] = useState([]);

  // Load distinct site names from HazMatRegistry when tenant changes
  useEffect(() => {
    if (!isSuperAdmin || !tenantId) { setSiteNames([]); return; }
    base44.entities.HazMatRegistry.filter({ tenant_id: tenantId }, null, 2000)
      .then(rows => {
        const names = [...new Set(rows.map(r => r.Site).filter(Boolean))].sort();
        setSiteNames(names);
      })
      .catch(() => setSiteNames([]));
  }, [tenantId, isSuperAdmin]);

  if (!isSuperAdmin || allTenants.length === 0) {
    return tenant ? (
      <div className={`px-3 py-2 rounded-lg bg-sidebar-accent flex items-center gap-2 ${collapsed ? 'justify-center' : ''}`}>
        <Building2 size={14} className="text-sidebar-primary shrink-0" />
        {!collapsed && <span className="text-xs font-medium text-sidebar-foreground truncate">{tenant.name}</span>}
      </div>
    ) : null;
  }

  return (
    <div className="space-y-1">
      {/* Tenant switcher */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="w-full justify-start gap-2 px-3 h-auto py-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <Building2 size={14} className="text-sidebar-primary shrink-0" />
            {!collapsed && (
              <>
                <span className="text-xs font-medium truncate flex-1 text-left">{tenant?.name || 'Select Tenant'}</span>
                <ChevronDown size={12} className="shrink-0" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch Tenant</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {allTenants.map(t => (
            <DropdownMenuItem
              key={t.id}
              onClick={() => switchTenant(t)}
              className="flex items-center justify-between"
            >
              <span className="text-sm">{t.name}</span>
              {t.id === tenant?.id && <Badge variant="secondary" className="text-xs ml-2">Active</Badge>}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Site switcher — only shown when tenant is selected and has multiple sites */}
      {!collapsed && siteNames.length > 1 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-full justify-start gap-2 px-3 h-auto py-1.5 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <MapPin size={12} className="text-sidebar-primary shrink-0" />
              <span className="text-xs truncate flex-1 text-left text-sidebar-foreground/70">
                {activeSite || 'All Sites'}
              </span>
              <ChevronDown size={11} className="shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 max-h-64 overflow-y-auto">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Filter by Site</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => switchSite(null)} className="flex items-center justify-between">
              <span className="text-sm">All Sites</span>
              {!activeSite && <Badge variant="secondary" className="text-xs ml-2">Active</Badge>}
            </DropdownMenuItem>
            {siteNames.map(name => (
              <DropdownMenuItem key={name} onClick={() => switchSite(name)} className="flex items-center justify-between">
                <span className="text-sm truncate">{name}</span>
                {activeSite === name && <Badge variant="secondary" className="text-xs ml-2">Active</Badge>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}