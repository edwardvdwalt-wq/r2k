/**
 * useRBAC — Role-Based Access Control hook for HazMat R2K
 *
 * Roles (hazmat_role):
 *   app_super_admin  — full platform access
 *   site_admin       — tenant-scoped admin
 *   site_user        — read + fast track + export (own sites)
 *   site_security    — read + fast track only
 *
 * The platform role "admin" maps to app_super_admin automatically.
 */

import { useAuth } from '@/lib/AuthContext';
import { useTenant } from '@/lib/TenantContext';

export function useRBAC() {
  const { user } = useAuth();
  const { tenantUser } = useTenant();

  // Derive effective hazmat role
  // Platform admin = app_super_admin regardless of hazmat_role field
  const isPlatformAdmin = user?.role === 'admin';
  const hazmatRole = isPlatformAdmin
    ? 'app_super_admin'
    : (user?.hazmat_role || tenantUser?.tenant_role || 'site_user');

  const isAppSuperAdmin = hazmatRole === 'app_super_admin';
  const isSiteAdmin = isAppSuperAdmin || hazmatRole === 'site_admin';
  const isSiteUser = isSiteAdmin || hazmatRole === 'site_user';
  const isSiteSecurity = isSiteAdmin || hazmatRole === 'site_security';

  // Allowed site IDs (empty = all sites in tenant for admins)
  const allowedSiteIds = user?.allowed_site_ids || tenantUser?.assigned_site_ids || [];
  const hasAllSiteAccess = isAppSuperAdmin || isSiteAdmin || allowedSiteIds.length === 0;

  const canAccessSite = (siteId) => {
    if (hasAllSiteAccess) return true;
    return allowedSiteIds.includes(siteId);
  };

  return {
    hazmatRole,
    isAppSuperAdmin,
    isSiteAdmin,
    isSiteUser,       // site_user or above
    isSiteSecurity,   // site_security or above (can search + fast track)
    allowedSiteIds,
    hasAllSiteAccess,
    canAccessSite,

    // Specific permission flags
    canEditRegister: isSiteAdmin,
    canDeleteRegister: isSiteAdmin,
    canUploadDocuments: isSiteAdmin,
    canManageUsers: isSiteAdmin,
    canViewSecureConfig: isAppSuperAdmin,
    canViewAuditLog: isSiteAdmin,
    canExportReports: isSiteUser || isSiteSecurity,  // site_security cannot export
    canExportReportsActual: isSiteUser,               // true exporter
    canCreateFastTrack: true,                         // all roles
    canReviewFastTrack: isSiteAdmin,
    canConvertFastTrack: isSiteAdmin,
    canViewAllFastTracks: isSiteAdmin,
  };
}