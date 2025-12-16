import { Navigate, useLocation } from "react-router-dom";
import { useAuth, UserRole } from "@/contexts/AuthContext";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { ReactNode, useEffect, useState } from "react";
import { api } from "@/lib/api";

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: UserRole[];
  requireOnboarding?: boolean;
}

// Roles that require onboarding
const ROLES_REQUIRING_ONBOARDING: UserRole[] = ['hr', 'employee', 'director', 'manager'];

export function ProtectedRoute({ 
  children, 
  allowedRoles,
  requireOnboarding = false 
}: ProtectedRouteProps) {
  const { user, userRole, isLoading } = useAuth();
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

  // Check if user has required role
  if (allowedRoles && userRole && !allowedRoles.includes(userRole)) {
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
