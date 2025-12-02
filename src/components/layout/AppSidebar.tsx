import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Clock,
  Settings,
  BarChart3,
  Building2,
  Network,
  UserCheck,
  CalendarClock,
  CalendarDays,
  Award,
  Bot,
  CheckSquare,
  History,
  DollarSign,
  Inbox,
  LogOut,
  ClipboardList,
  Receipt,
  Upload,
  ChevronDown,
  Briefcase,
  GitBranch,
  ArrowUpCircle,
  ShieldAlert,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  showBadge?: boolean;
  sso?: boolean;
  feature?: "timesheets" | "clock";
  roles?: string[];
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const roleNavItems: Record<string, NavGroup[]> = {
  employee: [
    {
      id: "employee-overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "employee-self",
      label: "My Workspace",
      items: [
        { title: "My Profile", url: "/my/profile", icon: Users },
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "My Shifts", url: "/my/profile?tab=shifts", icon: CalendarClock },
        { title: "Timesheet", url: "/timesheets", icon: Clock, feature: "timesheets" },
        { title: "Leave Requests", url: "/leaves", icon: Calendar },
        { title: "Request Resignation", url: "/offboarding/new", icon: LogOut },
        { title: "Documents", url: "/documents", icon: Inbox },
        { title: "My Appraisal", url: "/my-appraisal", icon: Award },
      ],
    },
    {
      id: "employee-payroll",
      label: "Payroll",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
      ],
    },
    {
      id: "employee-compliance",
      label: "Compliance",
      items: [
        { title: "Tax Declaration", url: "/tax/declaration", icon: Receipt },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
      ],
    },
    {
      id: "employee-org",
      label: "Company",
      items: [{ title: "Org Chart", url: "/org-chart", icon: Network }],
    },
  ],
  admin: [
    {
      id: "admin-overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "admin-people",
      label: "People Operations",
      items: [
        { title: "My Profile", url: "/my/profile", icon: Users },
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Teams", url: "/teams", icon: Building2 },
        { title: "Projects", url: "/projects", icon: Briefcase },
        { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck },
        { title: "Offboarding", url: "/offboarding", icon: LogOut },
        { title: "Org Chart", url: "/org-chart", icon: Network },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "New Project", url: "/projects/new", icon: Building2 },
        { title: "Background Checks", url: "/background-checks", icon: UserCheck },
        { title: "Workflows", url: "/workflows", icon: GitBranch, roles: ["admin", "hr", "ceo"] },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert, roles: ["admin", "hr", "ceo"] },
      ],
    },
    {
      id: "admin-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Timesheet", url: "/timesheets", icon: Clock, feature: "timesheets" },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true, feature: "timesheets" },
        { title: "Shift Management", url: "/scheduling", icon: CalendarClock },
        { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
      ],
    },
    {
      id: "admin-payroll",
      label: "Payroll",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
      ],
    },
    {
      id: "admin-compliance",
      label: "Compliance",
      items: [
        { title: "Tax Declaration", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
        { title: "Attendance Upload", url: "/attendance/upload", icon: Upload },
        { title: "Upload History", url: "/attendance/history", icon: History },
      ],
    },
  ],
  hr: [
    {
      id: "hr-overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "hr-people",
      label: "People Operations",
      items: [
        { title: "My Profile", url: "/my/profile", icon: Users },
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Teams", url: "/teams", icon: Building2 },
        { title: "Projects", url: "/projects", icon: Briefcase },
        { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck },
        { title: "Offboarding", url: "/offboarding", icon: LogOut },
        { title: "Org Chart", url: "/org-chart", icon: Network },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "New Project", url: "/projects/new", icon: Building2 },
        { title: "Background Checks", url: "/background-checks", icon: UserCheck },
        { title: "Workflows", url: "/workflows", icon: GitBranch, roles: ["admin", "hr", "ceo"] },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert, roles: ["admin", "hr", "ceo"] },
      ],
    },
    {
      id: "hr-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Timesheet", url: "/timesheets", icon: Clock, feature: "timesheets" },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true, feature: "timesheets" },
        { title: "Shift Management", url: "/scheduling", icon: CalendarClock },
        { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
        { title: "Holiday Management", url: "/holidays", icon: CalendarDays },
        { title: "Leave Policies", url: "/policies", icon: FileText },
        { title: "Probation Policies", url: "/probation-policies", icon: UserCheck, roles: ["admin", "hr", "ceo"] },
      ],
    },
    {
      id: "hr-compliance",
      label: "Compliance",
      items: [
        { title: "Attendance Upload", url: "/attendance/upload", icon: Upload },
        { title: "Upload History", url: "/attendance/history", icon: History },
        { title: "Tax Declaration", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
      ],
    },
    {
      id: "hr-payroll",
      label: "Payroll",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
      ],
    },
  ],
  ceo: [
    {
      id: "ceo-overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "CEO Dashboard", url: "/ceo/dashboard", icon: BarChart3 },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "Employee Analytics", url: "/employee-stats", icon: BarChart3 },
      ],
    },
    {
      id: "ceo-people",
      label: "People Operations",
      items: [
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Teams", url: "/teams", icon: Building2 },
        { title: "Projects", url: "/projects", icon: Briefcase },
        { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck },
        { title: "Offboarding", url: "/offboarding", icon: LogOut },
        { title: "Org Chart", url: "/org-chart", icon: Network },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "New Project", url: "/projects/new", icon: Building2 },
        { title: "Workflows", url: "/workflows", icon: GitBranch, roles: ["admin", "hr", "ceo"] },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle, roles: ["admin", "hr", "ceo", "director", "manager"] },
      ],
    },
    {
      id: "ceo-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Timesheet", url: "/timesheets", icon: Clock, feature: "timesheets" },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true, feature: "timesheets" },
        { title: "Shift Management", url: "/scheduling", icon: CalendarClock },
        { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
        { title: "Holiday Management", url: "/holidays", icon: CalendarDays },
        { title: "Leave Policies", url: "/policies", icon: FileText },
        { title: "Probation Policies", url: "/probation-policies", icon: UserCheck, roles: ["admin", "hr", "ceo"] },
      ],
    },
    {
      id: "ceo-compliance",
      label: "Compliance",
      items: [
        { title: "Attendance Upload", url: "/attendance/upload", icon: Upload },
        { title: "Upload History", url: "/attendance/history", icon: History },
        { title: "Tax Declaration", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "ceo-payroll",
      label: "Payroll",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
      ],
    },
  ],
  manager: [
    {
      id: "manager-overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "manager-people",
      label: "People Operations",
      items: [
        { title: "My Profile", url: "/my/profile", icon: Users },
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Org Chart", url: "/org-chart", icon: Network },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle, roles: ["admin", "hr", "ceo", "director", "manager"] },
      ],
    },
    {
      id: "manager-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Timesheet", url: "/timesheets", icon: Clock, feature: "timesheets" },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true, feature: "timesheets" },
        { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
      ],
    },
    {
      id: "manager-payroll",
      label: "Payroll",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
      ],
    },
    {
      id: "manager-compliance",
      label: "Compliance",
      items: [
        { title: "Tax Declaration", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
      ],
    },
  ],
  super_user: [
    {
      id: "super-owner",
      label: "Owner Tools",
      items: [{ title: "Owner Analytics", url: "/super/dashboard", icon: BarChart3 }],
    },
  ],
};

