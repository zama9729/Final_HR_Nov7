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
  Briefcase,
  GitBranch,
  ArrowUpCircle,
  ShieldAlert,
  Download,
  Database,
  Key,
  Shield,
  Server,
  Cloud,
  Globe,
  Lock,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  showBadge?: boolean;
  sso?: boolean;
  feature?: "timesheets" | "clock";
  roles?: string[];
};

export type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

export const roleNavItems: Record<string, NavGroup[]> = {
  employee: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "work",
      label: "Work",
      items: [
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "My Shifts", url: "/my/shifts", icon: CalendarClock },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
        { title: "Leave Requests", url: "/leaves", icon: Calendar },
      ],
    },
    {
      id: "people",
      label: "People",
      items: [
        { title: "Org Chart", url: "/org-chart", icon: Network },
      ],
    },
    {
      id: "governance",
      label: "Governance",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
        { title: "Tax Declaration", url: "/tax/declaration", icon: Receipt },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
      ],
    },
  ],
  admin: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { title: "System Dashboard", url: "/superadmin", icon: LayoutDashboard },
        { title: "Usage Analytics", url: "/admin", icon: BarChart3 },
      ],
    },
    {
      id: "work",
      label: "Work",
      items: [
        { title: "Tenant Management", url: "/superadmin", icon: Database },
        { title: "Data Imports", url: "/employees/import", icon: Upload },
        { title: "Integrations", url: "/settings", icon: Cloud },
      ],
    },
    {
      id: "people",
      label: "People",
      items: [
        { title: "Role Management", url: "/settings", icon: Key },
        { title: "Permission Mapping", url: "/settings", icon: Shield },
      ],
    },
    {
      id: "governance",
      label: "Governance",
      items: [
        { title: "Global Policies", url: "/policies/management", icon: FileText },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert },
        { title: "Security", url: "/settings", icon: Lock },
        { title: "Compliance", url: "/settings", icon: Shield },
      ],
    },
  ],
  hr: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3 },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "work",
      label: "Work",
      items: [
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "Shift Management", url: "/scheduling", icon: CalendarClock },
        { title: "Shift Management 2", url: "/shift-management-2", icon: CalendarClock },
        { title: "Holiday Management", url: "/holidays", icon: CalendarDays },
        { title: "Attendance Upload", url: "/attendance/upload", icon: Upload },
        { title: "Upload History", url: "/attendance/history", icon: History },
        { title: "Leave Policies", url: "/policies", icon: FileText },
        { title: "Probation Policies", url: "/probation-policies", icon: UserCheck },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true },
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
        { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck },
        { title: "Offboarding", url: "/offboarding", icon: LogOut },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Background Check", url: "/background-checks", icon: UserCheck },
      ],
    },
    {
      id: "people",
      label: "People",
      items: [
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Teams", url: "/teams", icon: Building2 },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle },
        { title: "Projects", url: "/projects", icon: Briefcase },
        { title: "Org Chart", url: "/org-chart", icon: Network },
      ],
    },
    {
      id: "governance",
      label: "Governance",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
        { title: "Tax Declaration", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "Workflow", url: "/workflows", icon: GitBranch },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert },
      ],
    },
  ],
  ceo: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { title: "CEO Dashboard", url: "/ceo/dashboard", icon: BarChart3 },
        { title: "Analytics", url: "/analytics", icon: BarChart3 },
        { title: "Employee Analytics", url: "/employee-stats", icon: BarChart3 },
      ],
    },
    {
      id: "work",
      label: "Work",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3 },
        { title: "Shift Management", url: "/scheduling", icon: CalendarClock },
        { title: "Shift Management 2", url: "/shift-management-2", icon: CalendarClock },
        { title: "Holiday Management", url: "/holidays", icon: CalendarDays },
      ],
    },
    {
      id: "people",
      label: "People",
      items: [
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Teams", url: "/teams", icon: Building2 },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle },
        { title: "Projects", url: "/projects", icon: Briefcase },
        { title: "Org Chart", url: "/org-chart", icon: Network },
      ],
    },
    {
      id: "governance",
      label: "Governance",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
        { title: "Tax Declaration", url: "/tax/declarations/review", icon: Receipt, showBadge: true },
        { title: "Form 16", url: "/reports/form16", icon: Receipt },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert },
      ],
    },
  ],
  manager: [
    {
      id: "overview",
      label: "Overview",
      items: [
        { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
        { title: "AI Assistant", url: "/ai-assistant", icon: Bot },
      ],
    },
    {
      id: "work",
      label: "Work",
      items: [
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "My Shifts", url: "/my/shifts", icon: CalendarClock },
        { title: "Shift Management 2", url: "/shift-management-2", icon: CalendarClock },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
        { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true },
      ],
    },
    {
      id: "people",
      label: "People",
      items: [
        { title: "Employees", url: "/employees", icon: Users },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle },
        { title: "Org Chart", url: "/org-chart", icon: Network },
      ],
    },
    {
      id: "governance",
      label: "Governance",
      items: [
        { title: "Payroll", url: "/payroll", icon: DollarSign, sso: true },
        { title: "Tax Declaration", url: "/tax/declaration", icon: Receipt },
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

export const roleAlias: Record<string, keyof typeof roleNavItems> = {
  admin: "admin",
  hr: "hr",
  ceo: "ceo",
  director: "hr",
  manager: "manager",
  accountant: "admin",
  employee: "employee",
  super_user: "super_user",
};

export const resolveRoleKey = (role?: string): keyof typeof roleNavItems => {
  if (role && roleNavItems[role]) {
    return role as keyof typeof roleNavItems;
  }
  if (!role) return "employee";
  return roleAlias[role] || "employee";
};

export interface NavigationConfig {
  userRole?: string;
  payrollIntegrationEnabled: boolean;
  isClockMode: boolean;
  isTimesheetMode: boolean;
}

export const getMenuItemsForProfile = (config: NavigationConfig): NavGroup[] => {
  const { userRole, payrollIntegrationEnabled, isClockMode, isTimesheetMode } = config;

  const resolvedRoleKey = resolveRoleKey(userRole);
  const navigationGroups = roleNavItems[resolvedRoleKey] || roleNavItems.employee;

  // Filter items based on visibility rules
  const shouldRenderItem = (item: NavItem): boolean => {
    if (item.roles && (!userRole || !item.roles.includes(userRole))) {
      return false;
    }
    if (item.feature === 'clock' && !isClockMode) return false;
    // Don't filter timesheets - show them for all users
    // if (item.feature === 'timesheets' && !isTimesheetMode) return false;
    if (item.sso && !payrollIntegrationEnabled) return false;
    return true;
  };

  // Return filtered groups
  return navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(shouldRenderItem),
    }))
    .filter((group) => group.items.length > 0);
};

