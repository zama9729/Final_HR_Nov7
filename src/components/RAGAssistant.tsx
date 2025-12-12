import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bot, Send, X, Loader2, MessageSquare, Trash2, Plus, Edit2, Check, XIcon, FileText, Sparkles, Shield, ListFilter } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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

interface RAGAssistantProps {
  embedded?: boolean; // If true, always open and not floating
}

const QUICK_PROMPTS = [
  "Summarise the leave policy in two sentences",
  "Does our POSH policy cover third-party vendors?",
  "What documents are needed for onboarding contractors?",
  "Show the process for internal transfers",
];

const SAFETY_CARDS = [
  {
    title: "Source citations",
    description: "Every answer links back to the original handbook or uploaded PDF so reviewers can verify quickly.",
    icon: FileText,
  },
  {
    title: "Policy first",
    description: "Trained on internal HR, legal, and onboarding docs - not generic internet content.",
    icon: Sparkles,
  },
  {
    title: "Read-only",
    description: "This assistant never executes tools or edits data. Perfect for audits and employee FAQs.",
    icon: Shield,
  },
];

export function RAGAssistant({ embedded = false }: RAGAssistantProps) {
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
  const composerRef = useRef<HTMLInputElement>(null);
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
      const stored = localStorage.getItem('rag_conversations');
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
      localStorage.setItem('rag_conversations', JSON.stringify(convs));
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

  const handleSend = async (promptOverride?: string) => {
    const messageText = (promptOverride ?? input).trim();
    if (!messageText || isLoading) return;

    if (!promptOverride) {
      setInput("");
    } else {
      setInput("");
    }
    const userMessage = messageText;
    
    // Add user message immediately
    const userMsg: Message = { role: "user", content: userMessage };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);

    try {
      // Call RAG API
      const response = await api.queryRAG(userMessage, undefined, true);
      
      // Add assistant response with provenance
      const assistantMsg: Message = {
        role: "assistant",
        content: response.answer || "I couldn't generate a response.",
        provenance: response.provenance,
        tool_calls: response.tool_calls,
      };
      
      setMessages((prev) => [...prev, assistantMsg]);
      
      // Save conversation
      saveCurrentConversation();
      
      // Show confidence warning if low
      if (response.provenance?.confidence && response.provenance.confidence < 0.6) {
        toast({
          title: "Low Confidence Response",
          description: "The answer may not be fully accurate. Please verify with HR if needed.",
          variant: "default",
        });
      }
    } catch (error: any) {
      console.error("RAG query error:", error);
      let errorMessage = error?.message || "Sorry, I encountered an error. Please try again.";
      let errorTitle = "Query Failed";
      
      // Provide helpful message for RAG service unavailable
      if (errorMessage.includes('RAG service is not available')) {
        errorTitle = "Service Unavailable";
        errorMessage = "AI Assistant is currently unavailable. The RAG service needs to be started.\n\nTo start it, run:\ncd rag-service && docker-compose up -d";
      }
      
      setMessages((prev) => [
        ...prev,
        { 
          role: "assistant", 
          content: errorMessage.includes('RAG service') 
            ? "AI Assistant is currently unavailable. Please start the RAG service to use this feature."
            : `Error: ${errorMessage}` 
        },
      ]);
      
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    handleSend(prompt);
    composerRef.current?.focus();
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
      <div
        className={`${
          embedded
            ? "w-full h-full"
            : "fixed bottom-6 right-6 w-[min(1000px,calc(100vw-2rem))] h-[min(720px,calc(100vh-2rem))]"
        } ${embedded ? "" : "shadow-2xl"} z-50 rounded-3xl border bg-background/95 backdrop-blur`}
      >
        <div className="flex h-full flex-col gap-4 p-4 lg:grid lg:grid-cols-[280px,minmax(0,1fr)] lg:gap-6">
          {/* Conversation / helper panel */}
          <div
            className={`${
              showHistory ? "flex" : "hidden lg:flex"
            } flex-col gap-4 rounded-2xl border bg-card/40 p-3 lg:p-4`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Workspace</p>
                <p className="text-base font-semibold">Conversations</p>
              </div>
              <Button variant="secondary" size="icon" className="h-8 w-8" onClick={startNewConversation}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="grow">
              <ScrollArea className="h-52 lg:h-[320px]">
                <div className="space-y-1">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`rounded-xl border px-3 py-2 text-sm transition hover:border-primary/40 ${
                        currentConversationId === conv.id
                          ? "border-primary bg-primary/5"
                          : "border-border/70"
                      }`}
                    >
                      {editingConversationId === conv.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEditing();
                              if (e.key === "Escape") cancelEditing();
                            }}
                            className="h-8 text-xs"
                            autoFocus
                          />
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEditing}>
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditing}>
                            <XIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          className="flex w-full items-start justify-between text-left"
                          onClick={() => loadConversation(conv.id)}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{conv.title || "New Conversation"}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {conv.messages[0]?.content?.substring(0, 30) || "No messages yet"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {format(new Date(conv.updated_at), "MMM d, h:mm a")}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1">
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
                        </button>
                      )}
                    </div>
                  ))}
                  {conversations.length === 0 && (
                    <div className="rounded-2xl border border-dashed p-4 text-center text-xs text-muted-foreground">
                      <MessageSquare className="mx-auto mb-2 h-6 w-6 opacity-60" />
                      Start a new conversation to see it listed here.
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">Quick prompts</p>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => composerRef.current?.focus()}>
                  Type & Ask
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="outline"
                    className="h-auto rounded-full px-3 py-1 text-xs"
                    onClick={() => handleQuickPrompt(prompt)}
                    disabled={isLoading}
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {SAFETY_CARDS.map((card) => (
                <Card key={card.title} className="bg-muted/40">
                  <CardHeader className="flex flex-row items-center gap-2 py-3">
                    <card.icon className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">{card.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 text-xs text-muted-foreground">{card.description}</CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Chat panel */}
          <div className="flex flex-col rounded-2xl border bg-card/80 backdrop-blur">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Bot className="h-4 w-4" />
                Retrieval Q&A
                <Badge variant="secondary" className="text-[10px]">
                  <Sparkles className="mr-1 h-3 w-3" />
                  Document cited
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 lg:hidden"
                  onClick={() => setShowHistory((prev) => !prev)}
                >
                  <ListFilter className="h-4 w-4" />
                </Button>
                {!embedded && (
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsOpen(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="space-y-4 p-4">
                {messages.length === 0 && (
                  <Card className="border-dashed text-center text-muted-foreground">
                    <CardContent className="py-10">
                      <Bot className="mx-auto mb-3 h-10 w-10 opacity-50" />
                      <p className="text-sm">Ask anything about your uploaded HR policies and documents.</p>
                    </CardContent>
                  </Card>
                )}

                {messages.map((msg, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                          msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                      </div>
                    </div>

                    {msg.role === "assistant" && (msg.provenance || msg.tool_calls) && (
                      <Card className="max-w-[80%] border-l-4 border-primary bg-muted/40 pl-3 text-xs">
                        <CardContent className="space-y-2 p-3">
                          {msg.provenance?.confidence && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              Confidence
                              <Badge variant={msg.provenance.confidence > 0.7 ? "default" : "secondary"}>
                                {(msg.provenance.confidence * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          )}
                          {msg.tool_calls && msg.tool_calls.length > 0 && (
                            <div>
                              <p className="text-muted-foreground">Tools referenced</p>
                              <div className="mt-1 flex flex-wrap gap-1">
                                {msg.tool_calls.map((tc, i) => (
                                  <Badge key={i} variant="outline" className="text-[10px]">
                                    {tc.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {msg.provenance?.snippets && msg.provenance.snippets.length > 0 && (
                            <details className="rounded-md bg-background/60 p-2">
                              <summary className="cursor-pointer text-muted-foreground">Sources</summary>
                              <div className="mt-2 space-y-2">
                                {msg.provenance.snippets.map((snippet, i) => (
                                  <div key={i} className="rounded-md bg-muted/60 p-2">
                                    {snippet}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Searching documents…
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>

            <div className="border-t bg-background/50 p-3">
              <div className="flex gap-2">
                <Input
                  ref={composerRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Ask about your HR docs…"
                  disabled={isLoading}
                  className="text-sm"
                />
                <Button onClick={() => handleSend()} disabled={isLoading || !input.trim()} size="icon" className="h-9 w-9">
                  <Send className="h-4 w-4" />
                </Button>
              </div>
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

