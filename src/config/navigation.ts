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
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
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
      items: [
        { title: "Org Chart", url: "/org-chart", icon: Network },
        { title: "Hierarchy", url: "/organization/hierarchy", icon: Network },
      ],
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
        { title: "Hierarchy", url: "/organization/hierarchy", icon: Network },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "New Project", url: "/projects/new", icon: Building2 },
        { title: "Background Checks", url: "/background-checks", icon: UserCheck },
        { title: "Appraisals", url: "/appraisals", icon: Award },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle },
        { title: "Workflows", url: "/workflows", icon: GitBranch, roles: ["admin", "hr", "ceo"] },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert, roles: ["admin", "hr", "ceo"] },
      ],
    },
    {
      id: "admin-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true },
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
        { title: "Hierarchy", url: "/organization/hierarchy", icon: Network },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "New Project", url: "/projects/new", icon: Building2 },
        { title: "Background Checks", url: "/background-checks", icon: UserCheck },
        { title: "Appraisals", url: "/appraisals", icon: Award },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle },
        { title: "Workflows", url: "/workflows", icon: GitBranch, roles: ["admin", "hr", "ceo"] },
        { title: "Audit Logs", url: "/audit-logs", icon: ShieldAlert, roles: ["admin", "hr", "ceo"] },
      ],
    },
    {
      id: "hr-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true },
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
        { title: "Hierarchy", url: "/organization/hierarchy", icon: Network },
        { title: "Offboarding Policies", url: "/offboarding/policies", icon: ClipboardList },
        { title: "Policy Management", url: "/policies/management", icon: FileText },
        { title: "New Project", url: "/projects/new", icon: Building2 },
        { title: "Workflows", url: "/workflows", icon: GitBranch, roles: ["admin", "hr", "ceo"] },
        { title: "Appraisals", url: "/appraisals", icon: Award },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle, roles: ["admin", "hr", "ceo", "director", "manager"] },
      ],
    },
    {
      id: "ceo-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Attendance Analytics", url: "/analytics/attendance", icon: BarChart3, roles: ["admin", "hr", "ceo", "director"] },
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true },
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
        { title: "Appraisals", url: "/appraisals", icon: Award },
        { title: "Promotions", url: "/promotions", icon: ArrowUpCircle, roles: ["admin", "hr", "ceo", "director", "manager"] },
      ],
    },
    {
      id: "manager-attendance",
      label: "Attendance & Leave",
      items: [
        { title: "Clock In / Out", url: "/attendance/clock", icon: Clock, feature: "clock" },
        { title: "Team Schedule", url: "/team-schedule", icon: CalendarDays },
        { title: "Timesheet", url: "/timesheets", icon: Clock },
        { title: "Generate Timesheet", url: "/timesheet-generator", icon: Download },
        { title: "Timesheet Approvals", url: "/timesheet-approvals", icon: CheckSquare, showBadge: true },
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



