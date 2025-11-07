import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Sparkles, Shield } from "lucide-react";
import { AIAssistant } from "@/components/AIAssistant";
import { AppLayout } from "@/components/layout/AppLayout";

export default function AIAssistantPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">AI Assistant</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Your HR Assistant
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Get instant help with HR-related questions, policies, and procedures. The AI assistant is here to help you navigate the platform.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Smart & Contextual</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  I know who you are! Just ask naturally - no need to mention your name or employee ID.
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Secure & Private</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  All conversations are organization-scoped and private to your account.
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Always Available</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Access the AI assistant from the floating chat button or this page.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="min-h-[600px]">
          <AIAssistant />
        </div>
      </div>
    </AppLayout>
  );
}
