import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function PayrollTopNavBar() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState<string>("Payroll");
  const [companyLogo, setCompanyLogo] = useState<string>("");
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
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
        console.error("Failed to fetch tenant:", error);
        setLogoLoaded(true);
      }
    };
    fetchProfile();
  }, []);


  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full liquid-glass-navbar">
      <div className="flex h-16 items-center justify-between px-4 lg:px-8 gap-4">
        {/* Logo & App Name - Left */}
        <div className="flex items-center gap-3 shrink-0">
          <NavLink
            to="/dashboard"
            className="flex h-10 w-auto min-w-[2.5rem] items-center justify-center relative"
          >
            {logoLoaded && companyLogo ? (
              <img
                src={companyLogo}
                alt={companyName}
                className="max-h-10 w-auto object-contain transition-opacity duration-300"
                style={{ opacity: 1 }}
              />
            ) : (
              <span className="px-2 text-base font-semibold bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                {companyName.substring(0, 2).toUpperCase()}
              </span>
            )}
          </NavLink>
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/change-pin")}
            className="liquid-glass-nav-item transition-transform duration-300 hover:scale-110"
          >
            <Key className="mr-2 h-4 w-4" />
            Change PIN
          </Button>
        </div>
      </div>
    </header>
  );
}

