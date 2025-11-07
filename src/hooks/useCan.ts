import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';

// Capability constants (matching server)
export const CAPABILITIES = {
  TIMESHEET_SUBMIT_OWN: 'TIMESHEET_SUBMIT_OWN',
  TIMESHEET_APPROVE_TEAM: 'TIMESHEET_APPROVE_TEAM',
  TIMESHEET_OVERRIDE_HR: 'TIMESHEET_OVERRIDE_HR',
  TIMESHEET_OVERRIDE_DEPT: 'TIMESHEET_OVERRIDE_DEPT',
  TIMESHEET_PAYBLOCK: 'TIMESHEET_PAYBLOCK',
  LEAVE_REQUEST_OWN: 'LEAVE_REQUEST_OWN',
  LEAVE_APPROVE_TEAM: 'LEAVE_APPROVE_TEAM',
  LEAVE_APPROVE_ORG: 'LEAVE_APPROVE_ORG',
  LEAVE_APPROVE_DEPT: 'LEAVE_APPROVE_DEPT',
  ONBOARDING_OWN_ALL: 'ONBOARDING_OWN_ALL',
  ONBOARDING_DEPT: 'ONBOARDING_DEPT',
  BG_CHECK_TRIGGER: 'BG_CHECK_TRIGGER',
  BG_CHECK_VIEW_DEPT: 'BG_CHECK_VIEW_DEPT',
  TERMINATE_REHIRE_EXECUTE: 'TERMINATE_REHIRE_EXECUTE',
  TERMINATE_REHIRE_APPROVE_DEPT: 'TERMINATE_REHIRE_APPROVE_DEPT',
  PROJECT_ALLOC_SET_ORG: 'PROJECT_ALLOC_SET_ORG',
  PROJECT_ALLOC_SET_DEPT: 'PROJECT_ALLOC_SET_DEPT',
  PROJECT_ALLOC_PROPOSE: 'PROJECT_ALLOC_PROPOSE',
  POLICIES_CREATE_EDIT: 'POLICIES_CREATE_EDIT',
  POLICIES_READ: 'POLICIES_READ',
  ATTENDANCE_UPLOAD: 'ATTENDANCE_UPLOAD',
  PAYROLL_RUN: 'PAYROLL_RUN',
  PAYROLL_ROLLBACK: 'PAYROLL_ROLLBACK',
  PAYROLL_READ_TOTALS: 'PAYROLL_READ_TOTALS',
  USER_ROLE_ADMIN: 'USER_ROLE_ADMIN',
  BREAK_GLASS_OVERRIDE: 'BREAK_GLASS_OVERRIDE',
  FEATURE_PAYROLL: 'FEATURE_PAYROLL',
} as const;

export type Capability = typeof CAPABILITIES[keyof typeof CAPABILITIES];

interface UseCanOptions {
  scope?: {
    department?: string;
    employeeId?: string;
  };
}

/**
 * Hook to check if user has a specific capability
 * @param capability - Capability to check
 * @param options - Optional scope
 * @returns boolean indicating if user has the capability
 */
export function useCan(capability: Capability, options?: UseCanOptions): boolean {
  const { user, userRole } = useAuth();
  const [hasCapability, setHasCapability] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setHasCapability(false);
      setIsLoading(false);
      return;
    }

    // Simple role-based check (can be enhanced with API call if needed)
    const checkCapability = async () => {
      try {
        // For now, use role-based mapping (can be enhanced with API call)
        const roleCapabilities: Record<string, Capability[]> = {
          employee: [
            CAPABILITIES.TIMESHEET_SUBMIT_OWN,
            CAPABILITIES.LEAVE_REQUEST_OWN,
            CAPABILITIES.POLICIES_READ,
          ],
          manager: [
            CAPABILITIES.TIMESHEET_SUBMIT_OWN,
            CAPABILITIES.TIMESHEET_APPROVE_TEAM,
            CAPABILITIES.LEAVE_REQUEST_OWN,
            CAPABILITIES.LEAVE_APPROVE_TEAM,
            CAPABILITIES.PROJECT_ALLOC_PROPOSE,
            CAPABILITIES.POLICIES_READ,
          ],
          hr: [
            CAPABILITIES.TIMESHEET_SUBMIT_OWN,
            CAPABILITIES.TIMESHEET_APPROVE_TEAM,
            CAPABILITIES.TIMESHEET_OVERRIDE_HR,
            CAPABILITIES.LEAVE_REQUEST_OWN,
            CAPABILITIES.LEAVE_APPROVE_TEAM,
            CAPABILITIES.LEAVE_APPROVE_ORG,
            CAPABILITIES.ONBOARDING_OWN_ALL,
            CAPABILITIES.BG_CHECK_TRIGGER,
            CAPABILITIES.TERMINATE_REHIRE_EXECUTE,
            CAPABILITIES.PROJECT_ALLOC_SET_ORG,
            CAPABILITIES.POLICIES_CREATE_EDIT,
            CAPABILITIES.POLICIES_READ,
            CAPABILITIES.ATTENDANCE_UPLOAD,
            CAPABILITIES.BREAK_GLASS_OVERRIDE,
          ],
          director: [
            CAPABILITIES.TIMESHEET_SUBMIT_OWN,
            CAPABILITIES.TIMESHEET_APPROVE_TEAM,
            CAPABILITIES.TIMESHEET_OVERRIDE_DEPT,
            CAPABILITIES.LEAVE_REQUEST_OWN,
            CAPABILITIES.LEAVE_APPROVE_TEAM,
            CAPABILITIES.LEAVE_APPROVE_DEPT,
            CAPABILITIES.ONBOARDING_DEPT,
            CAPABILITIES.BG_CHECK_VIEW_DEPT,
            CAPABILITIES.TERMINATE_REHIRE_APPROVE_DEPT,
            CAPABILITIES.PROJECT_ALLOC_SET_DEPT,
            CAPABILITIES.POLICIES_READ,
            CAPABILITIES.BREAK_GLASS_OVERRIDE,
          ],
          accountant: [
            CAPABILITIES.TIMESHEET_PAYBLOCK,
            CAPABILITIES.ATTENDANCE_UPLOAD,
            CAPABILITIES.PAYROLL_RUN,
            CAPABILITIES.PAYROLL_ROLLBACK,
            CAPABILITIES.FEATURE_PAYROLL,
          ],
          ceo: [
            CAPABILITIES.TIMESHEET_OVERRIDE_HR,
            CAPABILITIES.LEAVE_APPROVE_ORG,
            CAPABILITIES.PAYROLL_READ_TOTALS,
            CAPABILITIES.POLICIES_READ,
            CAPABILITIES.BREAK_GLASS_OVERRIDE,
            CAPABILITIES.FEATURE_PAYROLL,
          ],
          admin: Object.values(CAPABILITIES) as Capability[],
        };

        const capabilities = roleCapabilities[userRole || ''] || [];
        const hasAccess = capabilities.includes(capability);
        
        setHasCapability(hasAccess);
      } catch (error) {
        console.error('Error checking capability:', error);
        setHasCapability(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkCapability();
  }, [user, userRole, capability, options]);

  return hasCapability;
}

