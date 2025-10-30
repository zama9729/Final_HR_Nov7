import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";
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
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Get instant help with HR-related questions, policies, and procedures. The AI assistant is here to help you navigate the platform.
          </p>
          <div className="bg-muted p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              You can also access the AI assistant from the floating chat button at the bottom right of any page.
            </p>
          </div>
        </CardContent>
      </Card>

      <AIAssistant />
      </div>
    </AppLayout>
  );
}
