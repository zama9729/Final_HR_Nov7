import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export default function OnboardingNextStep() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Next Steps</CardTitle>
            <CardDescription>Your documents were submitted successfully.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Our HR team will review your information and reach out if anything else is needed. You can
              continue to the dashboard to explore the rest of the workspace.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button onClick={() => navigate("/dashboard")} className="w-full sm:w-auto">
                Go to dashboard
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/onboarding")}
                className="w-full sm:w-auto"
              >
                Review onboarding
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

