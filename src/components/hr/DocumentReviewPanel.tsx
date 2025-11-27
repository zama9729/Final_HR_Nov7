import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, Check, File, RefreshCw } from "lucide-react";

interface DocumentReviewPanelProps {
  employeeId: string;
}

export function DocumentReviewPanel({ employeeId }: DocumentReviewPanelProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDocuments = async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const response = await api.getOnboardingDocuments(employeeId, {
        status: filterStatus === "all" ? undefined : filterStatus,
        docType: filterType === "all" ? undefined : filterType,
      });
      setDocuments(response.documents || []);
    } catch (error: any) {
      toast({
        title: "Failed to load documents",
        description: error.message || "Please try again later",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [employeeId, filterStatus, filterType]);

  const docTypes = useMemo(() => {
    const types = new Set<string>();
    documents.forEach((doc) => {
      if (doc.doc_type) types.add(doc.doc_type);
    });
    return Array.from(types);
  }, [documents]);

  const handleAction = async (docId: string, action: "approve" | "reject" | "resubmit") => {
    try {
      setActionLoading(docId + action);
      if (action === "approve") {
        await api.approveDocument(docId);
      } else if (action === "reject") {
        await api.rejectDocument(docId, { reason: "Does not match records" });
      } else {
        await api.requestDocumentResubmission(docId, { note: "Please upload a clearer copy" });
      }
      fetchDocuments();
      toast({
        title: action === "approve" ? "Document approved" : "Action recorded",
        description: "Document status updated.",
      });
    } catch (error: any) {
      toast({
        title: "Action failed",
        description: error.message || "Please retry",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Documents</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <CardTitle>Documents</CardTitle>
        <div className="flex gap-2">
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Document type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {docTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="uploaded">Uploaded</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="resubmission_requested">Needs resubmission</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {documents.length === 0 && (
          <div className="text-sm text-muted-foreground">No documents available.</div>
        )}
        {documents.map((doc) => (
          <div key={doc.id} className="border rounded-lg p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium">{doc.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.doc_label} • Uploaded {new Date(doc.uploaded_at).toLocaleDateString()}
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="px-0 text-xs"
                  onClick={() => window.open(doc.url || doc.thumbnail_url, "_blank")}
                >
                  View / Download
                </Button>
              </div>
              <Badge variant={doc.status === "approved" ? "default" : doc.status === "rejected" ? "destructive" : "secondary"}>
                {doc.status}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading === doc.id + "approve"}
                onClick={() => handleAction(doc.id, "approve")}
                className="gap-1"
              >
                {actionLoading === doc.id + "approve" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={actionLoading === doc.id + "reject"}
                onClick={() => handleAction(doc.id, "reject")}
                className="gap-1"
              >
                {actionLoading === doc.id + "reject" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
                Reject
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={actionLoading === doc.id + "resubmit"}
                onClick={() => handleAction(doc.id, "resubmit")}
                className="gap-1"
              >
                {actionLoading === doc.id + "resubmit" ? <RefreshCw className="h-3 w-3 animate-spin" /> : <File className="h-3 w-3" />}
                Request Resubmission
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

