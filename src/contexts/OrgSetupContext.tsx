import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { api } from "@/lib/api";

export type SetupStepState = {
  completed: boolean;
  skipped: boolean;
  optional: boolean;
  data?: Record<string, any>;
  updatedAt?: string | null;
};

export type SetupDefinition = {
  key: string;
  label: string;
  optional: boolean;
  deepLink?: string;
};

export interface OrgSetupStatus {
  orgId?: string;
  isCompleted: boolean;
  currentStep: string;
  steps: Record<string, SetupStepState>;
  stepOrder: SetupDefinition[];
  requiredSteps: string[];
  updatedAt?: string;
  completedAt?: string;
}

type OrgSetupContextValue = {
  status: OrgSetupStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  shouldGate: boolean;
  attendanceSettings: any | null;
  refreshAttendanceSettings: () => Promise<void>;
};

const OrgSetupContext = createContext<OrgSetupContextValue | undefined>(undefined);

const ADMIN_ROLES = new Set(["admin", "hr", "ceo"]);

export function OrgSetupProvider({ children }: { children: React.ReactNode }) {
  const { userRole, user } = useAuth();
  const [status, setStatus] = useState<OrgSetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attendanceSettings, setAttendanceSettings] = useState<any | null>(null);

  const shouldGate = useMemo(
    () => Boolean(user?.id && userRole && ADMIN_ROLES.has(userRole)),
    [user?.id, userRole]
  );

  const fetchStatus = useCallback(async () => {
    if (!shouldGate) {
      setStatus(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getSetupStatus();
      setStatus(data);
    } catch (err: any) {
      setError(err?.message || "Failed to load setup status");
    } finally {
      setLoading(false);
    }
  }, [shouldGate]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const fetchAttendanceSettings = useCallback(async () => {
    if (!user?.id) {
      setAttendanceSettings(null);
      return;
    }
    try {
      const data = await api.getAttendanceSettings();
      setAttendanceSettings(data);
    } catch (err) {
      console.warn("Unable to fetch attendance settings", err);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchAttendanceSettings();
  }, [fetchAttendanceSettings]);

  const value = useMemo(
    () => ({
      status,
      loading,
      error,
      refresh: fetchStatus,
      shouldGate,
      attendanceSettings,
      refreshAttendanceSettings: fetchAttendanceSettings,
    }),
    [status, loading, error, fetchStatus, shouldGate, attendanceSettings, fetchAttendanceSettings]
  );

  return (
    <OrgSetupContext.Provider value={value}>
      {children}
    </OrgSetupContext.Provider>
  );
}

export function useOrgSetup() {
  const context = useContext(OrgSetupContext);
  if (!context) {
    throw new Error("useOrgSetup must be used within OrgSetupProvider");
  }
  return context;
}