const roleAlias: Record<string, keyof typeof roleNavItems> = {
  admin: "admin",
  hr: "hr",
  ceo: "ceo",
  director: "hr",
  manager: "manager",
  accountant: "admin",
  employee: "employee",
  super_user: "super_user",
};

const resolveRoleKey = (role?: string): keyof typeof roleNavItems => {
  if (role && roleNavItems[role]) {
    return role as keyof typeof roleNavItems;
  }
  if (!role) return "employee";
  return roleAlias[role] || "employee";
};

export function AppSidebar() {
  const { user, userRole } = useAuth();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const { toast } = useToast();
  const [pendingCounts, setPendingCounts] = useState<{
    timesheets: number;
    leaves: number;
    taxDeclarations: number;
  }>({
    timesheets: 0,
    leaves: 0,
    taxDeclarations: 0,
  });
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [payrollIntegrationEnabled, setPayrollIntegrationEnabled] = useState(true); // Default to true
  const { attendanceSettings } = useOrgSetup();
  const resolvedRoleKey = resolveRoleKey(userRole);
  const navigationGroups = roleNavItems[resolvedRoleKey] || roleNavItems.employee;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const fetchPendingCounts = useCallback(async () => {
    if (!user) return;

    try {
      const counts = await api.getPendingCounts();
      setPendingCounts({
        timesheets: counts.timesheets || 0,
        leaves: counts.leaves || 0,
        taxDeclarations: counts.taxDeclarations || 0,
      });
    } catch (error) {
      console.error('Error fetching pending counts:', error);
    }
  }, [user]);

  useEffect(() => {
    const enabled = import.meta.env.VITE_PAYROLL_INTEGRATION_ENABLED !== 'false';
    setPayrollIntegrationEnabled(enabled);
    console.log('Payroll integration enabled:', enabled);

    let interval: ReturnType<typeof setInterval> | undefined;

    if (user) {
      if (userRole === 'super_user') {
        setIsSuperadmin(true);
      } else {
        fetchIsSuperadmin();
      }

      if (userRole && ['manager', 'hr', 'director', 'ceo', 'admin'].includes(userRole)) {
        fetchPendingCounts();

        interval = setInterval(() => {
          fetchPendingCounts();
        }, 30000);
      }
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [user, userRole, fetchPendingCounts]);

  useEffect(() => {
    const handler = () => {
      fetchPendingCounts();
    };
    window.addEventListener("taxDeclarations:updated", handler);
    return () => {
      window.removeEventListener("taxDeclarations:updated", handler);
    };
  }, [fetchPendingCounts]);

  const fetchIsSuperadmin = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/access`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      setIsSuperadmin(!!data.superadmin);
    } catch (e) {
      // ignore
    }
  };

  const captureMethod = attendanceSettings?.capture_method === 'clock_in_out' ? 'clock_in_out' : 'timesheets';
  const isClockMode = captureMethod === 'clock_in_out';
  const isTimesheetMode = captureMethod !== 'clock_in_out';

  const shouldRenderItem = (item: NavItem) => {
    if (item.roles && (!userRole || !item.roles.includes(userRole))) {
      return false;
    }
    if (item.feature === 'clock' && !isClockMode) return false;
    if (item.sso && !payrollIntegrationEnabled) return false;
    return true;
  };

  const openPayrollSso = async () => {
    try {
      const result = await api.getPayrollSso();
      if (result.redirectUrl) {
        window.open(result.redirectUrl, '_blank');
      } else {
        toast({
          title: "Error",
          description: "Failed to generate Payroll SSO link",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Payroll SSO error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to access Payroll",
        variant: "destructive",
      });
    }
  };

  const getBadgeCount = (url: string) => {
    if (url === '/timesheet-approvals') return pendingCounts.timesheets;
    if (url === '/leaves') return pendingCounts.leaves;
    if (url === '/tax/declarations/review') return pendingCounts.taxDeclarations;
    return 0;
  };

  const renderNavItem = (item: NavItem, minimal = false) => {
    if (!shouldRenderItem(item)) {
      return null;
    }
    const badgeCount = item.showBadge ? getBadgeCount(item.url) : 0;

    const baseHover =
      "border border-transparent transition-all duration-200 hover:border-blue-400/50 hover:bg-blue-100/70 dark:hover:bg-sky-500/20 hover:text-blue-700 dark:hover:text-sky-200 focus-visible:ring-2 focus-visible:ring-blue-400/40";
    const activeStyles = "bg-blue-600 text-white border border-blue-500 shadow-[0_10px_25px_rgba(37,99,235,0.35)]";

    if (item.sso) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild>
            <button
              onClick={openPayrollSso}
              className={`flex items-center gap-3 py-2.5 rounded-lg text-sm w-full ${minimal ? "justify-center px-2" : "px-3 text-left"} ${baseHover}`}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!minimal && <span className="flex-1 text-sm">{item.title}</span>}
              {badgeCount > 0 && (
                <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-medium text-white shrink-0">
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </button>
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    }

    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton asChild>
          <NavLink
            to={item.url}
            className={({ isActive }) =>
              `flex items-center gap-3 py-2.5 rounded-lg text-sm ${minimal ? "justify-center px-2" : "px-3"} ${
                isActive
                  ? activeStyles
                  : `text-slate-700 dark:text-slate-200 ${baseHover}`
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!minimal && <span className="flex-1 text-sm">{item.title}</span>}
            {badgeCount > 0 && (
              <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-medium text-white shrink-0">
                {badgeCount > 9 ? '9+' : badgeCount}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const flattenedNavItems = useMemo(
    () =>
      navigationGroups
        .flatMap((group) => group.items)
        .filter((item) => shouldRenderItem(item)),
    [navigationGroups, userRole, payrollIntegrationEnabled, isClockMode, isTimesheetMode]
  );

  useEffect(() => {
    setOpenGroups((prev) => {
      const nextState: Record<string, boolean> = {};
      navigationGroups.forEach((group) => {
        nextState[group.id] = prev[group.id] ?? false;
      });
      return nextState;
    });
  }, [resolvedRoleKey]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? false),
    }));
  };

  // Get organization name abbreviation (ZM) or first two letters
  return (
    <Sidebar
      collapsible="offcanvas"
      className="bg-white text-slate-800 dark:bg-slate-950/80 supports-[backdrop-filter]:bg-white/85 dark:supports-[backdrop-filter]:bg-slate-950/65 backdrop-blur-[24px] border-r border-white/60 dark:border-slate-900/70 shadow-[10px_0_50px_rgba(15,23,42,0.2)] transition-colors"
    >
      <SidebarHeader className="px-4 py-3 border-b border-white/70 dark:border-slate-900/60 bg-white dark:bg-transparent supports-[backdrop-filter]:bg-white/90 dark:supports-[backdrop-filter]:bg-slate-950/60 backdrop-blur-[20px] transition-colors">
        {!isCollapsed && (
          <div className="text-xs font-semibold tracking-[0.2em] uppercase text-slate-600 dark:text-slate-300">
            Navigation
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-4 flex h-full flex-col gap-4 bg-white dark:bg-transparent supports-[backdrop-filter]:bg-white/90 dark:supports-[backdrop-filter]:bg-slate-950/55 backdrop-blur-[20px] text-slate-700 dark:text-slate-200 transition-colors">
        <div className="flex-1 overflow-y-auto space-y-4">
          {isCollapsed ? (
            <SidebarMenu className="space-y-1">
              {flattenedNavItems.map((item) => renderNavItem(item, true))}
            </SidebarMenu>
          ) : (
            navigationGroups.map((group) => {
              const rendered = group.items.map((item) => renderNavItem(item)).filter(Boolean);
              if (!rendered.length) return null;
              const open = openGroups[group.id] ?? false;
              return (
                <div
                  key={group.id}
                  className="border border-white/80 dark:border-slate-900/60 rounded-2xl bg-white dark:bg-slate-950/60 supports-[backdrop-filter]:bg-white/90 dark:supports-[backdrop-filter]:bg-slate-950/55 shadow-[0_18px_50px_rgba(15,23,42,0.14)] transition-colors"
                >
                  <button
                    onClick={() => toggleGroup(group.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-200 rounded-xl transition-colors hover:text-blue-700 dark:hover:text-sky-200 hover:bg-blue-50/60 dark:hover:bg-slate-900/40"
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform text-slate-500 dark:text-slate-300 ${open ? "rotate-180" : ""}`}
                    />
                  </button>
                  {open && (
                    <SidebarMenu className="space-y-1 px-2 pb-2 bg-white dark:bg-slate-950/50 rounded-xl shadow-inner">
                      {rendered as JSX.Element[]}
                    </SidebarMenu>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="space-y-2 bg-white dark:bg-slate-950/60 rounded-2xl border border-white/75 dark:border-slate-900/60 p-3 shadow-[0_12px_35px_rgba(15,23,42,0.12)]">
          {isSuperadmin && (
            <SidebarMenu className="space-y-1">
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all border ${isActive
                        ? "bg-blue-600 text-white border-blue-500 shadow-[0_10px_28px_rgba(37,99,235,0.35)]"
                        : "text-slate-600 dark:text-slate-200 border-transparent hover:border-blue-400/40 hover:bg-blue-100/70 dark:hover:bg-sky-500/20 hover:text-blue-700 dark:hover:text-sky-200"
                      }`
                    }
                  >
                    <BarChart3 className="h-4 w-4" />
                    <span>Admin</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          )}

          <SidebarMenu className="space-y-1">
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <NavLink
                  to="/settings"
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all border ${isActive
                      ? "bg-blue-600 text-white border-blue-500 shadow-[0_10px_28px_rgba(37,99,235,0.35)]"
                      : "text-slate-600 dark:text-slate-200 border-transparent hover:border-blue-400/40 hover:bg-blue-100/70 dark:hover:bg-sky-500/20 hover:text-blue-700 dark:hover:text-sky-200"
                    }`
                  }
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>
    </Sidebar>
  );
}