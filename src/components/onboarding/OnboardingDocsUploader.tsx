import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle, FileCheck2, RefreshCw, UploadCloud } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

const DOC_TYPES = [
  { type: "ID_PROOF", label: "ID Proof", description: "Government ID – PAN/Passport" },
  { type: "ADDRESS_PROOF", label: "Address Proof", description: "Utility bill, Aadhaar" },
  { type: "EDUCATION_CERT", label: "Education Certificate", description: "Highest qualification" },
  { type: "EXPERIENCE_LETTER", label: "Experience Letters", description: "Previous employer letters" },
  { type: "PAN", label: "PAN Card", description: "Permanent account number" },
  { type: "AADHAAR", label: "Aadhaar", description: "Masked Aadhaar upload" },
  { type: "BANK_STATEMENT", label: "Bank Statement", description: "Bank statement or cancelled cheque" },
  { type: "PASSPORT", label: "Passport", description: "First and last page" },
];

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
    const needsConsent = ["ID_PROOF", "PAN", "AADHAAR", "PASSPORT"].includes(docType);
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

  const renderDropZone = (docType: string) => (
    <div
      ref={(el) => (dropRefs.current[docType] = el)}
      className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary transition-colors"
      onDragOver={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dropRefs.current[docType]?.classList.add("border-primary");
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dropRefs.current[docType]?.classList.remove("border-primary");
      }}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dropRefs.current[docType]?.classList.remove("border-primary");
        handleFiles(docType, event.dataTransfer.files);
      }}
    >
      <input
        type="file"
        id={`file-${docType}`}
        className="hidden"
        onChange={(event) => handleFiles(docType, event.target.files)}
        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.tiff"
      />
      <label htmlFor={`file-${docType}`} className="space-y-2 block cursor-pointer">
        <UploadCloud className="h-8 w-8 mx-auto text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag & drop or <span className="text-primary font-medium">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, DOC, DOCX, JPG, PNG up to 10MB
        </p>
      </label>
    </div>
  );

  const groupedDocs = useMemo(() => {
    return DOC_TYPES.map((type) => ({
      ...type,
      items: documents.filter((doc) => doc.doc_type === type.type),
    }));
  }, [documents]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification Documents</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groupedDocs.map((doc) => (
            <div key={doc.type} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{doc.label}</p>
                  <p className="text-xs text-muted-foreground">{doc.description}</p>
                </div>
                {doc.type === "AADHAAR" || doc.type === "PAN" ? (
                  <Checkbox
                    checked={Boolean(consentMap[doc.type])}
                    onCheckedChange={(checked) =>
                      setConsentMap((prev) => ({ ...prev, [doc.type]: checked === true }))
                    }
                    id={`consent-${doc.type}`}
                  />
                ) : null}
              </div>
              {renderDropZone(doc.type)}
              <div className="space-y-2">
                {doc.items.length === 0 && (
                  <p className="text-xs text-muted-foreground">No files uploaded yet.</p>
                )}
                {doc.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-sm border rounded px-3 py-2">
                    <div>
                      <p className="font-medium">{item.file_name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{item.status}</p>
                    </div>
                    {item.status === "approved" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : item.status === "rejected" ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : (
                      <FileCheck2 className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {inProgressUploads.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Uploads in progress</p>
            {inProgressUploads.map((upload) => (
              <div key={upload.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>{upload.file.name}</span>
                  {upload.status === "error" ? (
                    <Button
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

