import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Building2 } from "lucide-react";
import { z } from "zod";

const passwordSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  securityQuestion1: z.string().min(1, "Please select a security question"),
  securityAnswer1: z.string().min(2, "Answer must be at least 2 characters"),
  securityQuestion2: z.string().min(1, "Please select a security question"),
  securityAnswer2: z.string().min(2, "Answer must be at least 2 characters"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

const securityQuestions = [
  "What was the name of your first pet?",
  "In what city were you born?",
  "What is your mother's maiden name?",
  "What was the name of your elementary school?",
  "What is your favorite book?",
];

export default function SetupPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
    securityQuestion1: "",
    securityAnswer1: "",
    securityQuestion2: "",
    securityAnswer2: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    try {
      const validated = passwordSchema.parse(formData);
      setLoading(true);

      // Update password and remove needs_password_setup flag
      const { error: passwordError } = await supabase.auth.updateUser({
        password: validated.password,
        data: {
          needs_password_setup: false,
        }
      });

      if (passwordError) throw passwordError;

      // Update employee record
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { error: updateError } = await supabase
          .from('employees')
          .update({
            must_change_password: false,
            onboarding_status: 'in_progress',
          })
          .eq('user_id', user.id);

        if (updateError) throw updateError;

        // Store security questions (in a real app, hash these answers)
        const { error: securityError } = await supabase
          .from('profiles')
          .update({
            security_question_1: validated.securityQuestion1,
            security_answer_1: validated.securityAnswer1.toLowerCase(),
            security_question_2: validated.securityQuestion2,
            security_answer_2: validated.securityAnswer2.toLowerCase(),
          })
          .eq('id', user.id);

        if (securityError) console.error('Security questions error:', securityError);
      }

      toast({
        title: "Password set successfully",
        description: "Please log in with your new password",
      });

      // Sign out and redirect to login
      await supabase.auth.signOut();
      navigate('/auth/login');
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path) {
            fieldErrors[err.path[0]] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to set password",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <Card className="w-full max-w-2xl shadow-large">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center">
            <Building2 className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl">Set Up Your Password</CardTitle>
            <CardDescription>Create a secure password and set up security questions</CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                />
                {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  required
                />
                {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword}</p>}
              </div>
            </div>

            <div className="border-t pt-6 space-y-4">
              <h3 className="font-semibold">Security Questions</h3>
              <p className="text-sm text-muted-foreground">
                These will help you recover your account if you forget your password
              </p>

              <div className="space-y-2">
                <Label htmlFor="securityQuestion1">Security Question 1 *</Label>
                <select
                  id="securityQuestion1"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.securityQuestion1}
                  onChange={(e) => setFormData({ ...formData, securityQuestion1: e.target.value })}
                  required
                >
                  <option value="">Select a question</option>
                  {securityQuestions.map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                {errors.securityQuestion1 && <p className="text-sm text-destructive">{errors.securityQuestion1}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="securityAnswer1">Answer *</Label>
                <Input
                  id="securityAnswer1"
                  type="text"
                  value={formData.securityAnswer1}
                  onChange={(e) => setFormData({ ...formData, securityAnswer1: e.target.value })}
                  required
                />
                {errors.securityAnswer1 && <p className="text-sm text-destructive">{errors.securityAnswer1}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="securityQuestion2">Security Question 2 *</Label>
                <select
                  id="securityQuestion2"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.securityQuestion2}
                  onChange={(e) => setFormData({ ...formData, securityQuestion2: e.target.value })}
                  required
                >
                  <option value="">Select a question</option>
                  {securityQuestions.filter(q => q !== formData.securityQuestion1).map((q) => (
                    <option key={q} value={q}>{q}</option>
                  ))}
                </select>
                {errors.securityQuestion2 && <p className="text-sm text-destructive">{errors.securityQuestion2}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="securityAnswer2">Answer *</Label>
                <Input
                  id="securityAnswer2"
                  type="text"
                  value={formData.securityAnswer2}
                  onChange={(e) => setFormData({ ...formData, securityAnswer2: e.target.value })}
                  required
                />
                {errors.securityAnswer2 && <p className="text-sm text-destructive">{errors.securityAnswer2}</p>}
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Setting up..." : "Complete Setup"}
            </Button>
          </CardContent>
        </form>
      </Card>
    </div>
  );
}
