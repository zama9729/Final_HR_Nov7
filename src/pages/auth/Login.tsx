import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Building2, Eye, EyeOff, ArrowLeft, Loader2 } from "lucide-react";

type LoginStep = "email" | "password" | "firstTime";

export default function Login() {
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [companyInfo, setCompanyInfo] = useState<{
    name: string;
    logoUrl: string | null;
  } | null>(null);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");
    
    if (!email || !email.includes("@")) {
      setEmailError("Please enter a valid email address");
      return;
    }

    setIsCheckingEmail(true);

    try {
      const result = await api.checkEmail(email);
      
      if (!result.exists) {
        setEmailError(`We couldn't find an account for ${email}.`);
        setIsCheckingEmail(false);
        return;
      }

      // User exists - move to step 2
      setCompanyInfo({
        name: result.companyName || "Company",
        logoUrl: result.companyLogoUrl || null
      });
      setIsFirstLogin(result.firstLogin || false);
      setStep(result.firstLogin ? "firstTime" : "password");
    } catch (error: any) {
      console.error("Check email error:", error);
      setEmailError(error.message || "Something went wrong. Please try again.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    if (!password) {
      setPasswordError("Password is required");
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(email, password);
      
      if (result.error) {
        let errorMessage = "Invalid password. Please try again.";
        
        if (result.error.message) {
          if (result.error.message.includes("Invalid")) {
            errorMessage = "Invalid password. Please try again.";
          } else {
            errorMessage = result.error.message;
          }
        }
        
        setPasswordError(errorMessage);
        return;
      }
      
      // Check if employee needs to change password
      try {
        const employeeData = await api.checkEmployeePasswordChange();
        
        if (employeeData?.must_change_password) {
          navigate("/auth/first-time-login");
          return;
        }
      } catch (error) {
        // Not an employee or error checking - continue normally
        console.log('Not an employee or error checking password status');
      }
      
      toast({
        title: "Welcome back!",
        description: "You've successfully logged in.",
      });
      navigate("/dashboard");
    } catch (error: any) {
      console.error("Login exception:", error);
      setPasswordError(error.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFirstTimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");

    // Validate passwords
    if (!password || !confirmPassword) {
      setPasswordError("Both password fields are required");
      return;
    }

    if (password.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      const result = await api.firstTimeSetup(email, password);
      
      if (result.error) {
        setPasswordError(result.error.message || "Failed to set up password. Please try again.");
        return;
      }
      
      toast({
        title: "Password set successfully!",
        description: "You've successfully logged in.",
      });
      
      navigate("/dashboard");
    } catch (error: any) {
      console.error("First-time setup exception:", error);
      setPasswordError(error.message || "An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep("email");
    setPassword("");
    setConfirmPassword("");
    setPasswordError("");
    setEmailError("");
  };

  const handleSignUpWithEmail = () => {
    navigate(`/auth/signup?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md shadow-large transition-all duration-300">
        {/* Step 1: Email Only */}
        {step === "email" && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <CardHeader className="space-y-4 text-center">
              <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                <Building2 className="h-7 w-7 text-primary-foreground" />
              </div>
              <div>
                <CardTitle className="text-2xl">Company Login</CardTitle>
                <CardDescription>Sign in to your HR platform account</CardDescription>
              </div>
            </CardHeader>
            <form onSubmit={handleEmailSubmit}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setEmailError("");
                    }}
                    required
                    disabled={isCheckingEmail}
                    className={emailError ? "border-destructive" : ""}
                  />
                  {emailError && (
                    <p className="text-sm text-destructive">{emailError}</p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button 
                  type="submit" 
                  className="w-full red-glass-button" 
                  disabled={isCheckingEmail || !email}
                >
                  {isCheckingEmail ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
                {emailError && emailError.includes("couldn't find") && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleSignUpWithEmail}
                  >
                    Sign up with this email
                  </Button>
                )}
                <div className="text-sm text-center text-muted-foreground">
                  Don't have an account?{" "}
                  <Link to="/auth/signup" className="text-primary hover:underline font-medium">
                    Sign up
                  </Link>
                </div>
              </CardFooter>
            </form>
          </div>
        )}

        {/* Step 2: Password or First-Time Setup */}
        {(step === "password" || step === "firstTime") && (
          <div className="animate-in fade-in slide-in-from-left-4 duration-300">
            <CardHeader className="space-y-4 text-center">
              {/* Company Logo - Full display without borders */}
              {companyInfo?.logoUrl ? (
                <div className="flex justify-center">
                  <img
                    src={companyInfo.logoUrl}
                    alt={companyInfo.name}
                    className="max-h-20 max-w-full object-contain"
                  />
                </div>
              ) : (
                <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-primary-foreground" />
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Sign in to continue</p>
                <CardTitle className="text-2xl">{companyInfo?.name || "Company"}</CardTitle>
              </div>
            </CardHeader>
            <form onSubmit={step === "firstTime" ? handleFirstTimeSubmit : handlePasswordSubmit}>
              <CardContent className="space-y-4">
                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label htmlFor="email-display">Email</Label>
                  <Input
                    id="email-display"
                    type="email"
                    value={email}
                    disabled
                    className="bg-muted"
                  />
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={handleBackToEmail}
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Change email
                    </button>
                  </div>
                </div>

                {step === "password" ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setPasswordError("");
                          }}
                          required
                          className={passwordError ? "border-destructive pr-10" : "pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordError && (
                        <p className="text-sm text-destructive">{passwordError}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Enter your password to continue.
                      </p>
                    </div>
                    <div className="flex justify-end">
                      <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <div className="relative">
                        <Input
                          id="new-password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            setPasswordError("");
                          }}
                          required
                          className={passwordError ? "border-destructive pr-10" : "pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm Password</Label>
                      <div className="relative">
                        <Input
                          id="confirm-password"
                          type={showConfirmPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => {
                            setConfirmPassword(e.target.value);
                            setPasswordError("");
                          }}
                          required
                          className={passwordError ? "border-destructive pr-10" : "pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {passwordError && (
                        <p className="text-sm text-destructive">{passwordError}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Set up your password to login for the first time. Password must be at least 8 characters.
                      </p>
                    </div>
                  </>
                )}
              </CardContent>
              <CardFooter className="flex flex-col gap-4">
                <Button 
                  type="submit" 
                  className="w-full red-glass-button" 
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {step === "firstTime" ? "Setting up..." : "Signing in..."}
                    </>
                  ) : (
                    step === "firstTime" ? "Set password & login" : "Sign in"
                  )}
                </Button>
              </CardFooter>
            </form>
          </div>
        )}
      </Card>
    </div>
  );
}
