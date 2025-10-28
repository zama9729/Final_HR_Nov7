import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  Calendar, 
  DollarSign, 
  Clock, 
  Workflow, 
  Settings, 
  BarChart3,
  Building2,
  ClipboardList,
  Network,
  UserCheck
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

// Navigation items for different roles
const hrItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Employees", url: "/employees", icon: Users },
  { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck },
  { title: "Org Chart", url: "/org-chart", icon: Network },
  { title: "Timesheets", url: "/timesheets", icon: Clock },
  { title: "Leave Requests", url: "/leaves", icon: Calendar },
  { title: "Workflows", url: "/workflows", icon: Workflow },
  { title: "Policies", url: "/policies", icon: FileText },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
];

const managerItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "My Team", url: "/employees", icon: Users },
  { title: "Org Chart", url: "/org-chart", icon: Network },
  { title: "Timesheets", url: "/timesheets", icon: Clock },
  { title: "Leave Requests", url: "/leaves", icon: Calendar },
];

const employeeItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "My Timesheets", url: "/timesheets", icon: Clock },
  { title: "Leave Requests", url: "/leaves", icon: Calendar },
  { title: "Org Chart", url: "/org-chart", icon: Network },
];

export function AppSidebar() {
  const { userRole } = useAuth();
  
  // Determine which navigation items to show based on role
  const getNavigationItems = () => {
    switch (userRole) {
      case 'ceo':
      case 'director':
      case 'hr':
        return hrItems;
      case 'manager':
        return managerItems;
      case 'employee':
      default:
        return employeeItems;
    }
  };
  
  const navigationItems = getNavigationItems();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-sidebar-foreground">HR Platform</h2>
            <p className="text-xs text-sidebar-foreground/60">Powered by AI</p>
          </div>
        </div>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {userRole === 'hr' || userRole === 'director' || userRole === 'ceo' 
              ? 'HR Dashboard' 
              : userRole === 'manager' 
              ? 'Manager Dashboard' 
              : 'My Dashboard'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink 
                      to={item.url}
                      className={({ isActive }) => 
                        isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/settings">
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
