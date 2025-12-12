import { useState, useRef, useEffect, ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

import {
    Bot, Send, X, Loader2, MessageSquare, Trash2, Plus, Edit2, Check, XIcon,
    Sparkles, Shield, Zap, CalendarPlus, ClipboardList, Users, BarChart3, ShieldQuestion
} from "lucide-react";
import { format } from "date-fns";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

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
}

interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    created_at: string;
    updated_at: string;
}

interface UnifiedAssistantProps {
    embedded?: boolean;
}

const QUICK_ACTIONS: Array<{
    key: string;
    title: string;
    description: string;
    prompt: string;
    tooltip: string;
    icon: ComponentType<{ className?: string }>;
}> = [
        {
            key: "create_leave_request",
            title: "Create Leave Request",
            description: "Submit a new leave request.",
            prompt: "I need to create a leave request. Please ask me for the details.",
            tooltip: "Guides you through creating a leave request.",
            icon: CalendarPlus,
        },
        {
            key: "get_leave_balance",
            title: "Check Leave Balance",
            description: "See your remaining leave days.",
            prompt: "Check my leave balance.",
            tooltip: "Checks your current leave balance.",
            icon: ClipboardList,
        },
        {
            key: "get_dashboard_stats",
            title: "Dashboard Summary",
            description: "Key HR metrics overview.",
            prompt: "Get dashboard stats summary.",
            tooltip: "Shows a summary of key HR metrics.",
            icon: BarChart3,
        },
        {
            key: "list_employees",
            title: "Find Employee",
            description: "Search for an employee.",
            prompt: "Help me find an employee.",
            tooltip: "Search for employees by name or department.",
            icon: Users,
        },
    ];

