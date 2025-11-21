import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Sparkles, Shield, FileText, Zap, ClipboardCheck, Compass, MessageCircle, Stars, CheckCircle } from "lucide-react";
import { RAGAssistant } from "@/components/RAGAssistant";
import { AIActionAssistant } from "@/components/AIActionAssistant";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AIAssistantPage() {
  const [mode, setMode] = useState<"rag" | "actions">("rag");
  const quickPrompts = useMemo(
    () =>
      mode === "rag"
        ? [
            "Summarise the latest leave policy update",
            "What is the POSH escalation workflow?",
            "Compare pre- and post-confirmation notice periods",
          ]
        : [
            "Log a WFH request for Alex tomorrow",
            "Approve pending timesheets for Sales",
            "Share attendance summary for this week",
          ],
    [mode]
  );

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Hero */}
        <section className="rounded-3xl border bg-gradient-to-r from-primary/10 via-background to-background p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" />
                Smarter HR Assistance
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">AI Assistant</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Use one workspace to ask policy questions, gather context, or delegate HR operations. The assistant keeps
                  conversations organised, cites sources, and executes only the actions you approve.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> RBAC aware
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Shield className="h-3 w-3" /> Data safe
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Stars className="h-3 w-3" /> Auto summaries
                </Badge>
              </div>
            </div>
            <div className="grid w-full grid-cols-2 gap-3 text-sm md:w-auto">
              {[
                { label: "Knowledge Sources", value: "36 synced docs" },
                { label: "Automations", value: "18 secure tools" },
                { label: "Avg. response", value: "< 3 sec" },
                { label: "This week", value: "412 queries" },
              ].map((stat) => (
                <Card key={stat.label} className="border-none bg-background/70 backdrop-blur">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-base font-semibold">{stat.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Mode switch + quick prompts */}
        <Tabs value={mode} onValueChange={(value) => setMode(value as "rag" | "actions")} className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <TabsList className="w-full overflow-hidden rounded-2xl bg-muted/60 p-1 sm:w-fit">
              <TabsTrigger value="rag" className="flex flex-1 items-center gap-2 rounded-xl data-[state=active]:bg-background">
                <Compass className="h-4 w-4" />
                Knowledge Q&A
              </TabsTrigger>
              <TabsTrigger value="actions" className="flex flex-1 items-center gap-2 rounded-xl data-[state=active]:bg-background">
                <Zap className="h-4 w-4" />
                Workflow Actions
              </TabsTrigger>
            </TabsList>
            <div className="flex flex-col gap-2 rounded-2xl border bg-card/50 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:text-sm">
              <MessageCircle className="h-4 w-4 text-primary" />
              <span>Try a quick prompt:</span>
              <div className="flex flex-wrap gap-2">
                {quickPrompts.map((prompt) => (
                  <Badge key={prompt} variant="outline" className="cursor-pointer rounded-full font-normal hover:bg-primary/10">
                    {prompt}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <TabsContent value="rag" className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  icon: Sparkles,
                  title: "Grounded answers",
                  description: "Every response cites the exact policy snippet so you can validate instantly.",
                },
                {
                  icon: FileText,
                  title: "Policy-first",
                  description: "Optimised for HR manuals, compliance documents, and onboarding guides.",
                },
                {
                  icon: Shield,
                  title: "Read-only mode",
                  description: "RAG can browse but never change data. Perfect for audits and FAQs.",
                },
              ].map((feature) => (
                <Card key={feature.title} className="h-full border-dashed">
                  <CardHeader className="flex flex-row items-center gap-3">
                    <feature.icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="min-h-[600px] overflow-hidden">
              <CardHeader className="border-b bg-muted/40">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4" />
                  Retrieval-Augmented Chat
                </CardTitle>
                <CardDescription>Ask natural questions. The assistant auto-organises conversations and saves transcripts.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 h-[600px]">
                <RAGAssistant embedded />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="actions" className="space-y-6">
            <section className="grid gap-4 lg:grid-cols-3">
              {[
                {
                  icon: Zap,
                  title: "Task automation",
                  description: "Approve requests, send reminders, or update teams without leaving chat.",
                },
                {
                  icon: ClipboardCheck,
                  title: "Context aware",
                  description: "Session memory keeps user intent, approvals, and previous tool responses handy.",
                },
                {
                  icon: Shield,
                  title: "RBAC compliant",
                  description: "Runs on your existing identity. Every action is logged and auditable.",
                },
              ].map((feature) => (
                <Card key={feature.title} className="h-full border-dashed">
                  <CardHeader className="flex flex-row items-center gap-3">
                    <feature.icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </section>

            <Card className="min-h-[600px] overflow-hidden">
              <CardHeader className="border-b bg-muted/40">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4" />
                  AI Assistant for Actions
                </CardTitle>
                <CardDescription>Describe the outcome you want. The assistant orchestrates the right secured tools for you.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 h-[600px]">
                <AIActionAssistant />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Guidance section */}
        <section className="rounded-3xl border bg-card/60 p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                title: "When to use RAG?",
                bullets: ["Policy clarifications", "Onboarding FAQs", "HR compliance audits"],
              },
              {
                title: "When to use Actions?",
                bullets: ["Approve/trigger workflows", "Fetch KPIs instantly", "Update employee records"],
              },
              {
                title: "Tips",
                bullets: ["Start with verbs (\"Show\", \"Create\")", "Reference employee names/teams", "Add due dates in text"],
              },
            ].map((section) => (
              <div key={section.title} className="rounded-2xl bg-background/80 p-4">
                <h3 className="text-sm font-semibold">{section.title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
