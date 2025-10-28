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
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// Navigation items for different roles
const hrItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, showBadge: false },
  { title: "Employees", url: "/employees", icon: Users, showBadge: false },
  { title: "Onboarding", url: "/onboarding-tracker", icon: UserCheck, showBadge: false },
  { title: "Org Chart", url: "/org-chart", icon: Network, showBadge: false },
  { title: "Timesheets", url: "/timesheets", icon: Clock, showBadge: true },
  { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
  { title: "Workflows", url: "/workflows", icon: Workflow, showBadge: false },
  { title: "Policies", url: "/policies", icon: FileText, showBadge: false },
  { title: "Analytics", url: "/analytics", icon: BarChart3, showBadge: false },
];

const managerItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, showBadge: false },
  { title: "My Team", url: "/employees", icon: Users, showBadge: false },
  { title: "Org Chart", url: "/org-chart", icon: Network, showBadge: false },
  { title: "Timesheets", url: "/timesheets", icon: Clock, showBadge: true },
  { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: true },
];

const employeeItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, showBadge: false },
  { title: "My Timesheets", url: "/timesheets", icon: Clock, showBadge: false },
  { title: "Leave Requests", url: "/leaves", icon: Calendar, showBadge: false },
  { title: "Org Chart", url: "/org-chart", icon: Network, showBadge: false },
];

export function AppSidebar() {
  const { user, userRole } = useAuth();
  const [pendingCounts, setPendingCounts] = useState<{ timesheets: number; leaves: number }>({
    timesheets: 0,
    leaves: 0,
  });

  useEffect(() => {
    if (user && userRole && ['manager', 'hr', 'director', 'ceo'].includes(userRole)) {
      fetchPendingCounts();
      
      // Set up realtime subscriptions
      const channel = supabase
        .channel('sidebar-notifications')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'timesheets' }, () => {
          fetchPendingCounts();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
          fetchPendingCounts();
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user, userRole]);

  const fetchPendingCounts = async () => {
    if (!user) return;

    try {
      const { count: timesheetCount } = await supabase
        .from('timesheets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: leaveCount } = await supabase
        .from('leave_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      setPendingCounts({
        timesheets: timesheetCount || 0,
        leaves: leaveCount || 0,
      });
    } catch (error) {
      console.error('Error fetching pending counts:', error);
    }
  };
  
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

  const getBadgeCount = (url: string) => {
    if (url === '/timesheets') return pendingCounts.timesheets;
    if (url === '/leaves') return pendingCounts.leaves;
    return 0;
  };

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
              {navigationItems.map((item) => {
                const badgeCount = item.showBadge ? getBadgeCount(item.url) : 0;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink 
                        to={item.url}
                        className={({ isActive }) => 
                          isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : ""
                        }
                      >
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {badgeCount > 0 && (
                          <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </span>
                        )}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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