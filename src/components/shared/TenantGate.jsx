import { useTenant } from '@/lib/TenantContext';
import { Building2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Wraps any page that requires an active tenant context.
 * Shows a loading spinner or "no tenant" message if needed.
 */
export default function TenantGate({ children }) {
  const { tenant, loading, isSuperAdmin, allTenants } = useTenant();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!tenant) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-6">
        <Building2 size={48} className="text-muted-foreground opacity-30 mb-4" />
        <h2 className="text-xl font-bold font-space-grotesk mb-2">No Tenant Assigned</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          {isSuperAdmin && allTenants.length === 0
            ? 'No tenants have been created yet. Create one in the Admin panel to get started.'
            : 'Your account has not been assigned to a tenant. Please contact your system administrator.'}
        </p>
        {isSuperAdmin && (
          <Link to="/admin/tenants/new" className="mt-4 text-sm text-primary underline">
            Create first tenant →
          </Link>
        )}
      </div>
    );
  }

  return children;
}