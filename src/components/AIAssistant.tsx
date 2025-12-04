import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sidebar, SidebarContent, SidebarHeader } from "@/components/ui/sidebar";
import { Bot, Send, X, Loader2, MessageSquare, Trash2, Plus, Edit2, Check, XIcon } from "lucide-react";
import { format } from "date-fns";
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

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  preview: string;
}

export function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

  // Load conversation history
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

  const loadConversations = async () => {
    try {
      const response = await fetch(`${API_URL}/api/ai/conversations`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (error) {
      console.error('Error loading conversations:', error);
    }
  };

  const loadConversation = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/ai/conversations/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data.conversation.messages || []);
        setCurrentConversationId(id);
      }
    } catch (error) {
      console.error('Error loading conversation:', error);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/api/ai/conversations/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
      });
      if (response.ok) {
        setConversations(conversations.filter(c => c.id !== id));
        if (currentConversationId === id) {
          setMessages([]);
          setCurrentConversationId(null);
        }
      }
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  };

  const updateConversationTitle = async (id: string, title: string) => {
    try {
      const response = await fetch(`${API_URL}/api/ai/conversations/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
        },
        body: JSON.stringify({ title }),
      });
      if (response.ok) {
        setConversations(conversations.map(c => 
          c.id === id ? { ...c, title } : c
        ));
        setEditingConversationId(null);
        setEditingTitle("");
      }
    } catch (error) {
      console.error('Error updating conversation title:', error);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
  };

  const streamChat = async (userMessage: string) => {
    const CHAT_URL = `${API_URL}/api/ai/chat`;
    
    const allMessages = [...messages, { role: "user" as const, content: userMessage }];
    
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem('auth_token') || ''}`,
      },
      body: JSON.stringify({ 
        messages: allMessages,
        enable_functions: true,
        conversation_id: currentConversationId,
      }),
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      throw new Error(`Failed to start stream: ${resp.status} ${errorText}`);
    }

    if (!resp.body) {
      throw new Error("Response body is null");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;
    let assistantContent = "";
    let receivedConversationId = currentConversationId;
    let hasStartedContent = false;

    // Add assistant message placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    while (!streamDone) {
      const { done, value } = await reader.read();
      if (done) {
        streamDone = true;
        break;
      }
      
      textBuffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
        let line = textBuffer.slice(0, newlineIndex);
        textBuffer = textBuffer.slice(newlineIndex + 1);

        // Clean up line
        if (line.endsWith("\r")) line = line.slice(0, -1);
        
        // Skip empty lines or comment lines
        if (line.trim() === "" || line.startsWith(":")) continue;
        
        // Must start with "data: "
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        
        // Handle done signal
        if (jsonStr === "[DONE]") {
          streamDone = true;
          break;
        }

        // Skip function call marker - just continue
        if (jsonStr === "[FUNCTION_CALL]") {
          continue;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          
          // Handle conversation ID
          if (parsed.conversation_id && !receivedConversationId) {
            receivedConversationId = parsed.conversation_id;
            setCurrentConversationId(parsed.conversation_id);
          }
          
          // Handle error
          if (parsed.error) {
            assistantContent = `Error: ${parsed.error}`;
            setMessages((prev) => {
              const newMessages = [...prev];
              newMessages[newMessages.length - 1].content = assistantContent;
              return newMessages;
            });
            break;
          }
          
          // Extract content from various possible structures
          const content = parsed.choices?.[0]?.delta?.content || 
                         parsed.choices?.[0]?.message?.content ||
                         parsed.content ||
                         parsed.message ||
                         (parsed.choices?.[0]?.message && parsed.choices[0].message.content);
          
          if (content && typeof content === 'string' && content.trim().length > 0) {
            hasStartedContent = true;
            assistantContent += content;
            
            // Force update messages state with new array
            setMessages((prev) => {
              const newMessages = [...prev];
              
              // Find and update the last assistant message
              let found = false;
              for (let i = newMessages.length - 1; i >= 0; i--) {
                if (newMessages[i].role === "assistant") {
                  newMessages[i] = { ...newMessages[i], content: assistantContent };
                  found = true;
                  break;
                }
              }
              
              // If no assistant message found, add one
              if (!found) {
                newMessages.push({ role: "assistant", content: assistantContent });
              }
              
              return [...newMessages]; // Force new array reference
            });
          }
        } catch (parseError) {
          // If it's not valid JSON, it might be a continuation - keep it in buffer
          if (jsonStr.startsWith("{") || jsonStr.startsWith("[")) {
            // Might be incomplete JSON, keep in buffer
            continue;
          }
          // Otherwise, skip invalid lines
          console.warn('Failed to parse line:', line, parseError);
        }
      }
    }

    // Ensure we have content in the assistant message
    if (assistantContent.trim() !== "") {
      // Ensure final content is set
      setMessages((prev) => {
        const newMessages = [...prev];
        for (let i = newMessages.length - 1; i >= 0; i--) {
          if (newMessages[i].role === "assistant") {
            newMessages[i] = {
              ...newMessages[i],
              content: assistantContent
            };
            break;
          }
        }
        return newMessages;
      });
    } else {
      // Remove empty assistant message
      setMessages((prev) => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && 
            newMessages[newMessages.length - 1].role === "assistant" && 
            newMessages[newMessages.length - 1].content === "") {
          newMessages.pop();
        }
        return newMessages;
      });
    }

    // Reload conversations after new message
    if (receivedConversationId) {
      loadConversations();
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    
    // Add user message immediately
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsLoading(true);

    try {
      await streamChat(userMessage);
    } catch (error: any) {
      console.error("Error:", error);
      const errorMessage = error?.message || "Sorry, I encountered an error. Please try again.";
      
      // Remove empty assistant message if it exists
      setMessages((prev) => {
        const newMessages = [...prev];
        // Remove last message if it's empty assistant message
        if (newMessages.length > 0 && 
            newMessages[newMessages.length - 1].role === "assistant" && 
            newMessages[newMessages.length - 1].content === "") {
          newMessages.pop();
        }
        // Add error message
        newMessages.push({ role: "assistant", content: errorMessage });
        return newMessages;
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

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="ai-chat-button flex items-center justify-center focus:outline-none"
        aria-label="Open AI Assistant"
      >
        <Bot className="h-7 w-7 text-[#E41E26] relative z-10" strokeWidth={2.5} />
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
        onClick={() => setIsOpen(false)}
      />
      {/* Chat Popup */}
      <div className="fixed bottom-24 right-6 w-[400px] h-[580px] shadow-2xl z-50 flex flex-col gap-0 bg-background rounded-2xl border overflow-hidden liquid-glass-dropdown">
        {/* Sidebar - Conversation History */}
        {showHistory && (
          <Sidebar className="w-48 border-r flex flex-col">
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
                              {conv.preview || "No messages"}
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

        {/* Main Chat Area - Minimal */}
        <div className="flex-1 flex flex-col">
          {/* Minimal Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="text-sm font-medium">HR Assistant</span>
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Chat Messages - Minimal */}
          <ScrollArea className="flex-1" ref={scrollRef}>
            <div className="p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Bot className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Ask me anything about HR, leaves, or policies</p>
                </div>
              )}
              {messages
                .filter(msg => msg.content || msg.role === "user")
                .map((msg, idx) => (
                  <div
                    key={idx}
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
                ))}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs text-muted-foreground">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Minimal Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                placeholder="Type your message..."
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
