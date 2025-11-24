import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { Upload, FileText, CheckCircle2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export default function RAGDocumentUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [isConfidential, setIsConfidential] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    status: "idle" | "uploading" | "success" | "error";
    message?: string;
    jobId?: string;
    documentId?: string;
  }>({ status: "idle" });
  const { toast } = useToast();
  const [pollId, setPollId] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ percent: number; processed: number; total: number }>({
    percent: 0,
    processed: 0,
    total: 0,
  });

  // Poll document status after a successful upload
  useEffect(() => {
    if (uploadStatus.status === "success" && uploadStatus.documentId) {
      // Fire an immediate check so UI shows quickly
      (async () => {
        try {
          const prog = await api.getRAGDocumentProgress(uploadStatus.documentId as string);
          setProgress({
            percent: prog?.percent ?? 0,
            processed: prog?.processed_chunks ?? 0,
            total: prog?.total_chunks ?? 0,
          });
        } catch {}
      })();

      // Start polling every 2s
      const id = window.setInterval(async () => {
        try {
          const prog = await api.getRAGDocumentProgress(uploadStatus.documentId as string);
          setProgress({
            percent: prog?.percent ?? 0,
            processed: prog?.processed_chunks ?? 0,
            total: prog?.total_chunks ?? 0,
          });

          const status = await api.getRAGDocumentStatus(uploadStatus.documentId as string);
          if (status?.status === "completed") {
            window.clearInterval(id);
            setPollId(null);
            setProgress((p) => ({ ...p, percent: 100 }));
            toast({
              title: "Document processed",
              description: "Your document is now searchable in the AI Assistant.",
            });
            setUploadStatus((s) => ({ ...s, message: "Processing complete. Ready to search." }));
          }
        } catch (e: any) {
          // Stop polling on hard errors
          window.clearInterval(id);
          setPollId(null);
          console.error("Status polling failed:", e);
        }
      }, 2000);
      setPollId(id);

      // Cleanup on unmount
      return () => {
        if (id) window.clearInterval(id);
      };
    }
  }, [uploadStatus.status, uploadStatus.documentId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      // Check file type
      const allowedTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"];
      if (!allowedTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(pdf|docx|txt|md)$/i)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF, DOCX, TXT, or MD file.",
          variant: "destructive",
        });
        return;
      }
      // Check file size (50MB max)
      if (selectedFile.size > 50 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "File size must be less than 50MB.",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
      setUploadStatus({ status: "idle" });
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({
        title: "No file selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setProgress({ percent: 0, processed: 0, total: 0 });
    setUploadStatus({ status: "uploading", message: "Uploading document..." });

    try {
      const result = await api.ingestDocument(file, isConfidential);
      
      setUploadStatus({
        status: "success",
        message: "Document uploaded successfully! Processing in background...",
        jobId: result.job_id,
        documentId: result.document_id,
      });

      toast({
        title: "Upload successful",
        description: "Document is being processed. It will be available for queries shortly.",
      });

      // Reset form
      setFile(null);
      setIsConfidential(false);
    } catch (error: any) {
      setUploadStatus({
        status: "error",
        message: error.message || "Upload failed",
      });
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Upload Documents for RAG</h1>
          <p className="text-muted-foreground mt-2">
            Upload HR policies, handbooks, and documents to make them searchable via the AI assistant.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Document Upload</CardTitle>
            <CardDescription>
              Supported formats: PDF, DOCX, TXT, MD (Max 50MB)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="file">Select Document</Label>
              <div className="flex items-center gap-4">
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="cursor-pointer"
                />
                {file && (
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{file.name}</span>
                    <Badge variant="outline">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </Badge>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="confidential"
                checked={isConfidential}
                onChange={(e) => setIsConfidential(e.target.checked)}
                disabled={isUploading}
                className="h-4 w-4"
              />
              <Label htmlFor="confidential" className="text-sm font-normal cursor-pointer">
                Mark as confidential (restricted access)
              </Label>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="w-full"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </>
              )}
            </Button>

            {uploadStatus.status !== "idle" && (
              <div className={`p-4 rounded-lg border ${
                uploadStatus.status === "success"
                  ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                  : uploadStatus.status === "error"
                  ? "bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800"
                  : "bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800"
              }`}>
                <div className="flex items-center gap-2">
                  {uploadStatus.status === "success" && (
                    <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  )}
                  {uploadStatus.status === "uploading" && (
                    <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium">{uploadStatus.message}</p>
                  {uploadStatus.status === "success" && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{progress.percent >= 100 ? "Processing complete" : "Processing embeddings"}</span>
                        <span>
                          {progress.total > 0
                            ? `${progress.processed}/${progress.total} (${progress.percent}%)`
                            : `${progress.percent}%`}
                        </span>
                      </div>
                      <Progress value={Math.min(progress.percent, 100)} />
                    </div>
                  )}
                    {uploadStatus.jobId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Job ID: {uploadStatus.jobId}
                      </p>
                    )}
                    {uploadStatus.documentId && (
                      <p className="text-xs text-muted-foreground">
                        Document ID: {uploadStatus.documentId}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">1. Upload</h4>
              <p>Upload your HR documents (policies, handbooks, procedures).</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">2. Processing</h4>
              <p>Documents are automatically chunked, embedded, and indexed in the vector store.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">3. Searchable</h4>
              <p>Once processed, documents become searchable via the RAG AI assistant with source citations.</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground">4. Privacy</h4>
              <p>PII (Personally Identifiable Information) is automatically detected and redacted before indexing.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

