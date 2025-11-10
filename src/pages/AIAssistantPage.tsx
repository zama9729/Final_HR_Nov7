import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Sparkles, Shield, FileText, Zap } from "lucide-react";
import { RAGAssistant } from "@/components/RAGAssistant";
import { AppLayout } from "@/components/layout/AppLayout";

export default function AIAssistantPage() {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">RAG-Powered AI Assistant</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Your HR Assistant with RAG
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Get instant help with HR-related questions, policies, and procedures. Powered by RAG (Retrieval-Augmented Generation) for accurate, document-backed answers.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">RAG-Powered</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Answers backed by your organization's documents and policies with source citations.
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Smart Actions</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Can create leave requests, check balances, and perform HR actions automatically.
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Secure & Private</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  All conversations are organization-scoped with PII protection and audit logging.
                </p>
              </div>
              <div className="bg-muted p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-sm">Document-Aware</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Understands your uploaded policies, handbooks, and HR documents.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="min-h-[600px]">
          <CardContent className="p-0 h-[600px]">
            <RAGAssistant embedded={true} />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
