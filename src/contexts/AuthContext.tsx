import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

export type UserRole = 'employee' | 'manager' | 'hr' | 'director' | 'ceo' | 'admin' | 'super_user' | 'accountant';

export type AuthUser = {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
};

export interface OrganizationData {
  orgName: string;
  domain: string;
  subdomain?: string;
  companySize?: string;
  industry?: string;
  timezone?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  session: { token: string } | null;
  login: (email: string, password: string) => Promise<{ error: any }>;
  signup: (email: string, password: string, firstName: string, lastName: string, orgData?: OrganizationData) => Promise<{ error: any }>;
  logout: () => Promise<void>;
  isLoading: boolean;
  userRole: UserRole | null;
  refreshUserRole: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<{ token: string } | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUserRole = async () => {
    if (user?.role) {
      setUserRole(user.role);
    } else if (user) {
      try {
        const profile = await api.getProfile();
        if (profile.role) {
          setUserRole(profile.role);
          setUser(prev => prev ? { ...prev, role: profile.role } : null);
        }
      } catch (error) {
        console.error('Failed to refresh role:', error);
      }
    }
  };

  useEffect(() => {
    // Check for existing token
    const token = localStorage.getItem('auth_token');
    if (token) {
      // Verify token and load user
      api.setToken(token);
      loadUserFromToken();
    } else {
      setIsLoading(false);
    }
  }, []);

  const loadUserFromToken = async () => {
    try {
      const profile = await api.getProfile();
      setUser({
        id: profile.id,
        email: profile.email,
        firstName: profile.first_name,
        lastName: profile.last_name,
        role: profile.role,
      });
      setUserRole(profile.role);
      setSession({ token: api.token || '' });
      setIsLoading(false);
    } catch (error: any) {
      // Token invalid or API error, clear it
      console.error('Failed to load user from token:', error);
      api.setToken(null);
      setUser(null);
      setSession(null);
      setUserRole(null);
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const result = await api.login(email, password);
      
      if (result.error) {
        return { error: result.error };
      }

      setUser(result.user);
      setUserRole(result.user.role);
      setSession({ token: result.token });

      return { error: null };
    } catch (error: any) {
      return { error: error.message || 'Login failed' };
    }
  };

  const signup = async (email: string, password: string, firstName: string, lastName: string, orgData?: OrganizationData) => {
    try {
      if (!orgData) {
        return { error: 'Organization data required' };
      }

      const result = await api.signup({
        email,
        password,
        firstName,
        lastName,
        orgName: orgData.orgName,
        domain: orgData.domain,
        subdomain: orgData.subdomain,
        companySize: orgData.companySize,
        industry: orgData.industry,
        timezone: orgData.timezone,
      });

      if (result.error) {
        return { error: result.error };
      }

      setUser(result.user);
      setUserRole(result.user.role);
      setSession({ token: result.token });

      return { error: null };
    } catch (error: any) {
      return { error: error.message || 'Signup failed' };
    }
  };

  const logout = async () => {
    api.setToken(null);
    setUser(null);
    setSession(null);
    setUserRole(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, login, signup, logout, isLoading, userRole, refreshUserRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