export type AvatarDropdownItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
};

export const getAvatarDropdownItems = (userRole?: string): AvatarDropdownItem[] => {
  const role = (userRole || '').toLowerCase();
  
  switch (role) {
    case 'employee':
      return [
        { title: 'My Profile', url: '/my/profile', icon: Users },
        { title: 'Documents', url: '/documents', icon: Inbox },
        { title: 'My Appraisal', url: '/my-appraisal', icon: Award },
        { title: 'Request Resignation', url: '/offboarding/new', icon: LogOut },
        { title: 'Settings', url: '/settings', icon: Settings },
        { title: 'Logout', url: '/auth/login', icon: LogOut },
      ];
    case 'manager':
      return [
        { title: 'My Profile', url: '/my/profile', icon: Users },
        { title: 'Documents', url: '/documents', icon: Inbox },
        { title: 'My Appraisal', url: '/my-appraisal', icon: Award },
        { title: 'Settings', url: '/settings', icon: Settings },
        { title: 'Logout', url: '/auth/login', icon: LogOut },
      ];
    case 'hr':
      return [
        { title: 'My Profile', url: '/my/profile', icon: Users },
        { title: 'Documents', url: '/documents', icon: Inbox },
        { title: 'My Appraisal', url: '/my-appraisal', icon: Award },
        { title: 'Settings', url: '/settings', icon: Settings },
        { title: 'Logout', url: '/auth/login', icon: LogOut },
      ];
    case 'ceo':
      return [
        { title: 'Settings', url: '/settings', icon: Settings },
        { title: 'Logout', url: '/auth/login', icon: LogOut },
      ];
    case 'admin':
      return [
        { title: 'Platform Settings', url: '/settings', icon: Settings },
        { title: 'Logout', url: '/auth/login', icon: LogOut },
      ];
    default:
      return [
        { title: 'My Profile', url: '/my/profile', icon: Users },
        { title: 'Settings', url: '/settings', icon: Settings },
        { title: 'Logout', url: '/auth/login', icon: LogOut },
      ];
  }
};



