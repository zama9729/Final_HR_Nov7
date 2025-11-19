import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Bot,
  Sparkles,
  Shield,
  FileText,
  Zap,
  ClipboardCheck,
} from "lucide-react";
import { RAGAssistant } from "@/components/RAGAssistant";
import { AIActionAssistant } from "@/components/AIActionAssistant";
import { AppLayout } from "@/components/layout/AppLayout";

export default function AIAssistantPage() {
  const [mode, setMode] = useState<"rag" | "actions">("rag");

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">AI Assistant</h1>
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as "rag" | "actions")}
          className="space-y-6"
        >
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="rag" className="flex-1 sm:flex-none">
              RAG Q&A
            </TabsTrigger>
            <TabsTrigger value="actions" className="flex-1 sm:flex-none">
              AI Actions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="rag" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Retrieval-Augmented Q&A
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Ask questions about uploaded HR policies and knowledge base
                  documents. Responses are grounded in your approved source
                  material.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Document-backed</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Answers cite the relevant document snippets for easy
                      verification.
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Policy Focused</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Optimised for handbooks, policy documents, and company
                      knowledge.
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Read-only</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Designed exclusively for answering questions – no actions
                      or tool execution.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-[600px]">
              <CardContent className="p-0 h-[600px]">
                <RAGAssistant embedded />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  AI Assistant for Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  Delegate operational HR tasks through natural language. The
                  assistant uses secure tool-calling to execute actions on your
                  behalf.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Zap className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Action Oriented</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Create leave requests, approve workflows, fetch balances,
                      and more.
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">Built-in Context</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Maintains conversation state per session and respects
                      role-based access.
                    </p>
                  </div>
                  <div className="bg-muted p-4 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="h-4 w-4 text-primary" />
                      <h3 className="font-semibold text-sm">
                        Secure Tool Calling
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Executes only authorised functions using your existing
                      authentication and RBAC.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-[600px]">
              <CardContent className="p-0 h-[600px]">
                <AIActionAssistant />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
