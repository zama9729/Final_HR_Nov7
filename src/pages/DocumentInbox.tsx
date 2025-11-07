import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { FileText, Download, CheckCircle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { format } from "date-fns";

interface Document {
  id: string;
  document_type: string;
  title: string;
  status: string;
  created_at: string;
}

interface Assignment {
  id: string;
  template: {
    name: string;
    category: string;
    requires_signature: boolean;
  };
  status: string;
  created_at: string;
  expires_at: string;
}

export default function DocumentInbox() {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchInbox();
  }, []);

  const fetchInbox = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/documents/inbox`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
        setAssignments(data.assignments || []);
      }
    } catch (error: any) {
      console.error('Error fetching document inbox:', error);
      toast({
        title: "Error",
        description: "Failed to load documents",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSign = async (assignmentId: string) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/documents/assignments/${assignmentId}/sign`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signature_data: { signed: true } })
      });
      if (response.ok) {
        toast({
          title: "Success",
          description: "Document signed successfully",
        });
        fetchInbox();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to sign document",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'signed': return 'bg-green-500';
      case 'viewed': return 'bg-blue-500';
      case 'sent': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Document Inbox</h1>
            <p className="text-muted-foreground">View and sign your documents</p>
          </div>
        </div>

        <Tabs defaultValue="assignments" className="space-y-4">
          <TabsList>
            <TabsTrigger value="assignments">
              <FileText className="mr-2 h-4 w-4" />
              E-Sign Packets ({assignments.length})
            </TabsTrigger>
            <TabsTrigger value="documents">
              <FileText className="mr-2 h-4 w-4" />
              Documents ({documents.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="assignments">
            <Card>
              <CardHeader>
                <CardTitle>E-Sign Packets</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Loading...</div>
                ) : assignments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No pending documents to sign
                  </div>
                ) : (
                  <div className="space-y-4">
                    {assignments.map((assignment) => (
                      <div key={assignment.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{assignment.template?.name}</h3>
                            <Badge className={getStatusColor(assignment.status)}>
                              {assignment.status}
                            </Badge>
                            {assignment.template?.requires_signature && (
                              <Badge variant="outline">Requires Signature</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Category: {assignment.template?.category} • 
                            Created: {format(new Date(assignment.created_at), 'MMM d, yyyy')}
                            {assignment.expires_at && ` • Expires: ${format(new Date(assignment.expires_at), 'MMM d, yyyy')}`}
                          </p>
                        </div>
                        {assignment.status !== 'signed' && assignment.template?.requires_signature && (
                          <Button size="sm" onClick={() => handleSign(assignment.id)}>
                            Sign Document
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader>
                <CardTitle>Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {documents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No documents found
                  </div>
                ) : (
                  <div className="space-y-4">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{doc.title}</h3>
                            <Badge variant="outline">{doc.document_type}</Badge>
                            {doc.status === 'read' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {format(new Date(doc.created_at), 'MMM d, yyyy')}
                          </p>
                        </div>
                        <Button size="sm" variant="outline">
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

