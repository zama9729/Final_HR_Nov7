import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Bot, Send, X, Loader2, MessageSquare, Trash2, Plus, Edit2, Check, XIcon, FileText, Sparkles, Shield } from "lucide-react";
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

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
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
      const errorMessage = error?.message || "Sorry, I encountered an error. Please try again.";
      
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${errorMessage}` },
      ]);
      
      toast({
        title: "Query Failed",
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
        {showHistory && (
          <Sidebar className="w-64 border-r flex flex-col">
            <SidebarHeader className="p-3 border-b">
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
            </SidebarHeader>
            <SidebarContent className="flex-1 p-2 overflow-auto">
              <div className="space-y-1">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group relative p-2 rounded-md cursor-pointer transition-colors ${
                      currentConversationId === conv.id
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
            </SidebarContent>
          </Sidebar>
        )}

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-medium">RAG HR Assistant</span>
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                RAG Enabled
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
                <div className="text-center text-muted-foreground py-12">
                  <Bot className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm mb-2">Ask me anything about HR, leaves, or policies</p>
                  <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                    <div className="flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      <span>RAG-powered</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Shield className="h-3 w-3" />
                      <span>Secure & Private</span>
                    </div>
                  </div>
                </div>
              )}
              {messages.map((msg, idx) => (
                <div key={idx} className="space-y-2">
                  <div
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-foreground"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                  
                  {/* Show provenance and tool calls for assistant messages */}
                  {msg.role === "assistant" && (msg.provenance || msg.tool_calls) && (
                    <div className="flex justify-start">
                      <Card className="max-w-[75%] p-2 text-xs">
                        <CardContent className="p-2 space-y-2">
                          {msg.provenance?.confidence && (
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground">Confidence:</span>
                              <Badge
                                variant={msg.provenance.confidence > 0.7 ? "default" : "secondary"}
                              >
                                {(msg.provenance.confidence * 100).toFixed(0)}%
                              </Badge>
                            </div>
                          )}
                          {msg.tool_calls && msg.tool_calls.length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Tools used:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {msg.tool_calls.map((tc, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {tc.name}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                          {msg.provenance?.snippets && msg.provenance.snippets.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground">
                                Sources ({msg.provenance.snippets.length})
                              </summary>
                              <div className="mt-2 space-y-1">
                                {msg.provenance.snippets.map((snippet, i) => (
                                  <div key={i} className="p-2 bg-muted rounded text-xs">
                                    {snippet}
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs text-muted-foreground">Querying RAG service...</span>
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
                placeholder="Ask about leave policies, paystubs, or HR questions..."
                disabled={isLoading}
                className="text-sm"
              />
              <Button
                onClick={handleSend}
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

