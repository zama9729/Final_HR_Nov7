import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Lock } from "lucide-react";
import { api } from "@/lib/api";

const PinAuth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const [pin, setPin] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [isSSO, setIsSSO] = useState(false);
  const [companyName, setCompanyName] = useState<string>("Payroll");
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [logoLoaded, setLogoLoaded] = useState(false);
  const hasCheckedAuth = useRef(false); // Prevent multiple auth checks
  const isChecking = useRef(false); // Prevent concurrent checks

  useEffect(() => {
    // Fetch company name and logo
    const fetchCompanyInfo = async () => {
      try {
        const tenantData = await api.dashboard.tenant();
        if (tenantData?.tenant) {
          setCompanyName(tenantData.tenant.company_name || "Payroll");
          const logoUrl = tenantData.tenant.logo_url || "";
          if (logoUrl) {
            // Preload image to prevent flickering
            const img = new Image();
            img.onload = () => {
              setCompanyLogo(logoUrl);
              setLogoLoaded(true);
            };
            img.onerror = () => {
              setCompanyLogo("");
              setLogoLoaded(true);
            };
            img.src = logoUrl;
          } else {
            setCompanyLogo("");
            setLogoLoaded(true);
          }
        }
      } catch (error) {
        console.error("Failed to fetch company info:", error);
        setLogoLoaded(true);
      }
    };
    fetchCompanyInfo();
  }, []);

  useEffect(() => {
    // Prevent multiple auth checks using sessionStorage
    const checkKey = 'payroll_pinauth_checked';
    if (sessionStorage.getItem(checkKey)) {
      setCheckingSession(false);
      return;
    }

    // Prevent multiple auth checks
    if (hasCheckedAuth.current || isChecking.current) {
      return;
    }

    // Check if coming from SSO
    const sso = searchParams.get('sso');
    const ssoToken = searchParams.get('token'); // Get SSO token from URL if present
    setIsSSO(sso === 'true');
    
    // If coming from SSO, store token and show PIN form (session cookie is set by backend)
    if (sso === 'true' || ssoToken) {
      hasCheckedAuth.current = true;
      sessionStorage.setItem(checkKey, 'true');
      // Store SSO token in sessionStorage for verify-pin endpoint
      if (ssoToken) {
        sessionStorage.setItem('payroll_sso_token', ssoToken);
      }
      setCheckingSession(false);
      toast.info('Please enter your PIN to continue');
      return;
    }
    
    // If not from SSO, check for existing session using API
    const checkSession = async () => {
      // Prevent multiple checks
      if (hasCheckedAuth.current || isChecking.current) {
        return;
      }

      isChecking.current = true;

      // Wait a bit for cookies to be set
      setTimeout(async () => {
        if (hasCheckedAuth.current) {
          isChecking.current = false;
          return;
        }

        try {
          // Use API call to check authentication instead of reading cookies
          // Cookies are httpOnly, so we can't read them with document.cookie
          try {
            const profileRes: any = await api.me.profile();
            if (profileRes?.profile) {
              // User is authenticated, check for last screen or redirect to dashboard
              hasCheckedAuth.current = true;
              sessionStorage.setItem(checkKey, 'true');
              console.log('[PinAuth] User already authenticated, checking for redirect');
              
              // Check if there's a last screen stored
              const lastScreen = sessionStorage.getItem('payroll_last_screen');
              const redirectPath = lastScreen || '/dashboard';
              
              if (lastScreen) {
                sessionStorage.removeItem('payroll_last_screen');
              }
              
              console.log('[PinAuth] Redirecting to:', redirectPath);
              const fullUrl = window.location.origin + redirectPath;
              window.location.href = fullUrl;
              return;
            }
          } catch (profileError: any) {
            // If profile fetch fails, show PIN form
            hasCheckedAuth.current = true;
            sessionStorage.setItem(checkKey, 'true');
            console.log('[PinAuth] User needs authentication, showing PIN form');
            setCheckingSession(false);
          }
        } catch (error) {
          console.error("Error checking session:", error);
          hasCheckedAuth.current = true;
          sessionStorage.setItem(checkKey, 'true');
          setCheckingSession(false);
        } finally {
          isChecking.current = false;
        }
      }, 500); // Wait 500ms for cookies to be set
    };

    checkSession();
  }, [searchParams, navigate]);

  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate PIN format
    if (!pin || pin.length !== 6) {
      toast.error("Please enter a 6-digit PIN");
      return;
    }
    
    // Ensure PIN is numeric
    if (!/^\d{6}$/.test(pin)) {
      toast.error("PIN must contain only numbers (0-9)");
      return;
    }
    
    setIsLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";
      
      // Get SSO token from sessionStorage if available (for fallback)
      const ssoToken = sessionStorage.getItem('payroll_sso_token');
      
      // Build request with SSO token in query or header if available
      let url = `${apiUrl}/sso/verify-pin`;
      if (ssoToken) {
        url += `?token=${encodeURIComponent(ssoToken)}`;
      }
      
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (ssoToken) {
        headers['x-sso-token'] = ssoToken;
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ pin })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || 'Invalid PIN');
      }
      
      const data = await response.json();
      toast.success("PIN verified successfully!");
      
      // Backend sets pin_ok cookie; get role from response or fetch profile
      console.log('[PinAuth] Full response data:', data);
      
      // Try to get role from response, otherwise fetch from profile
      let payrollRole = data.payrollRole || data.role || null;
      
      if (!payrollRole) {
        // If role not in response, fetch profile to get role
        try {
          const profileRes: any = await api.me.profile();
          payrollRole = profileRes?.profile?.payroll_role || 'payroll_employee';
          console.log('[PinAuth] Fetched role from profile:', payrollRole);
        } catch (profileError) {
          console.error('[PinAuth] Failed to fetch profile:', profileError);
          // Default to employee-portal if profile fetch fails
          payrollRole = 'payroll_employee';
        }
      }
      
      // Clear sessionStorage to allow Dashboard to load
      sessionStorage.removeItem('payroll_index_redirected');
      sessionStorage.removeItem('payroll_pinauth_checked');
      sessionStorage.removeItem('payroll_sso_token'); // Clear SSO token after successful verification
      
      // Check if there's a last screen stored, otherwise use dashboardUrl from response or default to /dashboard
      const lastScreen = sessionStorage.getItem('payroll_last_screen');
      // Use lastScreen if it exists, otherwise use dashboardUrl from backend response
      const redirectPath = lastScreen || data.dashboardUrl || '/dashboard';
      
      // Clear the last screen after using it
      if (lastScreen) {
        sessionStorage.removeItem('payroll_last_screen');
      }
      
      console.log('[PinAuth] PIN verified, role:', payrollRole, 'redirecting to:', redirectPath);
      console.log('[PinAuth] Last screen:', lastScreen, 'Dashboard URL:', data.dashboardUrl);
      
      // Wait a moment for cookies to be set by backend response
      // Backend sets pin_ok cookie in the response, so we need to wait for it
      console.log('[PinAuth] Waiting for cookies to be set...');
      
      // Wait longer to ensure cookies are set before redirecting
      // Use a longer timeout to ensure cookies are properly set
      setTimeout(() => {
        // Redirect to last screen or Dashboard - Dashboard will show content based on role
        const fullUrl = window.location.origin + redirectPath;
        console.log('[PinAuth] Redirecting to:', fullUrl);
        // Use window.location.href instead of replace to ensure proper navigation
        window.location.href = fullUrl;
      }, 500); // Wait 500ms to ensure cookies are set
    } catch (err: any) {
      toast.error(err.message || 'Failed to verify PIN');
      setPin(""); // Clear PIN on error
    } finally {
      setIsLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="text-lg">Checking session...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          {logoLoaded && companyLogo ? (
            <div className="inline-flex items-center justify-center mb-4">
              <img
                src={companyLogo}
                alt={companyName}
                className="max-h-16 w-auto object-contain transition-opacity duration-300"
                style={{ opacity: logoLoaded ? 1 : 0 }}
                onLoad={() => setLogoLoaded(true)}
              />
            </div>
          ) : (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4 shadow-xl">
              <span className="text-2xl font-bold text-primary-foreground">
                {companyName.substring(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>

        <Card className="shadow-xl">
          <CardHeader>
            <CardTitle>{isSSO ? 'Welcome Back!' : 'PIN Verification'}</CardTitle>
            <CardDescription>
              {isSSO 
                ? 'Enter your 6-digit PIN to access your Payroll account' 
                : 'Enter your 6-digit PIN to continue'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerifyPin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pin">6-Digit PIN</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={pin}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
                      setPin(value);
                    }}
                    onKeyDown={(e) => {
                      // Allow only numeric keys and backspace/delete
                      if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                        e.preventDefault();
                      }
                    }}
                    autoFocus
                    className="pl-10 text-center text-2xl tracking-widest font-mono"
                    autoComplete="off"
                    required
                  />
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading || pin.length !== 6}>
                {isLoading ? 'Verifying...' : 'Verify PIN'}
              </Button>
              
              <div className="flex flex-col gap-2 text-center text-sm">
                <Button
                  type="button"
                  variant="link"
                  className="text-xs"
                  onClick={() => navigate("/forgot-pin")}
                >
                  Forgot PIN?
                </Button>
                <p className="text-muted-foreground text-xs">
                  Accessed only through HR system
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PinAuth;

