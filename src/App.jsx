import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import AppLayout from '@/components/layout/AppLayout';
import { TenantProvider } from '@/lib/TenantContext';
import MobileSyncOverlay from '@/components/shared/MobileSyncOverlay';
import { useTenant } from '@/lib/TenantContext';

// Pages - Desktop
import Dashboard from '@/pages/Dashboard';
import HazMatRegister from '@/pages/HazMatRegister';
import ChemicalDetail from '@/pages/ChemicalDetail';
import SearchPage from '@/pages/SearchPage';
import Glossary from '@/pages/Glossary';
import Documents from '@/pages/Documents';
import Admin from '@/pages/Admin';
import Support from '@/pages/Support';
import SyncMonitor from '@/pages/SyncMonitor';
import NewRegistryEntry from '@/pages/admin/NewRegistryEntry';
import ManageSites from '@/pages/admin/ManageSites';
import ManageSuppliers from '@/pages/admin/ManageSuppliers';
import ManageProducts from '@/pages/admin/ManageProducts';
import ManageTenants from '@/pages/admin/ManageTenants';
import FastTrack from '@/pages/FastTrack';
import FastTrackReview from '@/pages/FastTrackReview';
import SDSDocumentsUpdate from '@/pages/SDSDocumentsUpdate';

// Pages - Mobile (auto-responsive)
import HazMatRegisterMobile from '@/pages/HazMatRegisterMobile';
import ChemicalDetailMobile from '@/pages/ChemicalDetailMobile';
import SearchPageMobile from '@/pages/SearchPageMobile';
import DocumentsMobile from '@/pages/DocumentsMobile';
import EmergencyContactsMobile from '@/pages/EmergencyContactsMobile';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
          <p className="text-sm text-muted-foreground font-medium">Loading HazMat R2K...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') { navigateToLogin(); return null; }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Dashboard />} />
        
        {/* Mobile-responsive routes - auto-switch based on breakpoint */}
        <Route path="/register" element={
          <>
            <div className="md:hidden"><HazMatRegisterMobile /></div>
            <div className="hidden md:block"><HazMatRegister /></div>
          </>
        } />
        <Route path="/register/:id" element={
          <>
            <div className="md:hidden"><ChemicalDetailMobile /></div>
            <div className="hidden md:block"><ChemicalDetail /></div>
          </>
        } />
        <Route path="/search" element={
          <>
            <div className="md:hidden"><SearchPageMobile /></div>
            <div className="hidden md:block"><SearchPage /></div>
          </>
        } />
        <Route path="/documents" element={
          <>
            <div className="md:hidden"><DocumentsMobile /></div>
            <div className="hidden md:block"><Documents /></div>
          </>
        } />
        
        {/* Emergency Contacts (mobile-only, always available) */}
        <Route path="/emergency" element={<EmergencyContactsMobile />} />
        
        {/* Other routes */}
        <Route path="/glossary" element={<Glossary />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/sync-monitor" element={<SyncMonitor />} />
        <Route path="/admin/new-entry" element={<NewRegistryEntry />} />
        <Route path="/admin/sites/new" element={<ManageSites />} />
        <Route path="/admin/sites/:siteId" element={<ManageSites />} />
        <Route path="/admin/suppliers/new" element={<ManageSuppliers />} />
        <Route path="/admin/suppliers/:supplierId" element={<ManageSuppliers />} />
        <Route path="/admin/products/new" element={<ManageProducts />} />
        <Route path="/admin/products/:productId" element={<ManageProducts />} />
        <Route path="/admin/tenants" element={<ManageTenants />} />
        <Route path="/admin/tenants/:tenantId" element={<ManageTenants />} />
        <Route path="/fast-track" element={<FastTrack />} />
        <Route path="/fast-track-review" element={<FastTrackReview />} />
        <Route path="/sds-documents-update" element={<SDSDocumentsUpdate />} />
        <Route path="/support" element={<Support />} />
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

const MobileSyncGate = ({ children }) => {
  const { mobileSyncReady, syncMessage, syncPercent, syncError, isMobile, retryMobileSync } = useTenant();

  if (isMobile && !mobileSyncReady) {
    return (
      <MobileSyncOverlay
        message={syncMessage}
        percent={syncPercent}
        error={syncError}
        onRetry={retryMobileSync}
      />
    );
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <TenantProvider>
            <MobileSyncGate>
              <AuthenticatedApp />
            </MobileSyncGate>
          </TenantProvider>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App