export function UnifiedAssistant({ embedded = false }: UnifiedAssistantProps) {
    const [isOpen, setIsOpen] = useState(embedded);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(true);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
    const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const { toast } = useToast();

    // Load conversations from localStorage
    useEffect(() => {
        if (isOpen) {
            loadConversations();
        }
    }, [isOpen]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const loadConversations = () => {
        try {
            const stored = localStorage.getItem('unified_conversations');
            if (stored) {
                const convs = JSON.parse(stored);
                setConversations(convs);
            }
        } catch (error) {
            console.error('Error loading conversations:', error);
        }
    };

    const saveConversations = (convs: Conversation[]) => {
        try {
            localStorage.setItem('unified_conversations', JSON.stringify(convs));
            setConversations(convs);
        } catch (error) {
            console.error('Error saving conversations:', error);
        }
    };

    const loadConversation = (id: string) => {
        const conv = conversations.find(c => c.id === id);
        if (conv) {
            setMessages(conv.messages);
            setCurrentConversationId(id);
        }
    };

    const deleteConversation = (id: string) => {
        const updated = conversations.filter(c => c.id !== id);
        saveConversations(updated);
        if (currentConversationId === id) {
            setMessages([]);
            setCurrentConversationId(null);
        }
    };

    const updateConversationTitle = (id: string, title: string) => {
        const updated = conversations.map(c =>
            c.id === id ? { ...c, title } : c
        );
        saveConversations(updated);
        setEditingConversationId(null);
        setEditingTitle("");
    };

    const startNewConversation = () => {
        setMessages([]);
        setCurrentConversationId(null);
    };

    const saveCurrentConversation = (title?: string) => {
        if (messages.length === 0) return;

        const convTitle = title || messages[0]?.content?.substring(0, 50) || "New Conversation";
        const now = new Date().toISOString();

        if (currentConversationId) {
            // Update existing
            const updated = conversations.map(c =>
                c.id === currentConversationId
                    ? { ...c, messages, title: title || c.title, updated_at: now }
                    : c
            );
            saveConversations(updated);
        } else {
            // Create new
            const newConv: Conversation = {
                id: Date.now().toString(),
                title: convTitle,
                messages,
                created_at: now,
                updated_at: now,
            };
            saveConversations([...conversations, newConv]);
            setCurrentConversationId(newConv.id);
        }
    };

    const handleSend = async (overrideInput?: string) => {
        const userMessage = overrideInput || input.trim();
        if (!userMessage || isLoading) return;

        setInput("");

        // Add user message immediately
        const userMsg: Message = { role: "user", content: userMessage };
        setMessages((prev) => [...prev, userMsg]);
        setIsLoading(true);

        try {
            // Call Unified API (RAG + Tools)
            // We use queryRAG with useTools=true to enable both
            const response = await api.queryRAG(userMessage, undefined, true);

            // Add assistant response
            const assistantMsg: Message = {
                role: "assistant",
                content: response.answer || "I processed your request.",
                provenance: response.provenance,
                tool_calls: response.tool_calls,
            };

            setMessages((prev) => [...prev, assistantMsg]);

            // Save conversation
            saveCurrentConversation();

        } catch (error: any) {
            console.error("Query error:", error);
            let errorMessage = error?.message || "Sorry, I encountered an error. Please try again.";
            
            // Provide helpful message for RAG service unavailable
            if (errorMessage.includes('RAG service is not available')) {
                errorMessage = `AI Assistant is currently unavailable. The RAG service needs to be started.\n\nTo start it, run:\n\`cd rag-service && docker-compose up -d\``;
            }

            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: errorMessage },
            ]);

            toast({
                title: errorMessage.includes('RAG service') ? "Service Unavailable" : "Request Failed",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const startEditing = (conv: Conversation) => {
        setEditingConversationId(conv.id);
        setEditingTitle(conv.title || "");
    };

    const cancelEditing = () => {
        setEditingConversationId(null);
        setEditingTitle("");
    };

    const saveEditing = () => {
        if (editingConversationId && editingTitle.trim()) {
            updateConversationTitle(editingConversationId, editingTitle.trim());
        }
    };

    if (!isOpen && !embedded) {
        return (
            <div className="fixed bottom-6 right-6 z-50">
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-14 w-14 rounded-full shadow-lg hover:shadow-xl transition-shadow"
                    size="icon"
                >
                    <Bot className="h-6 w-6" />
                </Button>
            </div>
        );
    }

    return (
        <>
            <div className={`${embedded ? 'w-full h-full' : 'fixed bottom-6 right-6 w-[900px] max-w-[calc(100vw-3rem)] h-[700px] max-h-[calc(100vh-3rem)]'} ${embedded ? '' : 'shadow-2xl'} z-50 flex gap-0 bg-background rounded-lg border overflow-hidden`}>
                {/* Sidebar - Conversation History */}
                {/* Sidebar - Conversation History */}
                {showHistory && (
                    <aside className="w-64 border-r flex flex-col bg-muted/10">
                        <div className="p-3 border-b">
                            <div className="flex items-center justify-between">
                                <h3 className="font-medium text-sm">Conversations</h3>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={startNewConversation}
                                    className="h-7 w-7"
                                >
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <div className="flex-1 p-2 overflow-auto">
                            <div className="space-y-1">
                                {conversations.map((conv) => (
                                    <div
                                        key={conv.id}
                                        className={`group relative p-2 rounded-md cursor-pointer transition-colors ${currentConversationId === conv.id
                                            ? "bg-accent"
                                            : "hover:bg-accent/50"
                                            }`}
                                        onClick={() => loadConversation(conv.id)}
                                    >
                                        {editingConversationId === conv.id ? (
                                            <div className="flex items-center gap-1">
                                                <Input
                                                    value={editingTitle}
                                                    onChange={(e) => setEditingTitle(e.target.value)}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') saveEditing();
                                                        if (e.key === 'Escape') cancelEditing();
                                                    }}
                                                    className="h-7 text-xs px-2"
                                                    autoFocus
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        saveEditing();
                                                    }}
                                                >
                                                    <Check className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        cancelEditing();
                                                    }}
                                                >
                                                    <XIcon className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-xs font-medium truncate">
                                                            {conv.title || "New Conversation"}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                                                            {conv.messages[0]?.content?.substring(0, 30) || "No messages"}
                                                        </p>
                                                        <p className="text-[10px] text-muted-foreground mt-1">
                                                            {format(new Date(conv.updated_at), "MMM d, h:mm a")}
                                                        </p>
                                                    </div>
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                startEditing(conv);
                                                            }}
                                                        >
                                                            <Edit2 className="h-3 w-3" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="h-6 w-6 text-destructive"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setConversationToDelete(conv.id);
                                                                setDeleteDialogOpen(true);
                                                            }}
                                                        >
                                                            <Trash2 className="h-3 w-3" />
                                                        </Button>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                {conversations.length === 0 && (
                                    <div className="text-center text-muted-foreground py-8 text-xs">
                                        <MessageSquare className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                        <p>No conversations yet</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </aside>
                )}

                {/* Main Chat Area */}
                <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b">
                        <div className="flex items-center gap-2">
                            <Bot className="h-4 w-4" />
                            <span className="text-sm font-medium">Unified AI Assistant</span>
                            <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                <Sparkles className="h-3 w-3" />
                                RAG + Actions
                            </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setShowHistory(!showHistory)}
                                className="h-7 w-7"
                            >
                                <MessageSquare className="h-4 w-4" />
                            </Button>
                            {!embedded && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsOpen(false)}
                                    className="h-7 w-7"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <ScrollArea className="flex-1" ref={scrollRef}>
                        <div className="p-4 space-y-4">
                            {messages.length === 0 && (
                                <div className="space-y-6">
                                    <div className="text-center text-muted-foreground py-8">
                                        <Bot className="h-10 w-10 mx-auto mb-3 opacity-50" />
                                        <p className="text-sm mb-2">How can I help you today?</p>
                                        <p className="text-xs">I can answer questions about policies and perform HR actions.</p>
                                    </div>

                                    {/* Quick Actions */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto">
                                        {QUICK_ACTIONS.map((action) => {
                                            const Icon = action.icon;
                                            return (
                                                <TooltipProvider key={action.key}>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                className="justify-start h-auto py-3 px-4 text-left hover:border-primary/60"
                                                                onClick={() => handleSend(action.prompt)}
                                                            >
                                                                <div className="flex items-start gap-3">
                                                                    <Icon className="h-5 w-5 text-primary mt-0.5" />
                                                                    <div>
                                                                        <p className="text-sm font-medium">{action.title}</p>
                                                                        <p className="text-xs text-muted-foreground">{action.description}</p>
                                                                    </div>
                                                                </div>
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="text-xs">{action.tooltip}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg, idx) => (
                                <div key={idx} className="space-y-2">
                                    <div
                                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                                    >
                                        <div
                                            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === "user"
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-foreground"
                                                }`}
                                        >
                                            <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                                        </div>
                                    </div>

                                    {/* Assistant Extras: Provenance & Tool Calls */}
                                    {msg.role === "assistant" && (
                                        <div className="flex justify-start max-w-[85%]">
                                            <div className="space-y-2 w-full">
                                                {/* Tool Calls */}
                                                {msg.tool_calls && msg.tool_calls.length > 0 && (
                                                    <Card className="bg-muted/50 border-dashed">
                                                        <CardContent className="p-3 space-y-2">
                                                            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                                <Zap className="h-3 w-3" />
                                                                Actions Performed
                                                            </div>
                                                            {msg.tool_calls.map((tc, i) => (
                                                                <div key={i} className="text-xs space-y-1">
                                                                    <div className="flex items-center justify-between">
                                                                        <Badge variant="outline">{tc.name}</Badge>
                                                                        {tc.error ? (
                                                                            <Badge variant="destructive" className="text-[10px]">Failed</Badge>
                                                                        ) : (
                                                                            <Badge variant="secondary" className="text-[10px] bg-green-100 text-green-800 hover:bg-green-100">Success</Badge>
                                                                        )}
                                                                    </div>
                                                                    {tc.result && (
                                                                        <pre className="bg-background p-2 rounded border overflow-x-auto text-[10px] text-muted-foreground">
                                                                            {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
                                                                        </pre>
                                                                    )}
                                                                    {tc.error && (
                                                                        <p className="text-destructive">{tc.error}</p>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </CardContent>
                                                    </Card>
                                                )}

                                                {/* Provenance */}
                                                {msg.provenance?.snippets && msg.provenance.snippets.length > 0 && (
                                                    <Card className="bg-muted/50 border-dashed">
                                                        <CardContent className="p-3">
                                                            <details className="text-xs group">
                                                                <summary className="cursor-pointer flex items-center gap-2 text-muted-foreground hover:text-foreground">
                                                                    <Sparkles className="h-3 w-3" />
                                                                    <span>Sources & Confidence</span>
                                                                    <Badge variant={msg.provenance.confidence && msg.provenance.confidence > 0.7 ? "outline" : "secondary"} className="ml-auto text-[10px]">
                                                                        {msg.provenance.confidence ? `${(msg.provenance.confidence * 100).toFixed(0)}%` : 'N/A'}
                                                                    </Badge>
                                                                </summary>
                                                                <div className="mt-3 space-y-2">
                                                                    {msg.provenance.snippets.map((snippet, i) => (
                                                                        <div key={i} className="p-2 bg-background rounded border text-[10px] leading-relaxed text-muted-foreground">
                                                                            {snippet}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </details>
                                                        </CardContent>
                                                    </Card>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        <span className="text-xs text-muted-foreground">Processing request...</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </ScrollArea>

                    {/* Input */}
                    <div className="border-t p-3">
                        <div className="flex gap-2">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                                placeholder="Ask a question or request an action..."
                                disabled={isLoading}
                                className="text-sm"
                            />
                            <Button
                                onClick={() => handleSend()}
                                disabled={isLoading || !input.trim()}
                                size="icon"
                                className="h-9 w-9"
                            >
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Conversation</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this conversation? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (conversationToDelete) {
                                    deleteConversation(conversationToDelete);
                                    setConversationToDelete(null);
                                }
                                setDeleteDialogOpen(false);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
