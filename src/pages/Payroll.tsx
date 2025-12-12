import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink } from "lucide-react";

export default function Payroll() {
  const { toast } = useToast();

  useEffect(() => {
    // Automatically redirect to Payroll app via SSO
    handleRedirectToPayroll();
  }, []);

  const handleRedirectToPayroll = async () => {
    try {
      const result = await api.getPayrollSso();
      if (result?.redirectUrl) {
        // Open Payroll app in new tab
        window.open(result.redirectUrl, '_blank');
        toast({
          title: "Redirecting to Payroll",
          description: "Opening Payroll application in a new tab...",
        });
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (error: any) {
      console.error('Payroll SSO error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to access Payroll. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Payroll Access</CardTitle>
            <CardDescription>
              Redirecting you to the Payroll application...
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                If you are not redirected automatically, click the button below.
              </p>
              <Button onClick={handleRedirectToPayroll} className="w-full">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Payroll App
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

