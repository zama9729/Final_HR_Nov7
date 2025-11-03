import { Bell, Search, User, LogOut, Circle } from "lucide-react";
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

export function TopBar() {
  const { user, userRole, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [presenceStatus, setPresenceStatus] = useState<string>('online');

  useEffect(() => {
    if (user) {
      fetchPresenceStatus();
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

  const handleLogout = () => {
    logout();
    navigate('/auth/login');
  };

  const userName = user?.user_metadata?.first_name 
    ? `${user.user_metadata.first_name} ${user.user_metadata.last_name || ''}`
    : user?.email || 'User';

  const getPresenceColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'away': return 'text-yellow-500';
      case 'break': return 'text-orange-500';
      case 'out_of_office': return 'text-blue-500';
      default: return 'text-gray-500';
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
    <header className="sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="flex h-14 items-center gap-4 px-4 lg:px-6">
        <div className="flex-1 flex items-center gap-4">
          <div className="relative max-w-lg flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search..."
              className="pl-10 h-10 bg-gray-50 border-gray-200 text-sm focus-visible:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Notifications />
          </div>
          
          {/* Presence Status Bell */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" className="relative h-10 w-10 p-0 hover:bg-gray-50">
                <Bell className="h-5 w-5 text-gray-600" />
                <Circle 
                  className={`absolute top-1.5 right-1.5 h-2.5 w-2.5 ${getPresenceColor(presenceStatus)}`} 
                  fill="currentColor"
                />
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
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition-colors ${
                      presenceStatus === status
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <Circle 
                      className={`h-2.5 w-2.5 ${getPresenceColor(status)}`} 
                      fill="currentColor"
                    />
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
              <Button variant="ghost" className="gap-2 h-10 px-2 hover:bg-gray-50">
                <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center">
                  <User className="h-5 w-5 text-gray-600" />
                </div>
                <span className="hidden lg:inline-block text-sm font-medium text-gray-700">
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
