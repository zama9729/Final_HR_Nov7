import { useState, useRef, useEffect } from "react";
import {
    Bot, Sparkles, Shield, FileText, Zap,
    MessageCircle, Send, Plus, ChevronRight,
    Lightbulb, Pin, Clock, MoreHorizontal,
    ArrowUpRight, CheckCircle2, Search, User
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Message {
    role: "user" | "assistant";
    content: string;
    provenance?: {
        top_doc_ids?: string[];
        chunk_ids?: string[];
        snippets?: string[];
        confidence?: number;
    };
    tool_calls?: Array<{
        name: string;
        result?: any;
        error?: string;
    }>;
    timestamp: Date;
}

const QUICK_PROMPTS = [
    { id: 1, text: "Summarise the latest leave policy update", pinned: true },
    { id: 2, text: "What is the POSH escalation workflow?", pinned: true },
    { id: 3, text: "Compare pre- and post-confirmation notice periods", pinned: false },
    { id: 4, text: "Log a WFH request for Alex tomorrow", pinned: false },
    { id: 5, text: "Approve pending timesheets for Sales", pinned: false },
];

const TIPS = [
    {
        title: "Be specific",
        description: "Mention employee names and dates for faster actions.",
        icon: Lightbulb,
    },
    {
        title: "Use keywords",
        description: "Try 'Show', 'Create', or 'Approve' to trigger workflows.",
        icon: Zap,
    },
];

export function UnifiedAssistantWorkspace() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [expandedCitation, setExpandedCitation] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async (textOverride?: string) => {
        const text = (textOverride || input).trim();
        if (!text || isLoading) return;

        if (!textOverride) setInput("");

        const userMsg: Message = {
            role: "user",
            content: text,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setIsLoading(true);

        try {
            // Determine if this looks like an action or a query
            // For now, we'll use the generic RAG endpoint which handles tools too
            const response = await api.queryRAG(text, undefined, true);

            const assistantMsg: Message = {
                role: "assistant",
                content: response.answer || "I couldn't generate a response.",
                provenance: response.provenance,
                tool_calls: response.tool_calls,
                timestamp: new Date()
            };

            setMessages(prev => [...prev, assistantMsg]);
        } catch (error: any) {
            console.error("AI Error:", error);
            toast({
                title: "Error",
                description: error.message || "Failed to get response",
                variant: "destructive"
            });
            setMessages(prev => [...prev, {
                role: "assistant",
                content: "Sorry, I encountered an error. Please try again.",
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="flex h-[calc(100vh-6rem)] gap-6">
            {/* Left Panel - 30% */}
            <div className="hidden w-[300px] flex-col gap-6 lg:flex shrink-0">
                {/* Quick Prompts */}
                <Card className="border-none shadow-sm bg-white/50">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                            <Zap className="h-4 w-4 text-amber-500" />
                            Quick Prompts
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                        {QUICK_PROMPTS.slice(0, 5).map((prompt) => (
                            <button
                                key={prompt.id}
                                onClick={() => handleSend(prompt.text)}
                                className="text-left text-xs p-2.5 rounded-lg hover:bg-slate-100 transition-colors border border-transparent hover:border-slate-200 group relative"
                            >
                                <span className="line-clamp-2 text-slate-700">{prompt.text}</span>
                                {prompt.pinned && (
                                    <Pin className="h-3 w-3 text-slate-400 absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                            </button>
                        ))}
                        <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground mt-1">
                            View all prompts
                        </Button>
                    </CardContent>
                </Card>

                {/* Knowledge & Tips */}
                <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                        Knowledge & Tips
                    </h3>
                    {TIPS.map((tip) => (
                        <Card key={tip.title} className="border-none shadow-sm bg-blue-50/50">
                            <CardContent className="p-4 flex gap-3">
                                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                                    <tip.icon className="h-4 w-4 text-blue-600" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{tip.title}</p>
                                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                        {tip.description}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Expanded Citation Panel (Conditional) */}
                {expandedCitation !== null && messages[expandedCitation]?.provenance?.snippets && (
                    <Card className="flex-1 border-l-4 border-l-blue-500 shadow-md animate-in slide-in-from-left-2">
                        <CardHeader className="py-3 bg-slate-50 border-b">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <FileText className="h-4 w-4 text-blue-600" />
                                    Source Citations
                                </CardTitle>
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedCitation(null)}>
                                    <span className="sr-only">Close</span>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardHeader>
                        <ScrollArea className="h-[200px]">
                            <div className="p-4 space-y-4">
                                {messages[expandedCitation].provenance!.snippets!.map((snippet, idx) => (
                                    <div key={idx} className="text-xs text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        {snippet}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>
                    </Card>
                )}
            </div>

            {/* Main Workspace - 70% */}
            <div className="flex-1 flex flex-col min-w-0 bg-white rounded-3xl border shadow-sm overflow-hidden relative">
                {/* Header / KPIs */}
                <div className="h-16 border-b flex items-center justify-between px-6 bg-white/80 backdrop-blur z-10">
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shadow-sm">
                            <Bot className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold text-slate-900">AI Assistant</h2>
                            <p className="text-xs text-slate-500 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                Online & Ready
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {[
                            { label: "Knowledge", value: "36 Docs", icon: FileText },
                            { label: "Tools", value: "18 Active", icon: Zap },
                            { label: "Avg Time", value: "< 3s", icon: Clock },
                        ].map((stat) => (
                            <div key={stat.label} className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100">
                                <stat.icon className="h-3.5 w-3.5 text-slate-500" />
                                <div className="flex flex-col leading-none">
                                    <span className="text-[10px] text-slate-400 font-medium uppercase">{stat.label}</span>
                                    <span className="text-xs font-semibold text-slate-700">{stat.value}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Chat Area */}
                <ScrollArea className="flex-1 p-6" ref={scrollRef}>
                    <div className="max-w-3xl mx-auto space-y-8 pb-4">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-[400px] text-center space-y-6">
                                <div className="h-20 w-20 rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center shadow-inner">
                                    <Sparkles className="h-10 w-10 text-blue-600" />
                                </div>
                                <div className="space-y-2 max-w-md">
                                    <h3 className="text-xl font-semibold text-slate-900">How can I help you today?</h3>
                                    <p className="text-sm text-slate-500">
                                        I can help you find policy information, manage leave requests,
                                        or analyze team attendance data.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 gap-3 w-full max-w-lg">
                                    {QUICK_PROMPTS.slice(0, 4).map((p) => (
                                        <button
                                            key={p.id}
                                            onClick={() => handleSend(p.text)}
                                            className="text-xs text-left p-3 rounded-xl border bg-white hover:bg-slate-50 hover:border-blue-200 transition-all shadow-sm"
                                        >
                                            {p.text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            messages.map((msg, idx) => (
                                <div key={idx} className={cn(
                                    "flex gap-4",
                                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                )}>
                                    {/* Avatar */}
                                    <div className={cn(
                                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                                        msg.role === "user" ? "bg-slate-900" : "bg-blue-600"
                                    )}>
                                        {msg.role === "user" ? (
                                            <span className="text-xs text-white font-medium">ME</span>
                                        ) : (
                                            <Bot className="h-4 w-4 text-white" />
                                        )}
                                    </div>

                                    {/* Message Bubble */}
                                    <div className={cn(
                                        "flex flex-col gap-2 max-w-[80%]",
                                        msg.role === "user" ? "items-end" : "items-start"
                                    )}>
                                        <div className={cn(
                                            "rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm",
                                            msg.role === "user"
                                                ? "bg-slate-900 text-white rounded-tr-none"
                                                : "bg-white border border-slate-100 text-slate-800 rounded-tl-none"
                                        )}>
                                            <p className="whitespace-pre-wrap">{msg.content}</p>
                                        </div>

                                        {/* Assistant Extras (Citations, Tools) */}
                                        {msg.role === "assistant" && (
                                            <div className="flex flex-wrap gap-2 px-1">
                                                {msg.provenance?.snippets && msg.provenance.snippets.length > 0 && (
                                                    <button
                                                        onClick={() => setExpandedCitation(expandedCitation === idx ? null : idx)}
                                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-full transition-colors"
                                                    >
                                                        <FileText className="h-3 w-3" />
                                                        Sources ({msg.provenance.snippets.length})
                                                    </button>
                                                )}
                                                {msg.tool_calls?.map((tool, i) => (
                                                    <Badge key={i} variant="outline" className="gap-1 bg-white text-xs font-normal text-slate-600">
                                                        <Zap className="h-3 w-3 text-amber-500" />
                                                        Executed: {tool.name}
                                                    </Badge>
                                                ))}
                                                <span className="text-[10px] text-slate-400 py-1">
                                                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}

                        {isLoading && (
                            <div className="flex gap-4">
                                <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-sm">
                                    <Bot className="h-4 w-4 text-white" />
                                </div>
                                <div className="bg-white border border-slate-100 rounded-2xl rounded-tl-none px-5 py-4 shadow-sm flex items-center gap-2">
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Sticky Input Area */}
                <div className="p-4 bg-white border-t">
                    <div className="max-w-3xl mx-auto relative">
                        <div className="relative flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-[20px] p-2 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-400 transition-all">
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full text-slate-500 hover:text-blue-600 hover:bg-blue-50 shrink-0 mb-0.5">
                                        <Plus className="h-5 w-5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="w-56">
                                    <DropdownMenuLabel>Workflow Actions</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Leave & Attendance</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleSend("Call get_my_leave_requests and present my recent leave requests with their status.")}>
                                        <Clock className="mr-2 h-4 w-4" /> My Leave Requests
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("Show leave requests waiting for my approval.")}>
                                        <CheckCircle2 className="mr-2 h-4 w-4" /> Pending Approvals
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("Show my attendance summary for this month.")}>
                                        <Clock className="mr-2 h-4 w-4" /> Attendance Summary
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("I need to regularize my attendance for yesterday.")}>
                                        <CheckCircle2 className="mr-2 h-4 w-4" /> Regularize Attendance
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Payroll</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleSend("Estimate tax deduction for a bonus of 50000.")}>
                                        <FileText className="mr-2 h-4 w-4" /> Tax Estimator
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("Download my payslip for last month.")}>
                                        <ArrowUpRight className="mr-2 h-4 w-4" /> Download Payslip
                                    </DropdownMenuItem>

                                    <DropdownMenuSeparator />
                                    <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Organization</DropdownMenuLabel>
                                    <DropdownMenuItem onClick={() => handleSend("Fetch key HR metrics for my organisation.")}>
                                        <ArrowUpRight className="mr-2 h-4 w-4" /> Dashboard Summary
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("List employees in the Engineering department.")}>
                                        <Search className="mr-2 h-4 w-4" /> List Employees
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("Find employee profile for...")}>
                                        <User className="mr-2 h-4 w-4" /> Find Employee
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleSend("Show my org chart.")}>
                                        <User className="mr-2 h-4 w-4" /> Org Chart
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <Input
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Ask anything or type '/' for commands..."
                                className="border-none bg-transparent shadow-none focus-visible:ring-0 min-h-[44px] py-3 text-base"
                            />

                            <Button
                                onClick={() => handleSend()}
                                disabled={!input.trim() || isLoading}
                                className="h-9 w-9 rounded-full shrink-0 mb-0.5 bg-blue-600 hover:bg-blue-700 text-white shadow-md disabled:opacity-50 disabled:shadow-none transition-all"
                                size="icon"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                            <p className="text-[10px] text-center text-slate-400 mt-2">
                                AI can make mistakes. Please review critical actions.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
            );
}