/**
 * Hook to get all user capabilities
 * @returns Array of capabilities
 */
export function useCapabilities(): Capability[] {
  const { user, userRole } = useAuth();
  const [capabilities, setCapabilities] = useState<Capability[]>([]);

  useEffect(() => {
    if (!user || !userRole) {
      setCapabilities([]);
      return;
    }

    const roleCapabilities: Record<string, Capability[]> = {
      employee: [
        CAPABILITIES.TIMESHEET_SUBMIT_OWN,
        CAPABILITIES.LEAVE_REQUEST_OWN,
        CAPABILITIES.POLICIES_READ,
      ],
      manager: [
        CAPABILITIES.TIMESHEET_SUBMIT_OWN,
        CAPABILITIES.TIMESHEET_APPROVE_TEAM,
        CAPABILITIES.LEAVE_REQUEST_OWN,
        CAPABILITIES.LEAVE_APPROVE_TEAM,
        CAPABILITIES.PROJECT_ALLOC_PROPOSE,
        CAPABILITIES.POLICIES_READ,
      ],
      hr: [
        CAPABILITIES.TIMESHEET_SUBMIT_OWN,
        CAPABILITIES.TIMESHEET_APPROVE_TEAM,
        CAPABILITIES.TIMESHEET_OVERRIDE_HR,
        CAPABILITIES.LEAVE_REQUEST_OWN,
        CAPABILITIES.LEAVE_APPROVE_TEAM,
        CAPABILITIES.LEAVE_APPROVE_ORG,
        CAPABILITIES.ONBOARDING_OWN_ALL,
        CAPABILITIES.BG_CHECK_TRIGGER,
        CAPABILITIES.TERMINATE_REHIRE_EXECUTE,
        CAPABILITIES.PROJECT_ALLOC_SET_ORG,
        CAPABILITIES.POLICIES_CREATE_EDIT,
        CAPABILITIES.POLICIES_READ,
        CAPABILITIES.ATTENDANCE_UPLOAD,
        CAPABILITIES.BREAK_GLASS_OVERRIDE,
      ],
      director: [
        CAPABILITIES.TIMESHEET_SUBMIT_OWN,
        CAPABILITIES.TIMESHEET_APPROVE_TEAM,
        CAPABILITIES.TIMESHEET_OVERRIDE_DEPT,
        CAPABILITIES.LEAVE_REQUEST_OWN,
        CAPABILITIES.LEAVE_APPROVE_TEAM,
        CAPABILITIES.LEAVE_APPROVE_DEPT,
        CAPABILITIES.ONBOARDING_DEPT,
        CAPABILITIES.BG_CHECK_VIEW_DEPT,
        CAPABILITIES.TERMINATE_REHIRE_APPROVE_DEPT,
        CAPABILITIES.PROJECT_ALLOC_SET_DEPT,
        CAPABILITIES.POLICIES_READ,
        CAPABILITIES.BREAK_GLASS_OVERRIDE,
      ],
      accountant: [
        CAPABILITIES.TIMESHEET_PAYBLOCK,
        CAPABILITIES.ATTENDANCE_UPLOAD,
        CAPABILITIES.PAYROLL_RUN,
        CAPABILITIES.PAYROLL_ROLLBACK,
        CAPABILITIES.FEATURE_PAYROLL,
      ],
      ceo: [
        CAPABILITIES.TIMESHEET_OVERRIDE_HR,
        CAPABILITIES.LEAVE_APPROVE_ORG,
        CAPABILITIES.PAYROLL_READ_TOTALS,
        CAPABILITIES.POLICIES_READ,
        CAPABILITIES.BREAK_GLASS_OVERRIDE,
        CAPABILITIES.FEATURE_PAYROLL,
      ],
      admin: Object.values(CAPABILITIES) as Capability[],
    };

    setCapabilities(roleCapabilities[userRole] || []);
  }, [user, userRole]);

  return capabilities;
}

