import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle, FileCheck2, RefreshCw } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

export const VERIFICATION_DOC_TYPES = [
  { type: "RESUME", label: "Resume", description: "Most recent resume/CV", required: true, helper: "Combine into one PDF if you have multiple pages." },
  { type: "ID_PROOF", label: "ID Proof", description: "Government ID – PAN/Passport", required: true, helper: "Use the same ID you used in personal info." },
  { type: "ADDRESS_PROOF", label: "Address Proof", description: "Utility bill, Aadhaar", required: true, helper: "Upload any utility bill or rental agreement." },
  { type: "EDUCATION_CERT", label: "Education Certificate", description: "Highest qualification", required: true, helper: "Combine into a single PDF if you have multiple pages." },
  { type: "EXPERIENCE_LETTER", label: "Experience Letters", description: "Previous employer letters", required: true, helper: "Upload one combined PDF if you have multiple letters." },
  { type: "PAN", label: "PAN Card", description: "Permanent account number", required: true, helper: "Masked PAN is accepted." },
  { type: "AADHAAR", label: "Aadhaar", description: "Masked Aadhaar upload", required: true, helper: "Please upload the masked version downloaded from UIDAI." },
  { type: "BANK_STATEMENT", label: "Bank Statement", description: "Bank statement or cancelled cheque", required: false, helper: "Optional now, required before payroll is processed." },
  { type: "PASSPORT", label: "Passport", description: "First and last page", required: false, helper: "Optional if PAN/Aadhaar already uploaded." },
];

const SENSITIVE_DOC_TYPES = ["ID_PROOF", "PAN", "AADHAAR", "PASSPORT"];

interface UploadItem {
  id: string;
  file: File;
  type: string;
  progress: number;
  status: "idle" | "uploading" | "success" | "error";
  error?: string;
}

interface OnboardingDocsUploaderProps {
  employeeId: string;
  onRefresh?: () => void;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  onUploadSuccess?: () => void;
}

