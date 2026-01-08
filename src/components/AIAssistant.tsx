import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  // ✅ 1. LOCK BACKGROUND SCROLL WHEN CHAT IS OPEN (MOST IMPORTANT)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // ✅ FIX AUTO-SCROLL (NOW IT WILL ACTUALLY WORK)
  useEffect(() => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages.length]);

  // Load conversation history and current conversation
  useEffect(() => {
    if (isOpen) {
      // Try to restore last conversation ID from localStorage
      const savedConvId = localStorage.getItem('ai_current_conversation_id');
      if (savedConvId) {
        setCurrentConversationId(savedConvId);
      }
      loadConversations();
    }
  }, [isOpen]);

  // Load conversation messages when currentConversationId changes
  useEffect(() => {
    if (currentConversationId && isOpen && messages.length === 0) {
      loadConversation(currentConversationId);
    }
  }, [currentConversationId, isOpen]);

  useEffect(() => {
    // Scroll to bottom when messages change or loading state changes
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        // Use setTimeout to ensure DOM is updated
        setTimeout(() => {
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: 'smooth'
          });
        }, 100);
      }
    }
  }, [messages, isLoading]);
  const loadConversations = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.warn('[AI Assistant] No auth token, skipping conversations load');
        return;
      }

      const response = await fetch(`${API_URL}/api/ai/conversations`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const convs = data.conversations || [];
        setConversations(convs);
      } else if (response.status === 401) {
        console.warn('[AI Assistant] Unauthorized when loading conversations');
      }
    } catch (error) {
      console.error('[AI Assistant] Error loading conversations:', error);
      // Don't show error to user, just log it
    }
  };

  const loadConversation = async (id: string) => {
    if (!id) return;
    
    try {
      const token = localStorage.getItem('auth_token');
      if (!token) {
        console.warn('[AI Assistant] No auth token, skipping conversation load');
        return;
      }

      const response = await fetch(`${API_URL}/api/ai/conversations/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const conversationMessages = data.conversation?.messages || [];
        if (conversationMessages.length > 0) {
          setMessages(conversationMessages);
          setCurrentConversationId(id);
          localStorage.setItem('ai_current_conversation_id', id);
        }
      } else if (response.status === 404) {
        // Conversation not found, clear it
        console.warn('[AI Assistant] Conversation not found:', id);
        setCurrentConversationId(null);
        localStorage.removeItem('ai_current_conversation_id');
        setMessages([]);
      } else if (response.status === 401) {
        // Unauthorized - clear token and conversation
        console.warn('[AI Assistant] Unauthorized, clearing conversation');
        setCurrentConversationId(null);
        localStorage.removeItem('ai_current_conversation_id');
        setMessages([]);
      }
    } catch (error) {
      console.error('[AI Assistant] Error loading conversation:', error);
      // Don't clear on network errors, might be temporary
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
    localStorage.removeItem('ai_current_conversation_id');
  };

  const streamChat = async (userMessage: string) => {
    const CHAT_URL = `${API_URL}/api/ai/chat`;
    const token = localStorage.getItem('auth_token');
    
    if (!token) {
      throw new Error("Authentication required. Please log in again.");
    }
    
    const allMessages = [...messages, { role: "user" as const, content: userMessage }];
    
    let resp: Response;
    try {
      resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          messages: allMessages,
          enable_functions: true,
          conversation_id: currentConversationId,
        }),
      });
    } catch (fetchError: any) {
      console.error('[AI Assistant] Fetch error:', fetchError);
      if (fetchError.message?.includes('Failed to fetch') || fetchError.name === 'TypeError') {
        throw new Error("Cannot connect to the server. Please check your connection and ensure the API server is running.");
      }
      throw new Error(`Network error: ${fetchError.message || 'Unknown error'}`);
    }

    if (!resp.ok) {
      let errorText = '';
      try {
        errorText = await resp.text();
      } catch (e) {
        errorText = `HTTP ${resp.status} ${resp.statusText}`;
      }
      
      if (resp.status === 401) {
        throw new Error("Authentication failed. Please log in again.");
      } else if (resp.status === 403) {
        throw new Error("You don't have permission to use the AI Assistant.");
      } else if (resp.status === 500) {
        throw new Error("Server error. Please try again later.");
      }
      
      throw new Error(`Failed to start chat: ${errorText || `HTTP ${resp.status}`}`);
    }

    if (!resp.body) {
      throw new Error("Server returned an empty response. Please try again.");
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let textBuffer = "";
    let streamDone = false;
    let assistantContent = "";
    let receivedConversationId = currentConversationId;
    let hasStartedContent = false;
    let hasError = false;

    // Add assistant message placeholder
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      while (!streamDone) {
        let readResult;
        try {
          readResult = await reader.read();
        } catch (readError: any) {
          console.error('[AI Assistant] Read error:', readError);
          throw new Error(`Stream read error: ${readError.message || 'Connection interrupted'}`);
        }
        
        const { done, value } = readResult;
        
        if (done) {
          streamDone = true;
          break;
        }
        
        if (value) {
          textBuffer += decoder.decode(value, { stream: true });
        }

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          // Clean up line
          if (line.endsWith("\r")) line = line.slice(0, -1);
          
          // Skip empty lines or comment lines
          if (line.trim() === "" || line.startsWith(":")) continue;
          
          // Must start with "data: "
          if (!line.startsWith("data: ")) {
            // Sometimes we get lines without "data: " prefix, try to parse anyway
            if (line.trim() === "[DONE]") {
              streamDone = true;
              break;
            }
            continue;
          }

          const jsonStr = line.slice(6).trim();
          
          // Handle done signal
          if (jsonStr === "[DONE]") {
            streamDone = true;
            break;
          }

          // Skip function call marker
          if (jsonStr === "[FUNCTION_CALL]") {
            continue;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            
            // Handle conversation ID
            if (parsed.conversation_id) {
              receivedConversationId = parsed.conversation_id;
              setCurrentConversationId(parsed.conversation_id);
              localStorage.setItem('ai_current_conversation_id', parsed.conversation_id);
            }
            
            // Handle error
            if (parsed.error) {
              hasError = true;
              assistantContent = parsed.error;
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                if (lastIdx >= 0 && newMessages[lastIdx].role === "assistant") {
                  newMessages[lastIdx] = { ...newMessages[lastIdx], content: assistantContent };
                }
                return newMessages;
              });
              break;
            }
            
            // Extract content from various possible structures
            const content = parsed.choices?.[0]?.delta?.content || 
                           parsed.choices?.[0]?.message?.content ||
                           parsed.content ||
                           parsed.message ||
                           (parsed.choices?.[0]?.message?.content);
            
            if (content && typeof content === 'string') {
              hasStartedContent = true;
              assistantContent += content;
              
              // Update messages state
              setMessages((prev) => {
                const newMessages = [...prev];
                const lastIdx = newMessages.length - 1;
                
                // Update the last assistant message
                if (lastIdx >= 0 && newMessages[lastIdx].role === "assistant") {
                  newMessages[lastIdx] = { ...newMessages[lastIdx], content: assistantContent };
                } else {
                  // If no assistant message, add one
                  newMessages.push({ role: "assistant", content: assistantContent });
                }
                
                return newMessages;
              });
            }
          } catch (parseError) {
            // If it's not valid JSON, it might be incomplete - keep in buffer
            if (jsonStr.startsWith("{") || jsonStr.startsWith("[")) {
              // Incomplete JSON, put it back in buffer
              textBuffer = jsonStr + "\n" + textBuffer;
              break;
            }
            // Otherwise, skip invalid lines silently
            console.debug('Skipping invalid line:', line.substring(0, 100));
          }
        }
      }
    } catch (streamError: any) {
      console.error('[AI Assistant] Stream error:', streamError);
      if (!hasError) {
        assistantContent = `Error: ${streamError.message || 'Stream interrupted'}`;
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIdx = newMessages.length - 1;
          if (lastIdx >= 0 && newMessages[lastIdx].role === "assistant") {
            newMessages[lastIdx] = { ...newMessages[lastIdx], content: assistantContent };
          }
          return newMessages;
        });
      }
      throw streamError;
    }

    // Ensure we have content in the assistant message
    if (assistantContent.trim() !== "" || hasError) {
      // Ensure final content is set
      setMessages((prev) => {
        const newMessages = [...prev];
        for (let i = newMessages.length - 1; i >= 0; i--) {
          if (newMessages[i].role === "assistant") {
            newMessages[i] = {
              ...newMessages[i],
              content: assistantContent || (hasError ? "An error occurred. Please try again." : "")
            };
            break;
          }
        }
        return newMessages;
      });
    } else if (!hasStartedContent) {
      // Remove empty assistant message if no content was received
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

    // Reload conversations after new message (with delay to ensure backend saved)
    if (receivedConversationId && !hasError) {
      setCurrentConversationId(receivedConversationId);
      localStorage.setItem('ai_current_conversation_id', receivedConversationId);
      setTimeout(() => {
        loadConversations();
      }, 1000);
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
      console.error("[AI Assistant] Error:", error);
      
      let errorMessage = "Sorry, I encountered an error. Please try again.";
      
      if (error?.message) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Remove empty assistant message if it exists and add error message
      setMessages((prev) => {
        const newMessages = [...prev];
        
        // Remove last message if it's empty assistant message
        if (newMessages.length > 0 && 
            newMessages[newMessages.length - 1].role === "assistant" && 
            newMessages[newMessages.length - 1].content === "") {
          newMessages.pop();
        }
        
        // Check if last message is already an error message
        const lastMsg = newMessages[newMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && lastMsg.content.includes("Error:")) {
          // Update existing error message
          newMessages[newMessages.length - 1] = { ...lastMsg, content: errorMessage };
        } else {
          // Add new error message
          newMessages.push({ role: "assistant", content: errorMessage });
        }
        
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
      <div className="fixed bottom-24 right-6 w-[400px] max-w-[calc(100vw-3rem)] h-[580px] max-h-[80vh] shadow-2xl z-50 flex flex-col gap-0 bg-background rounded-2xl border overflow-hidden liquid-glass-dropdown min-h-0">
        {/* Sidebar - Conversation History */}
        {showHistory && (
          <Sidebar className="w-48 border-r flex flex-col flex-shrink-0">
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
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {/* Minimal Header - Fixed */}
          <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0 bg-background">
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

          {/* Chat Messages - Scrollable Container */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* ✅ STOP SCROLL EVENT BUBBLING (final polish) */}
            <div
              className="flex-1 min-h-0"
              onWheel={(e) => e.stopPropagation()}
              onTouchMove={(e) => e.stopPropagation()}
            >
              {/* ✅ 1️⃣ FIX ScrollArea CLASS (MOST IMPORTANT) */}
              <ScrollArea
                className="flex-1 min-h-0 [&>[data-radix-scroll-area-viewport]]:h-full"
              >
                {/* ✅ 2️⃣ MOVE scrollRef TO A REAL DOM ELEMENT */}
                <div ref={scrollRef} className="p-4 space-y-4" style={{ scrollBehavior: 'smooth' }}>
                  {messages.length === 0 && (
                    <div className="text-center text-muted-foreground py-12">
                      <Bot className="h-10 w-10 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">Ask me anything about HR, leaves, or policies</p>
                    </div>
                  )}
                  {messages
                    .filter(msg => msg.content || msg.role === "user")
                    .map((msg, idx) => {
                      // Try to detect and format JSON
                      let formattedContent = msg.content;
                      try {
                        // Check if content looks like JSON
                        const trimmed = msg.content.trim();
                        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
                            (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                          const parsed = JSON.parse(trimmed);
                          formattedContent = JSON.stringify(parsed, null, 2);
                        }
                      } catch {
                        // Not JSON, use as-is
                      }

                      return (
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
                            {formattedContent !== msg.content ? (
                              <pre className="whitespace-pre-wrap leading-relaxed text-xs font-mono overflow-x-auto">
                                {formattedContent}
                              </pre>
                            ) : (
                              <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
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
            </div>
          </div>

          {/* Input - Fixed at Bottom */}
          <div className="border-t p-3 flex-shrink-0 bg-background">
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type your message... (Shift+Enter for new line)"
                disabled={isLoading}
                rows={1}
                className="flex-1 min-h-[40px] max-h-[120px] resize-none text-sm"
                style={{
                  height: 'auto',
                  overflowY: 'auto'
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = 'auto';
                  target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
                }}
              />
              <Button 
                onClick={handleSend} 
                disabled={isLoading || !input.trim()} 
                size="icon"
                className="h-9 w-9 flex-shrink-0"
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