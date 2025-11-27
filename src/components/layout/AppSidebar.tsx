import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  Clock,
  Workflow,
  Settings,
  BarChart3,
  Building2,
  Network,
  UserCheck,
  CalendarClock,
  Award,
  Bot,
  CheckSquare,
  Upload,
  History,
  DollarSign,
  Search,
  UserX,
  Inbox,
  LogOut,
  ClipboardList,
  Receipt,
  ChevronDown,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { useCallback, useEffect, useState } from "react";
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

const hrGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "CEO Dashboard", url: "/ceo/dashboard", icon: BarChart3 },
      { title: "Analytics", url: "/analytics", icon: BarChart3 },
      { title: "Employee Stats", url: "/employee-stats", icon: Users },
      { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
    ],
  },
  {
    id: "people",
    label: "People Operations",
    items: [
      { title: "My Profile", url: "/my/profile", icon: Users },
      { title: "Employees", url: "/employees", icon: Users },
      { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck },
      { title: "Offboarding", url: "/offboarding", icon: LogOut },
      { title: "Background Checks", url: "/background-checks", icon: Search },
      { title: "Terminations & Rehires", url: "/terminations", icon: UserX },
      { title: "Org Chart", url: "/org-chart", icon: Network },
      { title: "Skills", url: "/profile/skills", icon: Award },
      { title: "Workflows", url: "/workflows", icon: Workflow },
      { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
      { title: "Policy Management", url: "/policies/management", icon: FileText },
      { title: "New Project", url: "/projects/new", icon: Building2 },
      { title: "Audit Logs", url: "/audit-logs", icon: History, roles: ["ceo", "hr"] },
    ],
  },
  {
    id: "attendance",
    label: "Attendance & Leave",
    items: [
      { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
      { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3 },
      { title: "Timesheets", url: "/timesheets", icon: Clock, feature: "timesheets" },
      { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true, feature: "timesheets" },
      { title: "Shift Management", url: "/shifts", icon: CalendarClock, feature: "timesheets" },
      { title: "Attendance Upload", url: "/attendance/upload", icon: Upload, feature: "clock" },
      { title: "Upload History", url: "/attendance/history", icon: History, feature: "clock" },
      { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
      { title: "Holiday Management", url: "/holidays", icon: Calendar },
      { title: "Leave Policies", url: "/policies", icon: FileText },
    ],
  },
  {
    id: "planning",
    label: "Planning & Calendar",
    items: [
      { title: "Project Calendar", url: "/calendar", icon: CalendarClock },
    ],
  },
  {
    id: "payroll",
    label: "Payroll & Compliance",
    items: [
      { title: "Tax Declarations", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
      { title: "Form 16", url: "/reports/form16", icon: Receipt },
      { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
    ],
  },
];

const managerGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Org Chart", url: "/org-chart", icon: Network },
      { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
    ],
  },
  {
    id: "team",
    label: "My Team",
    items: [
      { title: "My Profile", url: "/my/profile", icon: Users },
      { title: "My Team", url: "/employees", icon: Users },
      { title: "Offboarding", url: "/offboarding", icon: LogOut },
      { title: "Timesheets", url: "/timesheets", icon: Clock, feature: "timesheets" },
      { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true, feature: "timesheets" },
      { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
      { title: "Attendance Upload", url: "/attendance/upload", icon: Upload, feature: "clock" },
      { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
      { title: "Appraisals", url: "/appraisals", icon: Award },
      { title: "Project Calendar", url: "/calendar", icon: CalendarClock },
    ],
  },
  {
    id: "compliance",
    label: "Compliance",
    items: [
      { title: "Tax Declaration", url: "/tax/declaration", icon: Receipt },
      { title: "Form 16", url: "/reports/form16", icon: Receipt },
      { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
    ],
  },
];

const employeeGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
    ],
  },
  {
    id: "self",
    label: "My Workspace",
    items: [
      { title: "My Profile", url: "/my/profile", icon: Users },
      { title: "My Timesheets", url: "/timesheets", icon: Clock, feature: "timesheets" },
      { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
      { title: "Attendance Upload", url: "/attendance/upload", icon: Upload, feature: "clock" },
      { title: "Leave Requests", url: "/leaves", icon: Calendar },
      { title: "Request Resignation", url: "/offboarding/new", icon: LogOut },
      { title: "Documents", url: "/documents", icon: Inbox },
      { title: "My Appraisal", url: "/my-appraisal", icon: Award },
      { title: "Tax Declaration", url: "/tax/declaration", icon: Receipt },
      { title: "Form 16", url: "/reports/form16", icon: Receipt },
      { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
    ],
  },
  {
    id: "org",
    label: "Organization",
    items: [
      { title: "Org Chart", url: "/org-chart", icon: Network },
      { title: "Project Calendar", url: "/calendar", icon: CalendarClock },
    ],
  },
];

const accountantGroups: NavGroup[] = [
  {
    id: "overview",
    label: "Overview",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    id: "attendance",
    label: "Attendance",
    items: [
      { title: "Attendance Upload", url: "/attendance/upload", icon: Upload, feature: "clock" },
      { title: "Upload History", url: "/attendance/history", icon: History, feature: "clock" },
      { title: "Timesheets", url: "/timesheets", icon: Clock, feature: "timesheets" },
    ],
  },
  {
    id: "payroll",
    label: "Payroll & Tax",
    items: [
      { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
      { title: "Tax Declarations", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
      { title: "Form 16", url: "/reports/form16", icon: Receipt },
    ],
  },
];

const superUserGroups: NavGroup[] = [
  {
    id: "owner",
    label: "Owner Tools",
    items: [
      { title: "Owner Analytics", url: "/super/dashboard", icon: BarChart3 },
    ],
  },
];

export function AppSidebar() {
  const { user, userRole } = useAuth();
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
  const [organization, setOrganization] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [payrollIntegrationEnabled, setPayrollIntegrationEnabled] = useState(true); // Default to true
  const { attendanceSettings } = useOrgSetup();
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

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
      if (userRole !== 'super_user') {
        fetchOrganization();
      } else {
        setOrganization(null);
      }
      fetchIsSuperadmin();

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

  const fetchOrganization = async () => {
    if (!user || userRole === 'super_user') return;

    try {
      const org = await api.getOrganization();
      if (org) {
        setOrganization(org);
      }
    } catch (error) {
      console.error('Error fetching organization:', error);
    }
  };

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

  // Determine which navigation items to show based on role
  const getNavigationGroups = (): NavGroup[] => {
    switch (userRole) {
      case 'ceo':
      case 'director':
      case 'hr':
      case 'admin':
        return hrGroups;
      case 'manager':
        return managerGroups;
      case 'accountant':
        return accountantGroups;
      case 'super_user':
        return superUserGroups;
      case 'employee':
      default:
        return employeeGroups;
    }
  };

  const navigationGroups = getNavigationGroups();
  const captureMethod = attendanceSettings?.capture_method === 'clock_in_out' ? 'clock_in_out' : 'timesheets';
  const isClockMode = captureMethod === 'clock_in_out';
  const isTimesheetMode = captureMethod !== 'clock_in_out';

  useEffect(() => {
    if (!navigationGroups.length) {
      if (activeGroup !== null) {
        setActiveGroup(null);
      }
      return;
    }
    const stillValid = navigationGroups.some((group) => group.id === activeGroup);
    if (!stillValid) {
      setActiveGroup(navigationGroups[0].id);
    }
  }, [navigationGroups, activeGroup]);

  const shouldRenderItem = (item: NavItem) => {
    if (item.roles && (!userRole || !item.roles.includes(userRole))) {
      return false;
    }
    if (item.feature === 'timesheets' && !isTimesheetMode) return false;
    if (item.feature === 'clock' && !isClockMode) return false;
    if (item.sso && !payrollIntegrationEnabled) return false;
    return true;
  };

  const toggleGroup = (groupId: string) => {
    setActiveGroup((prev) => (prev === groupId ? null : groupId));
  };

  const isGroupOpen = (groupId: string) => activeGroup === groupId;

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

  const renderNavItem = (item: NavItem) => {
    if (!shouldRenderItem(item)) {
      return null;
    }
    const badgeCount = item.showBadge ? getBadgeCount(item.url) : 0;

    if (item.sso) {
      return (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild>
            <button
              onClick={openPayrollSso}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-slate-300 hover:bg-slate-800 hover:text-white w-full text-left"
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-sm">{item.title}</span>
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
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive
                ? "bg-slate-800 text-white"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 text-sm">{item.title}</span>
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

  // Get organization name abbreviation (ZM) or first two letters
  const getLogoText = () => {
    if (organization?.name) {
      const words = organization.name.split(' ');
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return organization.name.substring(0, 2).toUpperCase();
    }
    return 'ZM';
  };

  return (
    <Sidebar collapsible="icon" className="bg-slate-900 border-r border-slate-800">
      <SidebarHeader className="border-b border-slate-800 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-shrink-0">
            {organization?.logo_url ? (
              <div className="relative h-12 w-12 rounded-lg overflow-hidden border border-slate-700 shadow-sm bg-slate-800">
                <img
                  src={organization.logo_url}
                  alt={organization.name || 'Organization'}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div className="h-12 w-12 rounded-lg bg-blue-600 border border-slate-700 flex items-center justify-center shadow-sm">
                <span className="text-white font-bold text-lg">{getLogoText()}</span>
              </div>
            )}
          </div>
          <div className="hidden lg:block min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white leading-tight truncate">
              {getLogoText()}
            </h2>
            <p className="text-xs text-slate-400 leading-tight mt-1">Powered by AI</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        {navigationGroups.map((group) => {
          const renderedItems = group.items
            .map(renderNavItem)
            .filter(Boolean) as JSX.Element[];

          if (renderedItems.length === 0) {
            return null;
          }

          const open = isGroupOpen(group.id);

          return (
            <SidebarGroup key={group.id}>
              <SidebarGroupLabel>
                <button
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between text-sm font-semibold text-slate-200"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
              </SidebarGroupLabel>
              {open && (
                <SidebarGroupContent>
                  <SidebarMenu>{renderedItems}</SidebarMenu>
                </SidebarGroupContent>
              )}
            </SidebarGroup>
          );
        })}

        {isSuperadmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Admin</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to="/admin"
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive
                          ? "bg-slate-800 text-white"
                          : "text-slate-300 hover:bg-slate-800 hover:text-white"
                        }`
                      }
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span>Admin</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink
                    to="/settings"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${isActive
                        ? "bg-slate-800 text-white"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                      }`
                    }
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}