import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Building2, Shield } from "lucide-react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

type FormState = {
  password: string;
  confirmPassword: string;
  securityAnswer1: string;
  securityAnswer2: string;
};

export default function ResetPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get("token") ?? "";

  const [formData, setFormData] = useState<FormState>({
    password: "",
    confirmPassword: "",
    securityAnswer1: "",
    securityAnswer2: "",
  });
  const [securityQuestions, setSecurityQuestions] = useState<string[]>([]);
  const [initializing, setInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const hasSecurityQuestion1 = useMemo(() => Boolean(securityQuestions[0]), [securityQuestions]);
  const hasSecurityQuestion2 = useMemo(() => Boolean(securityQuestions[1]), [securityQuestions]);

  useEffect(() => {
    const token = tokenParam.trim();

    if (!token) {
      setInitError("Reset token is missing. Please use the link from your password reset email.");
      setInitializing(false);
      return;
    }

    setInitializing(true);
    api.getPasswordResetInfo(token)
      .then((data: any) => {
        setSecurityQuestions(data?.securityQuestions || []);
        setInitError(null);
      })
      .catch((error: any) => {
        console.error("Failed to validate reset token:", error);
        setInitError(error?.message || "This password reset link is invalid or has expired.");
      })
      .finally(() => setInitializing(false));
  }, [tokenParam]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!tokenParam) {
      toast({
        title: "Invalid link",
        description: "Reset token missing. Please request a new password reset link.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: "Weak password",
        description: "Password must be at least 8 characters long.",
        variant: "destructive",
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Please ensure both password fields match exactly.",
        variant: "destructive",
      });
      return;
    }

    if (hasSecurityQuestion1 && !formData.securityAnswer1.trim()) {
      toast({
        title: "Answer required",
        description: "Please answer the first security question.",
        variant: "destructive",
      });
      return;
    }

    if (hasSecurityQuestion2 && !formData.securityAnswer2.trim()) {
      toast({
        title: "Answer required",
        description: "Please answer the second security question.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const payload: Record<string, string> = {
        token: tokenParam,
        password: formData.password,
      };

      if (hasSecurityQuestion1) {
        payload.securityAnswer1 = formData.securityAnswer1.trim();
      }

      if (hasSecurityQuestion2) {
        payload.securityAnswer2 = formData.securityAnswer2.trim();
      }

      await api.resetPassword(payload);

      toast({
        title: "Password reset",
        description: "Your password has been updated. You can now log in with the new password.",
      });

      navigate("/auth/login");
    } catch (error: any) {
      console.error("Failed to reset password:", error);
      toast({
        title: "Reset failed",
        description: error?.message || "We couldn't reset your password. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-2xl shadow-large">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-2xl">Reset Your Password</CardTitle>
            <CardDescription>Choose a new password to regain access to your account</CardDescription>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {initializing ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="h-4 w-4 animate-spin" />
              <span>Validating reset link…</span>
            </div>
          ) : initError ? (
            <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">
              <p className="font-medium">We couldn't verify this reset link.</p>
              <p className="text-sm mt-1">{initError}</p>
              <div className="mt-4">
                <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline font-medium">
                  Request a new password reset link
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(event) => setFormData((prev) => ({ ...prev, password: event.target.value }))}
                    required
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Must be at least 8 characters long.
                  </p>
                </div>
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(event) => setFormData((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                    required
                    disabled={submitting}
                  />
                </div>
              </div>

              {(hasSecurityQuestion1 || hasSecurityQuestion2) && (
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold">Security questions</h3>
                    <p className="text-sm text-muted-foreground">
                      Answer the questions you set up when you first created your password.
                    </p>
                  </div>

                  {hasSecurityQuestion1 && (
                    <div className="space-y-2">
                      <Label htmlFor="securityAnswer1">{securityQuestions[0]}</Label>
                      <Input
                        id="securityAnswer1"
                        type="text"
                        value={formData.securityAnswer1}
                        onChange={(event) => setFormData((prev) => ({ ...prev, securityAnswer1: event.target.value }))}
                        required
                        disabled={submitting}
                      />
                    </div>
                  )}

                  {hasSecurityQuestion2 && (
                    <div className="space-y-2">
                      <Label htmlFor="securityAnswer2">{securityQuestions[1]}</Label>
                      <Input
                        id="securityAnswer2"
                        type="text"
                        value={formData.securityAnswer2}
                        onChange={(event) => setFormData((prev) => ({ ...prev, securityAnswer2: event.target.value }))}
                        required
                        disabled={submitting}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Resetting password..." : "Reset password"}
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Remembered your password?{" "}
                  <Link to="/auth/login" className="text-primary hover:underline font-medium">
                    Back to login
                  </Link>
                </p>
              </div>
            </form>
          )}
        </CardContent>
        <CardFooter />
      </Card>
    </div>
  );
}


