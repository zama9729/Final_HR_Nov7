import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";

export default function ForgotPassword() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!email) {
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await api.requestPasswordReset(email);
      setIsSubmitted(true);
      toast({
        title: "Check your email",
        description: "If the email is registered, you'll receive instructions to reset your password shortly.",
      });

      if (response?.debugToken || response?.resetUrl) {
        const token = response.debugToken || new URL(response.resetUrl).searchParams.get("token");
        if (token) {
          navigate(`/auth/reset-password?token=${encodeURIComponent(token)}`, { replace: true });
        }
      }
    } catch (error: any) {
      console.error("Failed to request password reset:", error);
      toast({
        title: "Unable to send reset link",
        description: error.message || "Please try again later.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-md shadow-large">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl">Forgot Password</CardTitle>
            <CardDescription>Enter your email to receive a reset link</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                disabled={isSubmitting || isSubmitted}
              />
            </div>
            {isSubmitted && (
              <p className="text-sm text-muted-foreground">
                If your email is in our system, you'll receive a password reset link within the next few minutes.
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <Button type="submit" className="w-full" disabled={isSubmitting || isSubmitted}>
              {isSubmitting ? "Sending link..." : isSubmitted ? "Email sent" : "Send reset link"}
            </Button>
            <div className="text-sm text-center text-muted-foreground">
              Remembered your password?{" "}
              <Link to="/auth/login" className="text-primary hover:underline font-medium">
                Back to login
              </Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}


