import {
  Settings,
  ChevronDown,
  Menu,
  X,
  User,
  LogOut,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useOrgSetup } from "@/contexts/OrgSetupContext";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Notifications } from "@/components/Notifications";
import { useNavigate } from "react-router-dom";
import { getMenuItemsForProfile, type NavItem, type NavGroup } from "@/config/navigation";

export function TopNavBar() {
  const { user, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [presenceStatus, setPresenceStatus] = useState<string>('online');
  const [organization, setOrganization] = useState<{ name: string; logo_url: string | null } | null>(null);
  const [pendingCounts, setPendingCounts] = useState<{
    timesheets: number;
    leaves: number;
    taxDeclarations: number;
  }>({
    timesheets: 0,
    leaves: 0,
    taxDeclarations: 0,
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { attendanceSettings } = useOrgSetup();
  const [payrollIntegrationEnabled, setPayrollIntegrationEnabled] = useState(true);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  const captureMethod = attendanceSettings?.capture_method === 'clock_in_out' ? 'clock_in_out' : 'timesheets';
  const isClockMode = captureMethod === 'clock_in_out';
  const isTimesheetMode = captureMethod !== 'clock_in_out';

  // Get menu items using shared navigation config
  const navigationGroups = useMemo(() => {
    return getMenuItemsForProfile({
      userRole,
      payrollIntegrationEnabled,
      isClockMode,
      isTimesheetMode,
    });
  }, [userRole, payrollIntegrationEnabled, isClockMode, isTimesheetMode]);

  useEffect(() => {
    const enabled = import.meta.env.VITE_PAYROLL_INTEGRATION_ENABLED !== 'false';
    setPayrollIntegrationEnabled(enabled);
  }, []);

  useEffect(() => {
    if (user) {
      fetchPresenceStatus();
      fetchOrganization();
      if (userRole && ['manager', 'hr', 'director', 'ceo', 'admin'].includes(userRole)) {
        fetchPendingCounts();
      }
    }
  }, [user, userRole]);

  // Click outside handler for mobile menu
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(target)) {
        const menuButton = document.querySelector('button[aria-label="Toggle menu"]');
        if (menuButton && !menuButton.contains(target)) {
          setMobileMenuOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [mobileMenuOpen]);

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

  const fetchPresenceStatus = async () => {
    if (!user) return;
    try {
      const presence = await api.getPresenceStatus();
      setPresenceStatus(presence.presence_status || 'online');
    } catch (error) {
      console.error('Error fetching presence status:', error);
    }
  };

  const handlePresenceChange = async (newStatus: string) => {
    try {
      await api.updatePresenceStatus(newStatus as any);
      setPresenceStatus(newStatus);
      toast({
        title: 'Status Updated',
        description: `Your presence is now ${newStatus.replace('_', ' ')}`,
      });
    } catch (error: any) {
      console.error('Error updating presence status:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update presence status',
        variant: 'destructive',
      });
    }
  };

  const fetchOrganization = async () => {
    try {
      const org = await api.getOrganization();
      if (org) {
        setOrganization(org);
      }
    } catch (error) {
      console.error("Error fetching organization:", error);
    }
  };

  const getLogoText = () => {
    if (organization?.name) {
      const words = organization.name.split(" ");
      if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
      }
      return organization.name.substring(0, 2).toUpperCase();
    }
    return "NE";
  };

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const getRoleLabel = (role: string | null) => {
    if (!role) return '';
    const roleLabels: Record<string, string> = {
      'ceo': 'CEO',
      'director': 'Director',
      'hr': 'HR',
      'manager': 'Manager',
      'employee': 'Employee',
      'admin': 'Admin',
    };
    return roleLabels[role.toLowerCase()] || role.charAt(0).toUpperCase() + role.slice(1);
  };

  const getPresenceDotGlow = (status: string) => {
    switch (status) {
      case 'online':
        return 'bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.9)]';
      case 'away':
        return 'bg-yellow-300 shadow-[0_0_14px_rgba(253,224,71,0.9)]';
      case 'break':
        return 'bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.9)]';
      case 'out_of_office':
        return 'bg-sky-400 shadow-[0_0_14px_rgba(56,189,248,0.9)]';
      default:
        return 'bg-slate-400 shadow-[0_0_10px_rgba(148,163,184,0.6)]';
    }
  };

  const getPresenceLabel = (status: string) => {
    return status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  // Items are already filtered by getMenuItemsForProfile, so we just need to check if item exists
  const shouldRenderItem = (item: NavItem) => {
    // Items are already filtered by the navigation config, but we can add additional checks here if needed
    return true;
  };

  const getBadgeCount = (url: string) => {
    if (url === '/timesheet-approvals') return pendingCounts.timesheets;
    if (url === '/leaves') return pendingCounts.leaves;
    if (url === '/tax/declarations/review') return pendingCounts.taxDeclarations;
    return 0;
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

  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => {
      if (!shouldRenderItem(item)) return false;
      return location.pathname === item.url || location.pathname.startsWith(item.url + '/');
    });
  };

  const renderNavItem = (item: NavItem) => {
    if (!shouldRenderItem(item)) return null;
    const badgeCount = item.showBadge ? getBadgeCount(item.url) : 0;
    const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');

    if (item.sso) {
      return (
        <button
          key={item.title}
          onClick={() => {
            openPayrollSso();
            setMobileMenuOpen(false);
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm liquid-glass-nav-item ${
            isActive 
              ? 'liquid-glass-nav-item-active text-slate-900 font-medium' 
              : 'text-slate-700'
          }`}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="flex-1 text-left">{item.title}</span>
          {badgeCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white shrink-0">
              {badgeCount > 9 ? '9+' : badgeCount}
            </span>
          )}
        </button>
      );
    }

    return (
      <NavLink
        key={item.title}
        to={item.url}
        onClick={() => {
          setMobileMenuOpen(false);
        }}
        className={({ isActive: navIsActive }) =>
          `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm liquid-glass-nav-item ${
            navIsActive || isActive 
              ? 'liquid-glass-nav-item-active text-slate-900 font-medium' 
              : 'text-slate-700'
          }`
        }
      >
        <item.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left">{item.title}</span>
        {badgeCount > 0 && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white shrink-0">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
      </NavLink>
    );
  };

  // Navigation groups are already filtered by getMenuItemsForProfile
  const filteredGroups = navigationGroups;

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 w-full liquid-glass-navbar">
        <div className="flex h-16 items-center justify-between px-4 lg:px-8 gap-4">
          {/* Logo & App Name - Left */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-700 liquid-glass-nav-item"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>

            <NavLink
              to="/dashboard"
              className="flex h-10 w-auto min-w-[2.5rem] items-center justify-center relative group"
              title={organization?.name || "Dashboard"}
            >
              {organization?.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name || "Organization"}
                  className="max-h-10 w-auto object-contain"
                />
              ) : (
                <span className="px-2 text-base font-semibold bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {getLogoText()}
                </span>
              )}
              {/* Tooltip on hover */}
              {organization?.name && (
                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 shadow-lg">
                  {organization.name}
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-900"></div>
                </div>
              )}
            </NavLink>
          </div>

          {/* Desktop Navigation Groups - Center */}
          <nav className="hidden lg:flex flex-1 items-center justify-center gap-1 px-4 overflow-x-auto scrollbar-hide">
            {filteredGroups.map((group) => {
              const rendered = group.items.map((item) => renderNavItem(item)).filter(Boolean);
              if (!rendered.length) return null;
              const isActive = isGroupActive(group);

              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium liquid-glass-nav-item ${
                        isActive
                          ? 'liquid-glass-nav-item-active text-slate-900'
                          : 'text-slate-700 hover:text-slate-900'
                      }`}
                    >
                      <span>{group.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-64 max-h-[80vh] overflow-y-auto liquid-glass-dropdown">
                    {rendered.length > 0 ? rendered : <div className="px-4 py-2 text-sm text-slate-500">No items</div>}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
            {/* Settings Link - Only for HR and Admin */}
            {(userRole === 'hr' || userRole === 'admin') && (
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium liquid-glass-nav-item ${
                    isActive 
                      ? 'liquid-glass-nav-item-active text-slate-900'
                      : 'text-slate-700 hover:text-slate-900'
                  }`
                }
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </NavLink>
            )}
          </nav>

          {/* Right Side Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative">
              <Notifications />
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 w-9 p-0 flex items-center justify-center text-slate-700 hover:text-slate-900 transition-transform duration-300 hover:scale-110 focus:outline-none">
                  <span className={`h-3 w-3 rounded-full ${getPresenceDotGlow(presenceStatus)}`} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2 liquid-glass-dropdown">
                <div className="space-y-1">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Presence Status</div>
                  <DropdownMenuSeparator />
                  {['online', 'away', 'break', 'out_of_office'].map((status) => (
                    <button
                      key={status}
                      onClick={() => handlePresenceChange(status)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm liquid-glass-dropdown-item ${presenceStatus === status
                          ? 'bg-red-50/60 text-red-700'
                          : 'text-slate-700'
                        }`}
                    >
                      <span className={`h-2.5 w-2.5 rounded-full border border-white/40 ${getPresenceDotGlow(status)}`} />
                      <span>{getPresenceLabel(status)}</span>
                      {presenceStatus === status && (
                        <span className="ml-auto text-xs text-red-600">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="gap-2 h-9 px-2 flex items-center text-slate-700 hover:text-slate-900 transition-transform duration-300 hover:scale-110 focus:outline-none">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-blue-400/20 via-indigo-400/20 to-purple-400/20 backdrop-blur-sm flex items-center justify-center">
                    <User className="h-4 w-4 text-slate-700" />
                  </div>
                  <span className="hidden lg:inline-block text-sm font-medium">
                    {getRoleLabel(userRole)}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 liquid-glass-dropdown">
                <DropdownMenuLabel className="text-sm font-semibold">My Account</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate('/my/profile')}
                  className="text-sm liquid-glass-dropdown-item"
                >
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-sm liquid-glass-dropdown-item"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Mobile Menu Panel */}
        {mobileMenuOpen && (
          <div
            ref={mobileMenuRef}
            className="lg:hidden absolute top-full left-0 right-0 liquid-glass-dropdown border-b max-h-[calc(100vh-4rem)] overflow-y-auto z-50"
          >
            <div className="p-4 space-y-2">
              {filteredGroups.map((group) => {
                const rendered = group.items.map((item) => {
                  if (!shouldRenderItem(item)) return null;
                  const badgeCount = item.showBadge ? getBadgeCount(item.url) : 0;
                  const isActive = location.pathname === item.url || location.pathname.startsWith(item.url + '/');

                  if (item.sso) {
                    return (
                      <button
                        key={item.title}
                        onClick={() => {
                          openPayrollSso();
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm liquid-glass-nav-item ${
                          isActive 
                            ? 'liquid-glass-nav-item-active text-slate-900 font-medium' 
                            : 'text-slate-700'
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-left">{item.title}</span>
                        {badgeCount > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white shrink-0">
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </span>
                        )}
                      </button>
                    );
                  }

                  return (
                    <NavLink
                      key={item.title}
                      to={item.url}
                      onClick={() => {
                        setMobileMenuOpen(false);
                      }}
                        className={({ isActive: navIsActive }) =>
                          `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm liquid-glass-nav-item ${
                            navIsActive || isActive 
                              ? 'liquid-glass-nav-item-active text-slate-900 font-medium' 
                              : 'text-slate-700'
                          }`
                        }
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.title}</span>
                      {badgeCount > 0 && (
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-medium text-white shrink-0">
                          {badgeCount > 9 ? '9+' : badgeCount}
                        </span>
                      )}
                    </NavLink>
                  );
                }).filter(Boolean);
                if (!rendered.length) return null;

                return (
                  <div key={group.id} className="space-y-1">
                    <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {group.label}
                    </div>
                    <div className="space-y-1">
                      {rendered}
                    </div>
                  </div>
                );
              })}
              {/* Settings Link - Only for HR and Admin */}
              {(userRole === 'hr' || userRole === 'admin') && (
                <NavLink
                  to="/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg text-sm liquid-glass-nav-item ${
                      isActive ? 'liquid-glass-nav-item-active text-slate-900 font-medium' : 'text-slate-700'
                    }`
                  }
                >
                  <Settings className="h-4 w-4" />
                  <span>Settings</span>
                </NavLink>
              )}
            </div>
          </div>
        )}
      </header>
    </>
  );
}