export function OnboardingDocsUploader({
  employeeId,
  onRefresh,
  onUploadStart,
  onUploadEnd,
  onUploadSuccess,
}: OnboardingDocsUploaderProps) {
  const { toast } = useToast();
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploads, setUploads] = useState<Record<string, UploadItem>>({});
  const [consentMap, setConsentMap] = useState<Record<string, boolean>>({});
  const dropRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const fetchDocuments = async () => {
    if (!employeeId) return;
    try {
      const response = await api.getOnboardingDocuments(employeeId);
      setDocuments(response.documents || []);
      onRefresh?.();
    } catch (error: any) {
      console.error("Failed to load documents", error);
      toast({
        title: "Unable to load documents",
        description: error.message || "Please retry in a moment.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [employeeId]);

  const inProgressUploads = useMemo(() => Object.values(uploads), [uploads]);

  const handleFiles = (docType: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    startUpload(docType, file);
  };

  const startUpload = async (docType: string, file: File) => {
    if (!employeeId) {
      toast({ title: "Employee missing", description: "Please complete personal info first.", variant: "destructive" });
      return;
    }
    const needsConsent = SENSITIVE_DOC_TYPES.includes(docType);
    if (needsConsent && !consentMap[docType]) {
      toast({
        title: "Consent required",
        description: "Please provide consent before uploading this document.",
        variant: "destructive",
      });
      return;
    }

    const uploadId = `${docType}-${Date.now()}`;
    onUploadStart?.();
    setUploads((prev) => ({
      ...prev,
      [uploadId]: { id: uploadId, file, type: docType, progress: 5, status: "uploading" },
    }));

    try {
      const API_URL = (import.meta as any).env.VITE_API_URL || 'http://localhost:3001';
      const token = localStorage.getItem('auth_token') || localStorage.getItem('token');

      // Step 1: Get presigned URL
      setUploads((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], progress: 10 },
      }));

      const presignResponse = await fetch(`${API_URL}/api/onboarding/docs/presign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
        }),
      });

      if (!presignResponse.ok) {
        const error = await presignResponse.json();
        throw new Error(error.error || 'Failed to get upload URL');
      }

      const { url, key } = await presignResponse.json();

      // Step 2: Upload file directly to MinIO/S3 with progress tracking
      setUploads((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], progress: 30 },
      }));

      const uploadResponse = await fetch(url, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Calculate checksum
      setUploads((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], progress: 60 },
      }));

      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const checksum = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Step 4: Complete upload (save metadata to DB)
      setUploads((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], progress: 80 },
      }));

      const completeResponse = await fetch(`${API_URL}/api/onboarding/docs/complete`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key,
          filename: file.name,
          size: file.size,
          checksum,
          docType,
          employeeId, // Pass employeeId for onboarding flow
          consent: needsConsent ? Boolean(consentMap[docType]) : true,
          notes: "",
        }),
      });

      if (!completeResponse.ok) {
        const error = await completeResponse.json();
        throw new Error(error.error || 'Failed to complete upload');
      }

      setUploads((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], status: "success", progress: 100 },
      }));
      toast({
        title: "Uploaded",
        description: `${file.name} uploaded successfully.`,
      });
      await fetchDocuments();
      onUploadSuccess?.();
    } catch (error: any) {
      setUploads((prev) => ({
        ...prev,
        [uploadId]: { ...prev[uploadId], status: "error", error: error.message || "Upload failed" },
      }));
      toast({
        title: "Upload failed",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      onUploadEnd?.();
    }
  };

  const getStatusBadge = (status: string | undefined) => {
    if (!status) {
      return <Badge variant="outline">Not uploaded</Badge>;
    }
    switch (status.toLowerCase()) {
      case "approved":
        return <Badge className="bg-emerald-100 text-emerald-900 border-none">Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      case "pending":
      case "uploaded":
        return <Badge variant="outline">Pending review</Badge>;
      default:
        return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
    }
  };

  const groupedDocs = useMemo(() => {
    return VERIFICATION_DOC_TYPES.map((type) => ({
      ...type,
      items: documents.filter((doc) => doc.doc_type === type.type),
    }));
  }, [documents]);

  return (
    <Card>
      <CardHeader>
        <div className="space-y-2">
          <CardTitle>Verification Documents</CardTitle>
          <p className="text-sm text-muted-foreground">
            Upload scans or clear photos of each document. You can drag & drop files, browse from your device,
            or come back later—your uploads are saved automatically.
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          {groupedDocs.map((doc) => (
            <div
              key={doc.type}
              ref={(el) => (dropRefs.current[doc.type] = el)}
              className="rounded-xl border bg-card/50 p-4 space-y-3"
              onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dropRefs.current[doc.type]?.classList.add("border-primary");
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dropRefs.current[doc.type]?.classList.remove("border-primary");
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                dropRefs.current[doc.type]?.classList.remove("border-primary");
                handleFiles(doc.type, event.dataTransfer.files);
              }}
            >
              <input
                type="file"
                id={`file-${doc.type}`}
                className="hidden"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.tiff"
                onChange={(event) => handleFiles(doc.type, event.target.files)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">{doc.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.required ? (
                    <Badge variant="secondary">Required</Badge>
                  ) : (
                    <Badge variant="outline">Optional</Badge>
                  )}
                  {getStatusBadge(doc.items[0]?.status)}
                </div>
              </div>
              {SENSITIVE_DOC_TYPES.includes(doc.type) && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={Boolean(consentMap[doc.type])}
                    onCheckedChange={(checked) =>
                      setConsentMap((prev) => ({ ...prev, [doc.type]: checked === true }))
                    }
                    id={`consent-${doc.type}`}
                  />
                  I consent to HR reviewing my {doc.label}.
                </label>
              )}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => document.getElementById(`file-${doc.type}`)?.click()}
                >
                  Choose file
                </Button>
                <span className="text-xs text-muted-foreground">
                  PDF, DOC, DOCX, JPG, PNG up to 10MB • drag & drop enabled
                </span>
              </div>
              {doc.items.length > 0 ? (
                doc.items.slice(0, 1).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm bg-muted/50"
                  >
                    <div>
                      <p className="font-medium">{item.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded {item.uploaded_at ? format(new Date(item.uploaded_at), "MMM dd, yyyy") : "just now"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.status === "approved" ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      ) : item.status === "rejected" ? (
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground">No files uploaded yet.</p>
              )}
            </div>
          ))}
        </div>

        {inProgressUploads.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <p className="font-medium">Uploads in progress</p>
              <p className="text-xs text-muted-foreground">Please stay on this page until uploads finish.</p>
            </div>
                {inProgressUploads.map((upload) => (
              <div key={upload.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{upload.file.name}</span>
                  {upload.status === "error" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startUpload(upload.type, upload.file)}
                      className="h-6 text-xs gap-1"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </Button>
                  ) : (
                    <span className="text-muted-foreground text-xs uppercase">{upload.status}</span>
                  )}
                </div>
                <Progress value={upload.progress} />
                {upload.error && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {upload.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

