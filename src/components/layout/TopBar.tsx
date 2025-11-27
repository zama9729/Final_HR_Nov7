import { Search, User, LogOut, Circle, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Notifications } from "@/components/Notifications";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeContext";

export function TopBar() {
  const { user, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [presenceStatus, setPresenceStatus] = useState<string>('online');
  const { theme, toggleTheme } = useTheme();
  const [organization, setOrganization] = useState<{ name: string; logo_url: string | null } | null>(null);

  useEffect(() => {
    if (user) {
      fetchPresenceStatus();
      fetchOrganization();
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

  const userName = user?.firstName
    ? `${user.firstName} ${user.lastName || ''}`
    : user?.email || 'User';

  const getPresenceColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'away': return 'text-yellow-500';
      case 'break': return 'text-red-500';
      case 'out_of_office': return 'text-blue-500';
      default: return 'text-gray-500';
    }
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

  return (
    <header className="sticky top-0 z-40 h-16 border-b border-white/40 dark:border-slate-900/60 bg-gradient-to-r from-white/70 via-white/45 to-white/30 dark:from-slate-950/70 dark:via-slate-900/55 dark:to-slate-900/40 backdrop-blur-[22px] supports-[backdrop-filter]:bg-white/10 shadow-[0_24px_80px_rgba(15,23,42,0.28)]">
      <div className="flex h-16 items-center justify-between px-4 lg:px-6 gap-4">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="-ml-2 text-blue-500 drop-shadow-[0_0_12px_rgba(56,189,248,0.65)] dark:text-sky-300 dark:drop-shadow-[0_0_14px_rgba(14,165,233,0.75)] hover:text-cyan-400 transition-all" />
          <div className="flex items-center gap-3 px-1">
            <div className="flex h-10 w-auto min-w-[2.5rem] items-center justify-center">
              {organization?.logo_url ? (
                <img
                  src={organization.logo_url}
                  alt={organization.name || "Organization"}
                  className="max-h-10 w-auto object-contain drop-shadow-[0_6px_25px_rgba(15,23,42,0.45)]"
                />
              ) : (
                <span className="px-2 text-base font-semibold text-slate-900 dark:text-white drop-shadow-[0_6px_20px_rgba(15,23,42,0.45)]">
                  {getLogoText()}
                </span>
              )}
            </div>
            {organization?.name && (
              <div className="leading-tight hidden sm:block text-slate-900 dark:text-white drop-shadow-[0_4px_12px_rgba(15,23,42,0.35)]">
                <p className="text-sm font-semibold tracking-tight">{organization.name}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 max-w-2xl mx-auto w-full">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-cyan-500 drop-shadow-[0_0_12px_rgba(6,182,212,0.6)] dark:text-sky-300 dark:drop-shadow-[0_0_14px_rgba(14,165,233,0.65)]" />
            <Input
              type="search"
              placeholder="Search people, workflows, insights..."
              className="pl-10 h-10 w-full rounded-2xl border border-white/40 bg-white/22 text-sm shadow-[inset_0_2px_25px_rgba(15,23,42,0.18)] placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-400 supports-[backdrop-filter]:bg-white/12 dark:bg-slate-900/35 dark:border-white/15 dark:placeholder:text-slate-300"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            className="h-10 w-10 p-0 rounded-full border border-transparent hover:border-blue-200 dark:hover:border-slate-600 transition-all"
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-amber-200 drop-shadow-[0_0_15px_rgba(251,191,36,0.9)]" />
            ) : (
              <Moon className="h-5 w-5 text-sky-400 drop-shadow-[0_0_15px_rgba(14,165,233,0.85)]" />
            )}
          </Button>

          <div className="relative rounded-full border border-white/30 dark:border-slate-700/70 shadow-[0_0_20px_rgba(59,130,246,0.35)]">
            <Notifications />
          </div>

          {/* Presence Status Bell */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 p-0 hover:bg-gray-50 dark:hover:bg-slate-800 flex items-center justify-center">
                <span className={`h-3 w-3 rounded-full border border-white/50 dark:border-white/20 ${getPresenceDotGlow(presenceStatus)}`} />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
              <div className="space-y-1">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Presence Status</div>
                <DropdownMenuSeparator />
                {['online', 'away', 'break', 'out_of_office'].map((status) => (
                  <button
                    key={status}
                    onClick={() => handlePresenceChange(status)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${presenceStatus === status
                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200'
                        : 'hover:bg-gray-50 text-gray-700 dark:hover:bg-slate-800 dark:text-slate-200'
                      }`}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full border border-white/40 dark:border-white/20 ${getPresenceDotGlow(status)}`} />
                    <span>{getPresenceLabel(status)}</span>
                    {presenceStatus === status && (
                      <span className="ml-auto text-xs text-blue-600">✓</span>
                    )}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          {/* Profile with Role */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 h-10 px-2 hover:bg-gray-50 dark:hover:bg-slate-800">
                <div className="h-8 w-8 rounded-full bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-200 flex items-center justify-center shadow-[0_0_18px_rgba(59,130,246,0.45)]">
                  <User className="h-5 w-5 text-blue-500 dark:text-sky-300 drop-shadow-[0_0_12px_rgba(59,130,246,0.65)]" />
                </div>
                <span className="hidden lg:inline-block text-sm font-medium text-gray-700 dark:text-gray-200">
                  {getRoleLabel(userRole)}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuLabel className="text-sm font-semibold">My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate('/my/profile')} className="text-sm">
                <User className="mr-2 h-4 w-4" />
                Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-sm">
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
