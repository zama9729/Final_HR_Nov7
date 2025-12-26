import { Navigate, useLocation } from "react-router-dom";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isSuperAdmin } from "@/utils/superadminCheck";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  requireOnboarding?: boolean;
  requireSuperadmin?: boolean;
}

// Roles that require onboarding
const ROLES_REQUIRING_ONBOARDING: UserRole[] = ['hr', 'employee', 'director', 'manager'];

export function ProtectedRoute({ 
  children, 
  allowedRoles,
  requireOnboarding = false,
  requireSuperadmin = false
}: ProtectedRouteProps) {
  const { user, userRole, isLoading } = useAuth();
  
  // Check if user is superadmin (via ADMIN_EMAILS env var)
  const isSuperadmin = isSuperAdmin(user?.email);
  const location = useLocation();
  const { status: setupStatus, loading: setupLoading, shouldGate } = useOrgSetup();
  const [onboardingStatus, setOnboardingStatus] = useState<{
    status: string | null;
    loading: boolean;
  }>({ status: null, loading: true });
  const [checkingOnboarding, setCheckingOnboarding] = useState(false);

  // Check onboarding status for roles that require it
  useEffect(() => {
    if (!user || !userRole || isLoading) return;
    
    // Skip onboarding check for routes that don't require it
    if (location.pathname === '/onboarding' || location.pathname.startsWith('/auth/')) {
      setOnboardingStatus({ status: null, loading: false });
      return;
    }

    // Only check onboarding for roles that require it
    if (ROLES_REQUIRING_ONBOARDING.includes(userRole) || requireOnboarding) {
      setCheckingOnboarding(true);
      api.checkEmployeePasswordChange()
        .then((data: any) => {
          setOnboardingStatus({
            status: data?.onboarding_status || 'not_started',
            loading: false
          });
        })
        .catch((error) => {
          // If employee doesn't exist or error, assume not started
          console.error('Error checking onboarding status:', error);
          setOnboardingStatus({ status: 'not_started', loading: false });
        })
        .finally(() => {
          setCheckingOnboarding(false);
        });
    } else {
      setOnboardingStatus({ status: null, loading: false });
    }
  }, [user, userRole, isLoading, location.pathname, requireOnboarding]);

  const isSetupRoute = location.pathname.startsWith("/setup");
  const isOnboardingRoute = location.pathname === "/onboarding";
  const isOnboardingWizardRoute = location.pathname === "/onboarding-wizard";
  const requiresSetupGate = shouldGate && !!setupStatus && !setupStatus.isCompleted;

  // Show initial loading while auth/setup state resolves
  if (isLoading || (shouldGate && setupLoading && !isSetupRoute && !isOnboardingRoute && !isOnboardingWizardRoute)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  // If no authenticated user, redirect immediately to login
  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  // Redirect to organization onboarding wizard if setup is not complete (for admin roles)
  // This is different from employee onboarding (/onboarding) which is for personal details
  if (requiresSetupGate && !isOnboardingWizardRoute && !isOnboardingRoute && !isSetupRoute) {
    return <Navigate to="/onboarding-wizard" replace />;
  }

  // Redirect old setup route to new onboarding wizard
  if (isSetupRoute) {
    return <Navigate to="/onboarding-wizard" replace />;
  }

  // If setup is completed and user is on onboarding wizard page, redirect to dashboard
  if (isOnboardingWizardRoute && shouldGate && setupStatus?.isCompleted) {
    return <Navigate to="/dashboard" replace />;
  }

  // For authenticated users, wait for any onboarding checks (if applicable)
  if (checkingOnboarding || onboardingStatus.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  // Check superadmin requirement
  if (requireSuperadmin && !isSuperadmin) {
    // Log detailed debug info
    console.error('[SuperAdmin Access Denied]', {
      userEmail: user?.email,
      requireSuperadmin,
      isSuperadmin,
      adminEmailsEnv: import.meta.env.VITE_ADMIN_EMAILS,
      allEnvVars: Object.keys(import.meta.env).filter(k => k.includes('ADMIN'))
    });
    
    // Show error message instead of silent redirect (temporary for debugging)
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-red-900 mb-2">Access Denied</h2>
            <p className="text-sm text-red-800 mb-4">
              You don't have Super Admin access. Your email ({user?.email}) is not in the admin list.
            </p>
            <div className="text-xs text-red-700 space-y-1">
              <p><strong>Configured Admin Emails:</strong></p>
              <code className="block bg-red-100 p-2 rounded mt-1">
                {import.meta.env.VITE_ADMIN_EMAILS || '(not set)'}
              </code>
              <p className="mt-2">
                <strong>To fix:</strong> Add your email to VITE_ADMIN_EMAILS in .env and restart the dev server.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  // Check if user has required role (skip if superadmin)
  if (allowedRoles && userRole && !allowedRoles.includes(userRole) && !isSuperadmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check onboarding requirement
  const needsOnboarding = 
    (ROLES_REQUIRING_ONBOARDING.includes(userRole as UserRole) || requireOnboarding) &&
    onboardingStatus.status &&
    onboardingStatus.status !== 'completed';

  // Don't redirect if already on onboarding page
  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <>{children}</>;
}

export function PublicRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">Loading...</div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
